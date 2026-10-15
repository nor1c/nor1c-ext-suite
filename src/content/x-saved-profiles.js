(function () {
  const store = globalThis.Nor1cSavedXProfiles;
  const profiles = new Map();
  let timer;
  let scanTask;
  let autoRun;
  let checkingRun = false;
  const checkedRuns = new Set();
  const SCROLL_INTERVAL = 750;
  const TIMELINE_CHANNEL = 'nor1c-x-media-timeline-v1';
  let timeline = { href: '', state: 'unknown', pending: 0, revision: -1 };
  let timelineSavedRevision = -1;
  let timelineQueue = Promise.resolve();
  const timelineQueued = new Set();
  let timelineEpoch = 0;
  const BUSY_WAIT = 90000;
  const MAX_RUN_TIME = 30 * 60 * 1000;
  let indicator;
  let indicatorText;
  let stopButton;
  const failedCaptures = new Set();
  const pausedMessages = new Map();

  function setProfiles(value) {
    profiles.clear();
    for (const profile of Array.isArray(value) ? value : []) profiles.set(profile.id, profile);
    syncAutoRun();
    schedule();
  }

  chrome.storage.local.get({ [store.STORAGE_KEY]: [] }).then(result => setProfiles(result[store.STORAGE_KEY])).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[store.STORAGE_KEY]) setProfiles(changes[store.STORAGE_KEY].newValue);
  });

  function showStatus(text) {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'nor1c-profile-collection';
      const shadow = indicator.attachShadow({ mode: 'closed' });
      shadow.innerHTML = '<style>:host{all:initial;position:fixed;bottom:16px;left:16px;z-index:2147483646;max-width:calc(100vw - 32px)}div{padding:10px 14px;border:1px solid #b9d8f5;border-radius:12px;background:#fff;color:#17202a;box-shadow:0 3px 18px #0002;font:12px/1.5 Inter,system-ui,sans-serif}a{display:block;color:#1769aa}</style><div><span role="status"></span><a target="_blank" rel="noopener noreferrer">Saved X Profiles</a></div>';
      indicatorText = shadow.querySelector('span');
      stopButton = document.createElement('button');
      stopButton.type = 'button';
      stopButton.textContent = 'Stop automatic loading';
      stopButton.style.cssText = 'display:block;margin-top:8px;padding:6px 10px;cursor:pointer';
      stopButton.addEventListener('click', () => finishAutoRun('stopped'));
      shadow.querySelector('div').appendChild(stopButton);
      const link = shadow.querySelector('a');
      link.href = '#';
      link.addEventListener('click', async event => {
        event.preventDefault();
        try {
          const response = await chrome.runtime.sendMessage({ type: 'open-saved-x-profiles' });
          if (!response?.success) showStatus(response?.error || 'Could not open saved profiles.');
        } catch (_) { showStatus('Reload this X tab to reconnect the extension.'); }
      });
    }
    if (!indicator.isConnected) document.documentElement.appendChild(indicator);
    if (indicatorText.textContent !== text) indicatorText.textContent = text;
    stopButton.hidden = !autoRun;
  }

  function collectPhotos(profile) {
    const primary = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main');
    if (!primary) return [];
    const known = new Set((profile.photos || []).map(photo => photo.id));
    const photos = [];
    for (const image of primary.querySelectorAll('img[src*="pbs.twimg.com/media/"]')) {
      if (image.closest('[role="dialog"], [data-testid="videoPlayer"], [data-testid="videoComponent"]')) continue;
      const anchor = image.closest('a[href*="/status/"]');
      const article = image.closest('article');
      const permalink = anchor || article?.querySelector('a[href*="/status/"]:has(time)');
      const photo = store.normalizePhoto({ url: image.currentSrc || image.src, postUrl: permalink?.href, alt: image.alt }, profile.id);
      if (!photo || known.has(photo.id)) continue;
      known.add(photo.id);
      photos.push(photo);
      if (photos.length === store.MAX_BATCH) break;
    }
    return photos;
  }

  function currentProfile() {
    const canonical = store.canonicalProfileUrl(location.href);
    return canonical && store.isMediaPage(location.href) && profiles.get(canonical.id);
  }

  function scan() {
    if (scanTask) return scanTask;
    scanTask = scanOnce().finally(() => { scanTask = null; });
    return scanTask;
  }

  async function scanOnce() {
    let profile = currentProfile();
    if (!profile) { indicator?.remove(); return false; }
    const id = profile.id;
    const captureId = profile.captureId;
    if (profile.storageLimited) { showStatus(store.STORAGE_LIMIT_MESSAGE); return false; }
    if (failedCaptures.has(captureId)) { showStatus(pausedMessages.get(captureId)); return false; }
    try {
      // Drain every currently mounted batch before scrolling: X can recycle the entire grid.
      for (;;) {
        const photos = collectPhotos(profile);
        if (!photos.length) break;
        const response = await chrome.runtime.sendMessage({ type: 'append-x-profile-photos', id, captureId, photos });
        if (!response?.success) throw new Error(response?.error || 'Could not save profile photos.');
        profile = currentProfile();
        if (profile?.id !== id || profile.captureId !== captureId) return false;
        if (response.storageLimited) {
          profile.storageLimited = true;
          showStatus(store.STORAGE_LIMIT_MESSAGE);
          return false;
        }
        // Do not depend on storage.onChanged arriving before the append acknowledgment.
        const saved = new Map((profile.photos || []).map(photo => [photo.id, photo]));
        for (const photo of photos) saved.set(photo.id, photo);
        profile.photos = [...saved.values()];
      }
      const state = autoRun ? 'loading' : profile.collection?.state;
      showStatus(`@${id}: ${profile.photos?.length || 0} photos saved. ${store.COLLECTION_MESSAGES[state] || 'Use Load older photos in the gallery for automatic scrolling.'}`);
      return true;
    } catch (error) {
      const message = `${error.message || 'Could not save profile photos.'} Collection paused. Use Load older photos to retry.`;
      failedCaptures.add(captureId);
      pausedMessages.set(captureId, message);
      if (currentProfile()?.id === id) showStatus(message);
      return false;
    }
  }

  function cancelAutoRun() {
    if (autoRun) clearTimeout(autoRun.timer);
    autoRun = null;
    if (stopButton) stopButton.hidden = true;
  }

  async function finishAutoRun(state) {
    const run = autoRun;
    if (!run) return;
    cancelAutoRun();
    showStatus(`@${run.id}: ${store.COLLECTION_MESSAGES[state]}`);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'update-x-profile-collection', id: run.id, runId: run.runId, state, ...(state === 'finished' ? { timelineRevision: timelineSavedRevision } : {}) });
      if (!response?.success) throw new Error(response?.error || 'Could not update collection status.');
    } catch (_) {
      showStatus('Collection stopped without closing. Reload the X tab to verify its timeline response.');
      // A rejected/unverifiable end signal must not leave the gallery stuck on loading.
      if (state === 'finished') chrome.runtime.sendMessage({ type: 'update-x-profile-collection', id: run.id, runId: run.runId, state: 'error' }).catch(() => {});
    }
  }

  async function syncAutoRun() {
    const profile = currentProfile();
    const job = profile?.collection;
    if (autoRun && autoRun.href !== location.href && profile?.id === autoRun.id && job?.runId === autoRun.runId && job.state === 'loading') {
      finishAutoRun('interrupted');
      return;
    }
    if (autoRun && (autoRun.href !== location.href || job?.runId !== autoRun.runId || job.state !== 'loading')) cancelAutoRun();
    if (autoRun || checkingRun || job?.state !== 'loading' || checkedRuns.has(job.runId)) return;
    checkedRuns.add(job.runId);
    checkingRun = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'get-x-profile-collection' });
      const latest = currentProfile();
      if (response?.collection?.runId !== job.runId || latest?.id !== profile.id || latest.collection?.runId !== job.runId || latest.collection.state !== 'loading') return;
      failedCaptures.delete(profile.captureId);
      pausedMessages.delete(profile.captureId);
      autoRun = { id: profile.id, runId: job.runId, href: location.href, startedAt: Date.now(), lastProgress: Date.now(), savedCount: profile.photos?.length || 0, scrollAnchor: null, resetToTop: true, timer: null, stepping: false };
      window.postMessage({ channel: TIMELINE_CHANNEL, kind: 'read' }, location.origin);
      queueAutoStep(autoRun, 0);
    } catch (_) { showStatus('Reload this X tab to reconnect the extension.'); }
    finally { checkingRun = false; }
  }

  function scrollContainer(primary) {
    for (let node = primary; node && node !== document.body; node = node.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 2) return node;
    }
    return document.scrollingElement;
  }

  function queueAutoStep(run, delay = 100) {
    if (autoRun !== run || run.stepping) return;
    clearTimeout(run.timer);
    run.timer = setTimeout(() => {
      run.stepping = true;
      autoStep(run).catch(() => { if (autoRun === run) finishAutoRun('error'); })
        .finally(() => {
          run.stepping = false;
          if (autoRun === run) queueAutoStep(run, SCROLL_INTERVAL);
        });
    }, delay);
  }

  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || data?.channel !== TIMELINE_CHANNEL || data.kind !== 'state') return;
    const profile = currentProfile();
    if (!profile || data.profileId !== profile.id || data.href !== location.href || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Number.isSafeInteger(data.pending) || data.pending < 0 || data.pending > 100) return;
    if (!['unknown', 'loading', 'more', 'end', 'error'].includes(data.state) || !Array.isArray(data.photos) || data.photos.length > 1600) return;
    if (timeline.href !== data.href) {
      timelineEpoch += 1;
      timelineSavedRevision = -1;
      timelineQueued.clear();
    } else if (data.revision < timeline.revision) return;
    timeline = { href: data.href, state: data.state, pending: data.pending, revision: data.revision };
    const key = `${data.href}:${data.revision}`;
    if (['more', 'end', 'unknown'].includes(data.state) && data.revision !== timelineSavedRevision && !timelineQueued.has(key)) {
      const photos = data.photos.map(photo => store.normalizePhoto(photo, profile.id));
      if (photos.some(photo => !photo)) { timeline.state = 'error'; if (autoRun) queueAutoStep(autoRun); return; }
      timelineQueued.add(key);
      const href = data.href;
      const captureId = profile.captureId;
      const epoch = timelineEpoch;
      timelineQueue = timelineQueue.then(async () => {
        for (let index = 0; index < photos.length; index += store.MAX_BATCH) {
          if (timelineEpoch !== epoch || location.href !== href || currentProfile()?.captureId !== captureId) return;
          const response = await chrome.runtime.sendMessage({ type: 'append-x-profile-photos', id: profile.id, captureId, photos: photos.slice(index, index + store.MAX_BATCH) });
          if (!response?.success || response.storageLimited) throw new Error(response?.storageLimited ? store.STORAGE_LIMIT_MESSAGE : 'Could not save X timeline media.');
        }
        if (timelineEpoch === epoch && location.href === href && currentProfile()?.captureId === captureId) {
          timelineSavedRevision = data.revision;
          window.postMessage({ channel: TIMELINE_CHANNEL, kind: 'ack', href, revision: data.revision }, location.origin);
        }
      }).catch(error => {
        if (timelineEpoch === epoch && location.href === href && currentProfile()?.captureId === captureId) {
          failedCaptures.add(captureId);
          pausedMessages.set(captureId, error.message);
          timeline.state = 'error';
        }
      }).finally(() => {
        if (autoRun) queueAutoStep(autoRun, 0);
      });
    }
    if (autoRun) queueAutoStep(autoRun);
  });

  async function autoStep(run) {
    if (autoRun !== run) return;
    if (location.href !== run.href || currentProfile()?.collection?.runId !== run.runId || currentProfile()?.collection?.state !== 'loading') { syncAutoRun(); return; }
    await timelineQueue;
    if (autoRun !== run || location.href !== run.href) { syncAutoRun(); return; }
    const ok = await scan();
    if (autoRun !== run) return;
    if (location.href !== run.href) { syncAutoRun(); return; }
    if (!ok) { await finishAutoRun(currentProfile()?.storageLimited ? 'limit' : 'error'); return; }
    if (Date.now() - run.startedAt >= MAX_RUN_TIME) { await finishAutoRun('timeout'); return; }
    const primary = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main');
    const scroller = primary && scrollContainer(primary);
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none';
    const hasDialog = Array.from(document.querySelectorAll('[role="dialog"]')).some(visible);
    if (timeline.href === location.href && timeline.state === 'error') { await finishAutoRun('error'); return; }
    if (scroller && !hasDialog) {
      const before = scroller.scrollTop;
      const height = scroller.scrollHeight;
      const viewport = scroller.clientHeight;
      const busy = primary.matches('[aria-busy="true"]') || Array.from(primary.querySelectorAll('[role="progressbar"], [aria-busy="true"]')).some(visible);
      const blocked = Array.from(primary.querySelectorAll('[role="alert"], [data-testid="error-detail"]')).some(visible);
      if (blocked) { await finishAutoRun('error'); return; }
      const currentTimeline = timeline.href === location.href;
      if (currentTimeline && timeline.state === 'end' && timeline.pending === 0 && timelineSavedRevision === timeline.revision) {
        await finishAutoRun('finished');
        return;
      }
      const count = currentProfile().photos?.length || 0;
      if (count !== run.savedCount || run.scrollAnchor == null || Math.abs(before - run.scrollAnchor) >= 32) {
        run.lastProgress = Date.now();
        run.savedCount = count;
        run.scrollAnchor = before;
      }
      if (Date.now() - run.lastProgress >= BUSY_WAIT) { await finishAutoRun('stalled'); return; }
      if (busy || (currentTimeline && timeline.pending > 0)) return;
      // Small overlapping steps load every viewport rather than skipping virtualized rows.
      const top = run.resetToTop ? 0 : before + Math.max(100, Math.floor(viewport * 0.7));
      run.resetToTop = false;
      scroller.scrollTo({ top, behavior: 'instant' });
      if (before + viewport >= height - 2) {
        // Re-trigger an infinite-scroll boundary when the previous request was delayed.
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    } else {
      if (Date.now() - run.lastProgress >= BUSY_WAIT) {
        await finishAutoRun('stalled');
        return;
      }
    }
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (timeline.href && timeline.href !== location.href) {
        timelineEpoch += 1;
        timeline = { href: '', state: 'unknown', pending: 0, revision: -1 };
        timelineSavedRevision = -1;
        timelineQueued.clear();
      }
      syncAutoRun(); scan(); if (autoRun) queueAutoStep(autoRun);
    }, 100);
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'href', 'aria-busy', 'hidden', 'role'] });
  // X uses client-side navigation; no history monkey-patching is needed in the page world.
  setInterval(schedule, 2000);
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'stop-saved-x-profile') {
      if (autoRun?.runId === message.runId) cancelAutoRun();
      sendResponse({ success: true });
      return false;
    }
    if (message?.type !== 'scan-saved-x-profile') return;
    failedCaptures.clear();
    pausedMessages.clear();
    if (!autoRun) checkedRuns.clear();
    schedule();
    sendResponse({ success: true, autoLoadVersion: 4 });
    return false;
  });
  window.addEventListener('pagehide', cancelAutoRun);
  window.postMessage({ channel: TIMELINE_CHANNEL, kind: 'read' }, location.origin);
  schedule();
})();
