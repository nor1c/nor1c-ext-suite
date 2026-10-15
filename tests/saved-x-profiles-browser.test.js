const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');

function browserExecutable() {
  return [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(file => file && fs.existsSync(file));
}
const imageResponse = { status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#1976d2"/></svg>' };
const timelinePayload = (count, start, end = false) => ({ data: { user: { result: {
  rest_id: '42', core: { screen_name: 'alice' }, timeline_v2: { timeline: { instructions: [
    { type: 'TimelineAddEntries', entries: [
      ...Array.from({ length: count }, (_, index) => ({ content: { itemContent: { tweet_results: { result: {
        rest_id: String(10000 + start + index), core: { user_results: { result: { rest_id: '42', core: { screen_name: 'alice' } } } },
        legacy: { extended_entities: { media: [{ type: 'photo', media_url_https: `https://pbs.twimg.com/media/virtual_${start + index}.jpg` }] } }
      } } } } })),
      ...(!end ? [{ content: { entryType: 'TimelineTimelineCursor', cursorType: 'Bottom', value: `page-${start + count}` } }] : [])
    ] }, ...(end ? [{ type: 'TimelineTerminateTimeline', direction: 'Bottom' }] : [])
  ] } }
} } } });
const fixture = user => `<!DOCTYPE html><html><body><main><div data-testid="primaryColumn">
  <a href="/${user}/status/123/photo/1"><img alt="First photo" src="https://pbs.twimg.com/media/${user}_one?format=jpg&name=small"></a>
  <a href="/${user}/status/123/photo/2"><img alt="Second photo" src="https://pbs.twimg.com/media/${user}_two.jpg"></a>
  <a href="/foreign/status/222/photo/1"><img src="https://pbs.twimg.com/media/foreign.jpg"></a>
  <a href="/${user}/status/333/photo/1"><img src="https://pbs.twimg.com/profile_images/avatar.jpg"></a>
  <div data-testid="videoPlayer"><a href="/${user}/status/444/photo/1"><img src="https://pbs.twimg.com/media/video.jpg"></a></div>
</div></main><aside><a href="/${user}/status/555/photo/1"><img src="https://pbs.twimg.com/media/sidebar.jpg"></a></aside></body></html>`;

async function intercept(page, user, timelineHandler) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/UserMedia') && timelineHandler) { timelineHandler(request, url); }
    else if (url.hostname === 'x.com' && request.isNavigationRequest()) request.respond({ status: 200, contentType: 'text/html', body: fixture(user) });
    else if (url.hostname === 'pbs.twimg.com') request.respond(url.pathname.includes('broken') ? { status: 404, body: '' } : imageResponse);
    else if (url.protocol.startsWith('http')) request.abort();
    else request.continue();
  });
}

