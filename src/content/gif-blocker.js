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
    img[data-lazy-src$=".gif"] {
      visibility: hidden !important;
      opacity: 0 !important;
      max-height: 0 !important;
      max-width: 0 !important;
      overflow: hidden !important;
      position: absolute !important;
      pointer-events: none !important;
    }
  `;

  let active = null;
  let observer = null;
  let style = null;

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

  function isGif(el) {
    const src =
      el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || '';
    return /\.gif([?#]|$)/i.test(src);
  }

  function hideImages(container) {
    const imgs = container.tagName === 'IMG' ? [container] : container.querySelectorAll ? container.querySelectorAll('img') : [];
    imgs.forEach((el) => {
      if (isGif(el)) {
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
      }
    });
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          hideImages(node);
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

  // Block first, ask later
  injectCSS();
  startObserver();

  chrome.storage.sync.get(['gifBlocker'], (result) => {
    const val = result.gifBlocker === true;
    if (!val) {
      removeCSS();
      stopObserver();
    }
    active = val;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.gifBlocker) return;
    setActive(changes.gifBlocker.newValue);
  });
})();
