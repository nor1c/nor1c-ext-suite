const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const helperSource = fs.readFileSync(path.join(root, 'src/lib/saved-x-profiles.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(root, 'src/background-saved-x-profiles.js'), 'utf8');
const extensionSender = { url: 'chrome-extension://test/saved-x-profiles.html' };
const xSender = { url: 'https://x.com/alice/media?filter=photo', tab: { id: 7 }, frameId: 0, documentId: 'test-document' };

function harness() {
  const state = { savedXProfiles: [], savedXPosts: [{ id: 'preserve-post' }], savedXFolders: [{ id: 'preserve-folder' }] };
  const tabs = [];
  let listener;
  let storageError = false;
  let collectorAvailable = true;
  const focusedWindows = [];
  const tabListeners = {};
  const sentMessages = [];
  const removedTabs = [];
  let evidence = { state: 'end', pending: 0, revision: 7, profileId: 'alice', href: xSender.url };
  const chrome = {
    scripting: { async executeScript() { return [{ result: structuredClone(evidence) }]; } },
    runtime: { getURL: file => `chrome-extension://test/${file}`, onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: {
      async get(defaults) { return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, structuredClone(state[key] ?? value)])); },
      async set(values) { if (storageError) throw new Error('Storage full'); Object.assign(state, structuredClone(values)); }
    } },
    windows: { async update(id, options) { focusedWindows.push({ id, ...options }); } },
    tabs: {
      onRemoved: { addListener(fn) { tabListeners.removed = fn; } },
      onUpdated: { addListener(fn) { tabListeners.updated = fn; } },
      async query() { return structuredClone(tabs); },
      async get(id) { const tab = tabs.find(tab => tab.id === id); if (!tab) throw new Error('Tab not found'); return structuredClone(tab); },
      async remove(id) {
        removedTabs.push({ id, state: structuredClone(state.savedXProfiles[0]?.collection) });
        tabs.splice(tabs.findIndex(tab => tab.id === id), 1);
        tabListeners.removed?.(id);
      },
      async create(tab) { const created = { ...tab, id: tabs.length + 1 }; tabs.push(created); return created; },
      async update(id, options) { Object.assign(tabs.find(tab => tab.id === id), options); },
      async sendMessage(tabId, message) { sentMessages.push({ tabId, ...message }); if (!collectorAvailable) throw new Error('Not ready'); return { success: true, autoLoadVersion: 4 }; }
    }
  };
  const context = vm.createContext({ URL, TextEncoder, chrome, crypto: webcrypto });
  vm.runInContext(helperSource, context);
  vm.runInContext(backgroundSource, context);
  return {
    store: context.Nor1cSavedXProfiles, state, tabs, focusedWindows, tabListeners, sentMessages, removedTabs,
    setCollectorAvailable(value) { collectorAvailable = value; },
    setEvidence(value) { evidence = value; },
    failWrites(value) { storageError = value; },
    send(message, sender = extensionSender) {
      return new Promise(resolve => { const pending = listener(message, sender, resolve); if (pending !== true) resolve(undefined); });
    }
  };
}
const photo = (id = 'photo_1', user = 'alice') => ({ url: `https://pbs.twimg.com/media/${id}?format=jpg&name=small`, postUrl: `https://x.com/${user}/status/123/photo/1`, alt: 'A photo' });
const plain = value => JSON.parse(JSON.stringify(value));
async function append(h, photos, sender = xSender, extra = {}) {
  return h.send({ type: 'append-x-profile-photos', id: 'alice', captureId: h.state.savedXProfiles.find(profile => profile.id === 'alice')?.captureId, photos, ...extra }, sender);
}

test('profile URLs normalize aliases, optional @ and media filter; reject posts and unsafe routes', () => {
  const { store } = harness();
  for (const url of ['https://x.com/@Alice/media?filter=photo', 'https://twitter.com/Alice', 'http://mobile.twitter.com/alice/', 'https://www.x.com/ALICE/media']) {
    assert.deepEqual(plain(store.canonicalProfileUrl(url)), { id: 'alice', username: 'alice', url: 'https://x.com/alice/media?filter=photo' });
  }
  for (const url of ['https://x.com/alice/status/123', 'https://x.com/home', 'https://x.com/i/media', 'https://x.com/alice/likes', 'https://x.com.evil.test/alice', 'https://user:pass@x.com/alice', 'javascript:alert(1)', 'ftp://x.com/alice', 'https://x.com:444/alice', 'https://x.com/abcdefghijklmnop', 'https://x.com/a%2Fb', null, {}]) {
    assert.equal(store.canonicalProfileUrl(url), null, String(url));
  }
});