test('automatic loading drains delayed virtualized batches, stops at a jittering bottom and closes only its media tab', { timeout: 110000 }, async () => {
  const executablePath = browserExecutable();
  assert.ok(executablePath, 'Chrome or Edge is required');
  const browser = await puppeteer.launch({ headless: false, executablePath, pipe: true, enableExtensions: [path.join(root, 'dist/chrome')] });
  try {
    const worker = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().endsWith('/background.chrome.js'));
    const extensionId = new URL(worker.url()).hostname;
    const gallery = await browser.newPage();
    await intercept(gallery);
    await gallery.goto(`chrome-extension://${extensionId}/saved-x-profiles.html`);
    const media = await browser.newPage();
    await intercept(media, 'alice', (request, url) => {
      const vars = JSON.parse(url.searchParams.get('variables'));
      const start = Number((vars.cursor || 'page-0').split('-')[1]);
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(timelinePayload(130, start, start === 260)) });
    });
    await media.goto('https://x.com/alice/media?filter=photo');
    await media.evaluate(() => {
      document.body.innerHTML = '<main><div id="scroller" style="height:400px;overflow-y:auto"><div data-testid="primaryColumn" style="display:grid;grid-template-columns:repeat(10,60px)"></div></div></main>';
      const scroller = document.getElementById('scroller');
      const primary = document.querySelector('[data-testid="primaryColumn"]');
      window.batchNumber = 0;
      window.scrollEvents = 0;
      setInterval(() => {
        if (window.batchNumber !== 2) return;
        // Infinite timelines can keep resizing and refreshing thumbnail URLs at the end.
        primary.style.paddingBottom = `${Date.now() % 5}px`;
        const lastImage = primary.querySelector('a:last-child img');
        if (lastImage) lastImage.src = `https://pbs.twimg.com/media/virtual_389.jpg?name=${Date.now() % 2 ? 'small' : 'medium'}`;
      }, 600);
      let pending = false;
      function mount() {
        // X-like virtualization: earlier nodes are removed, not appended forever.
        primary.replaceChildren();
        for (let i = 0; i < 130; i += 1) {
          const n = window.batchNumber * 130 + i;
          const anchor = document.createElement('a');
          anchor.href = `/alice/status/${10000 + n}/photo/1`;
          anchor.innerHTML = `<img width="60" height="60" src="https://pbs.twimg.com/media/virtual_${n}.jpg">`;
          primary.appendChild(anchor);
        }
        scroller.scrollTop = 0;
      }
      mount();
      scroller.addEventListener('scroll', () => {
        window.scrollEvents += 1;
        if (pending || window.batchNumber >= 2 || scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 2) return;
        pending = true;
        primary.setAttribute('aria-busy', 'true');
        setTimeout(async () => {
          window.batchNumber += 1;
          const variables = encodeURIComponent(JSON.stringify({ userId: '42', cursor: `page-${window.batchNumber * 130}` }));
          await fetch(`/i/api/graphql/liveQuery/UserMedia?variables=${variables}`);
          mount();
          primary.removeAttribute('aria-busy');
          pending = false;
        }, window.batchNumber === 0 ? 5500 : 200);
      });
    });
    // Saving now starts the autoloader, without the test issuing any scroll command.
    await gallery.bringToFront();
    await gallery.click('#add-profiles');
    await gallery.type('#profile-urls', 'https://x.com/alice');
    await gallery.click('#save-profiles');
    await gallery.waitForFunction(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles[0]?.photos.length === 390, { timeout: 35000 });
    const photos = await gallery.evaluate(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles[0].photos);
    assert.equal(new Set(photos.map(photo => photo.id)).size, 390);
    // The final response can close the tab before X paints all its new DOM nodes.

    await gallery.waitForFunction(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles[0].collection.tabCloseState === 'closed', { timeout: 45000, polling: 500 });
    assert.match(await gallery.$eval('#collection-status', node => node.textContent), /Finished · tab closed/);
    assert.equal(media.isClosed(), true);
    assert.equal(gallery.isClosed(), false);
    assert.equal(await gallery.evaluate(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles[0].photos.length), 390);

  } finally { await browser.close(); }
});

