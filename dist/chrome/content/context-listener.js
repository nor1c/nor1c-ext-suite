(function () {
  let lastRightClickedLink = null;

  document.addEventListener('contextmenu', function (e) {
    let el = e.target;
    while (el && el !== document.body) {
      if (el.tagName === 'A' && el.href) {
        lastRightClickedLink = el;
        return;
      }
      el = el.parentElement;
    }
  }, true);

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
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    ta.remove();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'copy-link-text') {
      const text = (msg.text || (lastRightClickedLink ? (lastRightClickedLink.textContent || lastRightClickedLink.innerText || '') : '')).trim();
      if (text) copyText(text);
      sendResponse({ success: !!text });
      return true;
    }
  });
})();
