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
      navigator.clipboard.writeText(text).catch(() => {});
    }
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
