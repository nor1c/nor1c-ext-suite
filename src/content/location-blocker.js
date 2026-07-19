(function() {
  function update(enabled) {
    const state = document.querySelector('meta[name="nor1c-location-blocker"]');
    if (state) state.content = enabled ? 'true' : 'false';
  }

  chrome.storage.sync.get({ blockLocation: true }, result => update(result.blockLocation !== false));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.blockLocation) update(changes.blockLocation.newValue !== false);
  });
})();
