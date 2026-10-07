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
        // Keep the probe pending: this test checks URL wiring and controls, not video decoding.
        return;
      } else {
        request.continue();
      }
    });
    await page.goto(`chrome-extension://${extensionId}/saved-posts.html`);
    await page.click('#images-only-btn');

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
          folderIds: ['folder-a', 'folder-b']
        }, {
          id: 'pixiv-hidden',
          platform: 'pixiv',
          url: 'https://www.pixiv.net/artworks/999',
          author: 'Hidden Pixiv artist',
          text: 'Must not appear in the X view',
          savedAt: Date.now(),
          status: 'complete',
          media: [],
          folderIds: ['pixiv-folder']
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
        savedXFolders: [
          { id: 'folder-a', name: 'Folder A', platform: 'x' },
          { id: 'folder-b', name: 'Folder B', platform: 'x' },
          { id: 'pixiv-folder', name: 'Pixiv Folder', platform: 'pixiv' }
        ]
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
      containsPixiv: Array.from(document.querySelectorAll('#posts-list .post'), card => card.dataset.postId).includes('pixiv-hidden'),
      folderCounts: Array.from(document.querySelectorAll('.folder-chip'), chip => ({ id: chip.dataset.folderId, count: chip.querySelector('.folder-chip-count')?.textContent })),
      firstPostBadges: Array.from(document.querySelectorAll('#posts-list .post:first-child .post-folder-badge'), badge => badge.textContent),
      unfiledBadge: document.querySelector('#posts-list .post:nth-child(5) .post-folder-badge')?.textContent,
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
    assert.equal(rendered.containsPixiv, false);
    assert.deepEqual(rendered.folderCounts, [{ id: '', count: '36' }, { id: 'folder-a', count: '4' }, { id: 'folder-b', count: '1' }]);
    assert.deepEqual(rendered.firstPostBadges, ['Folder A', 'Folder B']);
    assert.equal(rendered.unfiledBadge, 'Unfiled');
    assert.deepEqual(rendered.pagination, { hidden: false, status: 'Page 1 of 2', previousDisabled: true, nextDisabled: false });
    assert.deepEqual([...new Set(rendered.cardHeights.map(height => Math.round(height)))], [420]);
    assert.equal(rendered.bodyOverflow, 'hidden');
    assert.equal(rendered.mediaContainedAboveActions, true);

    await page.click('.media-item img');
    const viewerOpen = await page.$eval('#image-viewer', dialog => ({ open: dialog.open, imageSrc: dialog.querySelector('img').src }));
    assert.equal(viewerOpen.open, true);
    assert.equal(viewerOpen.imageSrc, 'https://pbs.twimg.com/media/ext-test.svg');
    await page.click('#image-viewer-media img');
    assert.equal(await page.$eval('#image-viewer', dialog => dialog.open), true);
    await page.mouse.click(4, 4);
    assert.equal(await page.$eval('#image-viewer', dialog => dialog.open), false);
    await page.click('.media-item img');
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

    await page.click('#pagination-prev');
    await page.waitForFunction(() => document.querySelectorAll('#posts-list .post').length === 30);
    const deletedId = await page.$eval('#posts-list .post:first-child', card => card.dataset.postId);
    await page.click('#posts-list .post:first-child .delete-button');
    const removingState = await page.$eval('#posts-list .post:first-child', card => ({
      removing: card.classList.contains('post-removing'),
      count: document.querySelectorAll('#posts-list .post').length
    }));
    assert.deepEqual(removingState, { removing: true, count: 30 });
    await page.waitForFunction(id => {
      const cards = Array.from(document.querySelectorAll('#posts-list .post'));
      const ids = cards.map(card => card.dataset.postId);
      return !ids.includes(id) && ids.length === 30 && new Set(ids).size === ids.length;
    }, {}, deletedId);
    const afterDelete = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('#posts-list .post'), card => card.dataset.postId);
      return {
        ids,
        storedCount: null,
        folderCount: document.querySelector('[data-folder-id=""] .folder-chip-count')?.textContent
      };
    });
    afterDelete.storedCount = await page.evaluate(async () => (await chrome.storage.local.get({ savedXPosts: [] })).savedXPosts.length);
    assert.equal(afterDelete.ids.includes(deletedId), false);
    assert.equal(new Set(afterDelete.ids).size, afterDelete.ids.length);
    assert.equal(afterDelete.ids.length, 30);
    assert.equal(afterDelete.storedCount, 36);
    assert.equal(afterDelete.folderCount, '35');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

