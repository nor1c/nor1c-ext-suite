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

async function withPixivSaveButton(run, saved = false, html = '') {
  const executablePath = browserExecutable();
  assert.ok(executablePath, 'Chrome or Edge executable is required for browser test');
  const browser = await puppeteer.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.isNavigationRequest()) {
        request.respond({ status: 200, contentType: 'text/html', body: html || '<main><header><h1>Test artwork</h1></header><div id="actions"><div data-ga4-label="bookmark_button"><button class="gtm-main-bookmark" type="button">Love</button></div></div></main>' });
      } else request.abort();
    });
    await page.evaluateOnNewDocument(saved => {
      const posts = saved ? [{ id: '117787622', platform: 'pixiv', status: 'complete', folderIds: [] }] : [];
      window.sentMessages = [];
      window.chrome = {
        storage: {
          local: { get: async () => ({ savedXPosts: posts }) },
          onChanged: { addListener(listener) { window.storageListener = listener; } }
        },
        runtime: {
          sendMessage: async message => {
            window.sentMessages.push(message);
            return { success: true, folders: [] };
          }
        }
      };
    }, saved);
    await page.goto(ARTWORK_URL);
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'src/content/pixiv-saved-posts.css'), 'utf8').replace(/^@import[^;]+;/, '') });
    await page.addScriptTag({ path: path.join(root, 'src/content/pixiv-saved-posts.js') });
    await page.waitForSelector('#nor1c-save-pixiv-post');
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

for (const saved of [false, true]) {
  test(`Pixiv Save stays visible when native love replaces its action controls (${saved ? 'saved' : 'unsaved'})`, async () => {
    await withPixivSaveButton(async page => {
      await page.evaluate(() => {
        document.querySelector('.gtm-main-bookmark').addEventListener('click', () => {
          document.getElementById('actions').hidden = true;
          const actions = document.createElement('div');
          actions.id = 'liked-actions';
          actions.innerHTML = '<div data-ga4-label="bookmark_button"><span><button type="button" aria-pressed="true">Loved</button></span></div>';
          document.querySelector('main').appendChild(actions);
        }, { once: true });
      });
      await page.click('.gtm-main-bookmark');
      await page.waitForFunction(() => {
        const button = document.querySelector('#liked-actions #nor1c-save-pixiv-post');
        return button?.checkVisibility();
      }, { timeout: 3000 });
      assert.equal(await page.$$eval('#nor1c-save-pixiv-post', buttons => buttons.length), 1);
      assert.equal(await page.$eval('#nor1c-save-pixiv-post', button => button.dataset.state), saved ? 'saved' : 'idle');
      await page.click('#nor1c-save-pixiv-post');
      await page.waitForSelector('.nor1c-pixiv-folder-modal-host');
      assert.deepEqual(await page.evaluate(() => window.sentMessages), [{ type: 'get-saved-folders', platform: 'pixiv' }]);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.nor1c-pixiv-folder-modal-host', { hidden: true });
    }, saved);
  });
}

const bookmarkedToolbar = fs.readFileSync(path.join(root, 'tests/fixtures/pixiv-bookmarked-toolbar.html'), 'utf8')
  .replace('illust_id=149817033', 'illust_id=117787622');

