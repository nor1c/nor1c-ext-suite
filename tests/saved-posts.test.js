const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const storeSource = fs.readFileSync(path.join(root, 'src', 'lib', 'saved-posts-store.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(root, 'src', 'background-saved-posts.js'), 'utf8');
const savedPostsPageSource = fs.readFileSync(path.join(root, 'src', 'saved-posts.js'), 'utf8');
const backupValidatorSource = savedPostsPageSource.slice(
  savedPostsPageSource.indexOf('function validateSavedPostsBackup(payload) {'),
  savedPostsPageSource.indexOf('async function updateLastBackupLabel()')
);

function createStore() {
  const media = new Map();
  return {
    media,
    canonicalPostUrl(value) {
      try {
        const url = new URL(value);
        if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname.toLowerCase())) return null;
        const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/i);
        return match ? { id: match[2], url: `https://x.com/${match[1]}/status/${match[2]}` } : null;
      } catch (_) { return null; }
    },
    normalizeMediaUrl(value, kind) {
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password) return null;
        if (kind === 'image' && url.hostname !== 'pbs.twimg.com') return null;
        if (kind === 'video' && url.hostname !== 'video.twimg.com') return null;
        return url.href;
      } catch (_) { return null; }
    },
    async putMedia(key, postId, blob) { media.set(key, { postId, blob }); },
    async deleteMediaKeys(keys) { for (const key of keys) media.delete(key); },
    async deletePostMedia(postId) { for (const [key, entry] of media) if (entry.postId === postId) media.delete(key); }
  };
}

function createBackgroundHarness(fetchImpl = async () => { throw new Error('network unavailable'); }) {
  const store = createStore();
  const postsState = { savedXPosts: [], savedXFolders: [] };
  const alarms = new Map();
  const notifications = [];
  let messageListener;
  let alarmListener;
  let notificationClickListener;
  const chrome = {
    runtime: {
      onMessage: { addListener(listener) { messageListener = listener; } },
      getURL: file => `chrome-extension://test/${file}`
    },
    storage: {
      onChanged: { addListener() {} },
      local: {
        async get(defaults) {
          return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, structuredClone(postsState[key] ?? value)]));
        },
        async set(values) {
          for (const [key, value] of Object.entries(values)) postsState[key] = structuredClone(value);
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete postsState[key];
        }
      }
    },
    alarms: {
      async get(name) { return alarms.get(name); },
      async clear(name) { return alarms.delete(name); },
      create(name, options) { alarms.set(name, { name, ...options }); },
      onAlarm: { addListener(listener) { alarmListener = listener; } }
    },
    notifications: {
      async create(id, options) { notifications.push({ id, options }); return id; },
      async clear() { return true; },
      onClicked: { addListener(listener) { notificationClickListener = listener; } }
    },
    tabs: { async create() {} }
  };
  const context = {
    chrome, globalThis: null, URL, AbortController, Blob, crypto: require('node:crypto').webcrypto,
    fetch: fetchImpl, setTimeout, clearTimeout, console,
    __nor1cDetectedVideoSourcesByTab: new Map(),
    __nor1cXVideoSourcesByTab: new Map()
  };
  context.globalThis = context;
  context.Nor1cSavedPosts = store;
  vm.createContext(context);
  vm.runInContext(backgroundSource, context);

  function send(message, sender = { tab: { id: 7, url: 'https://x.com/home' }, url: 'https://x.com/home' }) {
    return new Promise(resolve => {
      let settled = false;
      const sendResponse = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const keepOpen = messageListener(message, sender, sendResponse);
      if (keepOpen !== true) sendResponse(undefined);
    });
  }
  return {
    send,
    store,
    postsState,
    alarms,
    notifications,
    fireAlarm(name) { alarmListener?.({ name }); },
    clickNotification(id) { notificationClickListener?.(id); }
  };
}