test('an actual XHR end response closes immediately despite stale spinner and missing photo DOM', { timeout: 20000 }, async () => {
  const browser = await puppeteer.launch({ headless: false, executablePath: browserExecutable(), pipe: true, enableExtensions: [path.join(root, 'dist/chrome')] });
  try {
    const worker = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().endsWith('/background.chrome.js'));
    const gallery = await browser.newPage();
    await intercept(gallery);
    await gallery.goto(`chrome-extension://${new URL(worker.url()).hostname}/saved-x-profiles.html`);
    const media = await browser.newPage();
    await intercept(media, 'alice', request => request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(timelinePayload(2, 0, true)) }));
    await media.goto('https://x.com/alice/media?filter=photo');
    await media.evaluate(() => {
      document.body.innerHTML = '<main><div data-testid="primaryColumn" aria-busy="true"><div role="progressbar">Loading…</div></div></main><div role="dialog" hidden></div>';
    });
    await gallery.bringToFront();
    await gallery.click('#add-profiles');
    await gallery.type('#profile-urls', 'https://x.com/alice');
    await gallery.click('#save-profiles');
    await gallery.waitForFunction(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles[0]?.collection?.state === 'loading');
    const latePhotoAt = Date.now();
    await media.evaluate(() => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/i/api/graphql/liveQuery/UserMedia?variables=' + encodeURIComponent(JSON.stringify({ userId: '42', cursor: 'last-page' })));
      xhr.send();
    });
    await gallery.waitForFunction(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles[0]?.collection.tabCloseState === 'closed', { timeout: 5000, polling: 100 });
    const saved = await gallery.evaluate(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles[0]);
    assert.equal(saved.collection.state, 'finished');
    assert.equal(saved.photos.length, 2);
    assert.ok(saved.collection.updatedAt - latePhotoAt < 4000);
    assert.equal(media.isClosed(), true);
    assert.equal(gallery.isClosed(), false);
    assert.match(await gallery.$eval('#collection-status', node => node.title), /X reported the end/);
    assert.equal(await gallery.$eval('#collection-status', node => node.textContent), 'Finished · tab closed');
  } finally { await browser.close(); }
});

test('GraphQL errors stop collection without closing and passive observer leaves ordinary requests untouched', { timeout: 20000 }, async () => {
  const browser = await puppeteer.launch({ headless: false, executablePath: browserExecutable(), pipe: true, enableExtensions: [path.join(root, 'dist/chrome')] });
  try {
    const worker = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().endsWith('/background.chrome.js'));
    const gallery = await browser.newPage();
    await intercept(gallery);
    await gallery.goto(`chrome-extension://${new URL(worker.url()).hostname}/saved-x-profiles.html`);
    const media = await browser.newPage();
    let requests = 0;
    await intercept(media, 'alice', request => {
      requests += 1;
      request.respond({ status: 429, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'Rate limited' }] }) });
    });
    await media.goto('https://x.com/alice/media?filter=photo');
    await gallery.bringToFront();
    await gallery.click('#add-profiles');
    await gallery.type('#profile-urls', 'https://x.com/alice');
    await gallery.click('#save-profiles');
    await gallery.waitForFunction(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles[0]?.collection?.state === 'loading');
    const response = await media.evaluate(async () => {
      const result = await fetch('/i/api/graphql/live/UserMedia?variables=' + encodeURIComponent(JSON.stringify({ userId: '42' })));
      return { status: result.status, body: await result.json() };
    });
    assert.equal(response.status, 429);
    assert.equal(response.body.errors[0].message, 'Rate limited');
    await gallery.waitForFunction(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles[0]?.collection?.state === 'error', { timeout: 5000, polling: 100 });
    assert.equal(requests, 1);
    assert.equal(media.isClosed(), false);
    assert.equal(gallery.isClosed(), false);
  } finally { await browser.close(); }
});

test('forged page end message cannot authorize closing without an observed timeline response', { timeout: 15000 }, async () => {
  const browser = await puppeteer.launch({ headless: false, executablePath: browserExecutable(), pipe: true, enableExtensions: [path.join(root, 'dist/chrome')] });
  try {
    const worker = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().endsWith('/background.chrome.js'));
    const gallery = await browser.newPage();
    await intercept(gallery);
    await gallery.goto(`chrome-extension://${new URL(worker.url()).hostname}/saved-x-profiles.html`);
    const media = await browser.newPage();
    await intercept(media, 'alice');
    await media.goto('https://x.com/alice/media?filter=photo');
    await gallery.bringToFront();
    await gallery.click('#add-profiles');
    await gallery.type('#profile-urls', 'https://x.com/alice');
    await gallery.click('#save-profiles');
    await gallery.waitForFunction(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles[0]?.collection?.state === 'loading');
    await media.evaluate(() => {
      window.postMessage({ channel: 'nor1c-x-media-timeline-v1', kind: 'state', href: location.href, profileId: 'alice', state: 'end', pending: 0, revision: 9000, photos: [] }, location.origin);
    });
    await gallery.waitForFunction(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles[0]?.collection?.state === 'error', { timeout: 5000, polling: 100 });
    assert.equal(media.isClosed(), false);
  } finally { await browser.close(); }
});

