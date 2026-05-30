(function () {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      var fakeGeo = {
        getCurrentPosition: function(success, error) {
          if (typeof error === 'function') {
            error({ code: 1, message: 'User denied Geolocation' });
          }
        },
        watchPosition: function(success, error) {
          if (typeof error === 'function') {
            error({ code: 1, message: 'User denied Geolocation' });
          }
          return 0;
        },
        clearWatch: function() {}
      };

      Object.defineProperty(Navigator.prototype, 'geolocation', {
        get: function() { return fakeGeo; },
        configurable: true
      });

      var origQuery = Permissions.prototype.query;
      Permissions.prototype.query = function(desc) {
        if (desc && desc.name === 'geolocation') {
          return Promise.resolve({ state: 'denied', onchange: null });
        }
        return origQuery.call(this, desc);
      };
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();
