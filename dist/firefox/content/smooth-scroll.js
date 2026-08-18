(function () {
  const STYLE_ID = 'nor1c-smooth-scroll-style';
  const CSS = 'html { scroll-behavior: smooth !important; }';

  let active = null;
  let style = null;
  let velocity = 0;
  let loopId = null;
  let lastTime = 0;
  let scrollTarget = null;
  let currentDecay = 0.90;
  const MIN_VEL = 0.2;
  const MAX_FRAME_GAP = 100;
  const CACHE_TTL = 30000;
  let scrollableCache = new WeakMap();
  let cacheResetTime = Date.now();
  let hasPlayingVideo = false;
  const playingVideos = new Set();
  let softLanding = null;
  let prevMaxScroll = 0;

  function isScrollable(node) {
    if (Date.now() - cacheResetTime > CACHE_TTL) {
      scrollableCache = new WeakMap();
      cacheResetTime = Date.now();
    }
    if (scrollableCache.has(node)) return true;
    if (node.scrollHeight <= node.clientHeight + 1) return false;
    const ov = window.getComputedStyle(node).overflowY;
    if (ov === 'auto' || ov === 'scroll') {
      scrollableCache.set(node, true);
      return true;
    }
    return false;
  }

  function isPageScroller(node) {
    if (node === document.documentElement || node === document.body) return true;
    const rect = node.getBoundingClientRect();
    return rect.width >= window.innerWidth * 0.9 &&
           rect.height >= window.innerHeight * 0.9 &&
           rect.top <= 5 && rect.left <= 5;
  }

  function findScrollableAncestor(el) {
    let node = el;
    while (node && node !== document.documentElement && node !== document.body) {
      if (isScrollable(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function getScrollEl() {
    return scrollTarget || window;
  }

  function getScrollTop() {
    return scrollTarget ? scrollTarget.scrollTop : window.scrollY;
  }

  function getMaxScroll() {
    if (scrollTarget) return scrollTarget.scrollHeight - scrollTarget.clientHeight;
    return document.documentElement.scrollHeight - window.innerHeight;
  }

  function scrollTo(y) {
    if (scrollTarget) scrollTarget.scrollTop = y;
    else window.scrollTo({ left: window.scrollX, top: y, behavior: 'instant' });
  }

  function tick(now) {
    const frameGap = lastTime ? now - lastTime : 16.67;
    lastTime = now;

    // Keep normal dropped frames time-correct, but discard stale momentum after
    // a real main-thread stall instead of jumping when the page recovers.
    if (frameGap > MAX_FRAME_GAP) {
      velocity = 0;
      loopId = null;
      lastTime = 0;
      softLanding = null;
      prevMaxScroll = 0;
      return;
    }
    const dt = Math.min(Math.max(frameGap / 16.67, 0), 3);

    if (softLanding) {
      const elapsed = now - softLanding.startTime;
      const t = Math.min(elapsed / softLanding.duration, 1);
      velocity = softLanding.startVel * Math.pow(1 - t, 3);
      if (t >= 1 || Math.abs(velocity) < 0.02) {
        velocity = 0;
        loopId = null;
        lastTime = 0;
        softLanding = null;
        prevMaxScroll = 0;
        return;
      }
    } else {
      if (Math.abs(velocity) < MIN_VEL) {
        velocity = 0;
        loopId = null;
        lastTime = 0;
        prevMaxScroll = 0;
        return;
      }
      if (Math.abs(velocity) < 3.5) {
        softLanding = { startVel: velocity, startTime: now, duration: 220 };
      }
    }

    const maxScroll = getMaxScroll();
    const curTop = getScrollTop();
    let next = curTop + velocity * dt;

    const clampedBottom = next > maxScroll && velocity > 0;
    const clampedTop = next < 0 && velocity < 0;

    if (prevMaxScroll > 0 && maxScroll > prevMaxScroll && curTop >= prevMaxScroll - 2) {
      next = curTop + velocity * dt;
    }

    if (next < 0) next = 0;
    if (next > maxScroll) next = maxScroll;
    scrollTo(next);
    prevMaxScroll = maxScroll;

    if (!softLanding) {
      const clamped = clampedBottom || clampedTop;
      const rate = clamped ? 1 - (1 - currentDecay) * 0.25 : currentDecay;
      velocity *= Math.pow(rate, dt);
    }

    loopId = requestAnimationFrame(tick);
  }

  function isInputTarget(el) {
    const tag = el.tagName || '';
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function isMediaTarget(el) {
    const tag = el.tagName || '';
    if (tag === 'VIDEO' || tag === 'AUDIO') return true;
    if (el.closest && el.closest('video, audio, [role="application"]')) return true;
    return false;
  }

  function handleScroll(e, delta) {
    if (!active) return false;
    if (isInputTarget(e.target)) return false;
    if (isMediaTarget(e.target)) return false;
    if (document.fullscreenElement || document.webkitFullscreenElement) return false;

    const ancestor = findScrollableAncestor(e.target);
    if (ancestor && !isPageScroller(ancestor)) return false;
    scrollTarget = ancestor || null;

    const maxScroll = getMaxScroll();
    if (maxScroll <= 0) return false;

    const absDelta = Math.abs(delta);
    const intensity = Math.min(absDelta / 150, 1);
    const scale = (0.12 + 0.63 * intensity) * 0.55;
    currentDecay = 0.95 - 0.10 * intensity;

    softLanding = null;
    velocity += delta * scale;

    const maxVel = 80;
    if (velocity > maxVel) velocity = maxVel;
    if (velocity < -maxVel) velocity = -maxVel;

    prevMaxScroll = 0;
    if (!loopId) {
      lastTime = 0;
      loopId = requestAnimationFrame(tick);
    }
    return true;
  }

  function onWheel(e) {
    if (e.ctrlKey || e.metaKey) return;
    if (handleScroll(e, e.deltaY)) e.preventDefault();
  }

  function onKeyDown(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;

    let delta = 0;
    if (e.key === 'PageDown') delta = window.innerHeight * 0.51;
    else if (e.key === 'PageUp') delta = -window.innerHeight * 0.51;
    else if (e.key === 'ArrowDown') delta = 30;
    else if (e.key === 'ArrowUp') delta = -30;
    else if (e.key === ' ') {
      if (hasPlayingVideo) return;
      delta = e.shiftKey ? -window.innerHeight * 0.85 : window.innerHeight * 0.85;
    }
    else return;

    if (handleScroll(e, delta)) e.preventDefault();
  }

  let videoTrackingSetup = false;

  function updatePlayingState(e) {
    const video = e.target;
    if (!video || video.tagName !== 'VIDEO') return;

    if (e.type === 'playing' && !video.paused && !video.ended) {
      playingVideos.add(video);
    } else {
      playingVideos.delete(video);
    }
    hasPlayingVideo = playingVideos.size > 0;
  }

  function setupVideoTracking() {
    if (videoTrackingSetup) return;
    videoTrackingSetup = true;
    document.addEventListener('playing', updatePlayingState, true);
    document.addEventListener('pause', updatePlayingState, true);
    document.addEventListener('ended', updatePlayingState, true);
    document.addEventListener('emptied', updatePlayingState, true);

    // This runs once. Media events update only their target instead of scanning
    // the whole page, which is prohibitively expensive on video-heavy feeds.
    const videos = document.querySelectorAll('video');
    for (let i = 0; i < videos.length; i++) {
      if (!videos[i].paused && !videos[i].ended) playingVideos.add(videos[i]);
    }
    hasPlayingVideo = playingVideos.size > 0;
  }

  function stopVideoTracking() {
    if (!videoTrackingSetup) return;
    videoTrackingSetup = false;
    document.removeEventListener('playing', updatePlayingState, true);
    document.removeEventListener('pause', updatePlayingState, true);
    document.removeEventListener('ended', updatePlayingState, true);
    document.removeEventListener('emptied', updatePlayingState, true);
    playingVideos.clear();
    hasPlayingVideo = false;
  }

  function injectCSS() {
    if (style) return;
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeCSS() {
    if (style) { style.remove(); style = null; }
  }

  function apply() {
    injectCSS();
    setupVideoTracking();
    velocity = 0;
    scrollTarget = null;
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown, { passive: false });
  }

  function remove() {
    removeCSS();
    window.removeEventListener('wheel', onWheel, { passive: false });
    window.removeEventListener('keydown', onKeyDown, { passive: false });
    if (loopId) { cancelAnimationFrame(loopId); loopId = null; }
    stopVideoTracking();
    velocity = 0;
    scrollTarget = null;
  }

  function setActive(val) {
    active = val;
    if (active) apply(); else remove();
  }

  chrome.storage.sync.get(['smoothScroll'], (result) => {
    const val = result.smoothScroll === true;
    active = val;
    if (val) apply();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.smoothScroll) return;
    setActive(changes.smoothScroll.newValue);
  });
})();