test('compact profile page prioritizes the grid and keeps add dialog, actions and warnings accessible', { timeout: 30000 }, async () => {
  const browser = await puppeteer.launch({ headless: false, executablePath: browserExecutable(), pipe: true, enableExtensions: [path.join(root, 'dist/chrome')] });
  try {
    const worker = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().endsWith('/background.chrome.js'));
    const page = await browser.newPage();
    await intercept(page);
    await page.goto(`chrome-extension://${new URL(worker.url()).hostname}/saved-x-profiles.html`);
    assert.equal(await page.$eval('#add-profiles-dialog', node => node.open), false);
    assert.equal(await page.$eval('#profile-urls', node => node.checkVisibility()), false);
    assert.equal(await page.$eval('#profile-actions', node => node.hidden), true);
    await page.focus('#add-profiles');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'profile-urls');
    await page.type('#profile-urls', 'https://x.com/alice');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'add-profiles');
    assert.equal(await page.$eval('#add-profiles-dialog', node => node.open), false);
    await page.click('#add-profiles');
    assert.equal(await page.$eval('#profile-urls', node => node.value), 'https://x.com/alice');
    await page.click('#cancel-add-profiles');
    await page.evaluate(() => chrome.storage.local.set({ savedXProfiles: [{
      id: 'alice', username: 'alice', url: 'https://x.com/alice/media?filter=photo',
      photos: [{ url: 'https://pbs.twimg.com/media/compact.jpg', postUrl: 'https://x.com/alice/status/1' }]
    }] }));
    await page.waitForSelector('.profile-post');
    for (const width of [1280, 320]) {
      await page.setViewport({ width, height: 900 });
      const layout = await page.evaluate(() => ({
        gridTop: document.getElementById('profile-photos').getBoundingClientRect().top,
        overflow: document.documentElement.scrollWidth > innerWidth,
        formVisible: document.getElementById('profile-urls').checkVisibility(),
        statusVisible: document.getElementById('collection-status').checkVisibility(),
        errorVisible: document.getElementById('page-error').checkVisibility(),
        summary: document.getElementById('gallery-summary').textContent,
        labels: ['load-profile', 'delete-profile'].map(id => document.getElementById(id).getAttribute('aria-label'))
      }));
      assert.ok(layout.gridTop < (width === 320 ? 260 : 110), JSON.stringify(layout));
      assert.equal(layout.overflow, false);
      assert.equal(layout.formVisible, false);
      assert.equal(layout.statusVisible, false);
      assert.equal(layout.errorVisible, false);
      assert.equal(layout.summary, '1 photo');
      assert.deepEqual(layout.labels, ['Load older photos', 'Remove profile']);
      await page.click('#add-profiles');
      assert.equal(await page.evaluate(() => {
        const bounds = document.getElementById('add-profiles-dialog').getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth;
      }), true);
      await page.keyboard.press('Escape');
    }
    await page.evaluate(async () => {
      const { savedXProfiles } = await chrome.storage.local.get('savedXProfiles');
      savedXProfiles[0].collection = { state: 'loading' };
      await chrome.storage.local.set({ savedXProfiles });
    });
    await page.waitForFunction(() => document.getElementById('load-profile').getAttribute('aria-label') === 'Show loading tab');
    assert.equal(await page.$eval('#stop-profile', node => node.checkVisibility()), true);
    assert.equal(await page.$eval('#collection-status', node => node.textContent), 'Loading photos…');
    await page.evaluate(async () => {
      const { savedXProfiles } = await chrome.storage.local.get('savedXProfiles');
      savedXProfiles[0].storageLimited = true;
      savedXProfiles[0].collection = { state: 'limit' };
      await chrome.storage.local.set({ savedXProfiles });
    });
    await page.waitForFunction(() => document.getElementById('collection-status').dataset.state === 'warning');
    assert.match(await page.$eval('#collection-status', node => node.textContent), /Storage full/);
    assert.equal(await page.$eval('#stop-profile', node => node.hidden), true);
    await page.evaluate(() => chrome.storage.local.set({ savedXProfiles: [] }));
    await page.waitForFunction(() => document.getElementById('profile-actions').hidden);
    assert.equal(await page.$eval('#gallery-title', node => node.textContent), 'Saved X Profiles');
    assert.equal(await page.$eval('#gallery-summary', node => node.textContent), '');
  } finally { await browser.close(); }
});

