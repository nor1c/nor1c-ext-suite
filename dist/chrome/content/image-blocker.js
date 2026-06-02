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
      z-index: 2147483647;
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

  let active = null;
  let observer = null;
  let style = null;
  const processedEls = new WeakSet();
  const bgProcessedEls = new WeakSet();

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

  function blockImgOrPicture(el) {
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

    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
  }

  function blockBgContainer(el) {
    if (bgProcessedEls.has(el)) return;
    bgProcessedEls.add(el);

    el.setAttribute('data-nor1c-bg', el.style.backgroundImage || '');
    el.setAttribute('data-nor1c-bg-color', el.style.backgroundColor || '');

    el.style.setProperty('background-image', 'none', 'important');
    el.style.setProperty('background-color', BG_COLOR, 'important');

    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.textContent = OVERLAY_TEXT;
    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
      el.setAttribute('data-nor1c-pos-static', '1');
    }
    el.appendChild(overlay);
  }

  function scanElement(el) {
    if (el.tagName === 'IMG' || el.tagName === 'PICTURE') {
      blockImgOrPicture(el);
    }
    if (el.querySelectorAll) {
      el.querySelectorAll('img, picture').forEach(function (img) {
        blockImgOrPicture(img);
      });
    }
    if (shouldBlock(el)) {
      blockBgContainer(el);
    }
    if (el.querySelectorAll) {
      CONTAINER_TAGS.forEach(function (_tag) {
        const nodes = el.getElementsByTagName(_tag);
        for (let i = 0; i < nodes.length; i++) {
          if (shouldBlock(nodes[i])) blockBgContainer(nodes[i]);
        }
      });
    }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const nodes = mutations[i].addedNodes;
        for (let j = 0; j < nodes.length; j++) {
          if (nodes[j].nodeType === 1) {
            scanElement(nodes[j]);
          }
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
    if (!wrapper || !wrapper.classList.contains(WRAPPER_CLASS)) return;
    const parent = wrapper.parentElement;
    if (!parent) return;
    const overlay = wrapper.querySelector('.' + OVERLAY_CLASS);
    if (overlay) overlay.remove();
    parent.insertBefore(el, wrapper);
    wrapper.remove();
    el.style.removeProperty('opacity');
    el.style.removeProperty('visibility');
  }

  function restoreBgContainer(el) {
    const overlays = el.querySelectorAll('.' + OVERLAY_CLASS);
    for (let i = 0; i < overlays.length; i++) overlays[i].remove();

    const origBg = el.getAttribute('data-nor1c-bg');
    if (origBg !== null) {
      if (origBg) el.style.backgroundImage = origBg;
      else el.style.removeProperty('background-image');
      el.removeAttribute('data-nor1c-bg');
    } else {
      el.style.removeProperty('background-image');
    }

    const origBgColor = el.getAttribute('data-nor1c-bg-color');
    if (origBgColor !== null) {
      if (origBgColor) el.style.backgroundColor = origBgColor;
      else el.style.removeProperty('background-color');
      el.removeAttribute('data-nor1c-bg-color');
    } else {
      el.style.removeProperty('background-color');
    }

    if (el.getAttribute('data-nor1c-pos-static')) {
      el.style.removeProperty('position');
      el.removeAttribute('data-nor1c-pos-static');
    }

    bgProcessedEls.delete(el);
  }

  function removeAll() {
    document.querySelectorAll('.' + WRAPPER_CLASS).forEach(function (wrapper) {
      const img = wrapper.querySelector('img, picture');
      const parent = wrapper.parentElement;
      if (img && parent) {
        parent.insertBefore(img, wrapper);
        img.style.removeProperty('opacity');
        img.style.removeProperty('visibility');
      }
      wrapper.remove();
    });
    document.querySelectorAll('.' + OVERLAY_CLASS).forEach(function (overlay) {
      const container = overlay.parentElement;
      overlay.remove();
      if (container) restoreBgContainer(container);
    });
  }

  function apply() {
    injectCSS();
    startObserver();
    if (document.body) scanElement(document.body);
  }

  function remove() {
    removeCSS();
    stopObserver();
    removeAll();
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
