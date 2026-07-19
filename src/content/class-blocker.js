(function() {
  let blockerEnabled = false;
  let rawSelectors = '';
  let styleEl = null;

  function ensureStyle() {
    if (styleEl) return styleEl;
    styleEl = document.createElement('style');
    styleEl.id = 'nor1c-class-blocker-rules';
    (document.head || document.documentElement).appendChild(styleEl);
    return styleEl;
  }

  function parseSelectors(input) {
    return input.split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .filter(s => /^[a-zA-Z0-9\-_#.:\[\]="~\s*^$|]+$/.test(s))
      .map(s => {
        if (s.startsWith('.') || s.startsWith('#')) return s;
        return '.' + s;
      });
  }

  function rebuildCSS() {
    const el = ensureStyle();
    if (!blockerEnabled || !rawSelectors) {
      el.textContent = '';
      return;
    }
    const selectors = parseSelectors(rawSelectors);
    if (selectors.length === 0) {
      el.textContent = '';
      return;
    }
    el.textContent = selectors.join(', ') + ' { display: none !important; }';
  }

  function loadState(callback) {
    chrome.storage.sync.get(['classBlocker', 'blockedSelectors'], result => {
      blockerEnabled = result.classBlocker === true;
      rawSelectors = result.blockedSelectors || '';
      if (callback) callback();
    });
  }

  function apply() {
    rebuildCSS();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadState(() => apply());
    });
  } else {
    loadState(() => apply());
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'toggle-changed' && msg.key === 'classBlocker') {
      blockerEnabled = msg.value === true;
      apply();
    } else if ((msg.type === 'blockedSelectors-changed') || (msg.type === 'toggle-changed' && msg.key === 'blockedSelectors')) {
      rawSelectors = msg.value || '';
      apply();
    }
  });
})();

