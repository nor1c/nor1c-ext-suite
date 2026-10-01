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

test('built saved-posts page renders locally stored image and video media', async () => {
  const executablePath = browserExecutable();
  assert.ok(executablePath, 'Chrome or Edge executable is required for extension browser test');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    pipe: true,
    enableExtensions: [path.join(root, 'dist', 'chrome')]
  });

  try {
    const workerTarget = await browser.waitForTarget(target =>
      target.type() === 'service_worker' && target.url().endsWith('/background.chrome.js'));
    const extensionId = new URL(workerTarget.url()).hostname;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`chrome-extension://${extensionId}/saved-posts.html`);

    await page.evaluate(async () => {
      const image = new Blob([
        '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>'
      ], { type: 'image/svg+xml' });
      const video = new Blob([new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109])], { type: 'video/mp4' });
      await Nor1cSavedPosts.putMedia('browser-post:image-0', 'browser-post', image);
      await Nor1cSavedPosts.putMedia('browser-post:video-0', 'browser-post', video);
      await chrome.storage.local.set({
        savedXPosts: [{
          id: 'browser-post',
          url: 'https://x.com/noric/status/123',
          author: 'Test author',
          text: 'Saved media test',
          savedAt: Date.now(),
          status: 'complete',
          error: '',
          media: [
            { slot: 'image-0', kind: 'image', status: 'saved', mediaKey: 'browser-post:image-0', mimeType: 'image/svg+xml', size: image.size, error: '' },
            { slot: 'video-0', kind: 'video', status: 'saved', mediaKey: 'browser-post:video-0', mimeType: 'video/mp4', size: video.size, error: '' }
          ]
        }]
      });
    });

    await page.waitForSelector('.post .media-item img');
    await page.waitForSelector('.post .media-item video');
    const rendered = await page.evaluate(() => ({
      text: document.querySelector('.post-text')?.textContent,
      imageSrc: document.querySelector('.media-item img')?.src,
      videoSrc: document.querySelector('.media-item video')?.src,
      videoControls: document.querySelector('.media-item video')?.controls,
      emptyHidden: document.getElementById('empty-state').hidden
    }));

    assert.equal(rendered.text, 'Saved media test');
    assert.match(rendered.imageSrc, /^blob:chrome-extension:\/\//);
    assert.match(rendered.videoSrc, /^blob:chrome-extension:\/\//);
    assert.equal(rendered.videoControls, true);
    assert.equal(rendered.emptyHidden, true);

    await page.click('.media-item img');
    const viewerOpen = await page.$eval('#image-viewer', dialog => ({ open: dialog.open, imageSrc: dialog.querySelector('img').src }));
    assert.equal(viewerOpen.open, true);
    assert.match(viewerOpen.imageSrc, /^blob:chrome-extension:\/\//);
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#image-viewer', dialog => dialog.open), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