test('saved posts page provides local JSON import and export controls', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'saved-posts.html'), 'utf8');
  assert.match(html, /id="backup-btn"/);
  assert.match(html, /id="backup-import"/);
  assert.match(html, /id="backup-export"/);
  assert.match(html, /id="backup-file"[^>]*accept="application\/json,\.json"/);
  assert.match(savedPostsPageSource, /validateSavedPostsBackup/);
  assert.match(savedPostsPageSource, /chrome\.storage\.local\.get\(\{ \[STORAGE_KEY\]: \[\], \[FOLDERS_KEY\]: \[\] \}\)/);
  assert.match(savedPostsPageSource, /chrome\.storage\.local\.set\(\{ \[STORAGE_KEY\]: restored\.posts, \[FOLDERS_KEY\]: restored\.folders \}\)/);
  assert.match(savedPostsPageSource, /window\.confirm/);
  assert.doesNotMatch(`${html}\n${savedPostsPageSource}`, /supabase/i);
});

test('backup export normalizes legacy posts without media or folderIds arrays', () => {
  const context = {
    BACKUP_VERSION: 1,
    Nor1cSavedPosts: createStore(),
    payload: {
      version: 1,
      folders: [{ id: 'legacy-folder', name: 'Legacy' }],
      posts: [{ id: '901', url: 'https://x.com/noric/status/901', folderId: 'legacy-folder' }]
    },
    result: null
  };
  vm.createContext(context);
  vm.runInContext(`${backupValidatorSource}\nresult = validateSavedPostsBackup(payload);`, context);
  const result = JSON.parse(JSON.stringify(context.result));
  assert.deepEqual(result.posts[0].folderIds, ['legacy-folder']);
  assert.deepEqual(result.posts[0].media, []);
  assert.equal(result.posts[0].status, 'complete');
});

test('dedicated image viewer includes previous and next navigation controls', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'saved-posts.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'saved-posts.css'), 'utf8');
  assert.match(html, /id="image-viewer-prev"/);
  assert.match(html, /id="image-viewer-next"/);
  assert.match(styles, /\.viewer-nav/);
});

test('all saved posts surfaces use consistent Inter typography', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'saved-posts.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'saved-posts.css'), 'utf8');
  const contentStyles = fs.readFileSync(path.join(root, 'src', 'content', 'x-saved-posts.css'), 'utf8');
  const contentSource = fs.readFileSync(path.join(root, 'src', 'content', 'x-saved-posts.js'), 'utf8');
  assert.match(html, /family=Inter/);
  assert.match(styles, /--font-ui:\s*Inter/);
  assert.match(contentStyles, /fonts\.googleapis\.com\/css2\?family=Inter/);
  assert.match(contentStyles, /font-family:\s*Inter/);
  assert.match(contentSource, /font-family: Inter/);
  assert.match(styles, /--text-base:\s*13px/);
  assert.match(styles, /--text-small:\s*11px/);
  assert.match(contentStyles, /font-size:\s*13px/);
});

test('saved post URLs accept only X/Twitter status routes', () => {
  const context = { URL, globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(storeSource, context);
  const store = context.Nor1cSavedPosts;

  assert.deepEqual(JSON.parse(JSON.stringify(store.canonicalPostUrl('https://twitter.com/noric/status/123?s=20'))), {
    id: '123', url: 'https://x.com/noric/status/123'
  });
  assert.equal(store.canonicalPostUrl('https://example.com/noric/status/123'), null);
  assert.equal(store.canonicalPostUrl('https://x.com/noric/status/not-a-number'), null);
});

test('saved media URLs are restricted to official HTTPS X media hosts', () => {
  const context = { URL, globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(storeSource, context);
  const store = context.Nor1cSavedPosts;

  assert.equal(store.normalizeMediaUrl('https://pbs.twimg.com/media/photo.jpg', 'image'), 'https://pbs.twimg.com/media/photo.jpg');
  assert.equal(store.normalizeMediaUrl('https://video.twimg.com/ext/clip.mp4', 'video'), 'https://video.twimg.com/ext/clip.mp4');
  assert.equal(store.normalizeMediaUrl('https://evil.example/photo.jpg', 'image'), null);
  assert.equal(store.normalizeMediaUrl('http://pbs.twimg.com/media/photo.jpg', 'image'), null);
});

test('background schedules a backup reminder every five days', async () => {
  const harness = createBackgroundHarness();
  await new Promise(resolve => setImmediate(resolve));
  const alarm = harness.alarms.get('saved-x-posts-backup-reminder');
  assert.equal(alarm.periodInMinutes, 5 * 24 * 60);
  harness.fireAlarm('saved-x-posts-backup-reminder');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].options.title, 'Back up your saved posts');
});

