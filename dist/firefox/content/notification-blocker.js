(function() {
  function update(enabled) {
    const state = document.querySelector('meta[name="nor1c-notification-blocker"]');
    if (state) state.content = enabled ? 'true' : 'false';
  }

  chrome.storage.sync.get({ blockNotifications: true }, result => update(result.blockNotifications !== false));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.blockNotifications) update(changes.blockNotifications.newValue !== false);
  });
})();
