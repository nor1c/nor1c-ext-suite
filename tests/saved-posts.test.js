const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const storeSource = fs.readFileSync(path.join(root, 'src', 'lib', 'saved-posts-store.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(root, 'src', 'background-saved-posts.js'), 'utf8');

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
  const postsState = { savedXPosts: [] };
  let messageListener;
  const chrome = {
    runtime: {
      onMessage: { addListener(listener) { messageListener = listener; } },
      getURL: file => `chrome-extension://test/${file}`
    },
    storage: {
      local: {
        async get(defaults) { return { ...defaults, savedXPosts: structuredClone(postsState.savedXPosts) }; },
        async set(values) { postsState.savedXPosts = structuredClone(values.savedXPosts); }
      }
    }
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
      const keepOpen = messageListener(message, sender, resolve);
      if (keepOpen !== true) resolve(undefined);
    });
  }
  return { send, store, postsState };
}

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

test('background stores image bytes in extension media storage', async () => {
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
  assert.equal(entry.status, 'saved');
  assert.equal(entry.mimeType, 'image/png');
  assert.equal(harness.store.media.get(entry.mediaKey).blob.size, imageBytes.length);
});

test('background retries failed media and replaces it with a stored copy', async () => {
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let shouldFail = true;
  const harness = createBackgroundHarness(async url => {
    if (shouldFail) throw new Error('temporary network error');
    const response = new Response(imageBytes, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(imageBytes.length) }
    });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  });
  const post = {
    id: '345', url: 'https://x.com/noric/status/345', author: 'noric', text: 'Retry image',
    media: [{ kind: 'image', url: 'https://pbs.twimg.com/media/retry.png' }]
  };

  const first = await harness.send({ type: 'save-x-post', post });
  shouldFail = false;
  const retry = await harness.send({ type: 'save-x-post', post: { ...post, retry: true } });

  assert.equal(first.post.status, 'partial');
  assert.equal(retry.post.status, 'complete');
  assert.equal(retry.post.media[0].status, 'saved');
  assert.equal(harness.store.media.size, 1);
});

test('removing a saved post clears its metadata and local media', async () => {
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

test('saved posts folder filters include a working All posts control', () => {
  const gallerySource = fs.readFileSync(path.join(root, 'src', 'saved-posts.js'), 'utf8');
  assert.match(gallerySource, /function selectAllPosts\(\)/);
  assert.match(gallerySource, /allPosts\?\.addEventListener\('click', selectAllPosts\)/);
  assert.match(gallerySource, /activeFolderId = '';[\s\S]*renderPosts\(\);/);
});

test('saved posts page uses a responsive grid for compact browsing', () => {
  const styles = fs.readFileSync(path.join(root, 'src', 'saved-posts.css'), 'utf8');
  assert.match(styles, /\.posts-list\s*\{[^}]*display:\s*grid/);
  assert.match(styles, /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
});

test('saved posts gallery displays media from extension object URLs', () => {
  const gallerySource = fs.readFileSync(path.join(root, 'src', 'saved-posts.js'), 'utf8');
  assert.match(gallerySource, /Nor1cSavedPosts\.getMedia\(item\.mediaKey\)/);
  assert.match(gallerySource, /item\.kind === 'video' \? element\('video'\) : element\('img'\)/);
  assert.match(gallerySource, /content\.controls = true/);
  assert.match(gallerySource, /URL\.createObjectURL\(blob\)/);
  assert.match(gallerySource, /imageViewer\.showModal\(\)/);
  assert.match(gallerySource, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(gallerySource, /imageViewer\.addEventListener\('cancel'/);
  assert.match(gallerySource, /ArrowLeft/);
  assert.match(gallerySource, /ArrowRight/);
  assert.match(gallerySource, /document\.querySelectorAll\('#posts-list \.post'\)/);
  assert.match(gallerySource, /viewerItems = postCards\.flatMap/);
  assert.match(gallerySource, /if \(post\.text\) card\.appendChild\(element\('p', 'post-text', post\.text\)\)/);
  assert.match(gallerySource, /actions\.appendChild\(retry\)/);
  assert.match(gallerySource, /actions\.appendChild\(link\)/);
  assert.match(gallerySource, /actions\.appendChild\(remove\)/);
});

test('X save button supports compact icon states and removal messages', () => {
  const contentSource = fs.readFileSync(path.join(root, 'src', 'content', 'x-saved-posts.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'content', 'x-saved-posts.css'), 'utf8');
  assert.match(contentSource, /remove-x-post/);
  assert.match(contentSource, /function actionSlot\(article\)/);
  assert.match(contentSource, /slot\.after\(wrapper\)/);
  assert.match(styles, /align-self:\s*center/);
  assert.match(contentSource, /Remove saved post/);
  assert.match(contentSource, /M4 6h16v12H4z/);
  assert.match(contentSource, /nor1c-save-folder-modal-host/);
  assert.match(contentSource, /Choose a folder for this saved post/);
  assert.match(contentSource, /class="folder selected"/);
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

test('background keeps failed media visible as a partial save and rejects non-X senders', async () => {
  const harness = createBackgroundHarness();
  const post = {
    id: '456', url: 'https://x.com/noric/status/456', author: 'noric', text: 'Image post',
    media: [{ kind: 'image', url: 'https://pbs.twimg.com/media/photo.jpg' }]
  };

  const partial = await harness.send({ type: 'save-x-post', post });
  const denied = await harness.send({ type: 'save-x-post', post }, { tab: { id: 2, url: 'https://example.com' }, url: 'https://example.com' });

  assert.equal(partial.success, true);
  assert.equal(partial.post.status, 'partial');
  assert.equal(partial.post.media[0].status, 'failed');
  assert.equal(denied.success, false);
  assert.equal(harness.postsState.savedXPosts.length, 1);
});