test('completed exports update the local backup timestamp and reset the reminder', async () => {
  const harness = createBackgroundHarness();
  const result = await harness.send({ type: 'saved-posts-backup-completed' }, {
    tab: { id: 9, url: 'chrome-extension://test/saved-posts.html' },
    url: 'chrome-extension://test/saved-posts.html'
  });
  assert.equal(result.success, true);
  assert.equal(harness.postsState.savedXPostsLastBackupAt, result.completedAt);
  assert.ok(harness.alarms.get('saved-x-posts-backup-reminder').when > result.completedAt);
});

test('X page can create a saved folder for the save modal', async () => {
  const harness = createBackgroundHarness();
  const result = await harness.send({ type: 'create-saved-folder', name: 'Research' });
  assert.equal(result.success, true);
  assert.equal(result.folder.name, 'Research');
});

test('background saves post metadata locally and deduplicates by post ID', async () => {
  const harness = createBackgroundHarness();
  const post = { id: '123', url: 'https://x.com/noric/status/123', author: 'noric', text: 'Saved locally', media: [] };

  const first = await harness.send({ type: 'save-x-post', post });
  const second = await harness.send({ type: 'save-x-post', post });

  assert.equal(first.success, true);
  assert.equal(first.post.status, 'complete');
  assert.equal(second.success, true);
  assert.equal(harness.postsState.savedXPosts.length, 1);
});

test('saved posts can belong to multiple folders and be reorganized from the dedicated view', async () => {
  const harness = createBackgroundHarness();
  const firstFolder = await harness.send({ type: 'create-saved-folder', name: 'Research' });
  const secondFolder = await harness.send({ type: 'create-saved-folder', name: 'Favorites' });
  const post = { id: '124', url: 'https://x.com/noric/status/124', author: 'noric', media: [], folderIds: [firstFolder.folder.id, secondFolder.folder.id] };

  const saved = await harness.send({ type: 'save-x-post', post });
  const updated = await harness.send({ type: 'update-saved-post-folders', id: post.id, folderIds: [secondFolder.folder.id] }, {
    tab: { id: 9, url: 'chrome-extension://test/saved-posts.html' },
    url: 'chrome-extension://test/saved-posts.html'
  });

  assert.deepEqual(Array.from(saved.post.folderIds), [firstFolder.folder.id, secondFolder.folder.id]);
  assert.equal(updated.success, true);
  assert.deepEqual(Array.from(updated.post.folderIds), [secondFolder.folder.id]);
  assert.deepEqual(harness.postsState.savedXPosts[0].folderIds, [secondFolder.folder.id]);
});

test('deleting one folder preserves a post other folder assignments', async () => {
  const harness = createBackgroundHarness();
  const firstFolder = await harness.send({ type: 'create-saved-folder', name: 'First' });
  const secondFolder = await harness.send({ type: 'create-saved-folder', name: 'Second' });
  const post = { id: '125', url: 'https://x.com/noric/status/125', author: 'noric', media: [], folderIds: [firstFolder.folder.id, secondFolder.folder.id] };
  await harness.send({ type: 'save-x-post', post });

  const result = await harness.send({ type: 'delete-saved-folder', id: firstFolder.folder.id }, {
    tab: { id: 9, url: 'chrome-extension://test/saved-posts.html' },
    url: 'chrome-extension://test/saved-posts.html'
  });

  assert.equal(result.success, true);
  assert.deepEqual(harness.postsState.savedXPosts[0].folderIds, [secondFolder.folder.id]);
});

test('background stores media source URLs without fetching or saving media bytes', async () => {
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const harness = createBackgroundHarness(async url => {
    const response = new Response(imageBytes, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(imageBytes.length) }
    });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  });
  const post = {
    id: '234', url: 'https://x.com/noric/status/234', author: 'noric', text: 'Image post',
    media: [{ kind: 'image', url: 'https://pbs.twimg.com/media/photo.png' }]
  };

  const result = await harness.send({ type: 'save-x-post', post });
  const entry = result.post.media[0];

  assert.equal(result.success, true);
  assert.equal(result.post.status, 'complete');
  assert.equal(entry.status, 'linked');
  assert.equal(entry.url, 'https://pbs.twimg.com/media/photo.png');
  assert.equal(harness.store.media.size, 0);
});

