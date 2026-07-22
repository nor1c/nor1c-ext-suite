(function () {
  let active = false;
  let observer = null;
  let walkTimeout = null;
  const timestamps = new WeakMap();
  let overlaysDone = new WeakSet();
  let volumeState = new WeakMap();
  const syncing = new WeakSet();
  const originalVideoState = new Map();
  const originalElementStyles = new Map();
  const mutedObservers = new Map();
  const volumeListeners = new WeakMap();
  const customControls = new Map();
  const controlListeners = new WeakMap();
  let positionFrame = null;
  let activeVideo = null;

  var autoHideEnabled = false;
  var autoHideDelay = 3;
  var autoHideActive = false;
  var autoHideTimer = null;
  const autoHideVideos = new Set();

  const styleEl = document.createElement('style');
  styleEl.id = 'nor1c-video-controls-force';
  styleEl.textContent = `
    video[nor1c] { pointer-events: auto !important; object-fit: contain !important; }
    video[nor1c]::-webkit-media-controls { display: none !important; }
    .nor1c-player-controls { align-items: center; background: rgba(2, 6, 23, .88); box-sizing: border-box; backdrop-filter: blur(6px); color: #fff; display: flex; font: 500 11px/1 system-ui, sans-serif; gap: 5px; min-height: 34px; opacity: 1; padding: 3px 6px; pointer-events: auto; position: fixed; transition: opacity .15s ease; z-index: 2147483647; }
    .nor1c-player-controls--hidden { opacity: 0; pointer-events: none; }
    .nor1c-fullscreen-host:fullscreen { align-items: center !important; background: #000 !important; display: flex !important; height: 100% !important; justify-content: center !important; width: 100% !important; }
    .nor1c-fullscreen-host:fullscreen > video[nor1c] { height: 100% !important; inset: 0 !important; max-height: 100% !important; max-width: 100% !important; position: absolute !important; width: 100% !important; }
    .nor1c-fullscreen-host:fullscreen > .nor1c-player-controls { bottom: 0 !important; left: 0 !important; top: auto !important; width: 100% !important; }
    .nor1c-player-button { align-items: center; background: transparent; border: 0; border-radius: 5px; color: #fff; cursor: pointer; display: inline-flex; flex: 0 0 28px; height: 28px; justify-content: center; padding: 0; }
    .nor1c-player-button:hover { background: rgba(255, 255, 255, .14); }
    .nor1c-player-button:focus-visible, .nor1c-player-range:focus-visible, .nor1c-player-speed:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
    .nor1c-player-button svg { fill: currentColor; height: 15px; width: 15px; }
    .nor1c-player-range { accent-color: #3b82f6; cursor: pointer; min-width: 0; }
    .nor1c-player-progress { flex: 1 1 auto; height: 16px; }
    .nor1c-player-time { flex: 0 0 auto; font-variant-numeric: tabular-nums; min-width: 68px; text-align: center; }
    .nor1c-player-speed { background: transparent; border: 0; border-radius: 5px; color: #fff; cursor: pointer; font: inherit; height: 28px; padding: 0 3px; }
    .nor1c-player-speed:hover { background: rgba(255, 255, 255, .14); }
    .nor1c-player-speed option { background: #0f172a; }
    @media (max-width: 480px) { .nor1c-player-controls { gap: 3px; padding-inline: 4px; } .nor1c-player-time { min-width: 58px; } }
    @media (prefers-reduced-motion: reduce) { .nor1c-player-controls { transition: none; } }
  `;
  if (document.head || document.documentElement) {
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function rememberStyles(element) {
    if (!originalElementStyles.has(element)) originalElementStyles.set(element, element.getAttribute('style'));
  }

  function liftStackingContexts(video) {
    let el = video.parentElement;
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      rememberStyles(el);
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
    rememberStyles(container);
    container.style.setProperty('pointer-events', 'none', 'important');
  }

  function findInstagramMuteButton(video) {
    const container = video.closest('article, [role="dialog"], main, section') || video.parentElement;
    if (!container) return null;

    const svg = container.querySelector('svg[aria-label="Audio is playing"], svg[aria-label="Audio is muted"]');
    if (svg) {
      const btn = svg.closest('[role="button"], button');
      if (btn) return btn;
    }

    const btnAlt = container.querySelector('button[aria-label="Toggle audio"], button[aria-label*="audio" i]');
    if (btnAlt) return btnAlt;

    return null;
  }

  function syncInstagramButton(video) {
    if (syncing.has(video)) return;
    syncing.add(video);
    const btn = findInstagramMuteButton(video);
    if (!btn) { syncing.delete(video); return; }
    const svg = btn.querySelector('svg[aria-label]');
    if (!svg) { syncing.delete(video); return; }
    const label = svg.getAttribute('aria-label');
    const isPlaying = label === 'Audio is playing';
    if (video.muted && isPlaying) {
      btn.click();
    } else if (!video.muted && !isPlaying) {
      btn.click();
    }
    setTimeout(function () { syncing.delete(video); }, 100);
  }

  function liftSoundButton(video) {
    const btn = findInstagramMuteButton(video);
    if (!btn) return;
    const limit = video.closest('article, [role="dialog"], main, section') || document.documentElement;
    let el = btn;
    while (el && el !== limit) {
      rememberStyles(el);
      el.style.setProperty('z-index', '2147483647', 'important');
      if (getComputedStyle(el).position === 'static') {
        el.style.setProperty('position', 'relative', 'important');
      }
      el = el.parentElement;
    }
    rememberStyles(btn);
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
          rememberStyles(c);
          c.style.setProperty('pointer-events', 'none', 'important');
        });
        return;
      }

      overlay = el.querySelector('[role="group"][data-visualcompletion="ignore"]');
      if (overlay) {
        nukeOverlay(overlay);
        overlay.querySelectorAll('[role="button"],[tabindex],button').forEach(function (c) {
          rememberStyles(c);
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

    const now = Date.now();
    const last = timestamps.get(video) || 0;
    if (now - last < 250) return;
    timestamps.set(video, now);

    if (!originalVideoState.has(video)) {
      originalVideoState.set(video, {
        controls: video.hasAttribute('controls'),
        controlsList: video.getAttribute('controlsList'),
        nor1c: video.hasAttribute('nor1c'),
        style: video.getAttribute('style'),
        playbackRate: video.playbackRate
      });
    }
    video.controls = false;
    video.removeAttribute('controls');
    video.setAttribute('controlsList', 'nodownload noplaybackrate');
    video.setAttribute('nor1c', '');

    video.style.setProperty('pointer-events', 'auto', 'important');
    video.style.setProperty('position', 'relative', 'important');
    video.style.setProperty('z-index', '2147483646', 'important');

    liftStackingContexts(video);
    disableOverlays(video);
    setupVolumeGuard(video);
    setupCustomControls(video);
    liftSoundButton(video);
    if (videoObserver) videoObserver.observe(video);
    attachAutoHideVideo(video);
  }

  function createControlButton(label, path) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nor1c-player-button';
    button.setAttribute('aria-label', label);
    button.title = label;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    svg.appendChild(shape);
    button.appendChild(svg);
    return button;
  }

  function setControlIcon(button, path) {
    button.querySelector('path').setAttribute('d', path);
  }

  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) return '0:00';
    const seconds = Math.floor(value % 60).toString().padStart(2, '0');
    const minutes = Math.floor(value / 60) % 60;
    const hours = Math.floor(value / 3600);
    return hours ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
  }

  function updateControlPosition(video) {
    const controls = customControls.get(video);
    if (!controls) return;
    const rect = video.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const visible = rect.width >= 220 && rect.height >= 100 && rect.bottom > 0 && rect.top < window.innerHeight && left < window.innerWidth;
    controls.root.hidden = !visible;
    if (!visible) return;
    controls.root.style.left = `${left}px`;
    controls.root.style.width = `${Math.min(rect.width, window.innerWidth - left)}px`;
    controls.root.style.top = `${Math.max(0, rect.bottom - controls.root.offsetHeight)}px`;
  }

  function scheduleControlPositions() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(function () {
      positionFrame = null;
      customControls.forEach(function (_, video) { updateControlPosition(video); });
    });
  }

  function restoreFullscreenControls(video, controls) {
    if (!controls.fullscreenHost) return;
    controls.fullscreenHost.classList.remove('nor1c-fullscreen-host');
    controls.fullscreenHost = null;
    document.documentElement.appendChild(controls.root);
    controls.root.hidden = false;
    controls.root.classList.remove('nor1c-player-controls--hidden');
    scheduleControlPositions();
    setTimeout(scheduleControlPositions, 100);
  }

  function toggleFullscreen(video, controls) {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
      return;
    }
    const host = video.parentElement;
    if (!host || !host.requestFullscreen) return;
    controls.fullscreenHost = host;
    host.classList.add('nor1c-fullscreen-host');
    host.appendChild(controls.root);
    controls.root.hidden = false;
    controls.root.classList.remove('nor1c-player-controls--hidden');
    host.requestFullscreen().catch(function () { restoreFullscreenControls(video, controls); });
  }

  function handleFullscreenChange() {
    customControls.forEach(function (controls, video) {
      if (controls.fullscreenHost && document.fullscreenElement !== controls.fullscreenHost) {
        restoreFullscreenControls(video, controls);
      } else if (controls.fullscreenHost) {
        controls.root.hidden = false;
        controls.root.classList.remove('nor1c-player-controls--hidden');
      }
    });
    scheduleControlPositions();
  }

  function getHotkeyVideo() {
    if (document.fullscreenElement) {
      for (const [video, controls] of customControls) {
        if (controls.fullscreenHost === document.fullscreenElement) return video;
      }
    }
    if (activeVideo && customControls.has(activeVideo) && activeVideo.isConnected) return activeVideo;
    for (const video of customControls.keys()) {
      if (!video.paused && video.isConnected) return video;
    }
    for (const video of customControls.keys()) {
      if (video.isConnected && !customControls.get(video).root.hidden) return video;
    }
    return null;
  }

  function isEditableTarget(target) {
    return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName));
  }

  function handleVideoHotkey(event) {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (key !== ' ' && key !== 'm' && key !== 'f') return;
    const video = getHotkeyVideo();
    if (!video) return;
    event.preventDefault();
    activeVideo = video;
    if (key === ' ') {
      if (video.paused) video.play().catch(function () {});
      else video.pause();
    } else if (key === 'm') {
      video.muted = !video.muted;
      controlListeners.get(video).updateVolume();
    } else {
      toggleFullscreen(video, customControls.get(video));
    }
  }

  function setupCustomControls(video) {
    if (customControls.has(video)) return;
    const root = document.createElement('div');
    root.className = 'nor1c-player-controls';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Video controls');
    const play = createControlButton('Play', 'M8 5v14l11-7z');
    const progress = document.createElement('input');
    progress.type = 'range';
    progress.className = 'nor1c-player-range nor1c-player-progress';
    progress.min = '0';
    progress.max = '1000';
    progress.value = '0';
    progress.setAttribute('aria-label', 'Seek video');
    const time = document.createElement('span');
    time.className = 'nor1c-player-time';
    time.textContent = '0:00 / 0:00';
    const mute = createControlButton('Mute', 'M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z');
    const speed = document.createElement('select');
    speed.className = 'nor1c-player-speed';
    speed.setAttribute('aria-label', 'Playback speed');
    [0.5, 0.75, 1, 1.25, 1.5, 2].forEach(function (rate) {
      const option = document.createElement('option');
      option.value = String(rate);
      option.textContent = `${rate}×`;
      speed.appendChild(option);
    });
    speed.value = String(video.playbackRate);
    const fullscreen = createControlButton('Enter fullscreen', 'M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z');
    root.append(play, progress, time, mute, speed, fullscreen);
    const activateVideo = function () { activeVideo = video; };
    root.addEventListener('pointerdown', activateVideo);
    video.addEventListener('pointerdown', activateVideo);
    document.documentElement.appendChild(root);
    const controls = { root, play, progress, time, mute, speed, fullscreen, fullscreenHost: null };
    customControls.set(video, controls);

    const updatePlayback = function () {
      const playing = !video.paused && !video.ended;
      if (playing) activeVideo = video;
      setControlIcon(play, playing ? 'M6 5h4v14H6zm8 0h4v14h-4z' : 'M8 5v14l11-7z');
      play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      play.title = playing ? 'Pause' : 'Play';
    };
    const updateTime = function () {
      progress.value = video.duration ? String(Math.round(video.currentTime / video.duration * 1000)) : '0';
      time.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    };
    const updateVolume = function () {
      const muted = video.muted || video.volume === 0;
      setControlIcon(mute, muted ? 'M3 9v6h4l5 4V5L7 9H3zm12.5 1.5 2 2 2-2 1.5 1.5-2 2 2 2-1.5 1.5-2-2-2 2-1.5-1.5 2-2-2-2z' : 'M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z');
      mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
      mute.title = muted ? 'Unmute' : 'Mute';
    };
    const listeners = {
      playClick: function () { if (video.paused) video.play().catch(function () {}); else video.pause(); },
      seekInput: function () { if (Number.isFinite(video.duration)) video.currentTime = Number(progress.value) / 1000 * video.duration; },
      muteClick: function () { video.muted = !video.muted; updateVolume(); },
      speedChange: function () { video.playbackRate = Number(speed.value); },
      fullscreenClick: function () { toggleFullscreen(video, controls); },
      activateVideo,
      updatePlayback,
      updateTime,
      updateVolume,
      rateChange: function () { speed.value = String(video.playbackRate); },
      position: scheduleControlPositions
    };
    controlListeners.set(video, listeners);
    play.addEventListener('click', listeners.playClick);
    progress.addEventListener('input', listeners.seekInput);
    mute.addEventListener('click', listeners.muteClick);
    speed.addEventListener('change', listeners.speedChange);
    fullscreen.addEventListener('click', listeners.fullscreenClick);
    video.addEventListener('play', updatePlayback);
    video.addEventListener('pause', updatePlayback);
    video.addEventListener('ended', updatePlayback);
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('durationchange', updateTime);
    video.addEventListener('volumechange', updateVolume);
    video.addEventListener('ratechange', listeners.rateChange);
    video.addEventListener('loadedmetadata', listeners.position);
    updatePlayback();
    updateTime();
    updateVolume();
    updateControlPosition(video);
  }

  function removeCustomControls(video) {
    const controls = customControls.get(video);
    const listeners = controlListeners.get(video);
    if (!controls || !listeners) return;
    controls.play.removeEventListener('click', listeners.playClick);
    controls.progress.removeEventListener('input', listeners.seekInput);
    controls.mute.removeEventListener('click', listeners.muteClick);
    controls.speed.removeEventListener('change', listeners.speedChange);
    controls.fullscreen.removeEventListener('click', listeners.fullscreenClick);
    controls.root.removeEventListener('pointerdown', listeners.activateVideo);
    video.removeEventListener('pointerdown', listeners.activateVideo);
    video.removeEventListener('play', listeners.updatePlayback);
    video.removeEventListener('pause', listeners.updatePlayback);
    video.removeEventListener('ended', listeners.updatePlayback);
    video.removeEventListener('timeupdate', listeners.updateTime);
    video.removeEventListener('durationchange', listeners.updateTime);
    video.removeEventListener('volumechange', listeners.updateVolume);
    video.removeEventListener('ratechange', listeners.rateChange);
    video.removeEventListener('loadedmetadata', listeners.position);
    if (controls.fullscreenHost) controls.fullscreenHost.classList.remove('nor1c-fullscreen-host');
    controls.root.remove();
    customControls.delete(video);
    controlListeners.delete(video);
    if (activeVideo === video) activeVideo = null;
  }

  function setupVolumeGuard(video) {
    if (volumeState.has(video)) return;

    const nativeMutedDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    const nativeVolumeDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    volumeState.set(video, { muted: video.muted, volume: video.volume });

    let muted = video.muted;

    Object.defineProperty(video, 'muted', {
      get: function () { return nativeMutedDesc.get.call(video); },
      set: function (val) {
        const previous = nativeMutedDesc.get.call(video);
        nativeMutedDesc.set.call(video, val);
        muted = nativeMutedDesc.get.call(video);
        volumeState.set(video, { muted, volume: video.volume });
        if (previous !== muted && !syncing.has(video)) syncInstagramButton(video);
      },
      configurable: true
    });

    Object.defineProperty(video, 'volume', {
      get: function () { return nativeVolumeDesc.get.call(video); },
      set: function (val) {
        nativeVolumeDesc.set.call(video, val);
        volumeState.set(video, { muted, volume: val });
      },
      configurable: true
    });

    const listeners = {
      volumechange() {
        muted = nativeMutedDesc.get.call(video);
        volumeState.set(video, { muted, volume: nativeVolumeDesc.get.call(video) });
      },
      seeking() {
        const saved = volumeState.get(video);
        if (saved) {
          muted = saved.muted;
          nativeMutedDesc.set.call(video, saved.muted);
          nativeVolumeDesc.set.call(video, saved.volume);
          syncInstagramButton(video);
        }
      },
      playing() {
        const saved = volumeState.get(video);
        if (saved) {
          muted = saved.muted;
          nativeMutedDesc.set.call(video, saved.muted);
          nativeVolumeDesc.set.call(video, saved.volume);
        }
      }
    };
    volumeListeners.set(video, listeners);
    video.addEventListener('volumechange', listeners.volumechange);
    video.addEventListener('seeking', listeners.seeking);
    video.addEventListener('playing', listeners.playing);

    const mutedObs = new MutationObserver(function () {
      const saved = volumeState.get(video);
      if (saved && nativeMutedDesc.get.call(video) !== saved.muted) {
        nativeMutedDesc.set.call(video, saved.muted);
        syncInstagramButton(video);
      }
    });
    mutedObs.observe(video, { attributes: true, attributeFilter: ['muted'] });
    mutedObservers.set(video, mutedObs);
  }

  function processAll() {
    document.querySelectorAll('video').forEach(forceControls);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.removedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.tagName === 'VIDEO') cleanupVideo(node);
            if (node.querySelectorAll) node.querySelectorAll('video').forEach(cleanupVideo);
            for (const [element, originalStyle] of originalElementStyles) {
              if (element === node || node.contains(element)) {
                restoreElement(element, originalStyle);
                originalElementStyles.delete(element);
              }
            }
          }
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.tagName === 'VIDEO') forceControls(node);
            if (node.querySelectorAll) {
              node.querySelectorAll('video').forEach(forceControls);
            }

            if (node.matches && node.matches('[aria-label="Video player"],[role="group"][data-visualcompletion="ignore"]')) {
              nukeOverlay(node);
              node.querySelectorAll('[role="button"],[tabindex],button').forEach(function (c) {
                rememberStyles(c);
                c.style.setProperty('pointer-events', 'none', 'important');
              });
            }
            if (node.querySelectorAll) {
              const overlays = node.querySelectorAll('[aria-label="Video player"],[role="group"][data-visualcompletion="ignore"]');
              overlays.forEach(function (o) {
                nukeOverlay(o);
                o.querySelectorAll('[role="button"],[tabindex],button').forEach(function (c) {
                  rememberStyles(c);
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
    walkTimeout = null;
    if (!active) return;
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

  let videoObserver = null;
  let overlayInterval = null;

  function enforceVideo(v) {
    v.controls = false;
    v.removeAttribute('controls');
    const saved = volumeState.get(v);
    if (saved) {
      if (v.muted !== saved.muted) v.muted = saved.muted;
      if (v.volume !== saved.volume) v.volume = saved.volume;
    }
    disableOverlays(v);
    if (!liftDone.has(v)) {
      liftSoundButton(v);
      liftDone.add(v);
    }
  }

  function startVideoObserver() {
    if (videoObserver) return;
    videoObserver = new IntersectionObserver((entries) => {
      if (!active) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          enforceVideo(entry.target);
        }
      }
    }, { threshold: 0.1 });
    document.querySelectorAll('video[nor1c]').forEach(function (v) {
      videoObserver.observe(v);
      enforceVideo(v);
    });
  }

  function stopVideoObserver() {
    if (videoObserver) {
      videoObserver.disconnect();
      videoObserver = null;
    }
  }

  function startOverlayPoll() {
    if (overlayInterval) return;
    overlayInterval = setInterval(() => {
      if (!active) return;
      document.querySelectorAll('[aria-label="Video player"],[role="group"][data-visualcompletion="ignore"]').forEach(nukeOverlay);
    }, 30000);
  }

  function stopOverlayPoll() {
    if (overlayInterval) {
      clearInterval(overlayInterval);
      overlayInterval = null;
    }
  }
  function getDomain() {
    return nor1cGetDomain();
  }

  function isSiteEnabled(enabledSites, domain) {
    return enabledSites.indexOf(domain) !== -1;
  }

  function autoHideShow() {
    customControls.forEach(function (controls) { controls.root.classList.remove('nor1c-player-controls--hidden'); });
  }

  function autoHideHide() {
    customControls.forEach(function (controls) { controls.root.classList.add('nor1c-player-controls--hidden'); });
  }

  function autoHideResetTimer() {
    if (autoHideTimer) clearTimeout(autoHideTimer);
    if (!autoHideEnabled) return;
    autoHideTimer = setTimeout(autoHideHide, autoHideDelay * 1000);
  }

  function autoHideMouseMove() { autoHideShow(); autoHideResetTimer(); }

  function autoHideVisibilityChange() {
    if (document.hidden) { if (autoHideTimer) clearTimeout(autoHideTimer); autoHideHide(); }
    else { autoHideShow(); autoHideResetTimer(); }
  }

  function autoHideVideoEnter() { autoHideShow(); autoHideResetTimer(); }
  function autoHideVideoLeave() { autoHideHide(); }

  function attachAutoHideVideo(video) {
    if (!autoHideActive || autoHideVideos.has(video)) return;
    autoHideVideos.add(video);
    video.addEventListener('mouseenter', autoHideVideoEnter);
    video.addEventListener('mouseleave', autoHideVideoLeave);
    const controls = customControls.get(video);
    if (controls) {
      controls.root.addEventListener('mouseenter', autoHideVideoEnter);
      controls.root.addEventListener('mouseleave', autoHideVideoLeave);
    }
  }

  function detachAutoHideVideo(video) {
    if (!autoHideVideos.delete(video)) return;
    video.removeEventListener('mouseenter', autoHideVideoEnter);
    video.removeEventListener('mouseleave', autoHideVideoLeave);
    const controls = customControls.get(video);
    if (controls) {
      controls.root.removeEventListener('mouseenter', autoHideVideoEnter);
      controls.root.removeEventListener('mouseleave', autoHideVideoLeave);
    }
  }

  function cleanupVideo(video) {
    if (videoObserver) videoObserver.unobserve(video);
    detachAutoHideVideo(video);
    removeCustomControls(video);
    const mutedObserver = mutedObservers.get(video);
    if (mutedObserver) mutedObserver.disconnect();
    mutedObservers.delete(video);
    const listeners = volumeListeners.get(video);
    if (listeners) {
      video.removeEventListener('volumechange', listeners.volumechange);
      video.removeEventListener('seeking', listeners.seeking);
      video.removeEventListener('playing', listeners.playing);
      volumeListeners.delete(video);
    }
    volumeState.delete(video);
    timestamps.delete(video);
    const state = originalVideoState.get(video);
    if (state) {
      delete video.muted;
      delete video.volume;
      if (state.controls) video.setAttribute('controls', '');
      else video.removeAttribute('controls');
      if (state.controlsList === null) video.removeAttribute('controlsList');
      else video.setAttribute('controlsList', state.controlsList);
      if (!state.nor1c) video.removeAttribute('nor1c');
      video.playbackRate = state.playbackRate;
      restoreElement(video, state.style);
      originalVideoState.delete(video);
    }
  }

  function startAutoHide() {
    if (!autoHideEnabled || autoHideActive) return;
    autoHideActive = true;
    document.addEventListener('mousemove', autoHideMouseMove, { passive: true });
    document.addEventListener('visibilitychange', autoHideVisibilityChange);
    document.querySelectorAll('video[nor1c]').forEach(attachAutoHideVideo);
    autoHideResetTimer();
  }

  function stopAutoHide() {
    if (!autoHideActive) return;
    autoHideActive = false;
    if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
    document.removeEventListener('mousemove', autoHideMouseMove);
    document.removeEventListener('visibilitychange', autoHideVisibilityChange);
    autoHideVideos.forEach(detachAutoHideVideo);
    autoHideShow();
  }

  function start() {
    if (active) return;
    active = true;
    processAll();
    walkTimeout = setTimeout(walkShadowRoots, 2000);
    startObserver();
    startVideoObserver(); startOverlayPoll();
    window.addEventListener('scroll', scheduleControlPositions, true);
    window.addEventListener('resize', scheduleControlPositions);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleVideoHotkey);
    startAutoHide();
  }

  function restoreElement(element, style) {
    if (style === null) element.removeAttribute('style');
    else element.setAttribute('style', style);
  }

  function stop() {
    if (!active) return;
    active = false;
    if (walkTimeout) { clearTimeout(walkTimeout); walkTimeout = null; }
    stopObserver();
    stopVideoObserver(); stopOverlayPoll();
    window.removeEventListener('scroll', scheduleControlPositions, true);
    window.removeEventListener('resize', scheduleControlPositions);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('keydown', handleVideoHotkey);
    if (positionFrame) { cancelAnimationFrame(positionFrame); positionFrame = null; }
    stopAutoHide();
    for (const [video, state] of originalVideoState) {
      removeCustomControls(video);
      const mutedObserver = mutedObservers.get(video);
      if (mutedObserver) mutedObserver.disconnect();
      const listeners = volumeListeners.get(video);
      if (listeners) {
        video.removeEventListener('volumechange', listeners.volumechange);
        video.removeEventListener('seeking', listeners.seeking);
        video.removeEventListener('playing', listeners.playing);
        volumeListeners.delete(video);
      }
      delete video.muted;
      delete video.volume;
      if (state.controls) video.setAttribute('controls', '');
      else video.removeAttribute('controls');
      if (state.controlsList === null) video.removeAttribute('controlsList');
      else video.setAttribute('controlsList', state.controlsList);
      if (!state.nor1c) video.removeAttribute('nor1c');
      video.playbackRate = state.playbackRate;
      restoreElement(video, state.style);
    }
    for (const [element, style] of originalElementStyles) restoreElement(element, style);
    originalVideoState.clear();
    originalElementStyles.clear();
    mutedObservers.clear();
    volumeState = new WeakMap();
    overlaysDone = new WeakSet();
    styleEl.remove();
  }

  function init() {
    const domain = getDomain();

    chrome.storage.sync.get(['videoControls', 'videoControlsEnabledSites', 'videoAutoHide', 'videoAutoHideDelay'], function (result) {
      const enabled = result.videoControls !== undefined ? result.videoControls : false;
      const enabledSites = result.videoControlsEnabledSites || [];

      autoHideEnabled = result.videoAutoHide === true;
      autoHideDelay = typeof result.videoAutoHideDelay === 'number' ? result.videoAutoHideDelay : 3;

      if (enabled && isSiteEnabled(enabledSites, domain)) start();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;

      if (changes.videoControls) {
        const enabled = changes.videoControls.newValue;
        chrome.storage.sync.get(['videoControlsEnabledSites'], function (r) {
          const enabledSites = r.videoControlsEnabledSites || [];
          if (enabled && isSiteEnabled(enabledSites, domain)) start();
          else stop();
        });
      }

      if (changes.videoAutoHide) {
        autoHideEnabled = changes.videoAutoHide.newValue === true;
        if (autoHideEnabled && active) startAutoHide();
        else if (!autoHideEnabled && autoHideActive) stopAutoHide();
      }

      if (changes.videoAutoHideDelay) {
        autoHideDelay = typeof changes.videoAutoHideDelay.newValue === 'number' ? changes.videoAutoHideDelay.newValue : 3;
        if (autoHideActive) { autoHideShow(); autoHideResetTimer(); }
      }

      if (changes.videoControlsEnabledSites) {
        const enabledSites = changes.videoControlsEnabledSites.newValue || [];
        chrome.storage.sync.get(['videoControls'], function (r) {
          const enabled = r.videoControls !== undefined ? r.videoControls : false;
          if (enabled && isSiteEnabled(enabledSites, domain)) start();
          else stop();
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
      const a = document.createElement('a');
      a.href = msg.url;
      a.download = msg.filename;
      a.click();
      sendResponse(true);
    }
  });
})();
