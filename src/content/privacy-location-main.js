(function() {
  const nativeGeolocation = navigator.geolocation;
  if (!nativeGeolocation) return;

  const blockedGeolocation = {
    getCurrentPosition(success, error) {
      if (typeof error === 'function') error({ code: 1, message: 'Geolocation blocked by extension' });
    },
    watchPosition(success, error) {
      if (typeof error === 'function') error({ code: 1, message: 'Geolocation blocked by extension' });
      return 0;
    },
    clearWatch(id) {
      return nativeGeolocation.clearWatch(id);
    }
  };

  try {
    Object.defineProperty(Navigator.prototype, 'geolocation', {
      get() { return blockedGeolocation; },
      configurable: true
    });
  } catch (_) {}

  if (navigator.permissions && navigator.permissions.query) {
    const nativeQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function(descriptor) {
      if (descriptor && descriptor.name === 'geolocation') {
        return Promise.resolve({
          state: 'denied',
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return true; }
        });
      }
      return nativeQuery(descriptor);
    };
  }
})();