test('retrying media keeps existing folder assignments when no new selection is sent', async () => {
  const harness = createBackgroundHarness();
  const folder = await harness.send({ type: 'create-saved-folder', name: 'Keep me' });
  const post = {
    id: '344', url: 'https://x.com/noric/status/344', author: 'noric', media: [], folderIds: [folder.folder.id]
  };

  const saved = await harness.send({ type: 'save-x-post', post });
  const retried = await harness.send({ type: 'save-x-post', post: { ...post, folderIds: undefined }, retry: true });

  assert.deepEqual(Array.from(saved.post.folderIds), [folder.folder.id]);
  assert.deepEqual(Array.from(retried.post.folderIds), [folder.folder.id]);
});

test('saving a post stores its media link without network retries', async () => {
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let fetchCount = 0;
  const harness = createBackgroundHarness(async () => {
    fetchCount += 1;
    throw new Error('save should not fetch media');
  });
  const post = {
    id: '345', url: 'https://x.com/noric/status/345', author: 'noric', text: 'Retry image',
    media: [{ kind: 'image', url: 'https://pbs.twimg.com/media/retry.png' }]
  };

  const result = await harness.send({ type: 'save-x-post', post });

  assert.equal(result.post.status, 'complete');
  assert.equal(result.post.media[0].status, 'linked');
  assert.equal(result.post.media[0].url, 'https://pbs.twimg.com/media/retry.png');
  assert.equal(fetchCount, 0);
  assert.equal(harness.store.media.size, 0);
});

test('removing a saved post clears its metadata and any legacy local media', async () => {
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const harness = createBackgroundHarness(async url => {
    const response = new Response(imageBytes, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(imageBytes.length) }
    });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  });
  const post = {
    id: '567', url: 'https://x.com/noric/status/567', author: 'noric', text: 'Remove image',
    media: [{ kind: 'image', url: 'https://pbs.twimg.com/media/remove.png' }]
  };
  const saved = await harness.send({ type: 'save-x-post', post });
  assert.equal(saved.post.media[0].status, 'linked');
  const removed = await harness.send({ type: 'delete-x-post', id: post.id }, {
    tab: { id: 9, url: 'chrome-extension://test/saved-posts.html' },
    url: 'chrome-extension://test/saved-posts.html'
  });

  assert.equal(saved.post.status, 'complete');
  assert.equal(removed.success, true);
  assert.equal(harness.postsState.savedXPosts.length, 0);
  assert.equal(harness.store.media.size, 0);
});

test('popup places the icon-only Saved X Posts shortcut at the top and makes it sticky', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'popup.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'popup.css'), 'utf8');
  assert.ok(html.indexOf('id="saved-posts-open-btn"') < html.indexOf('class="group-title">Media</h2>'));
  assert.match(html, /class="saved-posts-shortcut-btn"/);
  assert.match(styles, /\.saved-posts-shortcut\s*\{[^}]*position:\s*sticky/);
});