test('photo normalization keeps only photo CDN paths and matching author permalinks', () => {
  const { store } = harness();
  const normalized = store.normalizePhoto(photo(), 'alice');
  assert.equal(normalized.url, 'https://pbs.twimg.com/media/photo_1?format=jpg&name=orig');
  assert.equal(normalized.postUrl, 'https://x.com/alice/status/123');
  assert.equal(store.normalizePhoto({ ...photo(), url: 'https://pbs.twimg.com/media/photo_1.jpg' }, 'alice').id, normalized.id);
  for (const url of ['https://pbs.twimg.com/profile_images/avatar.jpg', 'https://pbs.twimg.com/ext_tw_video_thumb/123/a.jpg', 'https://evil.test/media/a.jpg', 'http://pbs.twimg.com/media/a.jpg', 'https://pbs.twimg.com/media/a?format=svg', 'https://user@pbs.twimg.com/media/a']) {
    assert.equal(store.normalizePhoto({ ...photo(), url }, 'alice'), null);
  }
  assert.equal(store.normalizePhoto(photo('photo_2', 'bob'), 'alice'), null);
  assert.equal(store.normalizePhoto({ ...photo(), postUrl: 'javascript:alert(1)' }, 'alice'), null);
});

test('multiple profiles deduplicate case and leave saved posts/folders untouched', async () => {
  const h = harness();
  const result = await h.send({ type: 'save-x-profiles', urls: ['https://x.com/@Alice/media?filter=photo', 'https://twitter.com/alice', 'https://x.com/bob'] });
  assert.equal(result.success, true);
  assert.equal(result.added, 2);
  assert.equal(h.state.savedXProfiles.length, 2);
  const original = structuredClone(h.state.savedXProfiles[0]);
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/Alice'] });
  assert.deepEqual(h.state.savedXProfiles[0], original);
  assert.deepEqual(h.state.savedXPosts, [{ id: 'preserve-post' }]);
  assert.deepEqual(h.state.savedXFolders, [{ id: 'preserve-folder' }]);
});

test('invalid batches and limits fail atomically and a failed write does not poison the queue', async () => {
  const h = harness();
  let result = await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice', 'https://evil.test/bob'] });
  assert.equal(result.success, false);
  assert.equal(h.state.savedXProfiles.length, 0);
  for (const urls of [[], Array(11).fill('https://x.com/bob'), null]) {
    assert.equal((await h.send({ type: 'save-x-profiles', urls })).success, false);
  }
  h.failWrites(true);
  assert.equal((await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] })).success, false);
  assert.equal(h.state.savedXProfiles.length, 0);
  h.failWrites(false);
  assert.equal((await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] })).success, true);
  h.state.savedXProfiles = Array.from({ length: 100 }, (_, i) => ({ id: `user${i}` }));
  assert.equal((await h.send({ type: 'save-x-profiles', urls: ['https://x.com/bob'] })).success, false);
  assert.equal(h.state.savedXProfiles.length, 100);
});

test('message authorization rejects websites managing profiles and wrong collection documents', async () => {
  const h = harness();
  for (const type of ['save-x-profiles', 'delete-x-profile', 'open-x-profile-media']) {
    assert.equal((await h.send({ type, urls: ['https://x.com/alice'], id: 'alice' }, xSender)).success, false);
  }
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  for (const sender of [extensionSender, { ...xSender, frameId: 1 }, { ...xSender, url: 'https://x.com/bob/media' }, { ...xSender, url: 'https://x.com/alice' }, { ...xSender, url: 'https://evil.test/alice/media', tab: { id: 7, url: xSender.url } }]) {
    assert.equal((await append(h, [photo()], sender)).success, false);
  }
  assert.equal(h.state.savedXProfiles[0].photos.length, 0);
});

test('SPA navigation uses the current same-origin top-frame route, not the original document path', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  const sender = { url: 'https://x.com/home', frameId: 0, tab: { id: 7, url: 'https://x.com/alice/media?filter=photo' } };
  assert.equal((await append(h, [photo()], sender)).success, true);
  assert.equal((await append(h, [photo('second')], { ...sender, frameId: 1 })).success, false);
  assert.equal((await append(h, [photo('second')], { ...sender, url: 'https://evil.test/' })).success, false);
  assert.equal(h.state.savedXProfiles[0].photos.length, 1);
});

