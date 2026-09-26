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

async function answerQuestion(page, correct = true) {
  const answer = await page.$eval('#challenge-question', element => {
    const [a, b, c, d, e] = element.textContent.match(/\d+/g).map(Number);
    return a * b + c * d - e;
  });
  await page.$eval('#challenge-answer', (element, value) => { element.value = String(value); }, correct ? answer : answer + 1);
  await page.click('#challenge-form button[type="submit"]');
}

async function solveQuiz(page) {
  for (let index = 0; index < 5; index++) await answerQuestion(page);
  await page.waitForFunction(() => !document.getElementById('unblock-challenge').open && !document.getElementById('blocker-settings').disabled);
}

test('blocker challenge works in the built extension, survives reload, and guards imports', { timeout: 60000 }, async () => {
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
      websiteBlockerChallengeEnabled: false
    }));
    await page.reload();
    await page.waitForSelector('.rule-item');
    await page.click('label[for="challenge-enabled"]');
    await page.waitForFunction(async () => (await chrome.storage.sync.get('websiteBlockerChallengeEnabled')).websiteBlockerChallengeEnabled === true);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('challenge-enabled').checked);

    await page.click('.rule-item .switch');
    await page.waitForSelector('#unblock-challenge[open]');
    assert.equal(await page.$eval('.rule-item input', element => element.checked), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'challenge-answer');
    await answerQuestion(page);
    await answerQuestion(page);
    assert.equal(await page.$eval('#challenge-progress', element => element.textContent), 'Question 3 of 5');
    await answerQuestion(page, false);
    assert.equal(await page.$eval('#challenge-progress', element => element.textContent), 'Question 1 of 5');
    assert.match(await page.$eval('#challenge-error', element => element.textContent), /Progress reset/);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('unblock-challenge').open && !document.getElementById('blocker-settings').disabled);
    assert.equal(await page.evaluate(async () => (await chrome.storage.sync.get('websiteBlockerRules')).websiteBlockerRules[0].enabled), true);
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.rule-item input')), true);

    // Reloading mid-quiz must not disable a site or retain partial progress.
    await page.click('.rule-item .switch');
    await page.waitForSelector('#unblock-challenge[open]');
    await answerQuestion(page);
    await page.reload();
    await page.waitForSelector('.rule-item');
    assert.equal(await page.$eval('.rule-item input', element => element.checked), true);
    await page.click('.rule-item .switch');
    await page.waitForSelector('#unblock-challenge[open]');
    assert.equal(await page.$eval('#challenge-progress', element => element.textContent), 'Question 1 of 5');
    await solveQuiz(page);
    assert.equal(await page.$eval('.rule-item input', element => element.checked), false);
    await page.click('.rule-item .switch');
    await page.waitForFunction(() => document.querySelector('.rule-item input').checked && !document.getElementById('blocker-settings').disabled);
    assert.equal(await page.$eval('#unblock-challenge', element => element.open), false);

    // A schedule change is staged until the explicit save passes the challenge.
    await page.$eval('#blocked-start', element => { element.value = '22:00'; });
    await page.click('#save-schedule-btn');
    await page.waitForSelector('#unblock-challenge[open]');
    assert.equal(await page.evaluate(async () => (await chrome.storage.sync.get('websiteBlockerSchedule')).websiteBlockerSchedule.start), '09:00');
    await page.click('#challenge-cancel');
    await page.waitForFunction(() => !document.getElementById('blocker-settings').disabled);
    assert.equal(await page.$eval('#blocked-start', element => element.value), '09:00');

    await page.setViewport({ width: 360, height: 740 });
    await page.click('.rule-item .btn-danger');
    await page.waitForSelector('#unblock-challenge[open]');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await page.$eval('#unblock-challenge', element => element.scrollWidth <= element.clientWidth), true);
    await page.click('#challenge-cancel');
    await page.waitForFunction(() => !document.getElementById('blocker-settings').disabled);
    await page.setViewport({ width: 1000, height: 800 });

    // Importing unrelated settings is allowed, but a backup cannot switch off protection.
    const popup = await browser.newPage();
    popup.on('pageerror', error => errors.push(error.message));
    await popup.setRequestInterception(true);
    popup.on('request', request => {
      if (/^https?:/.test(request.url())) request.abort();
      else request.continue();
    });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForSelector('#import-file');
    const attemptedImport = await popup.evaluate(async () => {
      let writes = 0;
      const set = chrome.storage.sync.set;
      chrome.storage.sync.set = async (...args) => { writes += 1; return set(...args); };
      const file = new File([JSON.stringify({ version: 1, data: { websiteBlockerChallengeEnabled: false, websiteBlockerRules: [] } })], 'settings.json', { type: 'application/json' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.getElementById('import-file');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => {
        const observer = new MutationObserver(() => {
          if (document.getElementById('import-error').textContent) { observer.disconnect(); resolve(); }
        });
        observer.observe(document.getElementById('import-error'), { childList: true });
      });
      chrome.storage.sync.set = set;
      return { writes, message: document.getElementById('import-error').textContent, settings: await chrome.storage.sync.get(['websiteBlockerChallengeEnabled', 'websiteBlockerRules']) };
    });
    assert.equal(attemptedImport.writes, 0);
    assert.match(attemptedImport.message, /Complete the challenge/);
    assert.equal(attemptedImport.settings.websiteBlockerChallengeEnabled, true);
    assert.equal(attemptedImport.settings.websiteBlockerRules.length, 1);

    await page.bringToFront();
    await page.click('label[for="challenge-enabled"]');
    await page.waitForSelector('#unblock-challenge[open]');
    await solveQuiz(page);
    assert.equal(await page.$eval('#challenge-enabled', element => element.checked), false);
    await page.reload();
    await page.waitForSelector('.rule-item');
    await page.click('.rule-item .btn-danger');
    await page.waitForSelector('#rules-empty');
    assert.equal(await page.$eval('#unblock-challenge', element => element.open), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
