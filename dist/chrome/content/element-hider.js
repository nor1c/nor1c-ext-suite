(function() {
  const RANDOM_ID_RE = /^(css-[a-z0-9]+|jss\d+|_[a-zA-Z0-9]{5,}|radix-|headlessui-|makeStyles-\w+|Component_\w+|sc-\w+|styled-\w+|emotion-\w+)/;
  const SEMANTIC_TAGS = new Set(['main', 'header', 'footer', 'nav', 'article', 'section', 'aside', 'form']);
  const UNSTABLE_CLASS_RE = /css-[a-z0-9]+|jss\d+|_[a-zA-Z0-9]{5,}|makeStyles-\w+|Component_\w+|sc-\w+|styled-\w+|emotion-\w+/;

  let pickerActive = false;
  let hoverStyle = null;
  let hoverLabel = null;
  let cancelPill = null;
  let lastHovered = null;
  let iframeOverride = null;

  // Cached rules for current domain â€” avoids chrome.storage.sync.get on every mutation
  let cachedDomainRules = null;
  let rulesLoaded = false;
  let debounceTimer = null;
  let elementHiderEnabled = true;
  let hideStyleEl = null;

  function ensureHideStyle() {
    if (hideStyleEl) return hideStyleEl;
    hideStyleEl = document.createElement('style');
    hideStyleEl.id = 'nor1c-eh-rules';
    (document.head || document.documentElement).appendChild(hideStyleEl);
    return hideStyleEl;
  }

  function rebuildHideCss() {
    const el = ensureHideStyle();
    if (!elementHiderEnabled || !cachedDomainRules || cachedDomainRules.length === 0) {
      el.textContent = '';
      return;
    }
    const selectors = cachedDomainRules.map(r => r.selector).join(',\n');
    el.textContent = selectors + ' { display: none !important; }';
  }

  function loadRules(callback) {
    chrome.storage.sync.get(['hiddenRules', 'elementHider'], result => {
      elementHiderEnabled = result.elementHider !== false;
      const rules = result.hiddenRules || {};
      const domain = nor1cGetDomain();
      const path = getPathname();
      const domainRules = rules[domain] || [];
      cachedDomainRules = domainRules.filter(r => pathsMatch(r.path, path));
      rulesLoaded = true;
      if (callback) callback();
    });
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16));
  }

  function isUnstableId(id) {
    return id && RANDOM_ID_RE.test(id);
  }

  function hasStableId(el) {
    const id = el.id;
    if (!id) return false;
    return !RANDOM_ID_RE.test(id);
  }

  function hasSemanticTag(el) {
    return SEMANTIC_TAGS.has(el.tagName.toLowerCase());
  }

  function hasTestId(el) {
    return el.hasAttribute('data-testid') || el.hasAttribute('data-cy');
  }

  function nthChildOfType(el) {
    const tag = el.tagName;
    let n = 1;
    let sib = el.previousElementSibling;
    while (sib) {
      if (sib.tagName === tag) n++;
      sib = sib.previousElementSibling;
    }
    return n;
  }

  function buildStructuralSelector(el) {
    const parts = [];
    let current = el;

    while (current && current !== document.body && current !== document.documentElement) {
      if (hasStableId(current)) {
        parts.unshift('#' + CSS.escape(current.id));
        break;
      }
      if (hasSemanticTag(current) || hasTestId(current)) {
        let sel = current.tagName.toLowerCase();
        if (current.hasAttribute('data-testid')) {
          sel += '[data-testid=' + CSS.escape(current.getAttribute('data-testid')) + ']';
        } else if (current.hasAttribute('data-cy')) {
          sel += '[data-cy=' + CSS.escape(current.getAttribute('data-cy')) + ']';
        }
        parts.unshift(sel);
        break;
      }

      const tag = current.tagName.toLowerCase();
      const n = nthChildOfType(current);
      parts.unshift(tag + ':nth-of-type(' + n + ')');
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  function buildContentHint(el) {
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
    return text.substring(0, 80);
  }

  function getPathname() {
    return location.pathname.replace(/\/+$/, '') || '/';
  }

  function pathsMatch(rulePath, currentPath) {
    if (!rulePath) return true;
    return currentPath === rulePath || currentPath.startsWith(rulePath + '/');
  }

  function injectPickerStyles() {
    if (hoverStyle) return;
    hoverStyle = document.createElement('style');
    hoverStyle.textContent = `
      .nor1c-eh-highlight {
        outline: 2px dashed #3b82f6 !important;
        outline-offset: 2px !important;
        cursor: crosshair !important;
      }
      .nor1c-eh-label {
        position: fixed;
        z-index: 2147483645;
        background: #1e3a5f;
        color: #fff;
        font: 11px/1.4 Inter, -apple-system, sans-serif;
        padding: 4px 10px;
        border-radius: 6px;
        pointer-events: none;
        white-space: nowrap;
        max-width: 400px;
        overflow: hidden;
        text-overflow: ellipsis;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      }
      .nor1c-eh-cancel {
        position: fixed;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483645;
        background: #ef4444;
        color: #fff;
        font: 600 13px/1 Inter, -apple-system, sans-serif;
        padding: 8px 20px;
        border-radius: 20px;
        cursor: pointer;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        border: none;
        user-select: none;
      }
      .nor1c-eh-cancel:hover { background: #dc2626; }
      .nor1c-eh-flash {
        outline: 2px solid #22c55e !important;
        outline-offset: 2px !important;
      }
    `;
    document.head.appendChild(hoverStyle);
    hoverLabel = document.createElement('div');
    hoverLabel.className = 'nor1c-eh-label';
    hoverLabel.style.display = 'none';
    document.body.appendChild(hoverLabel);
    cancelPill = document.createElement('button');
    cancelPill.className = 'nor1c-eh-cancel';
    cancelPill.textContent = 'âœ• Cancel (Esc)';
    cancelPill.addEventListener('click', exitPicker);
    document.body.appendChild(cancelPill);
  }

  function removePickerStyles() {
    if (hoverStyle) { hoverStyle.remove(); hoverStyle = null; }
    if (hoverLabel) { hoverLabel.remove(); hoverLabel = null; }
    if (cancelPill) { cancelPill.remove(); cancelPill = null; }
    if (lastHovered) { lastHovered.classList.remove('nor1c-eh-highlight'); lastHovered = null; }
    if (iframeOverride) { iframeOverride.style.pointerEvents = iframeOverride._origPointerEvents || ''; iframeOverride = null; }
  }

  function onPickerMouseOver(e) {
    if (!pickerActive) return;
    const el = e.target;
    if (el === hoverLabel || el === cancelPill || el === hoverStyle) return;
    if (lastHovered && lastHovered !== el) lastHovered.classList.remove('nor1c-eh-highlight');
    if (el.tagName === 'IFRAME') {
      if (iframeOverride && iframeOverride !== el) {
        iframeOverride.style.pointerEvents = iframeOverride._origPointerEvents || '';
      }
      el._origPointerEvents = el.style.pointerEvents || '';
      el.style.pointerEvents = 'none';
      iframeOverride = el;
    }
    el.classList.add('nor1c-eh-highlight');
    lastHovered = el;
    const tag = el.tagName.toLowerCase();
    const sel = buildStructuralSelector(el);
    const shortPath = sel.split(' > ').slice(-3).join(' > ');
    hoverLabel.textContent = tag + ' Â· ' + shortPath;
    hoverLabel.style.display = 'block';
    hoverLabel.style.left = (e.clientX + 16) + 'px';
    hoverLabel.style.top = (e.clientY + 16) + 'px';
  }

  function onPickerMouseOut(e) {
    if (!pickerActive) return;
    const el = e.target;
    if (el === hoverLabel || el === cancelPill) return;
    el.classList.remove('nor1c-eh-highlight');
    if (el.tagName === 'IFRAME' && iframeOverride === el) {
      el.style.pointerEvents = el._origPointerEvents || '';
      iframeOverride = null;
    }
  }

  function onPickerClick(e) {
    if (!pickerActive) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Use the hovered element, not e.target (which may differ due to propagation/overlap)
    const el = lastHovered || e.target;
    if (el === cancelPill || el === hoverLabel) return;

    const selector = buildStructuralSelector(el);
    const contentHint = buildContentHint(el);
    const domain = nor1cGetDomain();
    const rule = { id: uuid(), selector, contentHint, path: getPathname(), createdAt: Date.now() };

    chrome.storage.sync.get(['hiddenRules'], result => {
      const rules = result.hiddenRules || {};
      if (!rules[domain]) rules[domain] = [];
      rules[domain].push(rule);
      chrome.storage.sync.set({ hiddenRules: rules }, () => {
        // green flash feedback
        el.classList.remove('nor1c-eh-highlight');
        el.classList.add('nor1c-eh-flash');
        setTimeout(() => {
          el.classList.remove('nor1c-eh-flash');
          el.style.setProperty('display', 'none', 'important');
          showUndoToast(domain, rule.id, el);
        }, 400);
        // restore iframe pointer-events if needed
        if (el.tagName === 'IFRAME' && iframeOverride === el) {
          el.style.pointerEvents = el._origPointerEvents || '';
          iframeOverride = null;
        }
        // clear lastHovered so next hover starts clean
        if (lastHovered === el) lastHovered = null;
      });
    });
  }

  function showUndoToast(domain, ruleId, hiddenEl) {
    const existing = document.getElementById('nor1c-eh-undo-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'nor1c-eh-undo-toast';
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1f2937;color:#fff;padding:10px 16px;border-radius:8px;font:500 13px Inter,sans-serif;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);pointer-events:auto;';

    const msg = document.createElement('span');
    msg.textContent = 'Element hidden';

    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Undo';
    undoBtn.style.cssText = 'background:#3b82f6;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font:600 12px Inter,sans-serif;';
    undoBtn.addEventListener('click', () => {
      chrome.storage.sync.get(['hiddenRules'], result => {
        const rules = result.hiddenRules || {};
        if (rules[domain]) {
          rules[domain] = rules[domain].filter(r => r.id !== ruleId);
          if (rules[domain].length === 0) delete rules[domain];
          chrome.storage.sync.set({ hiddenRules: rules });
        }
      });
      hiddenEl.style.removeProperty('display');
      toast.remove();
    });

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'background:none;border:none;color:#9ca3af;cursor:pointer;font-size:16px;padding:0 2px;';
    closeBtn.addEventListener('click', () => toast.remove());

    toast.appendChild(msg);
    toast.appendChild(undoBtn);
    toast.appendChild(closeBtn);
    document.body.appendChild(toast);

    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 5000);
  }

  function onPickerKeyDown(e) {
    if (e.key === 'Escape') exitPicker();
  }

  function enterPicker() {
    if (pickerActive || !elementHiderEnabled) return;
    pickerActive = true;
    injectPickerStyles();
    document.addEventListener('mouseover', onPickerMouseOver, true);
    document.addEventListener('mouseout', onPickerMouseOut, true);
    document.addEventListener('click', onPickerClick, true);
    document.addEventListener('keydown', onPickerKeyDown, true);
  }

  function exitPicker() {
    if (!pickerActive) return;
    pickerActive = false;
    removePickerStyles();
    document.removeEventListener('mouseover', onPickerMouseOver, true);
    document.removeEventListener('mouseout', onPickerMouseOut, true);
    document.removeEventListener('click', onPickerClick, true);
    document.removeEventListener('keydown', onPickerKeyDown, true);
  }

  function applyRules() {
    if (!rulesLoaded) {
      loadRules(() => applyRules());
      return;
    }
    rebuildHideCss();
  }

  function unhideAllRules() {
    if (hideStyleEl) hideStyleEl.textContent = '';
    // Also remove any legacy inline styles
    if (!cachedDomainRules || cachedDomainRules.length === 0) return;
    for (const rule of cachedDomainRules) {
      let el = document.querySelector(rule.selector);
      if (!el && rule.contentHint) el = fuzzyMatch(rule);
      if (el) el.style.removeProperty('display');
    }
  }

  function applySingleRule(rule) {
    // CSS handles exact selectors; fuzzy match as fallback via inline style
    let el = document.querySelector(rule.selector);
    if (el) return; // already handled by CSS
    if (rule.contentHint) {
      el = fuzzyMatch(rule);
      if (el) el.style.setProperty('display', 'none', 'important');
    }
  }

  function fuzzyMatch(rule) {
    const parts = rule.selector.split(' > ');
    if (parts.length < 2) return null;
    const leafTag = parts[parts.length - 1].split(':')[0];
    const candidates = document.querySelectorAll(leafTag);
    for (const c of candidates) {
      const text = (c.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 80);
      if (text === rule.contentHint) return c;
    }
    return null;
  }

  let lastUrl = location.href;

  function onUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    // Clear old CSS rules first
    if (hideStyleEl) hideStyleEl.textContent = '';
    // Reset cache and reload rules for new path
    rulesLoaded = false;
    cachedDomainRules = null;
    loadRules(() => {
      rebuildHideCss();
      // Also run fuzzy match fallback for rules CSS selectors didn't catch
      if (cachedDomainRules) {
        for (const rule of cachedDomainRules) applySingleRule(rule);
      }
    });
  }

  // Intercept SPA navigation
  const origPushState = history.pushState;
  history.pushState = function() {
    origPushState.apply(this, arguments);
    onUrlChange();
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function() {
    origReplaceState.apply(this, arguments);
    onUrlChange();
  };
  window.addEventListener('popstate', onUrlChange);

  function observeForNewRules() {
    const observer = new MutationObserver(() => {
      // Debounce: batch rapid mutations into a single fuzzy-match pass
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        // CSS handles exact selectors; only do fuzzy match fallback here
        if (!elementHiderEnabled || !cachedDomainRules || cachedDomainRules.length === 0) return;
        for (const rule of cachedDomainRules) applySingleRule(rule);
      }, 500);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadRules(() => {
        applyRules();
        observeForNewRules();
      });
    });
  } else {
    loadRules(() => {
      applyRules();
      observeForNewRules();
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'start-element-picker') {
      enterPicker();
      sendResponse({ ok: true });
    } else if (msg.type === 'hiddenRules-changed' || (msg.type === 'toggle-changed' && msg.key === 'hiddenRules')) {
      loadRules(() => applyRules());
    } else if (msg.type === 'toggle-changed' && msg.key === 'elementHider') {
      elementHiderEnabled = msg.value !== false;
      if (elementHiderEnabled) {
        applyRules();
      } else {
        exitPicker();
        unhideAllRules();
      }
    }
  });
})();
