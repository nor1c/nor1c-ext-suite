(function () {
  const MIN_LEVEL = 0;
  const MAX_LEVEL = 500;
  const DEFAULT_LEVEL = 100;
  const STEP = 10;

  let active = false;
  let level = DEFAULT_LEVEL;
  let observer = null;
  let audioContext = null;
  let writeTimer = null;
  let lastWrittenLevel = null;

  const graphs = new WeakMap();
  const originalVolumes = new WeakMap();
  const tracked = new Set();

  function clampLevel(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(value)));
  }

  // One level for the whole browser, so any stored value is used as-is.
  function readLevel(stored) {
    const value = clampLevel(stored);
    return value === null ? DEFAULT_LEVEL : value;
  }

  function ensureAudioContext() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioContext) {
      try {
        audioContext = new Ctor();
      } catch (_) {
        return null;
      }
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(function () {});
    return audioContext;
  }

  // Routing an element through WebAudio is irreversible and silently mutes
  // cross-origin media without CORS headers, so only do it to exceed 100%.
  function ensureGraph(media) {
    if (graphs.has(media)) return graphs.get(media);
    const context = ensureAudioContext();
    if (!context) return null;
    try {
      const source = context.createMediaElementSource(media);
      const gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      const graph = { source, gain };
      graphs.set(media, graph);
      return graph;
    } catch (_) {
      graphs.set(media, null);
      return null;
    }
  }

  function rememberOriginalVolume(media) {
    if (!originalVolumes.has(media)) originalVolumes.set(media, media.volume);
  }

  function applyToMedia(media) {
    if (!active) return;
    rememberOriginalVolume(media);
    tracked.add(media);

    const existing = graphs.get(media);
    if (level > 100 || existing) {
      const graph = existing || ensureGraph(media);
      if (graph) {
        graph.gain.gain.value = level / 100;
        if (media.volume !== 1) media.volume = 1;
        return;
      }
    }
    media.volume = Math.min(1, level / 100);
  }

  function applyToAll() {
    document.querySelectorAll('video, audio').forEach(applyToMedia);
  }

  function restoreMedia(media) {
    const graph = graphs.get(media);
    if (graph) graph.gain.gain.value = 1;
    const original = originalVolumes.get(media);
    if (original !== undefined) media.volume = original;
    originalVolumes.delete(media);
  }

  function restoreAll() {
    tracked.forEach(restoreMedia);
    tracked.clear();
  }

  function persistLevel() {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(function () {
      writeTimer = null;
      lastWrittenLevel = level;
      chrome.storage.sync.set({ volumeControlLevel: level });
    }, 400);
  }

  function setLevel(next, persist) {
    const value = clampLevel(next);
    if (value === null || value === level) return;
    level = value;
    applyToAll();
    if (persist) persistLevel();
    notifyPopup();
  }

  function notifyPopup() {
    chrome.runtime.sendMessage({ type: 'volume-control-level', level: level }).catch(function () {});
  }

  function handleMediaEvent(event) {
    const media = event.target;
    if (media instanceof HTMLMediaElement) applyToMedia(media);
  }

  function isEditableTarget(target) {
    return target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }

  function handleHotkey(event) {
    if (event.defaultPrevented || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;
    const key = event.key;
    if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowRight' && key !== 'ArrowLeft') return;
    if (document.querySelector('video, audio') === null) return;
    event.preventDefault();
    if (key === 'ArrowRight' || key === 'ArrowLeft') setLevel(DEFAULT_LEVEL, true);
    else setLevel(level + (key === 'ArrowUp' ? STEP : -STEP), true);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function (mutations) {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') applyToMedia(node);
          else if (node.querySelectorAll) node.querySelectorAll('video, audio').forEach(applyToMedia);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  function start() {
    if (active) return;
    active = true;
    startObserver();
    document.addEventListener('play', handleMediaEvent, true);
    document.addEventListener('loadedmetadata', handleMediaEvent, true);
    document.addEventListener('keydown', handleHotkey);
    applyToAll();
  }

  function stop() {
    if (!active) return;
    active = false;
    stopObserver();
    document.removeEventListener('play', handleMediaEvent, true);
    document.removeEventListener('loadedmetadata', handleMediaEvent, true);
    document.removeEventListener('keydown', handleHotkey);
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    restoreAll();
  }

  function init() {
    chrome.storage.sync.get(['volumeControl', 'volumeControlLevel'], function (result) {
      level = readLevel(result.volumeControlLevel);
      lastWrittenLevel = level;
      if (result.volumeControl !== false) start();
    });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync') return;

      if (changes.volumeControlLevel) {
        const next = readLevel(changes.volumeControlLevel.newValue);
        if (next !== lastWrittenLevel) {
          lastWrittenLevel = next;
          if (next !== level) {
            level = next;
            if (active) applyToAll();
          }
        }
      }

      if (changes.volumeControl) {
        if (changes.volumeControl.newValue === true) start();
        else stop();
      }
    });

    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (msg.type === 'volume-control-get') {
        sendResponse({ level: level, active: active, hasMedia: Boolean(document.querySelector('video, audio')) });
        return;
      }
      if (msg.type === 'volume-control-set') {
        setLevel(msg.level, true);
        sendResponse({ level: level });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
