(function() {
  const PROGRESS_BAR_SELECTOR = 'yt-thumbnail-overlay-progress-bar-view-model';
  const PROGRESS_BAR_TAG = 'YT-THUMBNAIL-OVERLAY-PROGRESS-BAR-VIEW-MODEL';
  const RENDERER_TAGS = [
    'YTD-RICH-ITEM-RENDERER',
    'YTD-VIDEO-RENDERER',
    'YTD-COMPACT-VIDEO-RENDERER',
    'YTD-GRID-VIDEO-RENDERER',
    'YTD-PLAYLIST-VIDEO-RENDERER',
    'YT-RICH-ITEM-RENDERER',
    'YT-VIDEO-RENDERER',
    'YT-COMPACT-VIDEO-RENDERER',
    'YT-GRID-VIDEO-RENDERER',
    'YT-PLAYLIST-VIDEO-RENDERER'
  ];
  const RENDERER_SET = new Set(RENDERER_TAGS);

  let enabled = false;
  let hiddenSet = new WeakSet();
  let scanTimer = null;

  function collectProgressBars(root, results) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node;
    while (node = walker.nextNode()) {
      if (node.tagName === PROGRESS_BAR_TAG) {
        results.push(node);
      }
      if (node.shadowRoot) {
        collectProgressBars(node.shadowRoot, results);
      }
    }
  }

  function findClosestRenderer(el) {
    let current = el;
    while (current) {
      if (current.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        current = current.host;
        continue;
      }
      if (current.nodeType === Node.ELEMENT_NODE && RENDERER_SET.has(current.tagName)) {
        return current;
      }
      if (current === document.documentElement || current === document) break;
      if (current.nodeType === Node.ELEMENT_NODE && current.parentNode) {
        current = current.parentNode;
      } else if (current.nodeType === Node.ELEMENT_NODE && current.getRootNode()) {
        const root = current.getRootNode();
        if (root && root.host) {
          current = root.host;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    return null;
  }

  function scanAndHide() {
    if (!enabled) return;
    const bars = [];
    collectProgressBars(document.documentElement, bars);
    for (let i = 0; i < bars.length; i++) {
      const renderer = findClosestRenderer(bars[i]);
      if (renderer && !hiddenSet.has(renderer)) {
        renderer.style.setProperty('display', 'none', 'important');
        hiddenSet.add(renderer);
      }
    }
  }

  function loadState(callback) {
    chrome.storage.sync.get(['youtubeHideWatched'], function(result) {
      enabled = result.youtubeHideWatched !== false;
      if (callback) callback();
    });
  }

  function start() {
    scanAndHide();
    scanTimer = setInterval(scanAndHide, 1500);
  }

  function stop() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  }

  function apply() {
    if (enabled) start();
    else stop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      loadState(function() { apply(); });
    });
  } else {
    loadState(function() { apply(); });
  }

  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.type === 'toggle-changed' && msg.key === 'youtubeHideWatched') {
      enabled = msg.value !== false;
      apply();
    }
  });
})();