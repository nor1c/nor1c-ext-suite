(function () {
  let activeMenu = null;

  function dismiss() {
    if (!activeMenu) return;
    activeMenu.remove();
    activeMenu = null;
    document.removeEventListener('mousedown', onOutsideClick, true);
    document.removeEventListener('keydown', onEscape, true);
  }

  function onOutsideClick(e) {
    if (activeMenu && !activeMenu.contains(e.target)) dismiss();
  }

  function onEscape(e) {
    if (e.key === 'Escape') dismiss();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    ta.remove();
  }

  const ACTIONS = {
    'copy-link-text': {
      label: 'Copy Link Text',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
    },
    'open-image-viewer': {
      label: 'Open in Image Viewer',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
    },
    'save-to-png': {
      label: 'Save to PNG',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    }
  };

  function buildMenu(actions, x, y) {
    dismiss();
    const menu = document.createElement('div');
    menu.className = 'nor1c-context-menu';

    actions.forEach(function (actionId, i) {
      if (i > 0) {
        const sep = document.createElement('div');
        sep.className = 'nor1c-context-menu-separator';
        menu.appendChild(sep);
      }
      const def = ACTIONS[actionId];
      const item = document.createElement('button');
      item.className = 'nor1c-context-menu-item';
      item.innerHTML = def.icon + '<span>' + def.label + '</span>';
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        dismiss();
        executeAction(actionId);
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    activeMenu = menu;

    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const px = Math.min(x, window.innerWidth - mw - 4);
    const py = Math.min(y, window.innerHeight - mh - 4);
    menu.style.left = Math.max(4, px) + 'px';
    menu.style.top = Math.max(4, py) + 'px';

    requestAnimationFrame(function () {
      document.addEventListener('mousedown', onOutsideClick, true);
      document.addEventListener('keydown', onEscape, true);
    });
  }

  function executeAction(actionId) {
    if (actionId === 'copy-link-text') {
      if (lastLink) {
        const text = (lastLink.innerText || lastLink.textContent || '').trim();
        if (text) copyText(text);
      }
    } else if (actionId === 'open-image-viewer') {
      if (lastImg) {
        chrome.runtime.sendMessage({ type: 'open-image-viewer', srcUrl: lastImg.src }).catch(function () {});
      }
    } else if (actionId === 'save-to-png') {
      if (lastImg) {
        chrome.runtime.sendMessage({ type: 'save-to-png', srcUrl: lastImg.src }).catch(function () {});
      }
    }
  }

  let lastLink = null;
  let lastImg = null;

  document.addEventListener('contextmenu', function (e) {
    lastLink = null;
    lastImg = null;
    const actions = [];
    let el = e.target;

    while (el && el !== document.documentElement) {
      if (!lastImg && el.tagName === 'IMG' && el.src) lastImg = el;
      if (!lastLink && el.tagName === 'A' && el.href) lastLink = el;
      el = el.parentElement;
    }

    if (lastLink) actions.push('copy-link-text');
    if (lastImg) {
      actions.push('open-image-viewer');
      actions.push('save-to-png');
    }

    if (actions.length === 0) return;

    e.preventDefault();
    buildMenu(actions, e.clientX, e.clientY);
  }, { capture: true, passive: false });
})();
