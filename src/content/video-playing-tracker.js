(function () {
  var trackedSources = new WeakMap();

  function getVideoSrc(video) {
    return video.currentSrc || video.src || '';
  }

  function updatePlaying(video) {
    var src = getVideoSrc(video);
    if (src) trackedSources.set(video, src);
  }

  function getPlayingUrls() {
    var urls = [];
    document.querySelectorAll('video').forEach(function(video) {
      updatePlaying(video);
      var src = trackedSources.get(video);
      if (src && !video.paused && !video.ended && video.readyState > 2) urls.push(src);
    });
    return Array.from(new Set(urls));
  }

  function hookVideo(video) {
    if (video.__playingTracked) return;
    video.__playingTracked = true;
    video.addEventListener('play', function () { updatePlaying(video); });
    video.addEventListener('playing', function () { updatePlaying(video); });
    video.addEventListener('pause', function () { updatePlaying(video); });
    video.addEventListener('ended', function () { updatePlaying(video); });
    video.addEventListener('emptied', function () { updatePlaying(video); });
    updatePlaying(video);
  }

  function scanVideos() {
    document.querySelectorAll('video').forEach(hookVideo);
  }

  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'childList') {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var node = m.addedNodes[j];
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'VIDEO') hookVideo(node);
          if (node.querySelectorAll) {
            node.querySelectorAll('video').forEach(hookVideo);
          }
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scanVideos();
  setInterval(scanVideos, 2000);

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'get-playing-videos') {
      scanVideos();
      sendResponse({ playing: getPlayingUrls() });
      return true;
    }
  });
})();
