(function () {
  const profilesStore = globalThis.Nor1cSavedXProfiles;
  const { STORAGE_KEY, MAX_PROFILES, MAX_BATCH, MAX_STORAGE_BYTES, STORAGE_LIMIT_MESSAGE } = profilesStore;
  let writeQueue = Promise.resolve();

  function serialize(task) {
    const result = writeQueue.then(task);
    writeQueue = result.catch(() => {});
    return result;
  }

  async function getProfiles() {
    const result = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
    return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  }

  function fitsStorageBudget(profiles) {
    return new TextEncoder().encode(JSON.stringify(profiles)).byteLength <= MAX_STORAGE_BYTES;
  }

  function isExtensionPage(sender) {
    return typeof sender?.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
  }

  function sendingMediaProfile(sender) {
    if (!sender?.tab || sender.frameId !== 0) return null;
    try {
      // Chrome's sender.url remains the document's original URL after X SPA navigation.
      // Require a top-frame message from the same origin, then use the current tab route.
      const currentUrl = sender.tab.url || sender.url;
      if (new URL(sender.url).origin !== new URL(currentUrl).origin || !profilesStore.isMediaPage(currentUrl)) return null;
      return profilesStore.canonicalProfileUrl(currentUrl);
    } catch (_) { return null; }
  }

  async function saveProfiles(urls) {
    if (!Array.isArray(urls) || !urls.length || urls.length > 10) throw new Error('Enter 1–10 profile links at a time.');
    const requested = new Map();
    for (const url of urls) {
      const profile = profilesStore.canonicalProfileUrl(url);
      if (!profile) throw new Error('Use an X profile or media URL, for example https://x.com/username/media?filter=photo. Post links are not profile links.');
      requested.set(profile.id, profile);
    }
    const profiles = await getProfiles();
    const additions = [...requested.values()].filter(item => !profiles.some(profile => profile.id === item.id));
    if (profiles.length + additions.length > MAX_PROFILES) throw new Error(`You can save up to ${MAX_PROFILES} X profiles. Remove a profile first.`);
    const now = Date.now();
    const records = additions.map(profile => ({ ...profile, captureId: crypto.randomUUID(), savedAt: now, updatedAt: now, lastCollectedAt: 0, photos: [] }));
    if (records.length) {
      const updated = [...records, ...profiles];
      if (!fitsStorageBudget(updated)) throw new Error(STORAGE_LIMIT_MESSAGE);
      await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    }
    return { success: true, added: records.length, ids: [...requested.keys()] };
  }

  async function appendPhotos(message, sender) {
    const profile = sendingMediaProfile(sender);
    if (!profile || profile.id !== message.id) throw new Error('Collect photos from the saved profile’s X media page.');
    if (!Array.isArray(message.photos) || message.photos.length > MAX_BATCH) throw new Error('Invalid profile photo batch.');
    const profiles = await getProfiles();
    const index = profiles.findIndex(item => item.id === profile.id);
    if (index < 0 || profiles[index].captureId !== message.captureId) throw new Error('This profile is no longer saved.');
    const record = profiles[index];
    if (record.storageLimited) return { success: true, storageLimited: true, count: record.photos.length };
    const photos = new Map((record.photos || []).map(photo => [photo.id, photo]));
    let added = 0;
    for (const candidate of message.photos) {
      const photo = profilesStore.normalizePhoto(candidate, profile.id);
      if (!photo || photos.has(photo.id)) continue;
      photos.set(photo.id, photo);
      added += 1;
    }
    if (added) {
      profiles[index] = { ...record, photos: [...photos.values()], updatedAt: Date.now(), lastCollectedAt: Date.now() };
      if (!fitsStorageBudget(profiles)) {
        profiles[index] = { ...record, storageLimited: true };
        await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
        return { success: true, storageLimited: true, count: record.photos.length };
      }
      await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
    }
    return { success: true, added, count: photos.size };
  }

  async function removeProfile(id) {
    const profiles = await getProfiles();
    const remaining = profiles.filter(profile => profile.id !== id).map(profile => ({ ...profile, storageLimited: false }));
    await chrome.storage.local.set({ [STORAGE_KEY]: remaining });
    return { success: true };
  }

  async function updateCollection(message, sender) {
    const profiles = await getProfiles();
    const record = profiles.find(profile => profile.id === message.id);
    const job = record?.collection;
    if (!job || job.runId !== message.runId || job.state !== 'loading' || job.tabId !== sender.tab?.id || sender.frameId !== 0 || sendingMediaProfile(sender)?.id !== message.id) throw new Error('This collection is no longer active.');
    if (!['stopped', 'stalled', 'timeout', 'limit', 'error', 'interrupted', 'finished', 'idle'].includes(message.state)) throw new Error('Invalid collection state.');
    if (message.state === 'finished') {
      if (!Number.isSafeInteger(message.timelineRevision) || !sender.documentId) throw new Error('Missing X timeline completion evidence.');
      // Page postMessage is untrusted. Query our non-replaceable observer closure directly
      // in the exact sending document, rather than accepting a forged bridge end event.
      const results = await chrome.scripting.executeScript({
        target: { tabId: job.tabId, documentIds: [sender.documentId] }, world: 'MAIN',
        func: () => typeof window.__nor1cReadMediaTimeline === 'function' ? window.__nor1cReadMediaTimeline() : null
      });
      const evidence = results[0]?.result;
      if (evidence?.state !== 'end' || evidence.pending !== 0 || evidence.revision !== message.timelineRevision || evidence.profileId !== record.id || evidence.href !== (sender.tab.url || sender.url)) throw new Error('X has not confirmed the end of this timeline.');
    }
    record.collection = { ...job, state: message.state, updatedAt: Date.now() };
    // Persist the final state before closing: no photos/status are lost with the tab.
    await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
    if (message.state === 'finished' && job.closeWhenFinished === true) {
      let closeState = 'kept';
      try {
        const tab = await chrome.tabs.get(job.tabId);
        const sourceUrl = sender.tab.url || sender.url;
        if (!tab.pendingUrl && tab.url === sourceUrl && profilesStore.isMediaPage(tab.url) && profilesStore.canonicalProfileUrl(tab.url)?.id === record.id) {
          await chrome.tabs.remove(job.tabId);
          closeState = 'closed';
        }
      } catch (_) { closeState = 'failed'; }
      record.collection.tabCloseState = closeState;
      await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
    }
    return { success: true };
  }

  async function stopCollection(id) {
    const profiles = await getProfiles();
    const record = profiles.find(profile => profile.id === id);
    if (record?.collection?.state === 'loading') {
      record.collection = { ...record.collection, state: 'stopped', updatedAt: Date.now() };
      await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
      await chrome.tabs.sendMessage(record.collection.tabId, { type: 'stop-saved-x-profile', runId: record.collection.runId }).catch(() => {});
    }
    return { success: true };
  }

  async function interruptTab(tabId, url) {
    const profiles = await getProfiles();
    let changed = false;
    for (const profile of profiles) {
      if (profile.collection?.tabId !== tabId || profile.collection.state !== 'loading') continue;
      if (url && profilesStore.isMediaPage(url) && profilesStore.canonicalProfileUrl(url)?.id === profile.id) continue;
      profile.collection = { ...profile.collection, state: 'interrupted', updatedAt: Date.now() };
      changed = true;
    }
    if (changed) await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
  }
  chrome.tabs.onRemoved.addListener(tabId => { serialize(() => interruptTab(tabId)).catch(() => {}); });
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url) serialize(() => interruptTab(tabId, change.url)).catch(() => {});
  });

  async function openMedia(id, active, autoLoad) {
    const profile = (await getProfiles()).find(item => item.id === id);
    const canonical = profilesStore.canonicalProfileUrl(profile?.url);
    if (!canonical || canonical.id !== id) throw new Error('Saved profile was not found.');
    if (autoLoad && profile.storageLimited) throw new Error(STORAGE_LIMIT_MESSAGE);
    // Reuse a media tab; only the assigned collection tab may close on a normal finish.
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find(tab => profilesStore.isMediaPage(tab.url) && profilesStore.canonicalProfileUrl(tab.url)?.id === id);
    let tab = existing;
    if (existing) {
      if (active) {
        await chrome.tabs.update(existing.id, { active: true });
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      try {
        const response = await chrome.tabs.sendMessage(existing.id, { type: 'scan-saved-x-profile' });
        if (!response?.success || (autoLoad && response.autoLoadVersion !== 4)) throw new Error('Collector unavailable');
      } catch (_) {
        throw new Error(`Reload the existing @${id} X media tab so the updated extension can collect photos, then try again.`);
      }
    } else {
      tab = await chrome.tabs.create({ url: canonical.url, active });
    }
    if (autoLoad) {
      const profiles = await getProfiles();
      const record = profiles.find(profile => profile.id === id);
      if (record.storageLimited) throw new Error(STORAGE_LIMIT_MESSAGE);
      // Duplicate starts reuse the same job; a stopped/stalled run gets a new token.
      if (record.collection?.state !== 'loading' || record.collection.tabId !== tab.id) {
        record.collection = { runId: crypto.randomUUID(), tabId: tab.id, state: 'loading', closeWhenFinished: true, startedAt: Date.now(), updatedAt: Date.now() };
        if (!fitsStorageBudget(profiles)) throw new Error(STORAGE_LIMIT_MESSAGE);
        await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
      } else if (record.collection.closeWhenFinished !== true) {
        // Runs created before auto-close existed need the flag when explicitly resumed.
        record.collection.closeWhenFinished = true;
        if (!fitsStorageBudget(profiles)) throw new Error(STORAGE_LIMIT_MESSAGE);
        await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
      }
      await chrome.tabs.sendMessage(tab.id, { type: 'scan-saved-x-profile' }).catch(() => {});
    }
    return { success: true };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'open-saved-x-profiles') {
      const profile = sendingMediaProfile(sender);
      if (!profile) {
        sendResponse({ success: false, error: 'Open galleries from an X media page.' });
        return false;
      }
      chrome.tabs.create({ url: chrome.runtime.getURL(`saved-x-profiles.html?profile=${profile.id}`) })
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false, error: 'Could not open saved profiles.' }));
      return true;
    }
    if (!['save-x-profiles', 'append-x-profile-photos', 'delete-x-profile', 'open-x-profile-media', 'get-x-profile-collection', 'update-x-profile-collection', 'stop-x-profile-collection'].includes(message?.type)) return;
    const contentMessage = ['append-x-profile-photos', 'get-x-profile-collection', 'update-x-profile-collection'].includes(message.type);
    if (!contentMessage && !isExtensionPage(sender)) {
      sendResponse({ success: false, error: 'Manage profiles from the Saved X Profiles page.' });
      return false;
    }
    const task = () => {
      if (message.type === 'save-x-profiles') return saveProfiles(message.urls);
      if (message.type === 'append-x-profile-photos') return appendPhotos(message, sender);
      if (message.type === 'delete-x-profile') return removeProfile(message.id);
      if (message.type === 'update-x-profile-collection') return updateCollection(message, sender);
      if (message.type === 'stop-x-profile-collection') return stopCollection(message.id);
      if (message.type === 'get-x-profile-collection') {
        return getProfiles().then(profiles => {
          const source = sendingMediaProfile(sender);
          const record = source && profiles.find(profile => profile.id === source.id);
          const job = record?.collection;
          return { success: true, collection: job?.state === 'loading' && job.tabId === sender.tab.id ? job : null };
        });
      }
      return openMedia(message.id, message.active !== false, message.autoLoad === true);
    };
    serialize(task).then(sendResponse).catch(error => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not update saved profiles.' }));
    return true;
  });
})();
