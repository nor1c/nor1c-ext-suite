(function () {
  const STORAGE_KEY = 'savedXPosts';
  const FOLDERS_KEY = 'savedXFolders';
  const LAST_BACKUP_KEY = 'savedXPostsLastBackupAt';
  const BACKUP_ALARM = 'saved-x-posts-backup-reminder';
  const BACKUP_NOTIFICATION = 'saved-x-posts-backup-reminder';
  const BACKUP_INTERVAL_MINUTES = 5 * 24 * 60;
  const PIXIV_REFERRER_RULE_ID = 900001;
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

  function scheduleBackupReminder(fromTime = Date.now()) {
    chrome.alarms.create(BACKUP_ALARM, {
      when: Math.max(Date.now() + 1000, fromTime + BACKUP_INTERVAL_MINUTES * 60 * 1000),
      periodInMinutes: BACKUP_INTERVAL_MINUTES
    });
  }

  async function ensureBackupReminder() {
    const existing = await chrome.alarms.get(BACKUP_ALARM);
    if (existing) return;
    const result = await chrome.storage.local.get({ [LAST_BACKUP_KEY]: 0 });
    scheduleBackupReminder(Number(result[LAST_BACKUP_KEY]) || Date.now());
  }

  ensureBackupReminder().catch(error => console.warn('Could not schedule saved posts backup reminder:', error.message));

  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== BACKUP_ALARM) return;
    chrome.notifications.create(BACKUP_NOTIFICATION, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Back up your saved posts',
      message: 'Export a JSON backup of your saved X and Pixiv posts and folders.',
      priority: 1
    }).catch(error => console.warn('Could not show saved posts backup reminder:', error.message));
  });

  chrome.notifications.onClicked.addListener(notificationId => {
    if (notificationId !== BACKUP_NOTIFICATION) return;
    chrome.notifications.clear(notificationId).catch(() => {});
    chrome.tabs.create({ url: chrome.runtime.getURL('saved-posts.html') }).catch(() => {});
  });

  function safeFolderName(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  }

  function folderPlatform(folder) {
    return folder?.platform === 'pixiv' ? 'pixiv' : 'x';
  }

  function validFolderIds(value, folders, platform = 'x') {
    const allowed = new Set(folders.filter(folder => folderPlatform(folder) === platform).map(folder => folder.id));
    const values = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
    return [...new Set(values.filter(id => typeof id === 'string' && allowed.has(id)))];
  }

  function postFolderIds(post, folders) {
    return validFolderIds(Array.isArray(post?.folderIds) ? post.folderIds : post?.folderId, folders, postPlatform(post));
  }

  function migrateFolderPlatforms(folders, posts) {
    return folders.map(folder => {
      if (folder?.platform === 'pixiv' || folder?.platform === 'x') return folder;
      const usedByPixiv = posts.some(post => postPlatform(post) === 'pixiv' && (Array.isArray(post.folderIds) ? post.folderIds : [post.folderId]).includes(folder.id));
      const usedByX = posts.some(post => postPlatform(post) === 'x' && (Array.isArray(post.folderIds) ? post.folderIds : [post.folderId]).includes(folder.id));
      return { ...folder, platform: usedByPixiv && !usedByX ? 'pixiv' : 'x' };
    });
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

  function isPixivPage(value) {
    try {
      return ['pixiv.net', 'www.pixiv.net'].includes(new URL(value).hostname.toLowerCase());
    } catch (_) {
      return false;
    }
  }

  function postPlatform(input) {
    return input?.platform === 'pixiv' ? 'pixiv' : 'x';
  }

  function canonicalForPlatform(value, platform) {
    return platform === 'pixiv' ? store.canonicalPixivPostUrl(value) : store.canonicalPostUrl(value);
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

  async function ensurePixivReferrerRule() {
    if (!chrome.declarativeNetRequest?.updateSessionRules) return;
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [PIXIV_REFERRER_RULE_ID],
      addRules: [{
        id: PIXIV_REFERRER_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://www.pixiv.net/' }]
        },
        condition: {
          requestDomains: ['i.pximg.net'],
          initiatorDomains: [chrome.runtime.id],
          resourceTypes: ['image', 'xmlhttprequest', 'other']
        }
      }]
    });
  }

  if (!chrome.declarativeNetRequest?.updateSessionRules && chrome.webRequest?.onBeforeSendHeaders) {
    chrome.webRequest.onBeforeSendHeaders.addListener(details => {
      const initiator = details.initiator || details.originUrl || '';
      if (!initiator.startsWith(chrome.runtime.getURL(''))) return {};
      const headers = details.requestHeaders || [];
      const referer = headers.find(header => header.name.toLowerCase() === 'referer');
      if (referer) referer.value = 'https://www.pixiv.net/';
      else headers.push({ name: 'Referer', value: 'https://www.pixiv.net/' });
      return { requestHeaders: headers };
    }, { urls: ['https://i.pximg.net/*'] }, ['blocking', 'requestHeaders']);
  }

  async function authorizePixivMedia(url, artworkUrl) {
    const canonical = store.canonicalPixivPostUrl(artworkUrl);
    const posts = await getPosts();
    const savedPost = canonical && posts.find(post =>
      postPlatform(post) === 'pixiv' &&
      post.id === canonical.id &&
      post.url === canonical.url
    );
    if (!savedPost || !(savedPost.media || []).some(item => item?.url === url)) throw new Error('This Pixiv image is not part of the selected saved post.');
    await ensurePixivReferrerRule();
    return url;
  }

  async function savePost(input, sender, retry = false) {
    input = input && typeof input === 'object' ? input : {};
    const platform = postPlatform(input);
    const senderAllowed = platform === 'pixiv'
      ? isPixivPage(sender.tab?.url || sender.url)
      : isXPage(sender.tab?.url || sender.url);
    if (!sender.tab || !senderAllowed) throw new Error(platform === 'pixiv' ? 'Save posts from a Pixiv page.' : 'Save posts from an X or Twitter page.');
    const canonical = canonicalForPlatform(input.url, platform);
    if (!canonical || canonical.id !== String(input.id)) throw new Error('This post URL is invalid.');
    const posts = await getPosts();
    const folders = migrateFolderPlatforms(await getFolders(), posts);
    const existingIndex = posts.findIndex(post => post.id === canonical.id && postPlatform(post) === platform);
    const existing = existingIndex >= 0 ? posts[existingIndex] : null;
    const hasFolderSelection = Array.isArray(input.folderIds) || typeof input.folderId === 'string';
    const folderIds = hasFolderSelection ? validFolderIds(input.folderIds ?? input.folderId, folders, platform) : postFolderIds(existing, folders);
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
      const sourceUrl = store.normalizeMediaUrl(candidate.url, kind, platform);
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
      platform,
      text: safeText(input.text, 4000),
      author: safeText(input.author, 500),
      createdAt: safeText(input.createdAt, 80),
      savedAt: existing?.savedAt || Date.now(),
      updatedAt: Date.now(),
      folderIds: hasFolderSelection ? folderIds : postFolderIds(existing, folders),
      status: failures.length ? 'partial' : 'complete',
      error: failures.length ? `${failures.length} media link(s) are unavailable.` : safeText(input.mediaNote, 200),
      media
    };

    if (existingIndex >= 0) posts.splice(existingIndex, 1, record);
    else posts.unshift(record);
    await chrome.storage.local.set({ [STORAGE_KEY]: posts });

    const obsolete = (existing?.media || []).map(item => item.mediaKey).filter(key => key && !retainedKeys.has(key));
    if (obsolete.length) await store.deleteMediaKeys(obsolete);
    return record;
  }

  async function createFolder(name, sender, requestedPlatform) {
    const senderUrl = sender.tab?.url || sender.url;
    const platform = isPixivPage(senderUrl) ? 'pixiv' : isXPage(senderUrl) ? 'x' : requestedPlatform === 'pixiv' ? 'pixiv' : 'x';
    if (!isXPage(senderUrl) && !isPixivPage(senderUrl) && !isExtensionPage(sender)) throw new Error('Create folders from an X, Pixiv, or saved posts page.');
    const folderName = safeFolderName(name);
    if (!folderName) throw new Error('Folder name is required.');
    const posts = await getPosts();
    const storedFolders = await getFolders();
    const folders = migrateFolderPlatforms(storedFolders, posts);
    if (folders.some((folder, index) => folder.platform !== storedFolders[index]?.platform)) {
      await chrome.storage.local.set({ [FOLDERS_KEY]: folders });
    }
    if (folders.length >= MAX_FOLDERS) throw new Error(`Folder limit reached (${MAX_FOLDERS}).`);
    if (folders.some(folder => folderPlatform(folder) === platform && folder.name.toLowerCase() === folderName.toLowerCase())) throw new Error('A folder with this name already exists.');
    const folder = { id: crypto.randomUUID(), name: folderName, platform, createdAt: Date.now() };
    folders.push(folder);
    await chrome.storage.local.set({ [FOLDERS_KEY]: folders });
    return folder;
  }

  async function deleteFolder(folderId, sender) {
    if (!isExtensionPage(sender)) throw new Error('Manage folders from the saved posts page.');
    const targetId = String(folderId);
    const posts = await getPosts();
    const folders = migrateFolderPlatforms(await getFolders(), posts);
    const remaining = folders.filter(folder => folder.id !== targetId);
    await chrome.storage.local.set({ [FOLDERS_KEY]: remaining });
    const updated = posts.map(post => {
      const folderIds = postFolderIds(post, folders).filter(id => id !== targetId);
      const record = { ...post, folderIds };
      delete record.folderId;
      return record;
    });
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    return { success: true };
  }

  async function updatePostFolders(postId, folderIds, sender, platform = 'x') {
    if (!isExtensionPage(sender)) throw new Error('Manage folders from the saved posts page.');
    const posts = await getPosts();
    const index = posts.findIndex(post => post.id === String(postId) && postPlatform(post) === platform);
    if (index < 0) throw new Error('Saved post was not found.');
    const folders = migrateFolderPlatforms(await getFolders(), posts);
    const updated = { ...posts[index], folderIds: validFolderIds(folderIds, folders, platform), updatedAt: Date.now() };
    delete updated.folderId;
    posts.splice(index, 1, updated);
    await chrome.storage.local.set({ [STORAGE_KEY]: posts });
    return updated;
  }

  async function deletePost(postId, platform = 'x') {
    const posts = await getPosts();
    const target = posts.find(post => post.id === String(postId) && postPlatform(post) === platform);
    if (!target) return { success: true };
    const remaining = posts.filter(post => post !== target);
    await chrome.storage.local.set({ [STORAGE_KEY]: remaining });
    if (postPlatform(target) === 'x') await store.deletePostMedia(target.id);
    return { success: true };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'saved-posts-backup-completed') {
      if (!isExtensionPage(sender)) {
        sendResponse({ success: false, error: 'This action is only available from the saved posts page.' });
        return false;
      }
      const completedAt = Date.now();
      chrome.storage.local.set({ [LAST_BACKUP_KEY]: completedAt })
        .then(() => {
          scheduleBackupReminder(completedAt);
          sendResponse({ success: true, completedAt });
        })
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not update the backup reminder.' }));
      return true;
    }
    if (message?.type === 'save-x-post' || message?.type === 'save-pixiv-post') {
      const post = message?.type === 'save-pixiv-post' ? { ...message.post, platform: 'pixiv' } : message.post;
      serialize(() => savePost(post, sender, message.retry === true))
        .then(post => sendResponse({ success: true, post }))
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not save this post.' }));
      return true;
    }
    if (message?.type === 'get-saved-folders') {
      const senderUrl = sender.tab?.url || sender.url;
      const platform = isPixivPage(senderUrl) ? 'pixiv' : isXPage(senderUrl) ? 'x' : message.platform === 'pixiv' ? 'pixiv' : 'x';
      Promise.all([getFolders(), getPosts()])
        .then(([folders, posts]) => {
          const platformFolders = migrateFolderPlatforms(folders, posts).filter(folder => folderPlatform(folder) === platform);
          const itemCounts = new Map(platformFolders.map(folder => [folder.id, 0]));
          for (const post of posts) {
            if (postPlatform(post) !== platform) continue;
            for (const folderId of postFolderIds(post, platformFolders)) {
              if (itemCounts.has(folderId)) itemCounts.set(folderId, itemCounts.get(folderId) + 1);
            }
          }
          sendResponse({
            success: true,
            folders: platformFolders.map(folder => ({ ...folder, itemCount: itemCounts.get(folder.id) || 0 }))
          });
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (message?.type === 'get-pixiv-media') {
      if (!isExtensionPage(sender)) {
        sendResponse({ success: false, error: 'This action is only available from the saved posts page.' });
        return false;
      }
      const canonical = store.canonicalPixivPostUrl(message.artworkUrl);
      const url = store.normalizeMediaUrl(message.url, 'image', 'pixiv');
      if (!canonical || !url) {
        sendResponse({ success: false, error: 'This Pixiv media request is invalid.' });
        return false;
      }
      authorizePixivMedia(url, canonical.url)
        .then(mediaUrl => sendResponse({ success: true, url: mediaUrl }))
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not load Pixiv media.' }));
      return true;
    }
    if (message?.type === 'create-saved-folder') {
      serialize(() => createFolder(message.name, sender, message.platform))
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
      serialize(() => updatePostFolders(message.id, message.folderIds, sender, message.platform))
        .then(post => sendResponse({ success: true, post }))
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not update post folders.' }));
      return true;
    }
    if (message?.type === 'remove-x-post' || message?.type === 'remove-pixiv-post') {
      const platform = message?.type === 'remove-pixiv-post' ? 'pixiv' : 'x';
      const senderAllowed = platform === 'pixiv'
        ? isPixivPage(sender.tab?.url || sender.url)
        : isXPage(sender.tab?.url || sender.url);
      if (!sender.tab || !senderAllowed) {
        sendResponse({ success: false, error: platform === 'pixiv' ? 'Remove saved posts from a Pixiv page.' : 'Remove saved posts from an X or Twitter page.' });
        return false;
      }
      serialize(() => deletePost(message.id, platform))
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not remove saved post.' }));
      return true;
    }
    if (message?.type === 'delete-x-post') {
      if (!isExtensionPage(sender)) {
        sendResponse({ success: false, error: 'This action is only available from the saved posts page.' });
        return false;
      }
      serialize(() => deletePost(message.id, message.platform))
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not remove this post.' }));
      return true;
    }
  });
})();
