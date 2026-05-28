document.addEventListener('DOMContentLoaded', async () => {
  const keys = ['imageBlocker', 'gifBlocker', 'videoControls', 'videoDownload'];
  const defaults = { imageBlocker: false, gifBlocker: false, videoControls: false, videoDownload: false };

  const result = await chrome.storage.sync.get(keys);
  for (const key of keys) {
    const val = result[key] !== undefined ? result[key] : defaults[key];
    document.getElementById(`${toKebab(key)}-toggle`).checked = val;
  }

  for (const key of keys) {
    document.getElementById(`${toKebab(key)}-toggle`).addEventListener('change', async e => {
      await chrome.storage.sync.set({ [key]: e.target.checked });
      if (key === 'videoControls') updateSiteExcludeVisibility(e.target.checked);
      if (key === 'videoDownload') updateVideoDownloaderFrame(e.target.checked);
    });
  }

  const siteCard = document.getElementById('site-exclude-card');
  const siteToggle = document.getElementById('site-exclude-toggle');
  const siteDesc = document.getElementById('site-exclude-desc');

  let currentDomain = null;

  function getDomain(hostname) {
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
  }

  function updateSiteExcludeVisibility(videoControlsOn) {
    siteCard.style.display = videoControlsOn && currentDomain ? '' : 'none';
  }

  let frameResizeTimer = null;

  function updateVideoDownloaderFrame(videoDownloadOn) {
    const section = document.getElementById('video-sources-section');
    const frame = document.getElementById('video-downloader-frame');
    if (videoDownloadOn) {
      section.style.display = '';
      frame.style.display = '';
      frame.src = frame.src || 'video-downloader-popup.html';
      startFrameResize(frame);
    } else {
      section.style.display = 'none';
      frame.style.display = 'none';
      stopFrameResize();
    }
  }

  function startFrameResize(frame) {
    stopFrameResize();
    frameResizeTimer = setInterval(function() {
      try {
        var body = frame.contentDocument && frame.contentDocument.body;
        if (!body) return;
        var h = body.scrollHeight;
        if (h > 0 && frame.style.height !== h + 'px') {
          frame.style.height = h + 'px';
        }
      } catch(e) {}
    }, 200);
  }

  function stopFrameResize() {
    if (frameResizeTimer) { clearInterval(frameResizeTimer); frameResizeTimer = null; }
  }

  async function loadSiteExclude() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    try {
      const hostname = new URL(tab.url).hostname;
      currentDomain = getDomain(hostname);
      siteDesc.textContent = currentDomain;
    } catch (_) {
      siteCard.style.display = 'none';
      return;
    }

    const excludedResult = await chrome.storage.sync.get(['videoControlsExcluded']);
    const excluded = excludedResult.videoControlsExcluded || [];
    siteToggle.checked = excluded.indexOf(currentDomain) !== -1;
    updateSiteExcludeVisibility(document.getElementById('video-controls-toggle').checked);

    sendTabTitle(tab.title);
  }

  function sendTabTitle(title) {
    const frame = document.getElementById('video-downloader-frame');
    if (!title || !frame) return;
    function post(t) {
      try { frame.contentWindow.postMessage({ type: 'tab-title', title: t }, '*'); } catch(e) {}
    }
    post(title);
    setTimeout(function() { post(title); }, 500);
    setTimeout(function() {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs[0] && tabs[0].title) post(tabs[0].title);
      });
    }, 3000);
    setTimeout(function() {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs[0] && tabs[0].title) post(tabs[0].title);
      });
    }, 6000);
  }

  siteToggle.addEventListener('change', async e => {
    if (!currentDomain) return;
    const res = await chrome.storage.sync.get(['videoControlsExcluded']);
    const excluded = res.videoControlsExcluded || [];
    const idx = excluded.indexOf(currentDomain);
    if (e.target.checked && idx === -1) excluded.push(currentDomain);
    else if (!e.target.checked && idx !== -1) excluded.splice(idx, 1);
    await chrome.storage.sync.set({ videoControlsExcluded: excluded });
  });

  await loadSiteExclude();

  const videoDownloadOn = document.getElementById('video-download-toggle').checked;
  updateVideoDownloaderFrame(videoDownloadOn);
});

function toKebab(camel) {
  return camel.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}
