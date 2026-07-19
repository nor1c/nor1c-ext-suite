(function() {
  function getState(name) {
    const element = document.querySelector('meta[name="' + name + '"]');
    return element && element.content === 'true';
  }

  function ensureState(name) {
    let element = document.querySelector('meta[name="' + name + '"]');
    if (!element) {
      element = document.createElement('meta');
      element.name = name;
      element.content = 'false';
      document.documentElement.appendChild(element);
    }
  }

  ensureState('nor1c-location-blocker');
  ensureState('nor1c-notification-blocker');
  ensureState('nor1c-ad-bypass');

  const nativeGeolocation = navigator.geolocation;
  const blockedGeolocation = {
    getCurrentPosition(success, error) {
      if (getState('nor1c-location-blocker')) {
        if (typeof error === 'function') error({ code: 1, message: 'Geolocation blocked by extension' });
        return;
      }
      return nativeGeolocation.getCurrentPosition.apply(nativeGeolocation, arguments);
    },
    watchPosition(success, error) {
      if (getState('nor1c-location-blocker')) {
        if (typeof error === 'function') error({ code: 1, message: 'Geolocation blocked by extension' });
        return 0;
      }
      return nativeGeolocation.watchPosition.apply(nativeGeolocation, arguments);
    },
    clearWatch(id) {
      return nativeGeolocation.clearWatch(id);
    }
  };

  if (nativeGeolocation) {
    try {
      Object.defineProperty(Navigator.prototype, 'geolocation', {
        get() { return blockedGeolocation; },
        configurable: true
      });
    } catch (_) {}
  }

  if (typeof Notification !== 'undefined') {
    const nativeRequestPermission = Notification.requestPermission.bind(Notification);
    try {
      Notification.requestPermission = function() {
        if (getState('nor1c-notification-blocker')) return Promise.resolve('denied');
        return nativeRequestPermission.apply(Notification, arguments);
      };
    } catch (_) {}
  }

  if (navigator.permissions && navigator.permissions.query) {
    const nativeQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function(descriptor) {
      const blockedLocation = descriptor && descriptor.name === 'geolocation' && getState('nor1c-location-blocker');
      const blockedNotification = descriptor && descriptor.name === 'notifications' && getState('nor1c-notification-blocker');
      if (blockedLocation || blockedNotification) {
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

  const nativeOpen = window.open;
  window.open = function(url) {
    if (!url || !getState('nor1c-ad-bypass')) return nativeOpen.apply(window, arguments);
    return { closed: true, close() {}, focus() {}, blur() {} };
  };
})();