for (const alreadyBookmarked of [false, true]) {
  test(`Pixiv Save mounts beside the supplied bookmark link (${alreadyBookmarked ? 'initial load' : 'after love'})`, async () => {
    await withPixivSaveButton(async page => {
      if (!alreadyBookmarked) {
        await page.evaluate(toolbar => {
          document.querySelector('.gtm-main-bookmark').addEventListener('click', () => {
            document.getElementById('actions').outerHTML = toolbar;
          }, { once: true });
        }, bookmarkedToolbar);
        await page.click('.gtm-main-bookmark');
      }
      await page.waitForSelector('main section > #nor1c-save-pixiv-post', { visible: true, timeout: 3000 });
      assert.equal(await page.$eval('#nor1c-save-pixiv-post', button => {
        const link = button.previousElementSibling?.querySelector('a');
        return link && new URL(link.href).searchParams.get('illust_id') === '117787622';
      }), true);
      assert.equal(await page.$$eval('#nor1c-save-pixiv-post', buttons => buttons.length), 1);
      assert.equal(await page.$eval('#nor1c-save-pixiv-post', button => button.dataset.state), 'saved');
      await page.click('#nor1c-save-pixiv-post');
      await page.waitForSelector('.nor1c-pixiv-folder-modal-host');
      assert.deepEqual(await page.evaluate(() => window.sentMessages), [{ type: 'get-saved-folders', platform: 'pixiv' }]);
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        const link = document.querySelector('main section a');
        const unrelated = document.createElement('div');
        unrelated.innerHTML = '<a href="https://example.com/bookmark_add.php?type=illust&illust_id=117787622">External</a><a href="/bookmark_add.php?type=illust&illust_id=123">Other artwork</a><a hidden href="/bookmark_add.php?type=illust&illust_id=117787622">Hidden</a>';
        document.querySelector('main').prepend(unrelated);
        window.expectedBookmark = link;
        document.getElementById('nor1c-save-pixiv-post').remove();
      });
      await page.waitForSelector('main section > #nor1c-save-pixiv-post', { visible: true });
      assert.equal(await page.$eval('#nor1c-save-pixiv-post', button => button.previousElementSibling.contains(window.expectedBookmark)), true);
    }, true, alreadyBookmarked ? `<main><h1>Test artwork</h1>${bookmarkedToolbar}</main>` : '');
  });
}

test('Pixiv Save follows visibility-only love updates and remounts after a toolbar replacement', async () => {
  await withPixivSaveButton(async page => {
    await page.evaluate(() => {
      const alternate = document.createElement('div');
      alternate.id = 'alternate-actions';
      alternate.hidden = true;
      alternate.innerHTML = '<div data-ga4-label="bookmark_button"><button type="button">Loved</button></div>';
      document.querySelector('main').appendChild(alternate);
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => {
      document.getElementById('actions').hidden = true;
      document.getElementById('alternate-actions').hidden = false;
    });
    await page.waitForSelector('#alternate-actions > #nor1c-save-pixiv-post', { visible: true });
    await page.evaluate(() => {
      document.getElementById('alternate-actions').replaceChildren();
      document.getElementById('actions').hidden = false;
    });
    await page.waitForSelector('#actions > #nor1c-save-pixiv-post', { visible: true });
    await page.evaluate(() => {
      document.querySelector('[data-ga4-label="bookmark_button"]').removeAttribute('data-ga4-label');
      document.getElementById('nor1c-save-pixiv-post').remove();
    });
    await page.waitForSelector('#actions > #nor1c-save-pixiv-post', { visible: true });
    await page.evaluate(() => { document.getElementById('actions').style.display = 'none'; });
    await page.waitForSelector('main header > #nor1c-save-pixiv-post', { visible: true });
    await page.evaluate(() => { document.getElementById('actions').style.display = ''; });
    await page.waitForSelector('#actions > #nor1c-save-pixiv-post', { visible: true });
    assert.equal(await page.$$eval('#nor1c-save-pixiv-post', buttons => buttons.length), 1);
  });
});

test('Pixiv Save binds to the new artwork after in-page navigation', async () => {
  await withPixivSaveButton(async page => {
    await page.evaluate(() => {
      history.pushState(null, '', '/artworks/123');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForFunction(() => document.getElementById('nor1c-save-pixiv-post')?.dataset.postId === '123');
    assert.equal(await page.$eval('#nor1c-save-pixiv-post', button => button.dataset.state), 'idle');
    await page.evaluate(() => {
      history.pushState(null, '', '/');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForSelector('#nor1c-save-pixiv-post', { hidden: true });
  }, true);
});

test('Pixiv Save mounting settles without repeatedly rewriting its own button', async () => {
  await withPixivSaveButton(async page => {
    const changes = await page.evaluate(async () => {
      const button = document.getElementById('nor1c-save-pixiv-post');
      let changes = 0;
      const observer = new MutationObserver(records => { changes += records.length; });
      observer.observe(button, { childList: true, subtree: true });
      await new Promise(resolve => setTimeout(resolve, 250));
      observer.disconnect();
      return changes;
    });
    assert.equal(changes, 0);
  });
});

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
