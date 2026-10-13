const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');

function browserExecutable() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find(candidate => candidate && fs.existsSync(candidate));
}

test('built blocker disables, deletes, saves, and imports without a quiz even with legacy protection enabled', { timeout: 60000 }, async () => {
  const executablePath = browserExecutable();
  assert.ok(executablePath, 'Chrome or Edge executable is required');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    pipe: true,
    enableExtensions: [path.join(root, 'dist', 'chrome')]
  });
  try {
    const workerTarget = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().endsWith('/background.chrome.js'));
    const extensionId = new URL(workerTarget.url()).hostname;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // This feature needs no network, including the optional remote font.
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (/^https?:/.test(request.url())) request.abort();
      else request.continue();
    });
    const panelUrl = `chrome-extension://${extensionId}/website-blocker-panel.html`;
    await page.goto(panelUrl);
    await page.evaluate(() => chrome.storage.sync.set({
      websiteBlockerRules: [{ id: 'browser-rule', domain: 'example.com', enabled: true }],
      websiteBlockerSchedule: { start: '09:00', end: '17:00' },
      websiteBlockerChallengeEnabled: true
    }));
    await page.reload();
    await page.waitForSelector('.rule-item');
    assert.equal(await page.$('#challenge-enabled'), null);
    assert.equal(await page.$('#unblock-challenge'), null);

    await page.click('.rule-item .switch');
    await page.waitForFunction(async () => {
      const settings = await chrome.storage.sync.get('websiteBlockerRules');
      return settings.websiteBlockerRules[0].enabled === false && !document.getElementById('blocker-settings').disabled;
    });
    assert.equal(await page.$eval('.rule-item input', element => element.checked), false);
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.rule-item input')), true);
    await page.reload();
    await page.waitForSelector('.rule-item.inactive');
    assert.equal(await page.$eval('.rule-item input', element => element.checked), false);

    await page.click('.rule-item .switch');
    await page.waitForFunction(() => document.querySelector('.rule-item input').checked && !document.getElementById('blocker-settings').disabled);
    assert.equal(await page.evaluate(async () => (await chrome.storage.sync.get('websiteBlockerRules')).websiteBlockerRules[0].enabled), true);

    // Schedule changes still wait for an explicit save, but no longer for a quiz.
    await page.$eval('#blocked-start', element => { element.value = '22:00'; });
    await page.$eval('#blocked-end', element => { element.value = '06:00'; });
    assert.equal(await page.evaluate(async () => (await chrome.storage.sync.get('websiteBlockerSchedule')).websiteBlockerSchedule.start), '09:00');
    await page.click('#save-schedule-btn');
    await page.waitForFunction(async () => {
      const settings = await chrome.storage.sync.get('websiteBlockerSchedule');
      return settings.websiteBlockerSchedule.start === '22:00' && !document.getElementById('blocker-settings').disabled;
    });
    await page.reload();
    await page.waitForFunction(() => document.getElementById('blocked-start').value === '22:00' && document.getElementById('blocked-end').value === '06:00');

    await page.setViewport({ width: 360, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.click('.rule-item .btn-danger');
    await page.waitForFunction(() => document.getElementById('rules-empty') && !document.getElementById('blocker-settings').disabled);
    assert.deepEqual(await page.evaluate(async () => (await chrome.storage.sync.get('websiteBlockerRules')).websiteBlockerRules), []);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'domain-input');
    await page.reload();
    await page.waitForSelector('#rules-empty');

    // Add a new rule after clearing the list; it must be immediately usable.
    await page.$eval('#domain-input', element => { element.value = 'other.test'; });
    await page.click('#add-btn');
    await page.waitForSelector('.rule-item');
    assert.equal(await page.$eval('.rule-domain', element => element.textContent), 'other.test');
    assert.equal(await page.$eval('.rule-item input', element => element.checked), true);
    await page.setViewport({ width: 1000, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

    // Old backups and a stored true flag cannot restore the removed import restriction.
    const popup = await browser.newPage();
    popup.on('pageerror', error => errors.push(error.message));
    await popup.setRequestInterception(true);
    popup.on('request', request => {
      if (/^https?:/.test(request.url())) request.abort();
      else request.continue();
    });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForSelector('#import-file');
    await Promise.all([
      popup.waitForNavigation(),
      popup.evaluate(() => {
        const file = new File([JSON.stringify({ version: 1, data: {
          websiteBlockerChallengeEnabled: false,
          websiteBlockerRules: [],
          websiteBlockerSchedule: { start: '10:00', end: '12:00' }
        } })], 'settings.json', { type: 'application/json' });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const input = document.getElementById('import-file');
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })
    ]);
    await page.waitForFunction(() => document.getElementById('rules-empty') && document.getElementById('blocked-start').value === '10:00');
    const imported = await page.evaluate(() => chrome.storage.sync.get(['websiteBlockerRules', 'websiteBlockerSchedule', 'websiteBlockerChallengeEnabled']));
    assert.deepEqual(imported.websiteBlockerRules, []);
    assert.deepEqual(imported.websiteBlockerSchedule, { start: '10:00', end: '12:00' });
    assert.equal(imported.websiteBlockerChallengeEnabled, true, 'retired backup flag is ignored');
    assert.equal(await popup.$eval('#import-error', element => element.textContent), '');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
