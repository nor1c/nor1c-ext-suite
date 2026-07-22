(function () {
  const reportedUrls = new Set();
  const MAX_REPORTED = 500;

  function getVideoSrc(video) {
    const src = video.currentSrc || video.src || '';
    if (!src || src.indexOf('blob:') === 0 || src.indexOf('data:') === 0) return '';
    return src;
  }

  function reportVideoSrc(video) {
    const src = getVideoSrc(video);
    if (!src) return;
    if (reportedUrls.has(src)) return;
    if (reportedUrls.size >= MAX_REPORTED) {
      const first = reportedUrls.values().next().value;
      reportedUrls.delete(first);
    }
    reportedUrls.add(src);

    let fileName = '';
    try {
      const pathname = new URL(src).pathname;
      const parts = pathname.split('/');
      fileName = parts[parts.length - 1] || '';
      fileName = fileName.split('?')[0];
    } catch (_) {}

    let quality = 'N/A';
    if (video.videoHeight) {
      quality = video.videoHeight + 'p';
    }

    chrome.runtime.sendMessage({
      message: 'add-video-links',
      videoLinks: [{
        url: src,
        quality: quality,
        fileName: ''
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
    const videos = document.querySelectorAll('video');
    for (let i = 0; i < videos.length; i++) {
      checkPlayingVideo(videos[i]);
    }
  }

  document.addEventListener('playing', function (e) {
    checkPlayingVideo(e.target);
  }, true);

  document.addEventListener('play', function (e) {
    setTimeout(function () {
      checkPlayingVideo(e.target);
    }, 100);
  }, true);

  const observedVideos = new WeakMap();

  function cleanupVideo(video) {
    const observers = observedVideos.get(video);
    if (!observers) return;
    observers.src.disconnect();
    if (observers.parent) observers.parent.disconnect();
    observedVideos.delete(video);
  }

  function watchVideoSrc(video) {
    const existing = observedVideos.get(video);
    if (existing && existing.parentElement === video.parentElement) return;
    if (existing) cleanupVideo(video);

    const observer = new MutationObserver(function () {
      if (!video.paused) {
        reportVideoSrc(video);
      }
    });
    observer.observe(video, { attributes: true, attributeFilter: ['src'] });

    let parentObserver = null;
    if (video.parentElement) {
      parentObserver = new MutationObserver(function () {
        if (!video.isConnected) cleanupVideo(video);
        else if (!video.paused) reportVideoSrc(video);
      });
      parentObserver.observe(video.parentElement, { childList: true });
    }
    observedVideos.set(video, {
      src: observer,
      parent: parentObserver,
      parentElement: video.parentElement
    });
  }

  function scanForVideos() {
    const videos = document.querySelectorAll('video');
    for (let i = 0; i < videos.length; i++) {
      watchVideoSrc(videos[i]);
    }
    if (videos.length > 0) ensureScanInterval();
  }

  let scanDebounceTimer = null;
  const bodyObserver = new MutationObserver(function (mutations) {
    for (let i = 0; i < mutations.length; i++) {
      for (let j = 0; j < mutations[i].removedNodes.length; j++) {
        const node = mutations[i].removedNodes[j];
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'VIDEO') cleanupVideo(node);
        if (node.querySelectorAll) node.querySelectorAll('video').forEach(cleanupVideo);
      }
    }
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

  let scanInterval = null;

  function ensureScanInterval() {
    if (scanInterval) return;
    scanInterval = setInterval(function () {
      const videos = document.querySelectorAll('video');
      if (videos.length === 0) {
        clearInterval(scanInterval);
        scanInterval = null;
        return;
      }
      scanAllVideos();
    }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      scanForVideos();
      scanAllVideos();
    });
  } else {
    scanForVideos();
    scanAllVideos();
  }
})();
