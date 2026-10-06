const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');
const ARTWORK_URL = 'https://www.pixiv.net/artworks/117787622';
const IMAGE_URL = 'https://i.pximg.net/c/128x128/img-master/img/2024/04/13/04/30/25/117787622_p0_square1200.jpg';

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

test('Chrome displays authorized Pixiv media with the Pixiv referrer rule', { skip: !process.env.RUN_PIXIV_NETWORK_TEST }, async () => {
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
    await page.goto(`chrome-extension://${extensionId}/saved-pixiv-posts.html`);
    await page.evaluate(async ({ artworkUrl, imageUrl }) => {
      await chrome.storage.local.set({
        savedXPosts: [{
          id: 'x-hidden',
          platform: 'x',
          url: 'https://x.com/noric/status/123',
          author: 'Hidden X author',
          savedAt: Date.now(),
          status: 'complete',
          media: [],
          folderIds: []
        }, {
          id: '117787622',
          platform: 'pixiv',
          url: artworkUrl,
          author: 'Pixiv test',
          savedAt: Date.now(),
          status: 'complete',
          media: [{ slot: 'image-0', kind: 'image', status: 'linked', url: imageUrl }],
          folderIds: []
        }]
      });
    }, { artworkUrl: ARTWORK_URL, imageUrl: IMAGE_URL });

    await page.waitForFunction(() => {
      const image = document.querySelector('.media-item img');
      return image?.complete && image.naturalWidth > 0;
    }, { timeout: 30000 });
    const rendered = await page.evaluate(imageUrl => {
      const image = document.querySelector('.media-item img');
      return {
        src: image.src,
        width: image.naturalWidth,
        postIds: Array.from(document.querySelectorAll('#posts-list .post'), card => card.dataset.postId),
        title: document.getElementById('page-title').textContent
      };
    }, IMAGE_URL);
    assert.equal(rendered.src, IMAGE_URL);
    assert.ok(rendered.width > 0);
    assert.deepEqual(rendered.postIds, ['117787622']);
    assert.equal(rendered.title, 'Saved Pixiv Posts');
  } finally {
    await browser.close();
  }
});
