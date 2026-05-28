(function () {
  let lastRightClickedLink = null;

  document.addEventListener(
    'contextmenu',
    function (e) {
      let el = e.target;
      while (el && el !== document.body) {
        if (el.tagName === 'A' && el.href) {
          lastRightClickedLink = el;
          return;
        }
        el = el.parentElement;
      }
    },
    true
  );

  document.addEventListener('nor1c:get-last-link-text', function (e) {
    if (lastRightClickedLink) {
      const text =
        lastRightClickedLink.textContent ||
        lastRightClickedLink.innerText ||
        '';
      navigator.clipboard.writeText(text.trim());
      e.detail.callback && e.detail.callback(true);
    }
  });
})();