for (const platform of ['x', 'pixiv']) {
  test(`built ${platform} saved-posts page defaults to images only and toggles full posts`, async () => {
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
      await page.setViewport({ width: 1440, height: 900 });
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (/^https:\/\/(pbs\.twimg\.com|i\.pximg\.net)\//.test(request.url())) {
          const height = request.url().includes('second') ? 40 : 90;
          request.respond({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="${height}"><rect width="60" height="${height}" fill="blue"/></svg>` });
        } else if (request.url().startsWith('http')) {
          request.abort();
        } else {
          request.continue();
        }
      });
      const filename = platform === 'pixiv' ? 'saved-pixiv-posts.html' : 'saved-posts.html';
      await page.goto(`chrome-extension://${extensionId}/${filename}`);
      await page.evaluate(async platform => {
        const url = platform === 'pixiv' ? 'https://i.pximg.net/img-original/test.jpg' : 'https://pbs.twimg.com/media/test.jpg';
        const base = {
          platform, author: 'Gallery author', savedAt: Date.now(), status: 'complete',
          url: platform === 'pixiv' ? 'https://www.pixiv.net/artworks/123' : 'https://x.com/noric/status/123',
          folderIds: ['pictures']
        };
        const image = { kind: 'image', status: 'linked', url };
        const video = { kind: 'video', status: 'unavailable', error: 'Video unavailable' };
        await chrome.storage.local.set({
          savedXPosts: [
            { ...base, id: 'text-only', media: [], folderIds: ['no-images'] },
            { ...base, id: 'video-only', media: [video], folderIds: ['no-images'] },
            { ...base, id: 'broken-image', media: [{ kind: 'image', status: 'unavailable', error: 'Image unavailable' }], folderIds: ['broken'] },
            ...Array.from({ length: 31 }, (_, index) => ({
              ...base, id: String(1000 + index),
              url: platform === 'pixiv' ? `https://www.pixiv.net/artworks/${1000 + index}` : `https://x.com/noric/status/${1000 + index}`,
              media: index === 0 ? [image, { ...image, url: url.replace('test', 'second') }, video]
                : index >= 2 && index <= 4 ? Array.from({ length: index + 1 }, (_, slot) => ({ ...image, url: url.replace('test', `image-${slot}`) })) : [image]
            }))
          ],
          savedXFolders: [
            { id: 'pictures', name: 'Pictures', platform },
            { id: 'no-images', name: 'No images', platform },
            { id: 'broken', name: 'Broken', platform }
          ]
        });
      }, platform);
      await page.waitForSelector('#posts-list .post:nth-child(30)');
      const storedBefore = await page.evaluate(() => chrome.storage.local.get(['savedXPosts', 'savedXFolders']));
      assert.equal(await page.$eval('#images-only-btn', button => button.getAttribute('aria-pressed')), 'true');
      assert.equal(await page.$eval('#images-only-btn', button => button.title), 'Show full posts');
      assert.equal(await page.$eval('#posts-list', list => list.classList.contains('images-only')), true);
      assert.equal(await page.$eval('.post-header', node => node.checkVisibility()), false);
      assert.equal(await page.$eval('.post-actions', node => node.checkVisibility()), false);
      assert.equal(await page.$eval('.fetch-raw-image', node => node.checkVisibility()), false);
      await page.click('#images-only-btn');
      await page.waitForSelector('[data-post-id="text-only"]');
      assert.equal(await page.$eval('#images-only-btn', button => button.getAttribute('aria-pressed')), 'false');
      assert.equal(await page.$eval('#images-only-btn', button => button.title), 'Show images only');
      assert.equal(await page.$eval('.post-header', node => node.checkVisibility()), true);
      assert.equal(await page.$eval('.post-actions', node => node.checkVisibility()), true);
      assert.equal(await page.$eval('.fetch-raw-image', node => node.checkVisibility()), true);
      const originalCardSize = await page.$eval('[data-post-id="1000"]', card => ({
        width: card.getBoundingClientRect().width, height: card.getBoundingClientRect().height
      }));

      await page.click('#images-only-btn');
      await page.waitForFunction(() => {
        const cards = document.querySelectorAll('#posts-list .post');
        const image = document.querySelector('[data-post-id="1000"] img');
        return cards.length === 30 && !document.querySelector('[data-post-id="text-only"]') && image?.complete && image.naturalWidth > 0;
      });
      const gallery = await page.evaluate(() => {
        const card = document.querySelector('[data-post-id="1000"]');
        const image = card.querySelector('img');
        const style = getComputedStyle(card);
        const mediaStyle = getComputedStyle(card.querySelector('.media-item'));
        const gridStyle = getComputedStyle(document.getElementById('posts-list'));
        return {
          pressed: document.getElementById('images-only-btn').getAttribute('aria-pressed'),
          chromeHidden: Array.from(document.querySelectorAll('.post-header, .post-folder-badges, .post-url, .post-actions, .post-status, .media-error, .fetch-raw-image')).every(node => !node.checkVisibility()),
          brokenHidden: !document.querySelector('[data-post-id="broken-image"]').checkVisibility(),
          videoCount: document.querySelectorAll('#posts-list video').length,
          imageCount: card.querySelectorAll('img').length,
          padding: style.padding, border: style.borderWidth, radius: style.borderRadius,
          softShadow: style.boxShadow.includes('0px 2px 6px 0px') && style.boxShadow.includes('0px 8px 24px 0px'),
          mediaBorder: mediaStyle.borderWidth, mediaRadius: mediaStyle.borderRadius,
          gridGap: gridStyle.gap, gridPadding: gridStyle.padding,
          imageFillsHalfWidth: Math.abs(image.getBoundingClientRect().width * 2 - card.getBoundingClientRect().width) < 1,
          imageFit: getComputedStyle(image).objectFit,
          allCardsSquare: Array.from(document.querySelectorAll('#posts-list .post')).filter(node => node.checkVisibility()).every(node => Math.abs(node.getBoundingClientRect().width - node.getBoundingClientRect().height) < 1),
          mediaFillsHeight: Math.abs(card.querySelector('.media-grid').getBoundingClientRect().height - card.getBoundingClientRect().height) < 1,
          imagesFillHeight: Array.from(card.querySelectorAll('img')).every(node => Math.abs(node.getBoundingClientRect().height - card.getBoundingClientRect().height) < 1),
          pagination: document.getElementById('pagination-status').textContent
        };
      });
      assert.deepEqual(gallery, {
        pressed: 'true', chromeHidden: true, brokenHidden: true, videoCount: 0, imageCount: 2,
        padding: '0px', border: '0px', radius: '8px', softShadow: true, mediaBorder: '0px', mediaRadius: '0px',
        gridGap: '12px', gridPadding: '12px 0px 0px', imageFillsHalfWidth: true, imageFit: 'contain',
        allCardsSquare: true, mediaFillsHeight: true, imagesFillHeight: true, pagination: 'Page 1 of 2'
      });
      assert.equal(await page.$eval('[data-post-id="1000"]', card => card.getBoundingClientRect().width), originalCardSize.width);
      const readImageLayouts = () => ['1000', '1001', '1002', '1003', '1004'].map(id => {
        const card = document.querySelector(`[data-post-id="${id}"]`);
        const bounds = card.getBoundingClientRect();
        const images = Array.from(card.querySelectorAll('img'), image => image.getBoundingClientRect());
        return {
          count: images.length,
          columns: new Set(images.map(image => Math.round(image.left))).size,
          rows: new Set(images.map(image => Math.round(image.top))).size,
          square: Math.abs(bounds.width - bounds.height) < 1,
          imageBorders: Array.from(card.querySelectorAll('img'), image => {
            const style = getComputedStyle(image);
            return { width: style.borderWidth, style: style.borderStyle };
          }),
          contained: images.every(image => image.left >= bounds.left - 1 && image.right <= bounds.right + 1 && image.top >= bounds.top - 1 && image.bottom <= bounds.bottom + 1),
          equalCells: images.every(image => Math.abs(image.width - images[0].width) < 1 && Math.abs(image.height - images[0].height) < 1)
        };
      });
      const expectedLayouts = [2, 1, 3, 4, 5].map(count => ({
        count, columns: Math.min(count, 2), rows: Math.ceil(count / 2), square: true,
        imageBorders: Array.from({ length: count }, () => ({ width: count > 1 ? '1px' : '0px', style: count > 1 ? 'solid' : 'none' })),
        contained: true, equalCells: true
      }));
      const readRowGap = () => {
        const cards = Array.from(document.querySelectorAll('#posts-list .post')).filter(card => card.checkVisibility()).map(card => card.getBoundingClientRect());
        const first = cards[0];
        const nextRow = cards.find(card => card.top > first.bottom);
        return Math.round(nextRow.top - first.bottom);
      };
      assert.deepEqual(await page.evaluate(readImageLayouts), expectedLayouts);
      assert.equal(await page.evaluate(readRowGap), 12);
      assert.equal(await page.$eval('[data-post-id="1001"] img', image => {
        const card = image.closest('.post').getBoundingClientRect();
        const bounds = image.getBoundingClientRect();
        return Math.abs(bounds.height - card.height) < 1 && Math.abs(bounds.width - card.width) < 1;
      }), true);
      assert.equal(await page.evaluate(() => {
        const sheet = Array.from(document.styleSheets).find(sheet => sheet.href?.endsWith('/saved-posts.css'));
        const hover = Array.from(sheet.cssRules).find(rule => rule.selectorText === '.posts-list.images-only .post:hover');
        const shadow = hover.style.boxShadow;
        return shadow.includes('0px 3px 8px') && shadow.includes('0px 12px 28px');
      }), true);
      await page.click('[data-post-id="1000"] img');
      assert.deepEqual(await page.$eval('#image-viewer', dialog => ({
        open: dialog.open,
        backdrop: getComputedStyle(dialog, '::backdrop').backgroundColor,
        imageOpacity: getComputedStyle(dialog.querySelector('.viewer-image')).opacity,
        dialogOpacity: getComputedStyle(dialog).opacity
      })), { open: true, backdrop: 'rgba(0, 0, 0, 0.9)', imageOpacity: '1', dialogOpacity: '1' });
      await page.keyboard.press('Escape');
      const firstImageSrc = await page.$eval('[data-post-id="1000"] img', image => image.src);
      await page.click('[data-post-id="1000"] .media-item:nth-child(2) img');
      assert.equal(await page.$eval('#image-viewer .viewer-image', image => image.src), firstImageSrc);
      await page.keyboard.press('ArrowRight');
      assert.match(await page.$eval('#image-viewer .viewer-image', image => image.src), /second/);
      await page.keyboard.press('Escape');
      for (const key of ['Enter', 'Space']) {
        await page.focus('[data-post-id="1000"] .media-item:nth-child(2) img');
        await page.keyboard.press(key);
        assert.equal(await page.$eval('#image-viewer .viewer-image', image => image.src), firstImageSrc);
        await page.keyboard.press('Escape');
      }
      const laterPostFirstImage = await page.$eval('[data-post-id="1003"] img', image => image.src);
      await page.click('[data-post-id="1003"] .media-item:nth-child(4) img');
      assert.equal(await page.$eval('#image-viewer .viewer-image', image => image.src), laterPostFirstImage);
      await page.keyboard.press('ArrowRight');
      assert.match(await page.$eval('#image-viewer .viewer-image', image => image.src), /image-1/);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      assert.match(await page.$eval('#image-viewer .viewer-image', image => image.src), /image-2/);
      await page.keyboard.press('Escape');

      await page.click('#pagination-next');
      await page.waitForFunction(() => document.querySelectorAll('#posts-list .post').length === 2);
      assert.equal(await page.$eval('#pagination-status', node => node.textContent), 'Page 2 of 2');
      await page.click('#refresh-btn');
      await page.waitForFunction(() => document.querySelectorAll('#posts-list .post').length === 2 && document.querySelector('#posts-list img')?.complete);
      assert.equal(await page.$eval('.post-actions', node => node.checkVisibility()), false);
      await page.click('[data-folder-id="no-images"]');
      await page.waitForFunction(() => document.querySelectorAll('#posts-list .post').length === 0);
      assert.equal(await page.$eval('#empty-state', node => node.checkVisibility()), true);
      await page.click('[data-folder-id="broken"]');
      await page.waitForSelector('[data-post-id="broken-image"]');
      assert.equal(await page.$eval('#empty-state', node => node.checkVisibility()), true);
      assert.equal(await page.$eval('[data-post-id="broken-image"]', node => node.checkVisibility()), false);
      await page.click('[data-folder-id="pictures"]');
      await page.waitForSelector('[data-post-id="1000"] img');
      assert.equal(await page.$eval('#empty-state', node => node.hidden), true);

      await page.setViewport({ width: 320, height: 720 });
      const mobile = await page.evaluate(() => {
        const card = document.querySelector('.post');
        const image = card.querySelector('img');
        const button = document.getElementById('images-only-btn').getBoundingClientRect();
        return {
          padding: getComputedStyle(card).padding,
          radius: getComputedStyle(card).borderRadius,
          square: Math.abs(card.getBoundingClientRect().width - card.getBoundingClientRect().height) < 1,
          hasShadow: getComputedStyle(card).boxShadow !== 'none',
          gap: getComputedStyle(document.getElementById('posts-list')).gap,
          imageFillsHalfWidth: Math.abs(image.getBoundingClientRect().width * 2 - card.getBoundingClientRect().width) < 1,
          toggleFits: button.left >= 0 && button.right <= innerWidth,
          noHorizontalOverflow: document.documentElement.scrollWidth === innerWidth
        };
      });
      assert.deepEqual(mobile, { padding: '0px', radius: '8px', square: true, hasShadow: true, gap: '12px', imageFillsHalfWidth: true, toggleFits: true, noHorizontalOverflow: true });
      assert.deepEqual(await page.evaluate(readImageLayouts), expectedLayouts);
      assert.equal(await page.evaluate(readRowGap), 12);
      await page.focus('#images-only-btn');
      await page.keyboard.press('Space');
      await page.waitForFunction(() => document.getElementById('images-only-btn').getAttribute('aria-pressed') === 'false' && document.querySelector('.post-header')?.checkVisibility());
      assert.equal(await page.$eval('.post-actions', node => node.checkVisibility()), true);
      assert.equal(await page.$eval('.post', node => getComputedStyle(node).padding), '12px');
      assert.equal(await page.$eval('.post', node => getComputedStyle(node).borderRadius), '14px');
      assert.ok(Math.abs(await page.$eval('.post', node => node.getBoundingClientRect().height) - originalCardSize.height) < 1);
      await page.focus('[data-post-id="1000"] .media-item:nth-child(2) img');
      await page.keyboard.press('Enter');
      assert.equal(await page.$eval('#image-viewer .viewer-image', image => image.src), firstImageSrc);
      await page.keyboard.press('Escape');
      await page.click('[data-folder-id=""]');
      await page.waitForSelector('[data-post-id="text-only"]');
      assert.equal(await page.$eval('[data-post-id="video-only"]', node => node.checkVisibility()), true);
      assert.equal(await page.$eval('.fetch-raw-image', node => node.checkVisibility()), true);
      const storedAfter = await page.evaluate(() => chrome.storage.local.get(['savedXPosts', 'savedXFolders']));
      assert.deepEqual(storedAfter, storedBefore);
      await page.reload();
      await page.waitForSelector('[data-post-id="1000"] img');
      assert.equal(new URL(page.url()).searchParams.get('view'), 'full');
      assert.equal(await page.$eval('#images-only-btn', button => button.getAttribute('aria-pressed')), 'false');
      assert.equal(await page.$eval('#images-only-btn', button => button.title), 'Show images only');
      assert.equal(await page.$eval('#posts-list', list => list.classList.contains('images-only')), false);
      assert.equal(await page.$eval('.post-actions', node => node.checkVisibility()), true);
      assert.equal(await page.$eval('[data-post-id="text-only"]', node => node.checkVisibility()), true);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });

  test(`built ${platform} saved-posts page restores URL navigation and clamps invalid pages`, async () => {
    const executablePath = browserExecutable();
    assert.ok(executablePath, 'Chrome or Edge executable is required for extension browser test');
    const browser = await puppeteer.launch({
      headless: false, executablePath, pipe: true,
      enableExtensions: [path.join(root, 'dist', 'chrome')]
    });
    try {
      const workerTarget = await browser.waitForTarget(target =>
        target.type() === 'service_worker' && target.url().endsWith('/background.chrome.js'));
      const extensionId = new URL(workerTarget.url()).hostname;
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewport({ width: 1440, height: 900 });
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (/^https:\/\/(pbs\.twimg\.com|i\.pximg\.net)\//.test(request.url())) {
          request.respond({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"></svg>' });
        } else if (request.url().startsWith('http')) request.abort();
        else request.continue();
      });
      const baseUrl = `chrome-extension://${extensionId}/${platform === 'pixiv' ? 'saved-pixiv-posts.html' : 'saved-posts.html'}`;
      const folder = 'album & 1';
      await page.goto(baseUrl);
      await page.evaluate(async ({ platform, folder }) => {
        const postUrl = id => platform === 'pixiv' ? `https://www.pixiv.net/artworks/${id}` : `https://x.com/noric/status/${id}`;
        const url = platform === 'pixiv' ? 'https://i.pximg.net/img-original/test.jpg' : 'https://pbs.twimg.com/media/test.jpg';
        await chrome.storage.local.set({
          savedXPosts: [
            ...Array.from({ length: 65 }, (_, index) => ({
              id: String(2000 + index), platform, url: postUrl(2000 + index), savedAt: Date.now(),
              media: [{ kind: 'image', status: 'linked', url }], folderIds: index < 31 ? [folder] : []
            })),
            ...['9000', '9001'].map(id => ({ id, platform, url: postUrl(id), media: [], folderIds: [folder] }))
          ],
          savedXFolders: [
            { id: folder, name: 'Album', platform }, { id: 'empty', name: 'Empty', platform },
            { id: 'foreign', name: 'Other platform', platform: platform === 'x' ? 'pixiv' : 'x' }
          ]
        });
      }, { platform, folder });
      const expectView = async (pageNumber, firstId, count, full = false, folderId = '') => {
        await page.waitForFunction(expected => {
          const cards = document.querySelectorAll('#posts-list .post');
          const params = new URLSearchParams(location.search);
          return cards.length === expected.count && (cards[0]?.dataset.postId || '') === expected.firstId &&
            params.get('page') === String(expected.pageNumber) && (params.get('folder') || '') === expected.folderId &&
            params.get('view') === (expected.full ? 'full' : null) &&
            document.getElementById('pagination-status').textContent.startsWith(`Page ${expected.pageNumber} of `) &&
            document.getElementById('images-only-btn').getAttribute('aria-pressed') === String(!expected.full) &&
            document.getElementById('posts-list').classList.contains('images-only') === !expected.full &&
            document.querySelector('.folder-chip.is-active')?.dataset.folderId === expected.folderId;
        }, {}, { pageNumber, firstId, count, full, folderId });
        assert.equal(await page.$eval('#page-error', node => node.textContent), '');
      };
      await expectView(1, '2000', 30);
      await page.goto(`${baseUrl}?page=2&folder=${encodeURIComponent(folder)}&view=full&keep=yes#grid`);
      await expectView(2, '2030', 3, true, folder);
      const deepLink = page.url();
      await page.reload();
      await expectView(2, '2030', 3, true, folder);
      assert.equal(page.url(), deepLink);
      assert.equal(await page.$eval('.post-actions', node => node.checkVisibility()), true);
      await page.evaluate(() => { window.navigationMarker = 'same-document'; });
      const historyLength = await page.evaluate(() => history.length);
      await page.click('#pagination-prev');
      await expectView(1, '2000', 30, true, folder);
      assert.equal(await page.evaluate(() => window.navigationMarker), 'same-document');
      assert.equal(new URL(page.url()).searchParams.get('keep'), 'yes');
      assert.equal(new URL(page.url()).hash, '#grid');
      await page.evaluate(() => history.back());
      await expectView(2, '2030', 3, true, folder);
      await page.evaluate(() => history.forward());
      await expectView(1, '2000', 30, true, folder);
      assert.equal(await page.evaluate(() => history.length), historyLength + 1);
      await page.click('#pagination-next');
      await expectView(2, '2030', 3, true, folder);
      await page.click('#images-only-btn');
      await expectView(1, '2000', 30, false, folder);
      await page.click('#pagination-next');
      await expectView(2, '2030', 1, false, folder);
      await page.reload();
      await expectView(2, '2030', 1, false, folder);
      await page.click('[data-folder-id=""]');
      await expectView(1, '2000', 30);
      await page.evaluate(() => history.back());
      await expectView(2, '2030', 1, false, folder);
      await page.evaluate(() => history.back());
      await expectView(1, '2000', 30, false, folder);
      await page.evaluate(() => history.back());
      await expectView(2, '2030', 3, true, folder);
      await page.evaluate(() => history.forward());
      await expectView(1, '2000', 30, false, folder);

      await page.evaluate(() => {
        const get = chrome.storage.local.get.bind(chrome.storage.local);
        chrome.storage.local.get = async defaults => {
          chrome.storage.local.get = get;
          const snapshot = await get(defaults);
          return new Promise(resolve => { window.releasePendingRead = () => resolve(snapshot); });
        };
      });
      await page.click('#pagination-next');
      await page.waitForFunction(() => typeof window.releasePendingRead === 'function');
      await page.evaluate(() => history.back());
      await page.waitForFunction(() => new URLSearchParams(location.search).get('page') === '1');
      await page.evaluate(async () => {
        window.releasePendingRead();
        delete window.releasePendingRead;
        await renderQueue;
      });
      await expectView(1, '2000', 30, false, folder);

      for (const value of ['0', '-1', '2.5', 'abc', '9007199254740992']) {
        await page.goto(`${baseUrl}?page=${value}`);
        await expectView(1, '2000', 30);
      }
      await page.goto(`${baseUrl}?page=999&view=unknown`);
      await expectView(3, '2060', 5);
      await page.goto(`${baseUrl}?page=2&folder=missing`);
      await expectView(1, '2000', 30);
      await page.goto(`${baseUrl}?page=2&folder=foreign`);
      await expectView(1, '2000', 30);
      await page.goto(`${baseUrl}?page=4&folder=empty`);
      await expectView(1, '', 0, false, 'empty');
      assert.equal(await page.$eval('#empty-state', node => node.checkVisibility()), true);

      await page.goto(`${baseUrl}?page=2&folder=${encodeURIComponent(folder)}&view=full`);
      await expectView(2, '2030', 3, true, folder);
      const historyBeforeDelete = await page.evaluate(() => history.length);
      for (let count = 3; count > 1; count -= 1) {
        await page.click('#posts-list .post:first-child .delete-button');
        await expectView(2, String(9003 - count), count - 1, true, folder);
      }
      await page.click('#posts-list .post:first-child .delete-button');
      await expectView(1, '2000', 30, true, folder);
      assert.equal(await page.evaluate(() => history.length), historyBeforeDelete);
      await page.reload();
      await expectView(1, '2000', 30, true, folder);
      page.once('dialog', dialog => dialog.accept());
      await page.click('.folder-chip.is-active + .folder-delete-button');
      await expectView(1, '2000', 30, true);
      await page.evaluate(async () => { await chrome.storage.local.set({ savedXPosts: [] }); });
      await expectView(1, '', 0, true);
      assert.equal(await page.$eval('#pagination', node => node.hidden), true);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
