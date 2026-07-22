(function() {
  if (typeof Notification !== 'undefined') {
    try {
      Notification.requestPermission = function() {
        return Promise.resolve('denied');
      };
    } catch (_) {}
  }

  if (navigator.permissions && navigator.permissions.query) {
    const nativeQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function(descriptor) {
      if (descriptor && descriptor.name === 'notifications') {
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
