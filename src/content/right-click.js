(function () {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      document.addEventListener('contextmenu', function(e) {
        e.stopImmediatePropagation();
      }, true);

      document.addEventListener('selectstart', function(e) {
        e.stopImmediatePropagation();
      }, true);

      document.addEventListener('dragstart', function(e) {
        e.stopImmediatePropagation();
      }, true);
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();
