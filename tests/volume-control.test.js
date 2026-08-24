const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');
const popupSource = fs.readFileSync(path.join(root, 'src', 'popup.js'), 'utf8');
const volumeSource = fs.readFileSync(path.join(root, 'src', 'content', 'volume-control.js'), 'utf8');

function browserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function withPage(run, options = {}) {
  const executablePath = browserExecutable();
  assert.ok(executablePath, 'Chrome or Edge executable is required for browser tests');
  const browser = await puppeteer.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((stored) => {
      window.__storageListeners = [];
      window.__storageWrites = [];
      window.__sentMessages = [];
      window.nor1cGetDomain = () => 'example.test';

      // Deterministic stand-in for the real WebAudio graph.
      window.__gainNodes = [];
      window.AudioContext = class {
        constructor() { this.state = 'running'; this.destination = { kind: 'destination' }; }
        resume() { return Promise.resolve(); }
        createMediaElementSource() { return { connect() {} }; }
        createGain() {
          const node = { gain: { value: 1 }, connect() {} };
          window.__gainNodes.push(node);
          return node;
        }
      };

      window.chrome = {
        runtime: {
          sendMessage(msg) { window.__sentMessages.push(msg); return Promise.resolve(); },
          onMessage: { addListener(listener) { window.__messageListener = listener; } }
        },
        storage: {
          sync: {
            get(_keys, callback) { callback(JSON.parse(JSON.stringify(stored))); },
            set(items) {
              window.__storageWrites.push(items);
              Object.assign(stored, items);
            }
          },
          onChanged: { addListener(listener) { window.__storageListeners.push(listener); } }
        }
      };
    }, options.stored || {});
    await page.goto('about:blank');
    await run(page);
  } finally {
    await browser.close();
  }
}

const attachScript = (page) => page.addScriptTag({ path: path.join(root, 'src', 'content', 'volume-control.js') });

test('volume control stays inert until its own toggle is enabled', async () => {
  await withPage(async (page) => {
    await page.setContent('<video id="v"></video><audio id="a"></audio>');
    await attachScript(page);
    const result = await page.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        videoVolume: document.getElementById('v').volume,
        audioVolume: document.getElementById('a').volume,
        gainNodes: window.__gainNodes.length
      };
    });
    assert.deepEqual(result, { videoVolume: 1, audioVolume: 1, gainNodes: 0 });
  }, { stored: { volumeControl: false, volumeControlLevel: 40 } });
});

test('volume control attenuates existing and future media', async () => {
  await withPage(async (page) => {
    await page.setContent('<video id="v"></video><audio id="a"></audio>');
    await attachScript(page);
    const result = await page.evaluate(async () => {
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      await wait(50);
      const initial = [document.getElementById('v').volume, document.getElementById('a').volume];

      const late = document.createElement('video');
      document.body.appendChild(late);
      await wait(50);

      return { initial, lateVolume: late.volume, usedGainNodes: window.__gainNodes.length };
    });
    assert.deepEqual(result, { initial: [0.4, 0.4], lateVolume: 0.4, usedGainNodes: 0 });
  }, { stored: { volumeControl: true, volumeControlLevel: 40 } });
});

test('volume control boosts past 100% through a gain node instead of clipping element volume', async () => {
  await withPage(async (page) => {
    await page.setContent('<video id="v"></video>');
    await attachScript(page);
    const result = await page.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        elementVolume: document.getElementById('v').volume,
        gainNodes: window.__gainNodes.length,
        gainValue: window.__gainNodes[0] ? window.__gainNodes[0].gain.value : null
      };
    });
    assert.deepEqual(result, { elementVolume: 1, gainNodes: 1, gainValue: 2.5 });
  }, { stored: { volumeControl: true, volumeControlLevel: 250 } });
});

test('the saved level applies to every site, not just the one that set it', async () => {
  await withPage(async (page) => {
    await page.setContent('<video id="v"></video>');
    await attachScript(page);
    const volume = await page.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return document.getElementById('v').volume;
    });
    // The level was stored while browsing a different site, yet still applies here.
    assert.equal(volume, 0.3);
  }, { stored: { volumeControl: true, volumeControlLevel: 30 } });
});

test('volume control is on by default when nothing is stored yet', async () => {
  await withPage(async (page) => {
    await page.setContent('<video id="v"></video>');
    await attachScript(page);
    const result = await page.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      let state = null;
      window.__messageListener({ type: 'volume-control-get' }, {}, (response) => { state = response; });
      return { active: state.active, level: state.level, volume: document.getElementById('v').volume };
    });
    // Active out of the box, but silent until the user moves the slider.
    assert.deepEqual(result, { active: true, level: 100, volume: 1 });
  }, { stored: {} });
});

