(function () {
  const STYLE_ID = 'nor1c-gif-blocker-style';
  const CSS = `
    img[src$=".gif"],
    img[src*=".gif?"],
    img[src*=".gif#"],
    picture source[srcset*=".gif"],
    picture source[data-srcset*=".gif"],
    img[data-src$=".gif"],
    img[data-src*=".gif?"],
    img[data-src*=".gif#"],
    img[data-lazy-src$=".gif"],
    img[data-lazy-srcset*=".gif"],
    img[alt$=".gif"],
    img[alt*=".gif "],
    video[aria-label$="GIF"],
    video[aria-label$="gif"],
    video[aria-label$=" Gif"],
    video[title$=".gif"],
    video[title$="GIF"],
    video[title$="gif"],
    video[alt$=".gif"],
    video[alt$="GIF"] {
      visibility: hidden !important;
      opacity: 0 !important;
    }
  `;

  let active = null;
  let observer = null;
  let style = null;
  const hiddenEls = new WeakSet();
  const blockedGifs = new Set();
  let gifBlockedCount = 0;
  let gifBadgeTimer = null;

  function reportGifBadge() {
    if (gifBadgeTimer) return;
    gifBadgeTimer = setTimeout(() => {
      gifBadgeTimer = null;
      if (gifBlockedCount > 0) {
        chrome.runtime.sendMessage({ type: 'badge-count', feature: 'gif', count: blockedGifs.size }).catch(() => {});
        gifBlockedCount = 0;
      }
    }, 1000);
  }

  // =============================================================
  // Detect <img> elements with .gif in attributes
  // =============================================================
  function isGif(el) {
    if (!el || el.tagName !== 'IMG') return false;
    const srcAttrs = ['src', 'data-src', 'data-lazy-src'];
    for (const attr of srcAttrs) {
      const val = el.getAttribute(attr) || '';
      if (/\.gif([?# ]|$)/i.test(val)) return true;
    }
    const metaAttrs = ['alt', 'title'];
    for (const attr of metaAttrs) {
      const val = el.getAttribute(attr) || '';
      if (/\.gif([?# "]|$)/i.test(val)) return true;
    }
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-') && /\.gif([?# "]|$)/i.test(attr.value)) return true;
    }
    return false;
  }

  // =============================================================
  // Detect <video> elements that are GIFs (universal)
  // =============================================================
  function isVideoGif(el) {
    if (!el || el.tagName !== 'VIDEO') return false;
    // 1. aria-label ends with "gif" (case-insensitive)
    const aria = (el.getAttribute('aria-label') || '').toLowerCase().trim();
    if (aria.endsWith('gif')) return true;
    // 2. title/alt contains ".gif" or ends with "gif"
    const title = (el.getAttribute('title') || '').toLowerCase();
    const alt = (el.getAttribute('alt') || '').toLowerCase();
    if (/\.gif$/.test(title) || /gif$/.test(title)) return true;
    if (/\.gif$/.test(alt) || /gif$/.test(alt)) return true;
    // 3. loop + muted + autoplay + small dimensions â†’ likely GIF-as-video
    if (el.loop && el.muted && el.autoplay) {
      const w = el.videoWidth || el.clientWidth || 0;
      const h = el.videoHeight || el.clientHeight || 0;
      if (w > 0 && w <= 600 && h > 0 && h <= 600) return true;
    }
    return false;
  }

  // =============================================================
  // Detect "GIF" label overlays (span/div with text "GIF")
  // Used by Twitter/X, Giphy, Tenor, etc.
  // =============================================================
  function isGifLabel(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag !== 'SPAN' && tag !== 'DIV') return false;
    const text = (el.textContent || '').trim();
    if (text !== 'GIF') return false;
    if (el.childElementCount > 2) return false;
    if (el.closest && el.closest('[style*="visibility: hidden"]')) return false;
    return true;
  }

  function findGifLabel(node) {
    if (!node) return null;
    if (node.nodeType === 1) {
      if (isGifLabel(node)) return node;
      if (node.querySelector) {
        const spans = node.querySelectorAll('span');
        for (let i = 0; i < spans.length; i++) {
          if (isGifLabel(spans[i])) return spans[i];
        }
        const divs = node.querySelectorAll('div');
        for (let i = 0; i < divs.length; i++) {
          if (isGifLabel(divs[i])) return divs[i];
        }
      }
    }
    return null;
  }

  function hideMediaFromGifLabel(labelEl) {
    // Walk up from "GIF" label to find the shared media ancestor,
    // then find the actual <video> or <img> inside it to hide.

    let ancestor = labelEl;

    // Fast path: find data-testid="videoComponent" ancestor (Twitter/X)
    for (let i = 0; i < 8; i++) {
      if (!ancestor.parentElement) break;
      ancestor = ancestor.parentElement;
      if (ancestor.getAttribute && ancestor.getAttribute('data-testid') === 'videoComponent') {
        const video = ancestor.querySelector('video');
        const img = ancestor.querySelector('img[src]');
        if (video) { hideElement(video); return; }
        if (img && isGif(img)) { hideElement(img); return; }
      }
    }

    // Slow path: walk up looking for ancestor with <video> or <img>,
    // skip first 2 levels (overlay wrappers)
    ancestor = labelEl;
    for (let i = 0; i < 8; i++) {
      if (!ancestor.parentElement) break;
      ancestor = ancestor.parentElement;
      if (i < 2) continue;
      const video = ancestor.querySelector('video');
      const img = ancestor.querySelector('img[src]');
      if (video) { hideElement(video); return; }
      if (img && isGif(img)) { hideElement(img); return; }
    }
  }

  // =============================================================
  // CSS injection / removal
  // =============================================================
  function injectCSS() {
    if (style) return;
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeCSS() {
    if (style) {
      style.remove();
      style = null;
    }
  }

  // =============================================================
  // Hide / show helpers
  // =============================================================
  function hideElement(el) {
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('opacity', '0', 'important');
    hiddenEls.add(el);
    blockedGifs.add(el);
    gifBlockedCount++;
    reportGifBadge();
  }

  function showElement(el) {
    el.style.removeProperty('visibility');
    el.style.removeProperty('opacity');
    hiddenEls.delete(el);
    blockedGifs.delete(el);
  }

  // =============================================================
  // Main scan: img GIFs, video GIFs, and "GIF" label overlays
  // =============================================================
  function hideImages(container) {
    // 1) Hide <img> elements with .gif in src/attributes
    const imgs = container.tagName === 'IMG' ? [container]
      : container.querySelectorAll ? container.querySelectorAll('img') : [];
    imgs.forEach((el) => {
      if (isGif(el)) hideElement(el);
    });

    // 2) Hide <video> elements that are GIFs
    const videos = container.tagName === 'VIDEO' ? [container]
      : container.querySelectorAll ? container.querySelectorAll('video') : [];
    videos.forEach((el) => {
      if (isVideoGif(el)) hideElement(el);
    });

    // 3) Hide media identified by "GIF" label overlays
    const label = findGifLabel(container);
    if (label) hideMediaFromGifLabel(label);
  }

  // =============================================================
  // MutationObserver
  // =============================================================
  let childListObserver = null;
  let attrsObserver = null;

  function startObserver() {
    if (childListObserver) return;

    const childListHandler = (mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          hideImagesAndWatch(node);
        }
      }
    };

    const attrsHandler = (mutations) => {
      for (const m of mutations) {
        if (m.target.nodeType !== 1) continue;
        const tag = m.target.tagName;
        if (tag === 'IMG') {
          if (isGif(m.target)) hideElement(m.target);
          else showElement(m.target);
        }
        if (tag === 'VIDEO') {
          if (isVideoGif(m.target)) hideElement(m.target);
          else showElement(m.target);
        }
      }
    };

    childListObserver = new MutationObserver(childListHandler);
    childListObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    attrsObserver = new MutationObserver(attrsHandler);
    attrsObserver.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src', 'data-lazy-src', 'alt', 'title', 'aria-label']
    });
  }

  function stopObserver() {
    if (childListObserver) {
      childListObserver.disconnect();
      childListObserver = null;
    }
    if (attrsObserver) {
      attrsObserver.disconnect();
      attrsObserver = null;
    }
  }

  function hideImagesAndWatch(container) {
    hideImages(container);
    if (container.querySelectorAll) {
      container.querySelectorAll('img, video').forEach(function (el) {
        hideImages(el);
      });
    }
  }  // =============================================================
  // Apply / remove / toggle
  // =============================================================
  function apply() {
    injectCSS();
    startObserver();
    hideImages(document.documentElement);
  }

  function remove() {
    removeCSS();
    stopObserver();
    // Restore elements hidden by JS inline styles
    // WeakSet doesn't support iteration, so scan the DOM
    document.querySelectorAll('[style*="visibility: hidden"]').forEach((el) => {
      if (hiddenEls.has(el)) showElement(el);
    });
    blockedGifs.clear();
    chrome.runtime.sendMessage({ type: 'badge-count', feature: 'gif', count: 0 }).catch(() => {});
  }

  function setActive(val) {
    active = val;
    if (active) apply();
    else remove();
  }

  // =============================================================
  // Init: defer observer + CSS until storage confirms feature is on
  // =============================================================
  chrome.storage.sync.get(['gifBlocker'], (result) => {
    const val = result.gifBlocker === true;
    active = val;
    if (active) {
      injectCSS();
      startObserver();
      hideImages(document.documentElement);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.gifBlocker) return;
    setActive(changes.gifBlocker.newValue);
  });
})();
