const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');

function browserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return candidates.find(candidate => candidate && fs.existsSync(candidate));
}

test('built Chrome extension starts, registers privacy policies, and keeps downloader disabled', async () => {
  const executablePath = browserExecutable();
  assert.ok(executablePath, 'Chrome or Edge executable is required for extension smoke test');
  const extensionPath = path.join(root, 'dist', 'chrome');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    pipe: true,
    enableExtensions: [extensionPath]
  });

  try {
    const workerTarget = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().endsWith('/background.chrome.js'));
    const worker = await workerTarget.worker();
    const workerErrors = [];
    worker.on('console', message => {
      if (message.type() === 'error') workerErrors.push(message.text());
    });
    const extensionId = new URL(workerTarget.url()).hostname;
    const popup = await browser.newPage();
    const errors = [];
    popup.on('pageerror', error => errors.push(error.message));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.evaluate(() => chrome.storage.sync.set({ videoDownload: false }));
    const registrations = await popup.evaluate(() => chrome.scripting.getRegisteredContentScripts());
    const privacy = registrations.filter(registration => registration.id.startsWith('nor1c-privacy-'));
    assert.deepEqual(privacy.map(registration => registration.id).sort(), [
      'nor1c-privacy-location',
      'nor1c-privacy-notification',
      'nor1c-privacy-window-open'
    ]);
    assert.ok(privacy.every(registration => registration.world === 'MAIN'));
    await popup.reload();
    await popup.waitForFunction(() => document.getElementById('video-download-toggle').checked === false);
    const popupState = await popup.evaluate(() => ({
      checked: document.getElementById('video-download-toggle').checked,
      list: Boolean(document.getElementById('video-sources-list')),
      section: document.getElementById('video-sources-section').style.display
    }));
    assert.deepEqual(popupState, { checked: false, list: true, section: 'none' });
    assert.deepEqual(errors, []);

    const enabled = await popup.evaluate(async () => {
      await chrome.storage.sync.set({ videoDownload: true });
      return chrome.runtime.sendMessage({ type: 'ensure-video-downloader-background' });
    });
    assert.deepEqual(enabled, { loaded: true }, workerErrors.join('\n'));

    const mediaPage = await browser.newPage();
    await mediaPage.goto('https://example.com');
    const mediaTabId = await popup.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'https://example.com/' });
      return tabs[0] && tabs[0].id;
    });
    assert.ok(mediaTabId !== undefined, 'media probe tab must exist');
    await mediaPage.evaluate(() => fetch('/video-probe.mp4').catch(() => {}));
    await new Promise(resolve => setTimeout(resolve, 100));
    const captured = await popup.evaluate(tabId => chrome.runtime.sendMessage({
      type: 'get-detected-video-sources',
      tabId
    }), mediaTabId);
    assert.ok(captured.sources.some(source => source.url === 'https://example.com/video-probe.mp4'));
  } finally {
    await browser.close();
  }
});
