(function () {
  const playingVideos = new Set();
  const visibilityObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || entry.intersectionRatio === 0 || !isRendered(entry.target)) pauseVideo(entry.target);
    });
  }, { threshold: 0.01 });

  function isRendered(video) {
    const style = getComputedStyle(video);
    return video.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
  }

  function isInViewport(video) {
    const rect = video.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }

  function pauseVideo(video) {
    visibilityObserver.unobserve(video);
    playingVideos.delete(video);
    if (!video.paused) video.pause();
  }

  function pauseAllVideos() {
    Array.from(playingVideos).forEach(pauseVideo);
    publishState();
  }

  function getVideoUrls(video) {
    const urls = [video.currentSrc, video.src];
    video.querySelectorAll('source').forEach(source => urls.push(source.src));
    return urls.filter(url => typeof url === 'string' && url && !url.startsWith('blob:'));
  }

  function getPlayingUrls() {
    const urls = [];
    playingVideos.forEach(video => {
      if (!video.isConnected || video.paused || video.ended || video.readyState < 3) {
        playingVideos.delete(video);
        return;
      }
      urls.push(...getVideoUrls(video));
    });
    return Array.from(new Set(urls));
  }

  function publishState() {
    chrome.runtime.sendMessage({
      type: 'video-playback-state',
      playing: getPlayingUrls()
    }).catch(() => {});
  }

  function handlePlaybackEvent(event) {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    if (event.type === 'playing') {
      if (document.hidden || !isRendered(video) || !isInViewport(video)) {
        pauseVideo(video);
      } else {
        playingVideos.add(video);
        visibilityObserver.observe(video);
      }
    } else {
      visibilityObserver.unobserve(video);
      playingVideos.delete(video);
    }
    publishState();
  }

  ['playing', 'pause', 'ended', 'emptied', 'waiting', 'stalled', 'abort'].forEach(type => {
    document.addEventListener(type, handlePlaybackEvent, true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAllVideos();
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'get-playing-videos') {
      sendResponse({ playing: getPlayingUrls() });
    }
  });
})();
