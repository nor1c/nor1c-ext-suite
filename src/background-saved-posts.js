(function () {
  const STORAGE_KEY = 'savedXPosts';
  const FOLDERS_KEY = 'savedXFolders';
  const MAX_POSTS = 500;
  const MAX_FOLDERS = 100;
  const MAX_MEDIA_COUNT = 5;
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
  const MAX_POST_MEDIA_BYTES = 250 * 1024 * 1024;
  const MAX_TOTAL_MEDIA_BYTES = 1024 * 1024 * 1024;
  const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
  const MAX_HLS_SEGMENTS = 500;
  const store = globalThis.Nor1cSavedPosts;
  const responseControllers = new WeakMap();
  let writeQueue = Promise.resolve();

  function serialize(task) {
    const result = writeQueue.then(task);
    writeQueue = result.catch(() => {});
    return result;
  }

  async function getPosts() {
    const result = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
    return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  }

  async function getFolders() {
    const result = await chrome.storage.local.get({ [FOLDERS_KEY]: [] });
    return Array.isArray(result[FOLDERS_KEY]) ? result[FOLDERS_KEY] : [];
  }

  function safeFolderName(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  }

  function isXPage(value) {
    try {
      return ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(new URL(value).hostname.toLowerCase());
    } catch (_) {
      return false;
    }
  }

  function sourceFromActivePlayback(tabId, mediaHint) {
    const sources = globalThis.__nor1cXVideoSourcesByTab?.get(tabId) || globalThis.__nor1cDetectedVideoSourcesByTab?.get(tabId);
    if (!sources) return '';
    let candidates = Array.from(sources.values())
      .filter(source => store.normalizeMediaUrl(source.url, 'video'))
      .filter(source => /\.mp4(?:$|[?#])/i.test(source.url) || /\.m3u8(?:$|[?#])/i.test(source.url) || /mpegurl/i.test(source.contentType || '') || /\/playlist(?:\/|$)/i.test(source.url));
    const hint = typeof mediaHint === 'string' && /^\d+$/.test(mediaHint) ? mediaHint : '';
    if (hint) {
      candidates = candidates.filter(source => source.mediaId === hint || source.url.includes(`/${hint}/`));
    } else {
      const recent = candidates.filter(source => Date.now() - (source.detectedAt || 0) < 30000);
      const mediaIds = new Set(recent.map(source => source.mediaId).filter(Boolean));
      if (mediaIds.size !== 1) return '';
      const [onlyMediaId] = mediaIds;
      candidates = recent.filter(source => source.mediaId === onlyMediaId);
    }
    candidates.sort((a, b) => {
      const rank = source => /\.mp4(?:$|[?#])/i.test(source.url) ? 0 : 1;
      return rank(a) - rank(b) || (b.contentLength || 0) - (a.contentLength || 0) || b.detectedAt - a.detectedAt;
    });
    return candidates[0]?.url || '';
  }

  function responseUrlAllowed(response, kind) {
    return Boolean(store.normalizeMediaUrl(response.url, kind));
  }

  async function readBoundedBlob(response, limit, type) {
    const control = responseControllers.get(response);
    const declaredLength = Number(response.headers.get('content-length')) || 0;
    if (declaredLength > limit) {
      if (control) {
        clearTimeout(control.timeout);
        control.controller.abort();
      }
      throw new Error('Media exceeds the extension storage limit.');
    }
    if (!response.body) {
      try {
        const blob = await response.blob();
        if (blob.size > limit) throw new Error('Media exceeds the extension storage limit.');
        return blob.slice(0, blob.size, type || blob.type);
      } finally {
        if (control) clearTimeout(control.timeout);
      }
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw new Error('Media exceeds the extension storage limit.');
        }
        chunks.push(value);
      }
      return new Blob(chunks, { type: type || response.headers.get('content-type') || '' });
    } finally {
      reader.releaseLock();
      if (control) clearTimeout(control.timeout);
    }
  }

  async function fetchResponse(url, kind, options = {}) {
    const safeUrl = store.normalizeMediaUrl(url, kind);
    if (!safeUrl) throw new Error('Media URL is not a supported X media URL.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(safeUrl, {
        credentials: 'omit',
        redirect: 'follow',
        signal: controller.signal,
        headers: options.range ? { Range: options.range } : undefined
      });
      if (!response.ok) throw new Error(`Media request failed (${response.status}).`);
      if (!responseUrlAllowed(response, kind)) throw new Error('Media request redirected to an unsupported host.');
      const length = Number(response.headers.get('content-length')) || 0;
      const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
      if (length > limit) throw new Error('Media exceeds the extension storage limit.');
      responseControllers.set(response, { controller, timeout });
      return response;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  function parseAttributes(text) {
    const result = {};
    for (const match of text.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) {
      result[match[1]] = match[2].replace(/^"|"$/g, '');
    }
    return result;
  }

  function parseByteRange(value) {
    if (!value) return null;
    const match = value.match(/^(\d+)(?:@(\d+))?$/);
    return match ? { length: Number(match[1]), offset: match[2] === undefined ? null : Number(match[2]) } : null;
  }

  async function fetchPlaylist(url, depth = 0) {
    if (depth > 3) throw new Error('HLS playlist nesting is too deep.');
    const response = await fetchResponse(url, 'video');
    const playlistBlob = await readBoundedBlob(response, MAX_PLAYLIST_BYTES, 'application/vnd.apple.mpegurl');
    const text = await playlistBlob.text();
    if (text.length > MAX_PLAYLIST_BYTES || !text.startsWith('#EXTM3U')) throw new Error('Invalid HLS playlist.');
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const variants = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].startsWith('#EXT-X-MEDIA:')) {
        const attributes = parseAttributes(lines[i].slice(lines[i].indexOf(':') + 1));
        if (attributes.TYPE === 'AUDIO' && attributes.URI) {
          throw new Error('HLS video with a separate audio track is not supported.');
        }
      }
      if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
      const attributes = parseAttributes(lines[i].slice(lines[i].indexOf(':') + 1));
      const next = lines.slice(i + 1).find(line => !line.startsWith('#'));
      if (next) variants.push({ url: new URL(next, response.url).href, bandwidth: Number(attributes.BANDWIDTH) || 0 });
    }
    if (variants.length) {
      variants.sort((a, b) => a.bandwidth - b.bandwidth);
      const selected = variants[0].url;
      if (!store.normalizeMediaUrl(selected, 'video')) throw new Error('HLS variant points to an unsupported host.');
      return fetchPlaylist(selected, depth + 1);
    }

    if (lines.some(line => /^#EXT-X-(?:SESSION-)?KEY:/.test(line) && !/METHOD=NONE(?:,|$)/.test(line))) {
      throw new Error('Encrypted HLS video cannot be saved.');
    }

    let init = null;
    let pendingRange = null;
    const rangeEnds = new Map();
    const resolveRange = (url, range) => {
      if (!range) return null;
      const offset = range.offset === null ? rangeEnds.get(url) : range.offset;
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('HLS byte range offset is missing.');
      const resolved = { length: range.length, offset };
      rangeEnds.set(url, offset + range.length);
      return resolved;
    };
    const segments = [];
    for (const line of lines) {
      if (line.startsWith('#EXT-X-MAP:')) {
        const attributes = parseAttributes(line.slice(line.indexOf(':') + 1));
        const mapUrl = new URL(attributes.URI || '', response.url).href;
        if (!store.normalizeMediaUrl(mapUrl, 'video')) throw new Error('HLS initialization segment points to an unsupported host.');
        init = { url: mapUrl, range: resolveRange(mapUrl, parseByteRange(attributes.BYTERANGE)) };
      } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
        pendingRange = parseByteRange(line.slice(line.indexOf(':') + 1));
      } else if (!line.startsWith('#')) {
        const segmentUrl = new URL(line, response.url).href;
        if (!store.normalizeMediaUrl(segmentUrl, 'video')) throw new Error('HLS segment points to an unsupported host.');
        segments.push({ url: segmentUrl, range: resolveRange(segmentUrl, pendingRange) });
        pendingRange = null;
        if (segments.length > MAX_HLS_SEGMENTS) throw new Error('HLS playlist has too many segments.');
      }
    }
    if (!segments.length) throw new Error('HLS playlist has no video segments.');
    if (!init && segments.some(segment => /\.ts(?:$|[?#])/i.test(segment.url))) {
      throw new Error('Transport-stream HLS cannot be played from extension storage.');
    }
    return { playlistUrl: response.url, init, segments };
  }

  async function fetchHlsBlob(url, limit) {
    const playlist = await fetchPlaylist(url);
    const parts = [];
    let total = 0;
    const appendResponse = async item => {
      let range;
      if (item.range) {
        if (item.range.offset === null) throw new Error('Implicit HLS byte ranges are not supported.');
        range = `bytes=${item.range.offset}-${item.range.offset + item.range.length - 1}`;
      }
      const response = await fetchResponse(item.url, 'video', { range });
      const maxRead = item.range && response.status === 200 ? item.range.offset + item.range.length : limit - total;
      const blob = await readBoundedBlob(response, Math.min(maxRead, limit - total), response.headers.get('content-type') || 'video/mp4');
      if (item.range && response.status === 206 && blob.size !== item.range.length) {
        throw new Error('HLS byte range is incomplete.');
      }
      if (item.range && blob.size !== item.range.length && response.status === 200) {
        if (item.range.offset + item.range.length > blob.size) throw new Error('HLS byte range is incomplete.');
        parts.push(blob.slice(item.range.offset, item.range.offset + item.range.length));
        total += item.range.length;
      } else {
        parts.push(blob);
        total += blob.size;
      }
      if (total > MAX_VIDEO_BYTES) throw new Error('Video exceeds the extension storage limit.');
    };
    if (playlist.init) await appendResponse(playlist.init);
    for (const segment of playlist.segments) await appendResponse(segment);
    if (!playlist.init) throw new Error('HLS video has no supported MP4 initialization segment.');
    return new Blob(parts, { type: 'video/mp4' });
  }

  async function fetchMediaBlob(url, kind, availableBytes) {
    const safeUrl = store.normalizeMediaUrl(url, kind);
    if (!safeUrl) throw new Error('Media URL is missing or unsupported.');
    const limit = Math.min(kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES, availableBytes);
    if (limit <= 0) throw new Error('Saved post media limit reached.');
    if (kind === 'video' && (/\.m3u8(?:$|[?#])/i.test(safeUrl) || /\/playlist(?:\/|$)/i.test(new URL(safeUrl).pathname))) return fetchHlsBlob(safeUrl, limit);
    const response = await fetchResponse(safeUrl, kind);

    const blob = await readBoundedBlob(response, limit, response.headers.get('content-type') || '');
    if (!blob.size || blob.size > limit) throw new Error(blob.size ? 'Media exceeds the extension storage limit.' : 'Media file is empty.');
    const type = (blob.type || response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (kind === 'image' && !type.startsWith('image/')) throw new Error('The saved image response is not an image.');
    if (kind === 'video' && !['video/mp4', 'video/webm', 'video/quicktime'].includes(type)) {
      throw new Error('Only directly playable MP4 or WebM video is supported.');
    }
    return blob.type === type ? blob : blob.slice(0, blob.size, type);
  }

  function safeText(value, limit) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
  }

  async function savePost(input, sender, retry = false) {
    if (!sender.tab || !isXPage(sender.tab.url || sender.url)) throw new Error('Save posts from an X or Twitter page.');
    const canonical = store.canonicalPostUrl(input?.url);
    if (!canonical || canonical.id !== String(input.id)) throw new Error('This post URL is invalid.');
    const posts = await getPosts();
    const folders = await getFolders();
    const folderId = typeof input.folderId === 'string' && folders.some(folder => folder.id === input.folderId) ? input.folderId : '';
    const existingIndex = posts.findIndex(post => post.id === canonical.id);
    const existing = existingIndex >= 0 ? posts[existingIndex] : null;
    if (existing?.status === 'complete' && !retry) {
      if (existing.folderId !== folderId) {
        const updated = { ...existing, folderId, updatedAt: Date.now() };
        posts.splice(existingIndex, 1, updated);
        await chrome.storage.local.set({ [STORAGE_KEY]: posts });
        return updated;
      }
      return existing;
    }
    if (!existing && posts.length >= MAX_POSTS) throw new Error(`Saved posts limit reached (${MAX_POSTS}). Remove a saved post first.`);

    const incoming = Array.isArray(input.media) ? input.media.slice(0, MAX_MEDIA_COUNT) : [];
    if (incoming.some(item => item?.kind === 'video' && !item.url)) {
      const missing = incoming.find(item => item?.kind === 'video' && !item.url);
      const source = sourceFromActivePlayback(sender.tab.id, missing?.hint);
      if (missing && source) missing.url = source;
    }
    const media = [];
    const retainedKeys = new Set();
    const newlyCreatedKeys = new Set();
    const existingPostBytes = (existing?.media || []).filter(item => item.status === 'saved').reduce((total, item) => total + (Number(item.size) || 0), 0);
    const totalSavedBytes = posts.reduce((total, post) => total + (post.media || [])
      .filter(item => item.status === 'saved')
      .reduce((postTotal, item) => postTotal + (Number(item.size) || 0), 0), 0);
    let usedBytes = existingPostBytes;
    const previousBySlot = new Map((existing?.media || []).map(item => [item.slot, item]));
    const counts = { image: 0, video: 0 };

    for (const candidate of incoming) {
      if (!candidate || !['image', 'video'].includes(candidate.kind)) continue;
      const kind = candidate.kind;
      const slot = `${kind}-${counts[kind]++}`;
      const previous = previousBySlot.get(slot);
      if (previous?.status === 'saved' && previous.kind === kind) {
        media.push(previous);
        retainedKeys.add(previous.mediaKey);
        continue;
      }
      const sourceUrl = store.normalizeMediaUrl(candidate.url, kind);
      const entry = { slot, kind, status: 'failed', mediaKey: '', mimeType: '', size: 0, error: '' };
      if (!sourceUrl) {
        entry.error = kind === 'video' ? 'Video source is unavailable. Start playback and retry.' : 'Image source is unavailable. Reload the post and retry.';
        media.push(entry);
        continue;
      }
      try {
        const previousSize = previous?.status === 'saved' ? previous.size : 0;
        const totalAvailable = MAX_TOTAL_MEDIA_BYTES - totalSavedBytes + existingPostBytes - usedBytes + previousSize;
        const blob = await fetchMediaBlob(sourceUrl, kind, Math.min(MAX_POST_MEDIA_BYTES - usedBytes + previousSize, totalAvailable));
        const mediaKey = `${canonical.id}:${slot}:${crypto.randomUUID()}`;
        await store.putMedia(mediaKey, canonical.id, blob);
        newlyCreatedKeys.add(mediaKey);
        Object.assign(entry, { status: 'saved', mediaKey, mimeType: blob.type, size: blob.size, error: '' });
        usedBytes += blob.size - previousSize;
        retainedKeys.add(mediaKey);
      } catch (error) {
        entry.error = error instanceof Error ? error.message.slice(0, 300) : 'Media could not be saved.';
      }
      media.push(entry);
    }

    for (const old of existing?.media || []) {
      if (!media.some(item => item.slot === old.slot)) {
        if (old.status === 'saved') retainedKeys.add(old.mediaKey);
        media.push(old);
      }
    }

    const failures = media.filter(item => item.status !== 'saved');
    const record = {
      id: canonical.id,
      url: canonical.url,
      text: safeText(input.text, 4000),
      author: safeText(input.author, 500),
      createdAt: safeText(input.createdAt, 80),
      savedAt: existing?.savedAt || Date.now(),
      updatedAt: Date.now(),
      folderId: existing?.folderId || folderId,
      status: failures.length ? 'partial' : 'complete',
      error: failures.length ? `${failures.length} media item(s) could not be saved.` : '',
      media
    };

    if (existingIndex >= 0) posts.splice(existingIndex, 1, record);
    else posts.unshift(record);
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: posts });
    } catch (error) {
      if (newlyCreatedKeys.size) await store.deleteMediaKeys(Array.from(newlyCreatedKeys));
      throw error;
    }

    const obsolete = (existing?.media || []).map(item => item.mediaKey).filter(key => key && !retainedKeys.has(key));
    if (obsolete.length) await store.deleteMediaKeys(obsolete);
    return record;
  }

  async function createFolder(name, sender) {
    if (!sender.tab || !isXPage(sender.tab.url || sender.url)) throw new Error('Create folders from an X or Twitter page.');
    const folderName = safeFolderName(name);
    if (!folderName) throw new Error('Folder name is required.');
    const folders = await getFolders();
    if (folders.length >= MAX_FOLDERS) throw new Error(`Folder limit reached (${MAX_FOLDERS}).`);
    if (folders.some(folder => folder.name.toLowerCase() === folderName.toLowerCase())) throw new Error('A folder with this name already exists.');
    const folder = { id: crypto.randomUUID(), name: folderName, createdAt: Date.now() };
    folders.push(folder);
    await chrome.storage.local.set({ [FOLDERS_KEY]: folders });
    return folder;
  }

  async function deleteFolder(folderId, sender) {
    if (!sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('Manage folders from the saved posts page.');
    const folders = await getFolders();
    const remaining = folders.filter(folder => folder.id !== String(folderId));
    await chrome.storage.local.set({ [FOLDERS_KEY]: remaining });
    const posts = await getPosts();
    const updated = posts.map(post => post.folderId === String(folderId) ? { ...post, folderId: '' } : post);
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    return { success: true };
  }

  async function deletePost(postId) {
    const posts = await getPosts();
    const target = posts.find(post => post.id === String(postId));
    if (!target) return { success: true };
    const remaining = posts.filter(post => post.id !== target.id);
    await chrome.storage.local.set({ [STORAGE_KEY]: remaining });
    await store.deletePostMedia(target.id);
    return { success: true };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'save-x-post') {
      serialize(() => savePost(message.post, sender, message.retry === true))
        .then(post => sendResponse({ success: true, post }))
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not save this post.' }));
      return true;
    }
    if (message?.type === 'get-saved-folders') {
      getFolders().then(folders => sendResponse({ success: true, folders })).catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (message?.type === 'create-saved-folder') {
      serialize(() => createFolder(message.name, sender))
        .then(folder => sendResponse({ success: true, folder }))
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not create folder.' }));
      return true;
    }
    if (message?.type === 'delete-saved-folder') {
      serialize(() => deleteFolder(message.id, sender))
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not delete folder.' }));
      return true;
    }
    if (message?.type === 'remove-x-post') {
      if (!sender.tab || !isXPage(sender.tab.url || sender.url)) {
        sendResponse({ success: false, error: 'Remove saved posts from an X or Twitter page.' });
        return false;
      }
      serialize(() => deletePost(message.id))
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not remove saved post.' }));
      return true;
    }
    if (message?.type === 'delete-x-post') {
      if (!sender.url?.startsWith(chrome.runtime.getURL(''))) {
        sendResponse({ success: false, error: 'This action is only available from the saved posts page.' });
        return false;
      }
      serialize(() => deletePost(message.id))
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not remove this post.' }));
      return true;
    }
  });
})();
