(function() {
  let enabled = false;
  let loaded = false;
  let loading = false;

  function load() {
    if (!enabled || loaded || loading) return;
    loading = true;
    chrome.runtime.sendMessage({ type: 'load-video-downloader' }, response => {
      loading = false;
      if (chrome.runtime.lastError) return;
      loaded = Boolean(response && response.loaded);
    });
  }

  document.addEventListener('play', event => {
    if (event.target instanceof HTMLVideoElement) load();
  }, true);

  chrome.storage.sync.get({ videoDownload: true }, result => {
    enabled = result.videoDownload !== false;
    if (enabled && Array.from(document.querySelectorAll('video')).some(video => !video.paused && !video.ended)) load();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.videoDownload) return;
    enabled = changes.videoDownload.newValue !== false;
    if (enabled && Array.from(document.querySelectorAll('video')).some(video => !video.paused && !video.ended)) load();
  });
})();
