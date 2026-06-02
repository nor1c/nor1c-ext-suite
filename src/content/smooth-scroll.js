(function () {
  const STYLE_ID = 'nor1c-smooth-scroll-style';
  const CSS = 'html { scroll-behavior: smooth !important; }';

  let active = null;
  let style = null;
  let velocity = 0;
  let rafId = null;
  let lastTime = 0;
  let scrollTarget = null;
  let currentDecay = 0.90;
  const MIN_VEL = 0.3;
  const scrollableCache = new WeakMap();
  let hasPlayingVideo = false;

  function isScrollable(node) {
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
    const dt = lastTime ? (now - lastTime) / 16.67 : 1;
    lastTime = now;

    if (Math.abs(velocity) < MIN_VEL) {
      velocity = 0;
      rafId = null;
      lastTime = 0;
      return;
    }

    const maxScroll = getMaxScroll();
    let next = getScrollTop() + velocity * dt;
    if (next < 0) next = 0;
    if (next > maxScroll) next = maxScroll;
    scrollTo(next);

    velocity *= Math.pow(currentDecay, dt);

    rafId = requestAnimationFrame(tick);
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
    const scale = 0.12 + 0.63 * intensity;
    currentDecay = 0.93 - 0.15 * intensity;

    velocity += delta * scale;

    const maxVel = 80;
    if (velocity > maxVel) velocity = maxVel;
    if (velocity < -maxVel) velocity = -maxVel;

    if (!rafId) {
      lastTime = 0;
      rafId = requestAnimationFrame(tick);
    }
    return true;
  }

  function onWheel(e) {
    if (e.ctrlKey || e.metaKey) return;
    if (handleScroll(e, e.deltaY)) e.preventDefault();
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    let delta = 0;
    if (e.key === 'PageDown') delta = window.innerHeight * 0.85;
    else if (e.key === 'PageUp') delta = -window.innerHeight * 0.85;
    else if (e.key === 'ArrowDown') delta = 50;
    else if (e.key === 'ArrowUp') delta = -50;
    else if (e.key === ' ') {
      if (hasPlayingVideo) return;
      delta = e.shiftKey ? -window.innerHeight * 0.85 : window.innerHeight * 0.85;
    }
    else return;

    if (handleScroll(e, delta)) e.preventDefault();
  }

  function setupVideoTracking() {
    function findVideoInPath(e) {
      const path = e.composedPath ? e.composedPath() : [e.target];
      for (let i = 0; i < path.length; i++) {
        if (path[i] && path[i].tagName === 'VIDEO') return path[i];
      }
      return null;
    }

    document.addEventListener('playing', function (e) {
      const v = findVideoInPath(e);
      if (v && !v.paused && !v.ended && v.getBoundingClientRect().width > 200) {
        hasPlayingVideo = true;
      }
    }, true);

    document.addEventListener('ended', function (e) {
      if (findVideoInPath(e)) hasPlayingVideo = false;
    }, true);

    document.addEventListener('emptied', function (e) {
      if (findVideoInPath(e)) hasPlayingVideo = false;
    }, true);

    function walk(root) {
      const videos = root.querySelectorAll('video');
      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        if (!v.paused && !v.ended && v.getBoundingClientRect().width > 200) {
          hasPlayingVideo = true;
          return;
        }
      }
      const all = root.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        if (all[i].shadowRoot && !hasPlayingVideo) walk(all[i].shadowRoot);
      }
    }
    walk(document);
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
    velocity = 0;
    scrollTarget = null;
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown, { passive: false });
  }

  function remove() {
    removeCSS();
    window.removeEventListener('wheel', onWheel, { passive: false });
    window.removeEventListener('keydown', onKeyDown, { passive: false });
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    velocity = 0;
    scrollTarget = null;
  }

  function setActive(val) {
    active = val;
    if (active) apply(); else remove();
  }

  setupVideoTracking();

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