test('profile grid matches Saved X Posts squares and 1–4 photo layouts on desktop and mobile', { timeout: 45000 }, async () => {
  const browser = await puppeteer.launch({ headless: false, executablePath: browserExecutable(), pipe: true, enableExtensions: [path.join(root, 'dist/chrome')] });
  try {
    const worker = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().endsWith('/background.chrome.js'));
    const base = `chrome-extension://${new URL(worker.url()).hostname}`;
    const profiles = await browser.newPage();
    const posts = await browser.newPage();
    await intercept(profiles);
    await intercept(posts);
    await profiles.goto(`${base}/saved-x-profiles.html`);
    await profiles.evaluate(async () => {
      const photos = [];
      const savedXPosts = [];
      for (let count = 1; count <= 4; count += 1) {
        const postUrl = `https://x.com/alice/status/${count}`;
        const media = [];
        for (let i = 0; i < count; i += 1) {
          const url = `https://pbs.twimg.com/media/group_${count}_${i}?format=jpg&name=orig`;
          photos.push({ id: `group_${count}_${i}`, url, postUrl });
          media.push({ kind: 'image', url, status: 'linked' });
        }
        savedXPosts.push({ id: String(count), url: postUrl, media, folderIds: [] });
      }
      await chrome.storage.local.set({ savedXPosts, savedXProfiles: [{ id: 'alice', username: 'alice', url: 'https://x.com/alice/media?filter=photo', photos }] });
    });
    await posts.goto(`${base}/saved-posts.html`);
    await profiles.waitForSelector('.profile-post:nth-child(4)');
    await posts.waitForSelector('.post:nth-child(4)');
    const layouts = () => {
      const grid = document.querySelector('.posts-list');
      const css = getComputedStyle(grid);
      const round = value => Math.round(value * 100) / 100;
      return {
        gap: css.gap, columns: css.gridTemplateColumns,
        overflow: document.documentElement.scrollWidth > innerWidth,
        cards: Array.from(grid.querySelectorAll('.post'), card => {
          const bounds = card.getBoundingClientRect();
          const style = getComputedStyle(card);
          return {
            width: round(bounds.width), height: round(bounds.height), radius: style.borderRadius,
            padding: style.padding, border: style.borderWidth, shadow: style.boxShadow,
            images: Array.from(card.querySelectorAll('.media-item img'), image => {
              const rect = image.getBoundingClientRect();
              const style = getComputedStyle(image);
              return { x: round(rect.x - bounds.x), y: round(rect.y - bounds.y), width: round(rect.width), height: round(rect.height), fit: style.objectFit, border: style.borderWidth };
            })
          };
        })
      };
    };
    for (const width of [1280, 320]) {
      await profiles.setViewport({ width, height: 900 });
      await posts.setViewport({ width, height: 900 });
      await profiles.bringToFront();
      const profileLayout = await profiles.evaluate(layouts);
      await posts.bringToFront();
      const postLayout = await posts.evaluate(layouts);
      assert.deepEqual(profileLayout, postLayout);
      assert.equal(profileLayout.overflow, false);
      assert.ok(profileLayout.cards.every(card => Math.abs(card.width - card.height) < 1));
      assert.deepEqual(profileLayout.cards.map(card => card.images.length), [1, 2, 3, 4]);
    }
    await profiles.bringToFront();
    await profiles.focus('.profile-post:nth-child(4) .media-item:nth-child(3) img');
    await profiles.keyboard.press('Enter');
    assert.match(await profiles.$eval('#viewer-image', img => img.src), /group_4_2/);
    await profiles.keyboard.press('ArrowRight');
    assert.match(await profiles.$eval('#viewer-image', img => img.src), /group_4_3/);
    await profiles.keyboard.press('Escape');
    await profiles.reload();
    await profiles.waitForSelector('.profile-post:nth-child(4)');
    assert.equal(await profiles.$$eval('.profile-post', cards => cards.length), 4);
  } finally { await browser.close(); }
});