test('Shift+Arrow hotkeys adjust, reset, and persist the level', async () => {
  await withPage(async (page) => {
    await page.setContent('<video id="v"></video>');
    await attachScript(page);
    const result = await page.evaluate(async () => {
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const video = document.getElementById('v');
      await wait(50);

      const press = (key, init = {}) => {
        const event = new KeyboardEvent('keydown', { key, shiftKey: true, cancelable: true, ...init });
        document.dispatchEvent(event);
        return event;
      };

      const down = press('ArrowDown');
      const afterDown = Math.round(video.volume * 100);
      press('ArrowUp');
      const afterUp = Math.round(video.volume * 100);

      // Plain arrows (no Shift) must stay with the page.
      const plain = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
      document.dispatchEvent(plain);
      const afterPlainArrow = Math.round(video.volume * 100);

      // Typing in a field must not hijack the arrows.
      const input = document.createElement('input');
      document.body.appendChild(input);
      const typed = new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, cancelable: true });
      input.dispatchEvent(typed);
      await wait(10);
      const afterTypedArrow = Math.round(video.volume * 100);

      press('ArrowRight');
      const afterReset = Math.round(video.volume * 100);

      await wait(500);
      const persisted = window.__storageWrites.filter(w => 'volumeControlLevel' in w).pop();

      return {
        afterDown,
        afterUp,
        afterPlainArrow,
        afterTypedArrow,
        afterReset,
        hotkeyPrevented: down.defaultPrevented,
        plainArrowPrevented: plain.defaultPrevented,
        typedArrowPrevented: typed.defaultPrevented,
        persistedLevel: persisted ? persisted.volumeControlLevel : null
      };
    });

    assert.deepEqual(result, {
      afterDown: 40,
      afterUp: 50,
      afterPlainArrow: 50,
      afterTypedArrow: 50,
      afterReset: 100,
      hotkeyPrevented: true,
      plainArrowPrevented: false,
      typedArrowPrevented: false,
      persistedLevel: 100
    });
  }, { stored: { volumeControl: true, volumeControlLevel: 50 } });
});

test('volume control applies popup changes and restores original volume when disabled', async () => {
  await withPage(async (page) => {
    await page.setContent('<video id="v"></video>');
    // The page picks its own volume before the feature ever loads.
    await page.evaluate(() => { document.getElementById('v').volume = 0.9; });
    await attachScript(page);
    const result = await page.evaluate(async () => {
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const video = document.getElementById('v');
      await wait(50);
      const applied = Math.round(video.volume * 100);

      window.__storageListeners.forEach(l => l({ volumeControlLevel: { newValue: 20 } }, 'sync'));
      await wait(20);
      const afterSync = Math.round(video.volume * 100);

      window.__storageListeners.forEach(l => l({ volumeControl: { newValue: false } }, 'sync'));
      await wait(20);
      const afterDisable = Math.round(video.volume * 100);

      const writesBefore = window.__storageWrites.length;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, cancelable: true }));
      await wait(500);

      return {
        applied,
        afterSync,
        afterDisable,
        inertAfterDisable: window.__storageWrites.length === writesBefore
      };
    });

    assert.deepEqual(result, { applied: 60, afterSync: 20, afterDisable: 90, inertAfterDisable: true });
  }, { stored: { volumeControl: true, volumeControlLevel: 60 } });
});

test('volume control answers popup queries with the live level', async () => {
  await withPage(async (page) => {
    await page.setContent('<video id="v"></video>');
    await attachScript(page);
    const result = await page.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      let state = null;
      window.__messageListener({ type: 'volume-control-get' }, {}, (response) => { state = response; });
      let updated = null;
      window.__messageListener({ type: 'volume-control-set', level: 300 }, {}, (response) => { updated = response; });
      return { state, updated, elementVolume: document.getElementById('v').volume };
    });

    assert.deepEqual(result.state, { level: 75, active: true, hasMedia: true });
    assert.deepEqual(result.updated, { level: 300 });
    assert.equal(result.elementVolume, 1);
  }, { stored: { volumeControl: true, volumeControlLevel: 75 } });
});

test('volume control is registered as its own feature across manifests and defaults', () => {
  for (const browser of ['chrome', 'firefox']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src', `manifest.${browser}.json`), 'utf8'));
    const scripts = manifest.content_scripts.flatMap(entry => entry.js || []);
    assert.ok(scripts.includes('content/volume-control.js'), `${browser} manifest must register volume-control.js`);
  }

  const background = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8');
  assert.match(background, /volumeControl: true/);
  assert.match(background, /volumeControlLevel: 100/);
  assert.match(background, /'volumeControl', 'volumeControlLevel'/);

  const html = fs.readFileSync(path.join(root, 'src', 'popup.html'), 'utf8');
  assert.match(html, /id="volume-control-toggle"/);

  // Must be an independent top-level card, not nested inside the video controls group.
  const cardIndex = html.indexOf('id="volume-control-toggle"');
  const autoHideIndex = html.indexOf('id="auto-hide-card"');
  assert.ok(cardIndex > autoHideIndex, 'volume control belongs outside the video-controls sub-toggles');
  assert.doesNotMatch(volumeSource, /videoControls/);
});

test('backup validation covers the browser-wide volume level', () => {
  const context = { document: { addEventListener() {} }, exports: {}, Set, Object, Array, Number, Error, String };
  vm.runInNewContext(`${popupSource}\nexports.validateBackupPayload = validateBackupPayload;`, context);
  const { validateBackupPayload } = context.exports;

  assert.equal(
    JSON.stringify(validateBackupPayload({ version: 1, data: { volumeControl: true, volumeControlLevel: 250 } })),
    JSON.stringify({ volumeControl: true, volumeControlLevel: 250 })
  );
  assert.equal(
    JSON.stringify(validateBackupPayload({ version: 1, data: { volumeControlLevel: 0 } })),
    JSON.stringify({ volumeControlLevel: 0 })
  );
  assert.throws(() => validateBackupPayload({ version: 1, data: { volumeControlLevel: 900 } }), /Invalid setting: volumeControlLevel/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { volumeControlLevel: -5 } }), /Invalid setting: volumeControlLevel/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { volumeControlLevel: 55.5 } }), /Invalid setting: volumeControlLevel/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { volumeControlLevel: '100' } }), /Invalid setting: volumeControlLevel/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { volumeControl: 'on' } }), /Invalid setting: volumeControl/);

  // The retired per-domain map must not sneak back in through an old backup.
  assert.throws(() => validateBackupPayload({ version: 1, data: { volumeControlLevels: { 'example.com': 250 } } }), /Unknown setting: volumeControlLevels/);
});
