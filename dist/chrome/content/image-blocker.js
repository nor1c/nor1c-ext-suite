(function () {
  const STYLE_ID = 'nor1c-image-blocker-style';
  const CSS = `
    img,
    picture,
    svg image,
    video[poster] {
      visibility: hidden !important;
      opacity: 0 !important;
      max-height: 0 !important;
      max-width: 0 !important;
      overflow: hidden !important;
      position: absolute !important;
      pointer-events: none !important;
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
  const hiddenEls = new WeakSet();

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

    var rect = el.getBoundingClientRect();
    if (rect.width < MIN_SIZE && rect.height < MIN_SIZE) return false;

    try {
      var bg = getComputedStyle(el).backgroundImage;
      return bg && bg !== 'none' && bg.startsWith('url(');
    } catch (_) {
      return false;
    }
  }

  function hideEl(el) {
    if (hiddenEls.has(el)) return;
    hiddenEls.add(el);
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('opacity', '0', 'important');
  }

  function scanElement(el) {
    if (el.tagName === 'IMG' || el.tagName === 'PICTURE') {
      hideEl(el);
    }
    if (el.querySelectorAll) {
      el.querySelectorAll('img, picture').forEach(hideEl);
    }
    if (shouldBlock(el)) {
      hideEl(el);
    }
    if (el.querySelectorAll) {
      CONTAINER_TAGS.forEach(function (_tag) {
        var nodes = el.getElementsByTagName(_tag);
        for (var i = 0; i < nodes.length; i++) {
          if (shouldBlock(nodes[i])) hideEl(nodes[i]);
        }
      });
    }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
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

  function apply() {
    injectCSS();
    startObserver();
    if (document.body) scanElement(document.body);
  }

  function remove() {
    removeCSS();
    stopObserver();
  }

  function setActive(val) {
    active = val;
    if (active) apply();
    else remove();
  }

  injectCSS();
  startObserver();

  chrome.storage.sync.get(['imageBlocker'], (result) => {
    var val = result.imageBlocker === true;
    if (!val) {
      removeCSS();
      stopObserver();
    }
    active = val;
    if (active && document.body) {
      scanElement(document.body);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.imageBlocker) return;
    setActive(changes.imageBlocker.newValue);
  });
})();
