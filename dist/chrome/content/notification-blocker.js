(function() {
  const origRequestPermission = Notification.requestPermission;
  const origPermissionDesc = Object.getOwnPropertyDescriptor(Notification, 'permission');
  const origPermissionsQuery = navigator.permissions ? navigator.permissions.query.bind(navigator.permissions) : null;

  Notification.requestPermission = function() {
    return Promise.resolve('denied');
  };

  if (origPermissionDesc && origPermissionDesc.get) {
    Object.defineProperty(Notification, 'permission', {
      get: function() { return 'denied'; },
      configurable: true,
      enumerable: true
    });
  }

  if (origPermissionsQuery) {
    navigator.permissions.query = function(descriptor) {
      if (descriptor && descriptor.name === 'notifications') {
        return Promise.resolve({
          state: 'denied',
          onchange: null,
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return true; }
        });
      }
      return origPermissionsQuery(descriptor);
    };
  }
})();