test('saved posts folder filters and per-post organizer support multiple folders', () => {
  const gallerySource = fs.readFileSync(path.join(root, 'src', 'saved-posts.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'saved-posts.html'), 'utf8');
  assert.match(gallerySource, /function selectAllPosts\(\)/);
  assert.match(gallerySource, /allPosts\?\.addEventListener\('click', selectAllPosts\)/);
  assert.match(gallerySource, /postFolderIds\(post\)\.includes\(activeFolderId\)/);
  assert.match(gallerySource, /type: 'update-saved-post-folders'/);
  assert.match(gallerySource, /postFolderIds\(post\)\.filter\(id => id !== folderId\)/);
  assert.match(gallerySource, /activeFolderId \? 'Remove post from this folder' : 'Remove saved post'/);
  assert.match(gallerySource, /iconButton\('button', 'folder-button', 'Organize post folders'/);
  assert.match(html, /id="folder-manager"/);
});

test('each saved post shows badges for all assigned folders', () => {
  const styles = fs.readFileSync(path.join(root, 'src', 'saved-posts.css'), 'utf8');
  assert.match(savedPostsPageSource, /const folderNames = new Map\(folders\.map\(folder => \[folder\.id, folder\.name\]\)\)/);
  assert.match(savedPostsPageSource, /const assignedFolders = \[\.\.\.new Set\(postFolderIds\(post\)\.map\(id => folderNames\.get\(id\)\)\.filter\(Boolean\)\)\]/);
  assert.match(savedPostsPageSource, /'post-folder-badge', name/);
  assert.match(savedPostsPageSource, /'post-folder-badge is-unfiled', 'Unfiled'/);
  assert.match(styles, /\.post-folder-badges\s*\{/);
  assert.match(styles, /\.post-folder-badge\s*\{/);
});

test('saved posts folder list shows item counts and paginates 30 posts per page', () => {
  const gallerySource = fs.readFileSync(path.join(root, 'src', 'saved-posts.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'saved-posts.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'saved-posts.css'), 'utf8');
  assert.match(gallerySource, /const POSTS_PER_PAGE = 30/);
  assert.match(gallerySource, /const folderCounts = new Map/);
  assert.match(gallerySource, /folderCounts\.set\(folderId, folderCounts\.get\(folderId\) \+ 1\)/);
  assert.match(gallerySource, /visiblePosts\.slice\(pageRange\.start, pageRange\.end\)/);
  assert.match(gallerySource, /currentPage = 1; renderPosts\(\)/);
  assert.match(html, /class="folder-chip-count">0<\/span>/);
  assert.match(html, /id="pagination"/);
  assert.match(html, /id="pagination-prev"/);
  assert.match(html, /id="pagination-next"/);
  assert.match(styles, /\.folder-chip-count\s*\{/);
  assert.match(styles, /\.pagination\s*\{/);
});

test('saved posts renders and deletes cards without a blank refresh', () => {
  assert.match(savedPostsPageSource, /let renderQueue = Promise\.resolve\(\)/);
  assert.match(savedPostsPageSource, /const result = renderQueue\.then\(renderPostsOnce\)/);
  assert.match(savedPostsPageSource, /const fragment = document\.createDocumentFragment\(\)/);
  assert.match(savedPostsPageSource, /list\.replaceChildren\(fragment\)/);
  assert.match(savedPostsPageSource, /card\.classList\.add\('post-removing'\)/);
  assert.match(savedPostsPageSource, /if \(localMutationDepth > 0\) return/);
  assert.match(savedPostsPageSource, /card\.dataset\.postId = String\(post\.id\)/);
});

test('saved posts page uses a responsive grid for compact browsing', () => {
  const styles = fs.readFileSync(path.join(root, 'src', 'saved-posts.css'), 'utf8');
  assert.match(styles, /\.posts-list\s*\{[^}]*display:\s*grid/);
  assert.match(styles, /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
});

test('saved posts grid uses a fixed card height independent of content length', () => {
  const styles = fs.readFileSync(path.join(root, 'src', 'saved-posts.css'), 'utf8');
  const gallerySource = fs.readFileSync(path.join(root, 'src', 'saved-posts.js'), 'utf8');
  assert.match(styles, /\.posts-list\s*\{[^}]*grid-auto-rows:\s*420px/);
  assert.match(styles, /\.post\s*\{[^}]*height:\s*420px[^}]*overflow:\s*hidden/);
  assert.match(styles, /\.post-body\s*\{[^}]*position:\s*relative[^}]*flex:\s*1 1 0[^}]*overflow:\s*hidden/);
  assert.doesNotMatch(styles, /\.post-body\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(styles, /\.post-actions\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(gallerySource, /const body = element\('div', 'post-body'\)/);
  assert.match(gallerySource, /body\.appendChild\(grid\)/);
});

test('saved posts gallery loads linked media directly and supports legacy local object URLs', () => {
  const gallerySource = fs.readFileSync(path.join(root, 'src', 'saved-posts.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'saved-posts.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'saved-posts.css'), 'utf8');
  assert.match(gallerySource, /item\.url === 'string' \? Nor1cSavedPosts\.normalizeMediaUrl\(item\.url, item\.kind\)/);
  assert.match(gallerySource, /content\.src = url/);
  assert.match(gallerySource, /Nor1cSavedPosts\.getMedia\(item\.mediaKey\)/);
  assert.match(html, /img-src 'self' blob: https:\/\/pbs\.twimg\.com/);
  assert.match(html, /media-src 'self' blob: https:\/\/video\.twimg\.com/);
  assert.match(gallerySource, /item\.kind === 'video' \? element\('video'\) : element\('img'\)/);
  assert.match(gallerySource, /`media-grid media-count-\$\{Math\.min\(mediaItems\.length, 4\)\}`/);
  assert.match(gallerySource, /content\.controls = true/);
  assert.match(gallerySource, /URL\.createObjectURL\(blob\)/);
  assert.match(gallerySource, /imageViewer\.showModal\(\)/);
  assert.match(gallerySource, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(gallerySource, /imageViewer\.addEventListener\('cancel'/);
  assert.match(gallerySource, /ArrowLeft/);
  assert.match(gallerySource, /ArrowRight/);
  assert.match(gallerySource, /document\.querySelectorAll\('#posts-list \.post'\)/);
  assert.match(gallerySource, /viewerItems = postCards\.flatMap/);
  assert.doesNotMatch(gallerySource, /element\('p', 'post-text', post\.text\)/);
  assert.match(gallerySource, /actions\.appendChild\(retry\)/);
  assert.match(gallerySource, /actions\.appendChild\(link\)/);
  assert.match(gallerySource, /actions\.appendChild\(remove\)/);
  assert.match(styles, /\.media-grid\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/);
  assert.match(styles, /\.media-item img, \.media-item video\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*contain/);
  assert.match(styles, /\.media-item img\s*\{[^}]*image-orientation:\s*from-image/);
  assert.doesNotMatch(styles, /\.media-item img, \.media-item video\s*\{[^}]*aspect-ratio/);
});

test('X save button supports compact icon states and removal messages', () => {
  const contentSource = fs.readFileSync(path.join(root, 'src', 'content', 'x-saved-posts.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'content', 'x-saved-posts.css'), 'utf8');
  assert.match(contentSource, /remove-x-post/);
  assert.match(contentSource, /Delete from all folders/);
  assert.match(contentSource, /chooseFolder\(savedFolderIds\(savedPost\), Boolean\(savedPost\)\)/);
  assert.match(contentSource, /selection\.action === 'delete'/);
  assert.match(contentSource, /function actionSlot\(article\)/);
  assert.match(contentSource, /slot\.after\(wrapper\)/);
  assert.match(styles, /align-self:\s*center/);
  assert.match(contentSource, /Edit saved post folders/);
  assert.match(contentSource, /M4 6h16v12H4z/);
  assert.match(contentSource, /nor1c-save-folder-modal-host/);
  assert.match(contentSource, /Choose one or more folders for this saved post/);
  assert.match(contentSource, /node\.classList\.toggle\('selected', selectedIds\.has\(folder\.id\)\)/);
  assert.match(contentSource, /const selectedIds = new Set\(initialFolderIds\.filter/);
  assert.match(contentSource, /payload\.folderIds = selection\.folderIds/);
  assert.match(contentSource, /create-saved-folder/);
  assert.doesNotMatch(contentSource, /<select/);
  assert.match(contentSource, /host\.addEventListener\('keydown',[\s\S]*event\.stopPropagation\(\)/);
  assert.doesNotMatch(contentSource, /window\.prompt\(`Save to folder/);
  assert.match(styles, /min-width:\s*64px/);
  assert.match(styles, /height:\s*34px/);
  assert.match(styles, /\.nor1c-save-x-post svg\s*\{[^}]*width:\s*20px/);
  assert.match(contentSource, /<span>SAVE<\/span>/);
  assert.match(styles, /border-radius:\s*(?:50%|9999px)/);
});

test('background keeps unavailable media links visible and rejects non-X senders', async () => {
  const harness = createBackgroundHarness();
  const post = {
    id: '456', url: 'https://x.com/noric/status/456', author: 'noric', text: 'Image post',
    media: [{ kind: 'image', url: 'https://pbs.twimg.com/media/photo.jpg' }]
  };

  const partial = await harness.send({ type: 'save-x-post', post });
  const denied = await harness.send({ type: 'save-x-post', post }, { tab: { id: 2, url: 'https://example.com' }, url: 'https://example.com' });

  assert.equal(partial.success, true);
  assert.equal(partial.post.status, 'complete');
  assert.equal(partial.post.media[0].status, 'linked');
  assert.equal(denied.success, false);
  assert.equal(harness.postsState.savedXPosts.length, 1);
});
