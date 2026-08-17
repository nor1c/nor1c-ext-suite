(function () {
  const playingVideos = new Set();

  function getVideoUrls(video) {
    const urls = [video.currentSrc, video.src];
    video.querySelectorAll('source').forEach(source => urls.push(source.src));
    return urls.filter(url => typeof url === 'string' && url);
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
      playingVideos.add(video);
    } else {
      playingVideos.delete(video);
    }
    publishState();
  }

  ['playing', 'pause', 'ended', 'emptied', 'waiting', 'stalled', 'abort'].forEach(type => {
    document.addEventListener(type, handlePlaybackEvent, true);
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'get-playing-videos') {
      sendResponse({ playing: getPlayingUrls() });
    }
  });
})();
