(function () {
  const resumeCandidates = new Set();
  let resumeUntil = 0;
  let resumeTimer = null;

  function resumeInterruptedVideos() {
    resumeTimer = null;
    if (!document.hidden || Date.now() > resumeUntil) return;
    resumeCandidates.forEach(video => {
      if (!video.isConnected || video.ended) {
        resumeCandidates.delete(video);
        return;
      }
      if (video.paused) video.play().catch(() => {});
    });
  }

  function scheduleResume() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(resumeInterruptedVideos, 0);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      resumeCandidates.clear();
      resumeUntil = 0;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = null;
      return;
    }

    resumeCandidates.clear();
    document.querySelectorAll('video').forEach(video => {
      if (!video.paused && !video.ended) resumeCandidates.add(video);
    });
    resumeUntil = Date.now() + 1500;
    scheduleResume();
  }, true);

  document.addEventListener('pause', event => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    if (document.hidden && resumeCandidates.has(video) && Date.now() <= resumeUntil) scheduleResume();
  }, true);
})();
