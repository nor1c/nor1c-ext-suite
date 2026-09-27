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
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    async dispatch(type) {
      for (const handler of [...(listeners.get(type) || [])]) await handler({ preventDefault() {} });
    },
    showModal() { this.open = true; },
    close() { this.open = false; },
    focus() {},
    value: '',
    setAttribute(name, value) { this[name] = value; },
    set innerHTML(value) { this.children = []; this._innerHTML = value; },
    get innerHTML() { return this._innerHTML || ''; }
  };
}

test('website blocker renders the first rule after clearing the empty state', () => {
  const list = createElement();
  list.querySelectorAll = () => [];
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

async function flush() {
  await new Promise(resolve => setImmediate(resolve));
}

function answerFor(text) {
  const [a, b, c, d, e] = text.match(/\d+/g).map(Number);
  return String(a * b + c * d - e);
}

async function solve(harness) {
  for (let index = 0; index < 3; index++) {
    harness.el('challenge-answer').value = answerFor(harness.el('challenge-question').textContent);
    await harness.el('challenge-form').dispatch('submit');
  }
}

test('challenge defaults off and existing settings migrate without enabling it', async () => {
  const h = panelHarness();
  assert.equal((await h.run('loadSettings()')).challengeEnabled, false);
  await h.run('toggleRule("1", false)');
  assert.equal(h.state.websiteBlockerRules[0].enabled, false);
  assert.equal(h.el('unblock-challenge').open, undefined);
  const legacy = panelHarness({
    websiteBlockerSchedule: undefined,
    websiteBlockerRules: [{ id: '1', domain: 'example.com', start: '22:00', end: '06:00' }]
  });
  const settings = await legacy.run('loadSettings()');
  assert.equal(settings.challengeEnabled, false);
  assert.deepEqual(legacy.state.websiteBlockerSchedule, { start: '22:00', end: '06:00' });
  assert.deepEqual(legacy.state.websiteBlockerRules, [{ id: '1', domain: 'example.com', enabled: true }]);
});

test('questions have exact integer solutions and require three consecutive answers', () => {
  const h = panelHarness();
  for (let index = 0; index < 100; index++) {
    const question = h.run('createChallengeQuestion()');
    assert.equal(String(question.answer), answerFor(question.text));
  }
  const session = h.run('createChallengeSession()');
  for (const value of ['', '1.5', '1e3', '1,000', 'Infinity', '1 + 2']) {
    assert.equal(session.submit(value), 'invalid');
    assert.equal(session.correct, 0);
  }
  assert.equal(session.submit(String(session.question.answer)), 'next');
  assert.equal(session.submit(String(session.question.answer)), 'next');
  const previousQuestion = session.question;
  assert.equal(session.submit(String(session.question.answer + 1)), 'wrong');
  assert.equal(session.correct, 0);
  assert.notEqual(session.question, previousQuestion);
  assert.equal(session.submit(String(session.question.answer)), 'next');
  assert.equal(session.submit(String(session.question.answer)), 'next');
  assert.equal(session.submit(String(session.question.answer)), 'complete');
});

test('cancel, Escape, and closing the challenge preserve blocking and restore controls', async () => {
  for (const [id, event] of [['challenge-cancel', 'click'], ['unblock-challenge', 'cancel'], ['unblock-challenge', 'close']]) {
    const h = panelHarness({ websiteBlockerChallengeEnabled: true });
    const pending = h.run('toggleRule("1", false)');
    await flush();
    assert.equal(h.el('unblock-challenge').open, true);
    assert.equal(h.el('blocker-settings').disabled, true);
    assert.equal(h.writes.length, 0);
    await h.el(id).dispatch(event);
    await pending;
    assert.equal(h.state.websiteBlockerRules[0].enabled, true);
    assert.equal(h.writes.length, 0);
    assert.equal(h.el('unblock-challenge').open, false);
    assert.equal(h.el('blocker-settings').disabled, false);
  }
});

test('successful quiz authorizes only one action and preserves other-panel changes', async () => {
  const h = panelHarness({ websiteBlockerChallengeEnabled: true });
  const pending = h.run('toggleRule("1", false)');
  await flush();
  await h.run('deleteRule("1")'); // Ignore overlapping action while the quiz is open.
  h.state.websiteBlockerRules.push({ id: '2', domain: 'other.test', enabled: true });
  await solve(h);
  await pending;
  assert.deepEqual(h.state.websiteBlockerRules, [
    { id: '1', domain: 'example.com', enabled: false },
    { id: '2', domain: 'other.test', enabled: true }
  ]);
  assert.equal(h.state.websiteBlockerChallengeEnabled, true);
  assert.equal(h.writes.length, 1);
  const deletion = h.run('deleteRule("1")');
  await flush();
  assert.equal(h.el('unblock-challenge').open, true);
  assert.equal(h.el('challenge-progress').textContent, 'Question 1 of 3');
  await solve(h);
  await deletion;
  assert.deepEqual(h.state.websiteBlockerRules, [{ id: '2', domain: 'other.test', enabled: true }]);
});

test('schedule save and disabling protection are guarded, adding and re-enabling remain easy', async () => {
  const h = panelHarness();
  await h.document.init();
  h.el('challenge-enabled').checked = true;
  await h.el('challenge-enabled').dispatch('change');
  assert.equal(h.state.websiteBlockerChallengeEnabled, true);
  assert.equal(h.el('unblock-challenge').open, undefined);
  await h.run('addRule("other.test")');
  h.state.websiteBlockerRules[0].enabled = false;
  await h.run('toggleRule("1", true)');
  assert.equal(h.state.websiteBlockerRules[0].enabled, true);
  assert.equal(h.el('unblock-challenge').open, undefined);

  h.el('blocked-start').value = '22:00';
  h.el('blocked-end').value = '06:00';
  const schedule = h.el('save-schedule-btn').dispatch('click');
  await flush();
  assert.deepEqual(h.state.websiteBlockerSchedule, { start: '09:00', end: '17:00' });
  await h.el('challenge-cancel').dispatch('click');
  await schedule;
  assert.equal(h.el('blocked-start').value, '09:00');

  h.el('blocked-start').value = '22:00';
  h.el('blocked-end').value = '06:00';
  const approvedSchedule = h.el('save-schedule-btn').dispatch('click');
  await flush();
  await solve(h);
  await approvedSchedule;
  assert.deepEqual(h.state.websiteBlockerSchedule, { start: '22:00', end: '06:00' });

  h.el('challenge-enabled').checked = false;
  const protection = h.el('challenge-enabled').dispatch('change');
  await flush();
  assert.equal(h.el('challenge-enabled').checked, true);
  assert.equal(h.state.websiteBlockerChallengeEnabled, true);
  await solve(h);
  await protection;
  assert.equal(h.state.websiteBlockerChallengeEnabled, false);
});

test('storage write failure leaves protection intact, displays error, and restores controls', async () => {
  const h = panelHarness({ websiteBlockerChallengeEnabled: true });
  h.failWrites();
  const pending = h.run('toggleRule("1", false)');
  await flush();
  await solve(h);
  await pending;
  assert.equal(h.state.websiteBlockerRules[0].enabled, true);
  assert.match(h.el('settings-error').textContent, /Storage unavailable/);
  assert.equal(h.el('blocker-settings').disabled, false);
});

test('backup supports challenge setting and cannot bypass enabled protection', async () => {
  const h = panelHarness({ websiteBlockerChallengeEnabled: true });
  const popupSource = fs.readFileSync(path.join(root, 'src', 'popup.js'), 'utf8');
  vm.runInContext(popupSource, h.context);
  assert.equal(h.run('validateBackupPayload({ version: 1, data: { websiteBlockerChallengeEnabled: true } }).websiteBlockerChallengeEnabled'), true);
  assert.throws(() => h.run('validateBackupPayload({ version: 1, data: { websiteBlockerChallengeEnabled: "yes" } })'), /Invalid setting/);
  for (const change of [
    { websiteBlockerRules: [] },
    { websiteBlockerRules: [{ id: '1', domain: 'example.com', enabled: false }] },
    { websiteBlockerSchedule: { start: '00:00', end: '00:00' } },
    { websiteBlockerChallengeEnabled: false }
  ]) {
    await assert.rejects(h.run(`ensureBlockerImportAllowed(${JSON.stringify(change)})`), /Complete the challenge/);
  }
  await h.run('ensureBlockerImportAllowed({ imageBlocker: true })');
  await h.run(`ensureBlockerImportAllowed(${JSON.stringify(h.state)})`);
  h.state.websiteBlockerChallengeEnabled = false;
  await h.run('ensureBlockerImportAllowed({ websiteBlockerRules: [] })');
  assert.equal(h.writes.length, 0);
});
