(function (root) {
  const DB_NAME = 'nor1c-saved-x-posts';
  const DB_VERSION = 1;
  const STORE_NAME = 'media';
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('postId', 'postId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open saved post storage.'));
      request.onblocked = () => reject(new Error('Saved post storage is blocked by another extension page.'));
    }).catch(error => {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  }

  async function putMedia(key, postId, blob) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ key, postId, blob });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not save post media.'));
      tx.onabort = () => reject(tx.error || new Error('Saving post media was interrupted.'));
    });
  }

  async function getMedia(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result ? request.result.blob : null);
      request.onerror = () => reject(request.error || new Error('Could not read saved post media.'));
    });
  }

  async function deletePostMedia(postId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const index = tx.objectStore(STORE_NAME).index('postId');
      const request = index.openKeyCursor(IDBKeyRange.only(postId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          tx.objectStore(STORE_NAME).delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not remove saved post media.'));
      tx.onabort = () => reject(tx.error || new Error('Removing saved post media was interrupted.'));
    });
  }

  async function deleteMediaKeys(keys) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const key of keys) store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not remove incomplete media.'));
      tx.onabort = () => reject(tx.error || new Error('Removing incomplete media was interrupted.'));
    });
  }

  function canonicalPostUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(host)) return null;
      const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/i);
      if (!match) return null;
      return { id: match[2], url: `https://x.com/${match[1]}/status/${match[2]}` };
    } catch (_) {
      return null;
    }
  }

  function canonicalPixivPostUrl(value) {
    try {
      const url = new URL(value);
      if (!['pixiv.net', 'www.pixiv.net'].includes(url.hostname.toLowerCase())) return null;
      const match = url.pathname.match(/^\/(?:[a-z]{2}\/)?artworks\/(\d+)\/?$/i);
      if (!match) return null;
      return { id: match[1], url: `https://www.pixiv.net/artworks/${match[1]}` };
    } catch (_) {
      return null;
    }
  }

  function normalizeMediaUrl(value, kind, platform = 'x') {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      const host = url.hostname.toLowerCase();
      if (platform === 'pixiv') {
        if (kind !== 'image' || host !== 'i.pximg.net') return null;
      } else {
        if (kind === 'image' && host !== 'pbs.twimg.com') return null;
        if (kind === 'video' && host !== 'video.twimg.com') return null;
      }
      url.hash = '';
      return url.href;
    } catch (_) {
      return null;
    }
  }

  root.Nor1cSavedPosts = Object.freeze({
    DB_NAME,
    canonicalPostUrl,
    canonicalPixivPostUrl,
    normalizeMediaUrl,
    putMedia,
    getMedia,
    deletePostMedia,
    deleteMediaKeys
  });
})(globalThis);