test('concurrent photo appends merge, deduplicate variants and retain photos on failure', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  await Promise.all([append(h, [photo('one')]), append(h, [photo('two'), photo('one'), photo('foreign', 'bob')])]);
  assert.equal(h.state.savedXProfiles[0].photos.length, 2);
  assert.ok(h.state.savedXProfiles[0].lastCollectedAt > 0);
  h.failWrites(true);
  assert.equal((await append(h, [photo('three')])).success, false);
  assert.equal(h.state.savedXProfiles[0].photos.length, 2);
  h.failWrites(false);
  assert.equal((await append(h, [photo('three')])).success, true);
  assert.equal((await append(h, Array(101).fill(photo()))).success, false);
  assert.equal(h.state.savedXProfiles[0].photos.length, 3);
});

test('deleted profiles cannot be recreated by in-flight collection, even after re-adding', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  const captureId = h.state.savedXProfiles[0].captureId;
  await h.send({ type: 'delete-x-profile', id: 'alice' });
  assert.equal((await append(h, [photo()], xSender, { captureId })).success, false);
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  assert.equal((await append(h, [photo()], xSender, { captureId })).success, false);
  assert.equal(h.state.savedXProfiles[0].photos.length, 0);
  assert.equal(h.state.savedXPosts.length, 1);
});

test('photo collection continues past the former 1000-photo cap', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  h.state.savedXProfiles[0].photos = Array.from({ length: 999 }, (_, i) => h.store.normalizePhoto(photo(`photo_${i}`), 'alice'));
  const response = await append(h, [photo('last'), photo('excess')]);
  assert.equal(response.added, 2);
  assert.equal(response.limitReached, undefined);
  assert.equal(h.state.savedXProfiles[0].photos.length, 1001);
});

test('media loading opens canonical URL and reuses open tabs without navigating other tabs', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/@Alice'] });
  assert.equal((await h.send({ type: 'open-x-profile-media', id: 'alice', active: false })).success, true);
  assert.deepEqual(h.tabs, [{ id: 1, url: 'https://x.com/alice/media?filter=photo', active: false }]);
  assert.equal((await h.send({ type: 'open-x-profile-media', id: 'alice' })).success, true);
  assert.equal(h.tabs.length, 1);
  assert.equal(h.tabs[0].active, true);
  assert.equal(h.focusedWindows[0].focused, true);
  h.setCollectorAvailable(false);
  const unavailable = await h.send({ type: 'open-x-profile-media', id: 'alice' });
  assert.equal(unavailable.success, false);
  assert.match(unavailable.error, /Reload the existing @alice/);
  assert.equal(h.tabs.length, 1);
  assert.equal((await h.send({ type: 'open-x-profile-media', id: 'missing' })).success, false);
});

test('aggregate profile budget pauses collection persistently and deletion allows recovery', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice', 'https://x.com/bob'] });
  const alice = h.state.savedXProfiles[0];
  const bob = h.state.savedXProfiles[1];
  // Existing galleries occupy the shared budget; the next batch must be all-or-nothing.
  for (let i = 0; i < 7; i += 1) {
    const record = { ...bob, id: `artist${i}`, photos: [] };
    h.state.savedXProfiles.push(record);
    let bytes = new TextEncoder().encode(JSON.stringify(h.state.savedXProfiles)).byteLength;
    for (let j = 0; j < 1000 && bytes < h.store.MAX_STORAGE_BYTES - 4000; j += 1) {
      const item = { ...h.store.normalizePhoto(photo(`photo_${j}`), 'alice'), alt: 'a'.repeat(500) };
      record.photos.push(item);
      bytes += JSON.stringify(item).length + 1;
    }
  }
  const response = await append(h, Array.from({ length: 100 }, (_, i) => photo(`incoming_${i}`)));
  assert.equal(response.storageLimited, true);
  assert.equal(h.state.savedXProfiles.find(profile => profile.id === alice.id).photos.length, 0);
  assert.equal(h.state.savedXProfiles.find(profile => profile.id === alice.id).storageLimited, true);
  assert.equal((await append(h, [photo()])).storageLimited, true);
  await h.send({ type: 'delete-x-profile', id: 'artist0' });
  assert.equal(h.state.savedXProfiles.find(profile => profile.id === alice.id).storageLimited, false);
  assert.equal((await append(h, [photo()])).added, 1);
});

