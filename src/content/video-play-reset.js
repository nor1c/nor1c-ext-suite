(function () {
  // Always watch which video is playing, then report its source.
  // No reset logic — just continuous monitoring.

  var reportedUrls = {};

  function getVideoSrc(video) {
    var src = video.currentSrc || video.src || '';
    if (!src || src.indexOf('blob:') === 0 || src.indexOf('data:') === 0) return '';
    return src;
  }

  function reportVideoSrc(video) {
    var src = getVideoSrc(video);
    if (!src) return;
    // dedupe: skip if already reported this URL for this tab
    if (reportedUrls[src]) return;
    reportedUrls[src] = true;

    var fileName = '';
    try {
      var pathname = new URL(src).pathname;
      var parts = pathname.split('/');
      fileName = parts[parts.length - 1] || '';
      fileName = fileName.split('?')[0];
    } catch (_) {}

    var quality = 'N/A';
    if (video.videoHeight) {
      quality = video.videoHeight + 'p';
    }

    chrome.runtime.sendMessage({
      message: 'add-video-links',
      videoLinks: [{
        url: src,
        quality: quality,
        fileName: ""
      }]
    }, function () {
      chrome.runtime.lastError;
    });
  }

  function checkPlayingVideo(video) {
    if (!video || video.tagName !== 'VIDEO') return;
    if (video.paused || video.ended) return;
    reportVideoSrc(video);
  }

  function scanAllVideos() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      checkPlayingVideo(videos[i]);
    }
  }

  // Listen for play/playing events (capture phase to catch all)
  document.addEventListener('playing', function (e) {
    checkPlayingVideo(e.target);
  }, true);

  document.addEventListener('play', function (e) {
    // slight delay so currentSrc has time to populate
    setTimeout(function () {
      checkPlayingVideo(e.target);
    }, 100);
  }, true);

  // Watch for src attribute changes on video elements
  var observedVideos = new WeakSet();

  function watchVideoSrc(video) {
    if (observedVideos.has(video)) return;
    observedVideos.add(video);

    var observer = new MutationObserver(function () {
      if (!video.paused) {
        reportVideoSrc(video);
      }
    });
    observer.observe(video, { attributes: true, attributeFilter: ['src'] });

    // Watch <source> children — only direct childList, no subtree
    // to avoid firing on every descendant mutation
    if (video.parentElement) {
      var parentObserver = new MutationObserver(function () {
        if (!video.paused) {
          reportVideoSrc(video);
        }
      });
      parentObserver.observe(video.parentElement, { childList: true });
    }
  }

  function scanForVideos() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      watchVideoSrc(videos[i]);
    }
  }

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      scanForVideos();
      scanAllVideos();
    });
  } else {
    scanForVideos();
    scanAllVideos();
  }

  // Watch for dynamically added video elements — debounced to avoid
  // firing scanForVideos on every single DOM mutation
  var scanDebounceTimer = null;
  var bodyObserver = new MutationObserver(function () {
    if (scanDebounceTimer) return;
    scanDebounceTimer = setTimeout(function () {
      scanDebounceTimer = null;
      scanForVideos();
    }, 500);
  });

  function attachBodyObserver() {
    if (document.body) {
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.body) {
    attachBodyObserver();
  } else {
    document.addEventListener('DOMContentLoaded', attachBodyObserver);
  }

  // Periodic scan: every 3s, check if any video is playing and not yet reported.
  // Only runs while there are video elements on the page.
  var scanInterval = null;

  function ensureScanInterval() {
    if (scanInterval) return;
    scanInterval = setInterval(function () {
      var videos = document.querySelectorAll('video');
      if (videos.length === 0) {
        clearInterval(scanInterval);
        scanInterval = null;
        return;
      }
      scanAllVideos();
    }, 3000);
  }

  // Start interval if videos exist now, or after first scan finds them
  if (document.querySelectorAll('video').length > 0) {
    ensureScanInterval();
  }
  // Also check after DOMContentLoaded
  var _origScanForVideos = scanForVideos;
  scanForVideos = function () {
    _origScanForVideos();
    if (document.querySelectorAll('video').length > 0) {
      ensureScanInterval();
    }
  };
})();
