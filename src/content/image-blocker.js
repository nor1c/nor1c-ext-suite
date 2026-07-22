(function () {
  const STYLE_ID = 'nor1c-image-blocker-style';
  const WRAPPER_CLASS = 'nor1c-img-blocked-wrapper';
  const OVERLAY_CLASS = 'nor1c-img-blocked-overlay';
  const OVERLAY_TEXT = 'BLOCKED';
  const BG_COLOR = '#888';

  const CSS = `
    .${OVERLAY_CLASS} {
      position: absolute;
      inset: 0;
      background: ${BG_COLOR};
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      font-family: 'Inter', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483643;
      pointer-events: none;
      user-select: none;
    }
    .${WRAPPER_CLASS} {
      position: relative;
      display: inline-block;
      line-height: 0;
    }
  `;

  const CONTAINER_TAGS = new Set([
    'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'NAV',
    'FIGURE', 'ASIDE', 'FORM', 'FIELDSET', 'LI', 'TD', 'TH'
  ]);
  const MIN_SIZE = 64;
  const CONTAINER_SELECTOR = Array.from(CONTAINER_TAGS).map(function (tag) { return tag.toLowerCase(); }).join(',');

  let active = null;
  let observer = null;
  let style = null;
  let blockedCount = 0;
  const blockedImages = new Set();
  let badgeTimer = null;

  function reportBadge() {
    if (badgeTimer) return;
    badgeTimer = setTimeout(() => {
      badgeTimer = null;
      if (blockedCount > 0) {
        chrome.runtime.sendMessage({ type: 'badge-count', feature: 'image', count: blockedImages.size }).catch(() => {});
        blockedCount = 0;
      }
    }, 1000);
  }
  let processedEls = new WeakSet();
  let bgProcessedEls = new WeakSet();
  let imageStyles = new WeakMap();
  let backgroundStyles = new Map();

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

  function shouldBlock(el) {
    if (el.nodeType !== 1) return false;
    if (!CONTAINER_TAGS.has(el.tagName)) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < MIN_SIZE && rect.height < MIN_SIZE) return false;

    try {
      const bg = getComputedStyle(el).backgroundImage;
      return bg && bg !== 'none' && bg.startsWith('url(');
    } catch (_) {
      return false;
    }
  }

  function rememberStyle(el, property) {
    return {
      value: el.style.getPropertyValue(property),
      priority: el.style.getPropertyPriority(property)
    };
  }

  function restoreStyle(el, property, state) {
    if (state.value) el.style.setProperty(property, state.value, state.priority);
    else el.style.removeProperty(property);
  }

  function blockImgOrPicture(el) {
    if (el.tagName === 'IMG' && el.parentElement && el.parentElement.tagName === 'PICTURE') el = el.parentElement;
    if (processedEls.has(el)) return;
    processedEls.add(el);

    if (el.parentElement && el.parentElement.classList.contains(WRAPPER_CLASS)) return;

    const wrapper = document.createElement('div');
    wrapper.className = WRAPPER_CLASS;

    const computed = getComputedStyle(el);
    if (computed.display === 'block') {
      wrapper.style.display = 'block';
    }
    wrapper.style.width = computed.width;
    wrapper.style.height = computed.height;
    wrapper.style.verticalAlign = computed.verticalAlign;

    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.textContent = OVERLAY_TEXT;

    el.parentElement.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    wrapper.appendChild(overlay);

    imageStyles.set(el, {
      opacity: rememberStyle(el, 'opacity'),
      visibility: rememberStyle(el, 'visibility')
    });
    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    blockedImages.add(el);
    blockedCount++;
    reportBadge();
  }

  function blockBgContainer(el) {
    if (bgProcessedEls.has(el)) return;
    bgProcessedEls.add(el);

    backgroundStyles.set(el, {
      backgroundImage: rememberStyle(el, 'background-image'),
      backgroundColor: rememberStyle(el, 'background-color'),
      position: rememberStyle(el, 'position')
    });

    el.style.setProperty('background-image', 'none', 'important');
    el.style.setProperty('background-color', BG_COLOR, 'important');

    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.textContent = OVERLAY_TEXT;
    if (getComputedStyle(el).position === 'static') {
      el.style.setProperty('position', 'relative');
    }
    el.appendChild(overlay);
  }

  function scanElement(el) {
    if (el.tagName === 'IMG' || el.tagName === 'PICTURE') {
      blockImgOrPicture(el);
    }
    if (el.querySelectorAll) {
      el.querySelectorAll('picture, img:not(picture img)').forEach(function (image) {
        blockImgOrPicture(image);
      });
    }
    if (shouldBlock(el)) {
      blockBgContainer(el);
    }
    if (el.querySelectorAll) {
      el.querySelectorAll(CONTAINER_SELECTOR).forEach(function (node) {
        if (shouldBlock(node)) blockBgContainer(node);
      });
    }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const removedNodes = mutations[i].removedNodes;
        for (let j = 0; j < removedNodes.length; j++) {
          const node = removedNodes[j];
          if (node.nodeType !== 1 || node.classList.contains(OVERLAY_CLASS)) continue;
          Array.from(blockedImages).forEach(image => {
            const wrapper = image.parentElement;
            const ownedMove = wrapper && wrapper.classList.contains(WRAPPER_CLASS) && wrapper.isConnected;
            if (!ownedMove && (image === node || node.contains(image))) unwrapImgOrPicture(image);
          });
          Array.from(backgroundStyles.keys()).forEach(container => {
            if (container === node || node.contains(container)) restoreBgContainer(container);
          });
        }
        const nodes = mutations[i].addedNodes;
        for (let j = 0; j < nodes.length; j++) {
          if (nodes[j].nodeType === 1) scanElement(nodes[j]);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function unwrapImgOrPicture(el) {
    const wrapper = el.parentElement;
    if (wrapper && wrapper.classList.contains(WRAPPER_CLASS)) {
      const overlay = wrapper.querySelector('.' + OVERLAY_CLASS);
      if (overlay) overlay.remove();
      const parent = wrapper.parentElement;
      if (parent) parent.insertBefore(el, wrapper);
      else wrapper.removeChild(el);
      wrapper.remove();
    }
    const state = imageStyles.get(el);
    if (state) {
      restoreStyle(el, 'opacity', state.opacity);
      restoreStyle(el, 'visibility', state.visibility);
      imageStyles.delete(el);
    }
    blockedImages.delete(el);
  }

  function restoreBgContainer(el) {
    const state = backgroundStyles.get(el);
    if (!state) return;
    Array.from(el.children).forEach(function (child) {
      if (child.classList.contains(OVERLAY_CLASS)) child.remove();
    });
    restoreStyle(el, 'background-image', state.backgroundImage);
    restoreStyle(el, 'background-color', state.backgroundColor);
    restoreStyle(el, 'position', state.position);
    backgroundStyles.delete(el);
    bgProcessedEls.delete(el);
  }

  function removeAll() {
    Array.from(blockedImages).reverse().forEach(unwrapImgOrPicture);
    Array.from(backgroundStyles.keys()).reverse().forEach(restoreBgContainer);
  }

  function apply() {
    injectCSS();
    startObserver();
    if (document.body) scanElement(document.body);
  }

  function remove() {
    if (badgeTimer) { clearTimeout(badgeTimer); badgeTimer = null; }
    blockedCount = 0;
    removeCSS();
    stopObserver();
    removeAll();
    processedEls = new WeakSet();
    bgProcessedEls = new WeakSet();
    imageStyles = new WeakMap();
    backgroundStyles = new Map();
    blockedImages.clear();
    chrome.runtime.sendMessage({ type: 'badge-count', feature: 'image', count: 0 }).catch(() => {});
  }

  function setActive(val) {
    active = val;
    if (active) apply();
    else remove();
  }

  chrome.storage.sync.get(['imageBlocker'], (result) => {
    const val = result.imageBlocker === true;
    active = val;
    if (active) {
      injectCSS();
      startObserver();
      if (document.body) scanElement(document.body);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.imageBlocker) return;
    setActive(changes.imageBlocker.newValue);
  });
})();
