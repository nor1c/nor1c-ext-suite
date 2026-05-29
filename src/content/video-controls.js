(function () {
  let active = false;
  let observer = null;
  let walkInterval = null;
  const timestamps = new WeakMap();
  const overlaysDone = new WeakSet();
  const volumeState = new WeakMap();
  const syncing = new WeakSet();

  const styleEl = document.createElement('style');
  styleEl.id = 'nor1c-video-controls-force';
  styleEl.textContent = `
    video[nor1c] { pointer-events: auto !important; }
    video[nor1c]::-webkit-media-controls,
    video[nor1c]::-webkit-media-controls-enclosure,
    video[nor1c]::-webkit-media-controls-panel { display: flex !important; opacity: 1 !important; visibility: visible !important; }
    video[nor1c]::-webkit-media-controls-panel-container,
    video[nor1c]::-webkit-media-controls-play-button,
    video[nor1c]::-webkit-media-controls-mute-button,
    video[nor1c]::-webkit-media-controls-time-display,
    video[nor1c]::-webkit-media-controls-timeline,
    video[nor1c]::-webkit-media-controls-fullscreen-button,
    video[nor1c]::-webkit-media-controls-download-button,
    video[nor1c]::-webkit-media-controls-current-time-display,
    video[nor1c]::-webkit-media-controls-time-remaining-display,
    video[nor1c]::-webkit-media-controls-seek-back-button,
    video[nor1c]::-webkit-media-controls-seek-forward-button,
    video[nor1c]::-webkit-media-controls-timeline-container,
    video[nor1c]::-webkit-media-controls-volume-slider-container,
    video[nor1c]::-webkit-media-controls-volume-slider,
    video[nor1c]::-webkit-media-controls-toggle-closed-captions-button { display: flex !important; opacity: 1 !important; visibility: visible !important; }
    video[nor1c]::-webkit-media-controls-auto-play-button,
    video[nor1c]::-webkit-media-controls-start-playback-button,
    video[nor1c]::-webkit-media-controls-overlay-play-button { display: none !important; }
    video[nor1c] { object-fit: contain !important; }
  `;
  if (document.head || document.documentElement) {
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function liftStackingContexts(video) {
    let el = video.parentElement;
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'static') {
        el.style.setProperty('z-index', '2147483647', 'important');
        break;
      }
      el.style.setProperty('position', 'relative');
      el = el.parentElement;
    }
  }

  function nukeOverlay(container) {
    if (overlaysDone.has(container)) return;
    overlaysDone.add(container);
    container.style.setProperty('pointer-events', 'none', 'important');
  }

  function findInstagramMuteButton(video) {
    var container = video.closest('article, [role="dialog"], main, section') || video.parentElement;
    if (!container) return null;

    var svg = container.querySelector('svg[aria-label="Audio is playing"], svg[aria-label="Audio is muted"]');
    if (svg) {
      var btn = svg.closest('[role="button"], button');
      if (btn) return btn;
    }

    var btnAlt = container.querySelector('button[aria-label="Toggle audio"], button[aria-label*="audio" i]');
    if (btnAlt) return btnAlt;

    return null;
  }

  function syncInstagramButton(video) {
    if (syncing.has(video)) return;
    syncing.add(video);
    var btn = findInstagramMuteButton(video);
    if (!btn) { syncing.delete(video); return; }
    var svg = btn.querySelector('svg[aria-label]');
    if (!svg) { syncing.delete(video); return; }
    var label = svg.getAttribute('aria-label');
    var isPlaying = label === 'Audio is playing';
    if (video.muted && isPlaying) {
      btn.click();
    } else if (!video.muted && !isPlaying) {
      btn.click();
    }
    setTimeout(function () { syncing.delete(video); }, 100);
  }

  function liftSoundButton(video) {
    var btn = findInstagramMuteButton(video);
    if (!btn) return;
    var limit = video.closest('article, [role="dialog"], main, section') || document.documentElement;
    var el = btn;
    while (el && el !== limit) {
      el.style.setProperty('z-index', '2147483647', 'important');
      if (getComputedStyle(el).position === 'static') {
        el.style.setProperty('position', 'relative', 'important');
      }
      el = el.parentElement;
    }
    btn.style.setProperty('z-index', '2147483647', 'important');
  }

  function disableOverlays(video) {
    const videoRect = video.getBoundingClientRect();
    if (videoRect.width === 0 && videoRect.height === 0) return;

    let el = video;
    for (let i = 0; i < 15; i++) {
      el = el.parentElement;
      if (!el || el === document.documentElement) return;

      let overlay = el.querySelector('[aria-label="Video player"]');
      if (overlay) {
        nukeOverlay(overlay);
        overlay.querySelectorAll('[role="button"],[tabindex],button').forEach(function (c) {
          c.style.setProperty('pointer-events', 'none', 'important');
        });
        return;
      }

      overlay = el.querySelector('[role="group"][data-visualcompletion="ignore"]');
      if (overlay) {
        nukeOverlay(overlay);
        overlay.querySelectorAll('[role="button"],[tabindex],button').forEach(function (c) {
          c.style.setProperty('pointer-events', 'none', 'important');
        });
        return;
      }
    }
  }

  // Cache for liftSoundButton — avoid repeated getComputedStyle walks
  // when the button hasn't moved in the DOM
  const liftDone = new WeakSet();

  function forceControls(video) {
    if (!video || video.tagName !== 'VIDEO') return;

    var now = Date.now();
    var last = timestamps.get(video) || 0;
    if (now - last < 250) return;
    timestamps.set(video, now);

    if (!video.hasAttribute('controls')) {
      video.setAttribute('controls', 'true');
      video.controls = true;
    }
    video.setAttribute('controlsList', '');
    video.setAttribute('nor1c', '');

    video.style.setProperty('pointer-events', 'auto', 'important');
    video.style.setProperty('position', 'relative', 'important');
    video.style.setProperty('z-index', '2147483647', 'important');

    liftStackingContexts(video);
    disableOverlays(video);
    setupVolumeGuard(video);
    liftSoundButton(video);
  }

  function setupVolumeGuard(video) {
    if (volumeState.has(video)) return;

    var nativeMutedDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    var nativeVolumeDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    volumeState.set(video, { muted: video.muted, volume: video.volume });

    var _muted = video.muted;

    Object.defineProperty(video, 'muted', {
      get: function () { return _muted; },
      set: function (val) {
        var prev = _muted;
        _muted = val;
        volumeState.set(video, { muted: val, volume: video.volume });
        if (prev !== val && !syncing.has(video)) syncInstagramButton(video);
      },
      configurable: true
    });

    Object.defineProperty(video, 'volume', {
      get: function () { return nativeVolumeDesc.get.call(video); },
      set: function (val) {
        nativeVolumeDesc.set.call(video, val);
        volumeState.set(video, { muted: _muted, volume: val });
      },
      configurable: true
    });

    video.addEventListener('volumechange', function () {
      _muted = nativeMutedDesc.get.call(video);
      volumeState.set(video, { muted: _muted, volume: nativeVolumeDesc.get.call(video) });
    });

    video.addEventListener('seeking', function () {
      var saved = volumeState.get(video);
      if (saved) {
        _muted = saved.muted;
        nativeMutedDesc.set.call(video, saved.muted);
        nativeVolumeDesc.set.call(video, saved.volume);
        syncInstagramButton(video);
      }
    });

    video.addEventListener('playing', function () {
      var saved = volumeState.get(video);
      if (saved) {
        _muted = saved.muted;
        nativeMutedDesc.set.call(video, saved.muted);
        nativeVolumeDesc.set.call(video, saved.volume);
      }
    });

    var mutedObs = new MutationObserver(function () {
      var saved = volumeState.get(video);
      if (saved && nativeMutedDesc.get.call(video) !== saved.muted) {
        nativeMutedDesc.set.call(video, saved.muted);
        syncInstagramButton(video);
      }
    });
    mutedObs.observe(video, { attributes: true, attributeFilter: ['muted'] });
  }

  function processAll() {
    document.querySelectorAll('video').forEach(forceControls);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.tagName === 'VIDEO') forceControls(node);
            if (node.querySelectorAll) {
              node.querySelectorAll('video').forEach(forceControls);
            }

            if (node.matches && node.matches('[aria-label="Video player"],[role="group"][data-visualcompletion="ignore"]')) {
              nukeOverlay(node);
              node.querySelectorAll('[role="button"],[tabindex],button').forEach(function (c) {
                c.style.setProperty('pointer-events', 'none', 'important');
              });
            }
            if (node.querySelectorAll) {
              const overlays = node.querySelectorAll('[aria-label="Video player"],[role="group"][data-visualcompletion="ignore"]');
              overlays.forEach(function (o) {
                nukeOverlay(o);
                o.querySelectorAll('[role="button"],[tabindex],button').forEach(function (c) {
                  c.style.setProperty('pointer-events', 'none', 'important');
                });
              });
            }
          }
        }
        if (m.type === 'attributes' && m.target.tagName === 'VIDEO') {
          forceControls(m.target);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'currentSrc']
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function ensureStyle() {
    if (!document.getElementById('nor1c-video-controls-force') && (document.head || document.documentElement)) {
      (document.head || document.documentElement).appendChild(styleEl);
    }
  }

  function walkShadowRoots() {
    ensureStyle();
    const walk = (root) => {
      root.querySelectorAll('video').forEach((v) => {
        forceControls(v);
        disableOverlays(v);
      });
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) walk(el.shadowRoot);
      });
    };
    walk(document.documentElement);
  }

  function startShadowPoll() {
    if (walkInterval) return;
    walkInterval = setInterval(() => {
      if (!active) return;

      document.querySelectorAll('video[nor1c]').forEach(function (v) {
        if (!v.controls) {
          v.controls = true;
          v.setAttribute('controls', 'true');
        }
        var saved = volumeState.get(v);
        if (saved) {
          if (v.muted !== saved.muted) v.muted = saved.muted;
          if (v.volume !== saved.volume) v.volume = saved.volume;
        }
        disableOverlays(v);
        // Only walk DOM for liftSoundButton once per video —
        // the z-index/position styles persist, no need to re-apply
        if (!liftDone.has(v)) {
          liftSoundButton(v);
          liftDone.add(v);
        }
      });

      // Single combined selector instead of two separate querySelectorAll
      document.querySelectorAll('[aria-label="Video player"],[role="group"][data-visualcompletion="ignore"]').forEach(nukeOverlay);
    }, 4000);
  }

  function stopShadowPoll() {
    if (walkInterval) {
      clearInterval(walkInterval);
      walkInterval = null;
    }
  }

  function getDomain() {
    var h = location.hostname;
    var parts = h.split('.');
    if (parts.length <= 2) return h;
    return parts.slice(-2).join('.');
  }

  function isExcluded(excluded, domain) {
    return excluded.indexOf(domain) !== -1;
  }

  function start() {
    if (active) return;
    active = true;
    processAll();
    setTimeout(walkShadowRoots, 2000);
    startObserver();
    startShadowPoll();
  }

  function stop() {
    if (!active) return;
    active = false;
    stopObserver();
    stopShadowPoll();
  }

  function init() {
    var domain = getDomain();

    chrome.storage.sync.get(['videoControls', 'videoControlsExcluded'], function (result) {
      var enabled = result.videoControls !== undefined ? result.videoControls : false;
      var excluded = result.videoControlsExcluded || [];

      if (enabled && !isExcluded(excluded, domain)) {
        start();
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;

      if (changes.videoControls) {
        var enabled = changes.videoControls.newValue;
        chrome.storage.sync.get(['videoControlsExcluded'], function (r) {
          var excluded = r.videoControlsExcluded || [];
          if (enabled && !isExcluded(excluded, domain)) {
            start();
          } else {
            stop();
          }
        });
      }

      if (changes.videoControlsExcluded) {
        var excluded = changes.videoControlsExcluded.newValue || [];
        chrome.storage.sync.get(['videoControls'], function (r) {
          var enabled = r.videoControls !== undefined ? r.videoControls : false;
          if (enabled && !isExcluded(excluded, domain)) {
            start();
          } else {
            stop();
          }
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'download-video' && msg.url && msg.filename) {
      var a = document.createElement('a');
      a.href = msg.url;
      a.download = msg.filename;
      a.click();
      sendResponse(true);
    }
  });
})();
