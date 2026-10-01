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

test('built saved-posts page renders media from stored source URLs', async () => {
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
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url() === 'https://pbs.twimg.com/media/ext-test.svg') {
        request.respond({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>' });
      } else if (request.url() === 'https://video.twimg.com/ext_test.mp4') {
        request.respond({ status: 200, contentType: 'video/mp4', body: Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]) });
      } else {
        request.continue();
      }
    });
    await page.goto(`chrome-extension://${extensionId}/saved-posts.html`);

    await page.evaluate(async () => {
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
            { slot: 'image-0', kind: 'image', status: 'linked', url: 'https://pbs.twimg.com/media/ext-test.svg', error: '' },
            { slot: 'video-0', kind: 'video', status: 'linked', url: 'https://video.twimg.com/ext_test.mp4', error: '' }
          ],
          folderIds: ['folder-a']
        }, ...Array.from({ length: 35 }, (_, index) => ({
          id: `text-post-${index}`,
          url: `https://x.com/noric/status/${200 + index}`,
          author: `Text author ${index}`,
          text: index === 0 ? 'A much longer saved post. '.repeat(12) : `Short post ${index}`,
          savedAt: Date.now(),
          status: 'complete',
          error: '',
          media: [],
          folderIds: index < 3 ? ['folder-a'] : []
        }))],
        savedXFolders: [{ id: 'folder-a', name: 'Folder A' }]
      });
    });

    await page.waitForSelector('.post .media-item img');
    await page.waitForSelector('.post .media-item video');
    await page.waitForSelector('#posts-list .post:nth-child(30)');
    const rendered = await page.evaluate(() => ({
      text: document.querySelector('.post-text')?.textContent,
      imageSrc: document.querySelector('.media-item img')?.src,
      videoSrc: document.querySelector('.media-item video')?.src,
      videoControls: document.querySelector('.media-item video')?.controls,
      emptyHidden: document.getElementById('empty-state').hidden,
      postCount: document.querySelectorAll('#posts-list .post').length,
      folderCounts: Array.from(document.querySelectorAll('.folder-chip'), chip => ({ id: chip.dataset.folderId, count: chip.querySelector('.folder-chip-count')?.textContent })),
      pagination: {
        hidden: document.getElementById('pagination').hidden,
        status: document.getElementById('pagination-status').textContent,
        previousDisabled: document.getElementById('pagination-prev').disabled,
        nextDisabled: document.getElementById('pagination-next').disabled
      },
      cardHeights: Array.from(document.querySelectorAll('#posts-list .post'), card => card.getBoundingClientRect().height),
      bodyOverflow: getComputedStyle(document.querySelector('#posts-list .post:nth-child(2) .post-body')).overflow,
      mediaContainedAboveActions: (() => {
        const media = document.querySelector('.media-item img');
        const actions = media.closest('.post').querySelector('.post-actions');
        return media.getBoundingClientRect().bottom <= actions.getBoundingClientRect().top;
      })()
    }));

    assert.equal(rendered.text, undefined);
    assert.equal(rendered.imageSrc, 'https://pbs.twimg.com/media/ext-test.svg');
    assert.equal(rendered.videoSrc, 'https://video.twimg.com/ext_test.mp4');
    assert.equal(rendered.videoControls, true);
    assert.equal(rendered.emptyHidden, true);
    assert.equal(rendered.postCount, 30);
    assert.deepEqual(rendered.folderCounts, [{ id: '', count: '36' }, { id: 'folder-a', count: '4' }]);
    assert.deepEqual(rendered.pagination, { hidden: false, status: 'Page 1 of 2', previousDisabled: true, nextDisabled: false });
    assert.deepEqual([...new Set(rendered.cardHeights.map(height => Math.round(height)))], [420]);
    assert.equal(rendered.bodyOverflow, 'hidden');
    assert.equal(rendered.mediaContainedAboveActions, true);

    await page.click('.media-item img');
    const viewerOpen = await page.$eval('#image-viewer', dialog => ({ open: dialog.open, imageSrc: dialog.querySelector('img').src }));
    assert.equal(viewerOpen.open, true);
    assert.equal(viewerOpen.imageSrc, 'https://pbs.twimg.com/media/ext-test.svg');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#image-viewer', dialog => dialog.open), false);

    await page.click('#pagination-next');
    await page.waitForFunction(() => document.querySelectorAll('#posts-list .post').length === 6);
    const secondPage = await page.evaluate(() => ({
      postCount: document.querySelectorAll('#posts-list .post').length,
      status: document.getElementById('pagination-status').textContent,
      previousDisabled: document.getElementById('pagination-prev').disabled,
      nextDisabled: document.getElementById('pagination-next').disabled
    }));
    assert.deepEqual(secondPage, { postCount: 6, status: 'Page 2 of 2', previousDisabled: false, nextDisabled: true });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
