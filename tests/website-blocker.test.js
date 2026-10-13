const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const panelSource = fs.readFileSync(path.join(root, 'src', 'website-blocker-panel.js'), 'utf8');

function createElement(tagName = 'div') {
  const listeners = new Map();
  return {
    tagName,
    children: [],
    dataset: {},
    style: {},
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    async dispatch(type) {
      for (const handler of [...(listeners.get(type) || [])]) await handler({ preventDefault() {} });
    },
    focus() {},
    value: '',
    setAttribute(name, value) { this[name] = value; },
    set innerHTML(value) { this.children = []; this._innerHTML = value; },
    get innerHTML() { return this._innerHTML || ''; }
  };
}

test('website blocker renders the first rule after clearing the empty state', () => {
  const list = createElement();
  const count = createElement('span');
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (id === 'rules-list') return list;
      if (id === 'rules-count') return count;
      return null;
    },
    createElement
  };

  const context = { document, chrome: {}, URL, Math, Date, parseInt };
  vm.runInNewContext(`${panelSource}\nrenderRules([{ id: '1', domain: 'example.com', enabled: true }]);`, context);

  assert.equal(count.textContent, 1);
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].dataset.id, '1');
  assert.equal(list.children[0].children.length, 3);
});

test('website blocker keeps one schedule separate from website list', () => {
  assert.match(panelSource, /const SCHEDULE_STORAGE_KEY = 'websiteBlockerSchedule'/);
  assert.match(panelSource, /rules\.push\(\{ id: generateId\(\), domain: parsed, enabled: true \}\)/);
  assert.doesNotMatch(panelSource, /rules\.push\([^\n]+start/);
});

function panelHarness(initial = {}) {
  const elements = new Map();
  const state = {
    websiteBlockerRules: [{ id: '1', domain: 'example.com', enabled: true }],
    websiteBlockerSchedule: { start: '09:00', end: '17:00' },
    ...initial
  };
  const writes = [];
  const document = {
    addEventListener(type, handler) { if (type === 'DOMContentLoaded') this.init = handler; },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    },
    createElement
  };
  let failWrite = false;
  const context = {
    document, URL, Math, Date,
    chrome: {
      storage: {
        sync: {
          async get() { return structuredClone(state); },
          async set(values) {
            if (failWrite) throw new Error('Storage unavailable');
            writes.push(structuredClone(values));
            Object.assign(state, structuredClone(values));
          }
        },
        onChanged: { addListener() {} }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(panelSource, context);
  return {
    state, writes, context, document,
    el: id => document.getElementById(id),
    run: source => vm.runInContext(source, context),
    failWrites() { failWrite = true; }
  };
}

test('disabling and deleting sites need no quiz, including with legacy protection enabled', async () => {
  for (const legacyFlag of [undefined, false, true]) {
    const h = panelHarness({ websiteBlockerChallengeEnabled: legacyFlag });
    await h.document.init();
    await h.run('toggleRule("1", false)');
    assert.equal(h.state.websiteBlockerRules[0].enabled, false);
    assert.equal(h.el('rules-list').children[0].className, 'rule-item inactive');
    assert.equal(h.el('blocker-settings').disabled, false);
    await h.run('toggleRule("1", true)');
    assert.equal(h.state.websiteBlockerRules[0].enabled, true);
    await h.run('deleteRule("1")');
    assert.deepEqual(h.state.websiteBlockerRules, []);
    assert.equal(h.el('rules-list').children[0].id, 'rules-empty');
    assert.equal(h.writes.length, 3);
    assert.equal(h.el('settings-error').textContent, '');
  }
});

test('legacy per-site schedules still migrate without losing rules', async () => {
  const h = panelHarness({
    websiteBlockerSchedule: undefined,
    websiteBlockerRules: [{ id: '1', domain: 'example.com', start: '22:00', end: '06:00' }],
    websiteBlockerChallengeEnabled: true
  });
  const settings = await h.run('loadSettings()');
  assert.deepEqual(h.state.websiteBlockerSchedule, { start: '22:00', end: '06:00' });
  assert.deepEqual(h.state.websiteBlockerRules, [{ id: '1', domain: 'example.com', enabled: true }]);
  assert.deepEqual(Object.keys(settings).sort(), ['rules', 'schedule']);
  await h.run('toggleRule("1", false)');
  assert.equal(h.state.websiteBlockerRules[0].enabled, false);
});

test('pending settings changes ignore overlapping actions and use the latest rules', async () => {
  const h = panelHarness({ websiteBlockerChallengeEnabled: true });
  const get = h.context.chrome.storage.sync.get;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  h.context.chrome.storage.sync.get = async () => { await gate; return get(); };
  const pending = h.run('toggleRule("1", false)');
  assert.equal(h.el('blocker-settings').disabled, true);
  await h.run('deleteRule("1")');
  assert.equal(h.writes.length, 0);
  h.state.websiteBlockerRules.push({ id: '2', domain: 'other.test', enabled: true });
  release();
  await pending;
  assert.deepEqual(h.state.websiteBlockerRules, [
    { id: '1', domain: 'example.com', enabled: false },
    { id: '2', domain: 'other.test', enabled: true }
  ]);
  assert.equal(h.writes.length, 1);
  assert.equal(h.el('blocker-settings').disabled, false);
  await h.run('deleteRule("1")');
  assert.deepEqual(h.state.websiteBlockerRules, [{ id: '2', domain: 'other.test', enabled: true }]);
});

test('schedule save and adding sites work without a quiz', async () => {
  const h = panelHarness({ websiteBlockerChallengeEnabled: true });
  await h.document.init();
  h.el('blocked-start').value = '22:00';
  h.el('blocked-end').value = '06:00';
  await h.el('save-schedule-btn').dispatch('click');
  assert.deepEqual(h.state.websiteBlockerSchedule, { start: '22:00', end: '06:00' });
  assert.equal(h.el('blocker-settings').disabled, false);

  await h.run('addRule("https://www.other.test/path")');
  assert.equal(h.state.websiteBlockerRules[1].domain, 'other.test');
  assert.equal(h.state.websiteBlockerRules[1].enabled, true);
  await assert.rejects(h.run('addRule("other.test")'), /already exists/);
  await assert.rejects(h.run('addRule("not a domain")'), /valid domain/);
  assert.equal(h.state.websiteBlockerRules.length, 2);
});

test('storage write failures preserve settings, display errors, and restore controls', async () => {
  for (const action of ['toggleRule("1", false)', 'deleteRule("1")']) {
    const h = panelHarness({ websiteBlockerChallengeEnabled: true });
    h.failWrites();
    await h.run(action);
    assert.deepEqual(h.state.websiteBlockerRules, [{ id: '1', domain: 'example.com', enabled: true }]);
    assert.match(h.el('settings-error').textContent, /Storage unavailable/);
    assert.equal(h.el('blocker-settings').disabled, false);
  }
  const h = panelHarness();
  await h.document.init();
  h.failWrites();
  h.el('blocked-start').value = '22:00';
  await h.el('save-schedule-btn').dispatch('click');
  assert.deepEqual(h.state.websiteBlockerSchedule, { start: '09:00', end: '17:00' });
  assert.equal(h.el('blocked-start').value, '09:00');
  assert.match(h.el('settings-error').textContent, /Storage unavailable/);
  assert.equal(h.el('blocker-settings').disabled, false);
});

test('old backups remain importable without restoring or exporting the retired quiz flag', () => {
  const h = panelHarness({ websiteBlockerChallengeEnabled: true });
  const popupSource = fs.readFileSync(path.join(root, 'src', 'popup.js'), 'utf8');
  vm.runInContext(popupSource, h.context);
  for (const enabled of [false, true]) {
    const settings = h.run(`validateBackupPayload({ version: 1, data: { websiteBlockerChallengeEnabled: ${enabled}, websiteBlockerRules: [] } })`);
    assert.deepEqual(structuredClone(settings), { websiteBlockerRules: [] });
  }
  assert.equal(h.run('BACKUP_KEYS.includes("websiteBlockerChallengeEnabled")'), false);
  assert.throws(() => h.run('validateBackupPayload({ version: 1, data: { unknownSetting: true } })'), /Unknown setting/);
  assert.throws(() => h.run('validateBackupPayload({ version: 1, data: { websiteBlockerRules: "invalid" } })'), /Invalid setting/);
  assert.throws(() => h.run('validateBackupPayload({ version: 1, data: { websiteBlockerSchedule: {} } })'), /Invalid setting/);
  assert.doesNotMatch(popupSource, /ensureBlockerImportAllowed|Complete the challenge/);
});

test('panel no longer includes quiz controls, copy, styles, or logic', () => {
  for (const filename of ['website-blocker-panel.js', 'website-blocker-panel.html', 'website-blocker-panel.css']) {
    const source = fs.readFileSync(path.join(root, 'src', filename), 'utf8');
    assert.doesNotMatch(source, /challenge|quiz|protection/i, filename);
  }
});
