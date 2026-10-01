(function () {
  const STORAGE_KEY = 'savedXPosts';
  const FOLDERS_KEY = 'savedXFolders';
  const MAX_POSTS = 500;
  const MAX_FOLDERS = 100;
  const MAX_MEDIA_COUNT = 5;
  const store = globalThis.Nor1cSavedPosts;
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

  function validFolderIds(value, folders) {
    const allowed = new Set(folders.map(folder => folder.id));
    const values = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
    return [...new Set(values.filter(id => typeof id === 'string' && allowed.has(id)))];
  }

  function postFolderIds(post, folders) {
    return validFolderIds(Array.isArray(post?.folderIds) ? post.folderIds : post?.folderId, folders);
  }

  function sameFolderIds(left, right) {
    return left.length === right.length && left.every(id => right.includes(id));
  }

  function isExtensionPage(sender) {
    const baseUrl = chrome.runtime.getURL('');
    return [sender?.url, sender?.tab?.url].some(value => typeof value === 'string' && value.startsWith(baseUrl));
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

  function safeText(value, limit) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
  }

  async function savePost(input, sender, retry = false) {
    if (!sender.tab || !isXPage(sender.tab.url || sender.url)) throw new Error('Save posts from an X or Twitter page.');
    input = input && typeof input === 'object' ? input : {};
    const canonical = store.canonicalPostUrl(input.url);
    if (!canonical || canonical.id !== String(input.id)) throw new Error('This post URL is invalid.');
    const posts = await getPosts();
    const folders = await getFolders();
    const existingIndex = posts.findIndex(post => post.id === canonical.id);
    const existing = existingIndex >= 0 ? posts[existingIndex] : null;
    const hasFolderSelection = Array.isArray(input.folderIds) || typeof input.folderId === 'string';
    const folderIds = hasFolderSelection ? validFolderIds(input.folderIds ?? input.folderId, folders) : postFolderIds(existing, folders);
    if (existing?.status === 'complete' && !retry) {
      if (!sameFolderIds(postFolderIds(existing, folders), folderIds) || !Array.isArray(existing.folderIds)) {
        const updated = { ...existing, folderIds, updatedAt: Date.now() };
        delete updated.folderId;
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
    const previousBySlot = new Map((existing?.media || []).map(item => [item.slot, item]));
    const counts = { image: 0, video: 0 };

    for (const candidate of incoming) {
      if (!candidate || !['image', 'video'].includes(candidate.kind)) continue;
      const kind = candidate.kind;
      const slot = `${kind}-${counts[kind]++}`;
      const sourceUrl = store.normalizeMediaUrl(candidate.url, kind);
      const entry = { slot, kind, status: 'linked', url: sourceUrl || '', hint: safeText(candidate.hint, 80), error: '' };
      if (!sourceUrl) {
        entry.status = 'unavailable';
        entry.error = kind === 'video' ? 'Video source is unavailable. Start playback and save again.' : 'Image source is unavailable. Reload the post and save again.';
      }
      media.push(entry);
    }

    for (const old of existing?.media || []) {
      if (!media.some(item => item.slot === old.slot)) {
        // Keep legacy local media records visible until the user replaces them.
        media.push(old);
        if (old.mediaKey) retainedKeys.add(old.mediaKey);
      }
    }

    const failures = media.filter(item => item.status === 'unavailable');
    const record = {
      id: canonical.id,
      url: canonical.url,
      text: safeText(input.text, 4000),
      author: safeText(input.author, 500),
      createdAt: safeText(input.createdAt, 80),
      savedAt: existing?.savedAt || Date.now(),
      updatedAt: Date.now(),
      folderIds: hasFolderSelection ? folderIds : postFolderIds(existing, folders),
      status: failures.length ? 'partial' : 'complete',
      error: failures.length ? `${failures.length} media link(s) are unavailable.` : '',
      media
    };

    if (existingIndex >= 0) posts.splice(existingIndex, 1, record);
    else posts.unshift(record);
    await chrome.storage.local.set({ [STORAGE_KEY]: posts });

    const obsolete = (existing?.media || []).map(item => item.mediaKey).filter(key => key && !retainedKeys.has(key));
    if (obsolete.length) await store.deleteMediaKeys(obsolete);
    return record;
  }

  async function createFolder(name, sender) {
    if (!isXPage(sender.tab?.url || sender.url) && !isExtensionPage(sender)) throw new Error('Create folders from an X page or the saved posts page.');
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
    if (!isExtensionPage(sender)) throw new Error('Manage folders from the saved posts page.');
    const targetId = String(folderId);
    const folders = await getFolders();
    const remaining = folders.filter(folder => folder.id !== targetId);
    await chrome.storage.local.set({ [FOLDERS_KEY]: remaining });
    const posts = await getPosts();
    const updated = posts.map(post => {
      const folderIds = postFolderIds(post, folders).filter(id => id !== targetId);
      const record = { ...post, folderIds };
      delete record.folderId;
      return record;
    });
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    return { success: true };
  }

  async function updatePostFolders(postId, folderIds, sender) {
    if (!isExtensionPage(sender)) throw new Error('Manage folders from the saved posts page.');
    const posts = await getPosts();
    const index = posts.findIndex(post => post.id === String(postId));
    if (index < 0) throw new Error('Saved post was not found.');
    const folders = await getFolders();
    const updated = { ...posts[index], folderIds: validFolderIds(folderIds, folders), updatedAt: Date.now() };
    delete updated.folderId;
    posts.splice(index, 1, updated);
    await chrome.storage.local.set({ [STORAGE_KEY]: posts });
    return updated;
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
    if (message?.type === 'update-saved-post-folders') {
      serialize(() => updatePostFolders(message.id, message.folderIds, sender))
        .then(post => sendResponse({ success: true, post }))
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not update post folders.' }));
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
      if (!isExtensionPage(sender)) {
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