test('collector opens private gallery through the background without exposing extension resources', async () => {
  const h = harness();
  assert.equal((await h.send({ type: 'open-saved-x-profiles' }, { ...xSender, url: 'https://evil.test/alice/media' })).success, false);
  assert.equal((await h.send({ type: 'open-saved-x-profiles' }, xSender)).success, true);
  assert.equal(h.tabs[0].url, 'chrome-extension://test/saved-x-profiles.html?profile=alice');
});

test('automatic collection is assigned to one tab, survives duplicate starts, and rejects stale status', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  assert.equal((await h.send({ type: 'open-x-profile-media', id: 'alice', active: false, autoLoad: true })).success, true);
  const first = structuredClone(h.state.savedXProfiles[0].collection);
  const sender = { ...xSender, tab: { id: first.tabId, url: xSender.url } };
  assert.equal(first.state, 'loading');
  assert.equal((await h.send({ type: 'get-x-profile-collection' }, sender)).collection.runId, first.runId);
  assert.equal((await h.send({ type: 'get-x-profile-collection' }, xSender)).collection, null);
  await h.send({ type: 'open-x-profile-media', id: 'alice', autoLoad: true });
  assert.equal(h.state.savedXProfiles[0].collection.runId, first.runId);
  const status = { type: 'update-x-profile-collection', id: 'alice', runId: first.runId, state: 'stalled' };
  assert.equal((await h.send(status, xSender)).success, false);
  assert.equal((await h.send({ ...status, state: 'complete' }, sender)).success, false);
  assert.equal((await h.send(status, sender)).success, true);
  await h.send({ type: 'open-x-profile-media', id: 'alice', autoLoad: true });
  assert.notEqual(h.state.savedXProfiles[0].collection.runId, first.runId);
  assert.equal((await h.send(status, sender)).success, false);
  await h.send({ type: 'stop-x-profile-collection', id: 'alice' });
  assert.equal(h.state.savedXProfiles[0].collection.state, 'stopped');
  assert.ok(h.sentMessages.some(message => message.type === 'stop-saved-x-profile'));
  assert.equal((await h.send({ type: 'stop-x-profile-collection', id: 'alice' }, xSender)).success, false);
});

test('starting collection checks the metadata byte budget before writing a job', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  const profile = h.state.savedXProfiles[0];
  profile.padding = '';
  const size = new TextEncoder().encode(JSON.stringify(h.state.savedXProfiles)).byteLength;
  profile.padding = 'a'.repeat(h.store.MAX_STORAGE_BYTES - size - 30);
  const response = await h.send({ type: 'open-x-profile-media', id: 'alice', autoLoad: true });
  assert.equal(response.success, false);
  assert.match(response.error, /storage budget/);
  assert.equal(h.state.savedXProfiles[0].collection, undefined);
});

test('closing or leaving the collection tab marks an interrupted, partial run', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  await h.send({ type: 'open-x-profile-media', id: 'alice', autoLoad: true });
  h.tabListeners.updated(1, { url: 'https://x.com/bob/media' });
  await h.send({ type: 'get-x-profile-collection' }, xSender);
  assert.equal(h.state.savedXProfiles[0].collection.state, 'interrupted');
  await h.send({ type: 'open-x-profile-media', id: 'alice', autoLoad: true });
  h.tabListeners.removed(1);
  await h.send({ type: 'get-x-profile-collection' }, xSender);
  assert.equal(h.state.savedXProfiles[0].collection.state, 'interrupted');
});

test('normal finish persists results before closing only its collection tab', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  await h.send({ type: 'open-x-profile-media', id: 'alice', autoLoad: true });
  const job = h.state.savedXProfiles[0].collection;
  h.tabs.push({ id: 90, url: 'https://x.com/bob/media' });
  const sender = { ...xSender, tab: { id: job.tabId, url: xSender.url } };
  await append(h, [photo()], sender);
  const message = { type: 'update-x-profile-collection', id: 'alice', runId: job.runId, state: 'finished', timelineRevision: 7 };
  assert.equal((await h.send(message, xSender)).success, false);
  assert.equal(h.removedTabs.length, 0);
  assert.equal((await h.send(message, sender)).success, true);
  assert.equal(h.removedTabs[0].state.state, 'finished');
  assert.equal(h.state.savedXProfiles[0].photos.length, 1);
  assert.equal(h.state.savedXProfiles[0].collection.tabCloseState, 'closed');
  assert.deepEqual(h.tabs.map(tab => tab.id), [90]);
  assert.equal((await h.send(message, sender)).success, false);
});