test('built profile gallery saves links, collects live DOM batches, isolates profiles/posts and supports recovery', { timeout: 90000 }, async () => {
  const executablePath = browserExecutable();
  assert.ok(executablePath, 'Chrome or Edge is required');
  const browser = await puppeteer.launch({ headless: false, executablePath, pipe: true, enableExtensions: [path.join(root, 'dist/chrome')] });
  try {
    const worker = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().endsWith('/background.chrome.js'));
    const extensionId = new URL(worker.url()).hostname;
    const page = await browser.newPage();
    await intercept(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`chrome-extension://${extensionId}/saved-x-profiles.html`);
    await page.evaluate(() => chrome.storage.local.set({ savedXPosts: [{ id: 'keep-post', url: 'https://x.com/alice/status/123', media: [] }], savedXFolders: [{ id: 'keep-folder' }] }));
    const before = await page.evaluate(() => chrome.storage.local.get(['savedXPosts', 'savedXFolders']));
    const alice = await browser.newPage();
    await intercept(alice, 'alice');
    await alice.goto('https://x.com/alice/media?filter=photo');
    const bob = await browser.newPage();
    await intercept(bob, 'bob');
    await bob.goto('https://x.com/bob/media?filter=photo');
    await page.bringToFront();
    await page.click('#add-profiles');
    await page.type('#profile-urls', 'https://x.com/@Alice/media?filter=photo\nhttps://twitter.com/bob\nhttps://x.com/alice');
    await page.click('#save-profiles');
    await page.waitForFunction(() => document.querySelectorAll('#profiles-list button').length === 2 && document.querySelectorAll('#profile-photos img').length === 2);
    assert.equal(await page.$eval('#gallery-title', el => el.textContent), '@alice');
    const profiles = await page.evaluate(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles);
    assert.equal(profiles.length, 2);
    assert.deepEqual(profiles.find(profile => profile.id === 'alice').photos.map(photo => photo.id), ['alice_one', 'alice_two']);
    await page.waitForFunction(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles.find(profile => profile.id === 'bob')?.photos.length === 2);
    assert.equal((await browser.pages()).filter(tab => tab.url().includes('x.com/') && tab.url().includes('/media')).length, 2, 'Existing tabs are reused');

    await page.focus('.profile-photo-open');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('profile-viewer').open);
    assert.match(await page.$eval('#viewer-image', el => el.src), /alice_one.*name=orig/);
    await page.keyboard.press('ArrowRight');
    assert.match(await page.$eval('#viewer-image', el => el.src), /alice_two/);
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#profile-viewer', el => el.open), false);

    // An X SPA navigation with stale Alice DOM must not attribute it to Bob.
    await alice.evaluate(() => history.pushState(null, '', '/bob/media?filter=photo'));
    await alice.evaluate(() => {
      const primary = document.querySelector('[data-testid="primaryColumn"]');
      const anchor = document.createElement('a');
      anchor.href = '/alice/status/777/photo/1';
      anchor.innerHTML = '<img src="https://pbs.twimg.com/media/alice_stale.jpg">';
      primary.appendChild(anchor);
      const marker = document.createElement('a');
      marker.href = '/bob/status/778/photo/1';
      marker.innerHTML = '<img src="https://pbs.twimg.com/media/bob_spa.jpg">';
      primary.appendChild(marker);
    });
    await page.waitForFunction(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles.find(profile => profile.id === 'bob').photos.some(photo => photo.id === 'bob_spa'));
    assert.equal(await page.evaluate(async () => (await chrome.storage.local.get('savedXProfiles')).savedXProfiles.some(profile => profile.photos.some(photo => photo.id === 'alice_stale'))), false);
    await alice.evaluate(() => history.pushState(null, '', '/alice/media?filter=photo'));
    await alice.evaluate(() => {
      const root = document.querySelector('[data-testid="primaryColumn"]');
      root.querySelector('a[href*="777"]').remove();
      for (let i = 0; i < 65; i += 1) {
        const anchor = document.createElement('a');
        anchor.href = `/alice/status/${1000 + i}/photo/1`;
        const image = document.createElement('img');
        image.src = `https://pbs.twimg.com/media/more_${i}.jpg`;
        anchor.appendChild(image);
        root.appendChild(anchor);
      }
    });
    await page.waitForFunction(() => document.getElementById('gallery-summary').textContent === '67 photos');
    assert.equal(await page.$$eval('.profile-post', nodes => nodes.length), 30);
    await page.click('#photos-next');
    assert.equal(await page.$$eval('.profile-post', nodes => nodes.length), 30);
    await page.click('[data-profile-id="bob"]');
    assert.equal(await page.$$eval('.profile-post', nodes => nodes.length), 2);
    assert.equal(await page.$eval('#gallery-title', node => node.textContent), '@bob');
    assert.equal(await page.$eval('#photo-pagination', node => node.hidden), true);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('gallery-title').textContent === '@bob');

    // Failed image has visible recovery controls rather than silently disappearing.
    await bob.evaluate(() => {
      const anchor = document.createElement('a');
      anchor.href = '/bob/status/888/photo/1';
      anchor.innerHTML = '<img src="https://pbs.twimg.com/media/broken.jpg">';
      document.querySelector('[data-testid="primaryColumn"]').appendChild(anchor);
    });
    await page.waitForSelector('.profile-photo-recovery:not([hidden])');
    assert.equal(await page.$eval('.profile-photo-recovery:not([hidden]) .profile-photo-retry', el => el.textContent), 'Retry image');
    await page.focus('.profile-post:last-child .profile-photo-open');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('viewer-error').hidden);
    assert.match(await page.$eval('#viewer-post', el => el.href), /bob\/status\/888/);
    await page.keyboard.press('Escape');

    await page.setViewport({ width: 320, height: 720 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true);
    assert.equal(await page.$eval('#load-profile', el => el.getBoundingClientRect().right <= innerWidth), true);
    await page.click('#add-profiles');
    await page.type('#profile-urls', 'https://x.com/alice/status/123');
    await page.click('#save-profiles');
    await page.waitForFunction(() => document.getElementById('add-profiles-error').textContent.includes('Post links are not profile links'));
    assert.equal(await page.$eval('#add-profiles-dialog', dialog => dialog.open), true);
    assert.equal(await page.$$eval('#profiles-list button', nodes => nodes.length), 2);
    await page.click('#cancel-add-profiles');
    page.once('dialog', dialog => dialog.accept());
    await page.click('#delete-profile');
    await page.waitForFunction(() => document.querySelectorAll('#profiles-list button').length === 1);
    await bob.evaluate(() => document.querySelector('main').appendChild(document.createElement('div')));
    assert.deepEqual(await page.evaluate(() => chrome.storage.local.get(['savedXPosts', 'savedXFolders'])), before);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('gallery-title').textContent === '@alice');
    assert.equal(await page.$$eval('#profiles-list button', nodes => nodes.length), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