test('inactivity no longer closes tabs, and explicitly resumed legacy jobs enable end-signal auto-close', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  await h.send({ type: 'open-x-profile-media', id: 'alice', autoLoad: true });
  const originalRunId = h.state.savedXProfiles[0].collection.runId;
  delete h.state.savedXProfiles[0].collection.closeWhenFinished;
  await h.send({ type: 'open-x-profile-media', id: 'alice', autoLoad: true });
  const job = h.state.savedXProfiles[0].collection;
  assert.equal(job.runId, originalRunId);
  assert.equal(job.closeWhenFinished, true);
  const sender = { ...xSender, tab: { id: job.tabId, url: xSender.url } };
  await append(h, [photo()], sender);
  assert.equal((await h.send({ type: 'update-x-profile-collection', id: 'alice', runId: job.runId, state: 'idle' }, sender)).success, true);
  assert.equal(h.removedTabs.length, 0);
  assert.equal(h.state.savedXProfiles[0].collection.state, 'idle');
  assert.equal(h.state.savedXProfiles[0].photos.length, 1);
});

test('manual stop, failed storage, stale runs and navigated tabs cannot auto-close', async () => {
  for (const scenario of ['manual', 'write-failure', 'navigation', 'pending-navigation', 'stale']) {
    const h = harness();
    await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
    await h.send({ type: 'open-x-profile-media', id: 'alice', autoLoad: true });
    const job = h.state.savedXProfiles[0].collection;
    const sender = { ...xSender, tab: { id: job.tabId, url: xSender.url } };
    if (scenario === 'manual') await h.send({ type: 'stop-x-profile-collection', id: 'alice' });
    if (scenario === 'write-failure') h.failWrites(true);
    if (scenario === 'navigation') h.tabs[0].url = 'https://x.com/bob/media';
    if (scenario === 'pending-navigation') h.tabs[0].pendingUrl = 'https://example.com/';
    const result = await h.send({ type: 'update-x-profile-collection', id: 'alice', runId: scenario === 'stale' ? 'old-run' : job.runId, state: 'finished', timelineRevision: 7 }, sender);
    assert.equal(h.removedTabs.length, 0, scenario);
    if (['manual', 'write-failure', 'stale'].includes(scenario)) assert.equal(result.success, false);
  }
});

test('forged completion messages cannot close without matching observer evidence', async () => {
  const h = harness();
  await h.send({ type: 'save-x-profiles', urls: ['https://x.com/alice'] });
  await h.send({ type: 'open-x-profile-media', id: 'alice', autoLoad: true });
  const job = h.state.savedXProfiles[0].collection;
  h.setEvidence({ state: 'more', pending: 0, revision: 7, profileId: 'alice', href: xSender.url });
  const result = await h.send({ type: 'update-x-profile-collection', id: 'alice', runId: job.runId, state: 'finished', timelineRevision: 7 }, { ...xSender, tab: { id: job.tabId, url: xSender.url } });
  assert.equal(result.success, false);
  assert.equal(h.removedTabs.length, 0);
});

test('both browsers and build wire separate profile surfaces and collectors', () => {
  for (const browser of ['chrome', 'firefox']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, `src/manifest.${browser}.json`), 'utf8'));
    const scripts = manifest.content_scripts.find(script => script.js.includes('content/x-saved-profiles.js')).js;
    assert.ok(scripts.indexOf('lib/saved-x-profiles.js') < scripts.indexOf('content/x-saved-profiles.js'));
    if (browser === 'firefox') assert.ok(manifest.background.scripts.includes('background-saved-x-profiles.js'));
  }
  const build = fs.readFileSync(path.join(root, 'build.js'), 'utf8');
  for (const file of ['saved-x-profiles.html', 'saved-x-profiles.js', 'saved-x-profiles.css', 'background-saved-x-profiles.js']) assert.ok(build.includes(`'${file}'`));
});
