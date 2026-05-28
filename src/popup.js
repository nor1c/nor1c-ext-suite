document.addEventListener('DOMContentLoaded', async () => {
  const keys = ['imageBlocker', 'gifBlocker', 'videoControls', 'videoDownload'];
  const defaults = { imageBlocker: false, gifBlocker: false, videoControls: false, videoDownload: false };

  const result = await chrome.storage.sync.get(keys);
  for (const key of keys) {
    const val = result[key] !== undefined ? result[key] : defaults[key];
    document.getElementById(`${toKebab(key)}-toggle`).checked = val;
  }

  for (const key of keys) {
    document.getElementById(`${toKebab(key)}-toggle`).addEventListener('change', async (e) => {
      await chrome.storage.sync.set({ [key]: e.target.checked });
      if (key === 'videoControls') {
        updateSiteExcludeVisibility(e.target.checked);
      }
    });
  }

  const siteCard = document.getElementById('site-exclude-card');
  const siteToggle = document.getElementById('site-exclude-toggle');
  const siteLabel = document.getElementById('site-exclude-label');
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

  async function loadSiteExclude() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    let hostname;
    try {
      hostname = new URL(tab.url).hostname;
    } catch (_) {
      siteCard.style.display = 'none';
      return;
    }

    currentDomain = getDomain(hostname);
    siteDesc.textContent = currentDomain;

    const excludedResult = await chrome.storage.sync.get(['videoControlsExcluded']);
    const excluded = excludedResult.videoControlsExcluded || [];
    siteToggle.checked = excluded.indexOf(currentDomain) !== -1;
    updateSiteExcludeVisibility(document.getElementById('video-controls-toggle').checked);
  }

  siteToggle.addEventListener('change', async (e) => {
    if (!currentDomain) return;
    const result = await chrome.storage.sync.get(['videoControlsExcluded']);
    const excluded = result.videoControlsExcluded || [];
    const idx = excluded.indexOf(currentDomain);

    if (e.target.checked && idx === -1) {
      excluded.push(currentDomain);
    } else if (!e.target.checked && idx !== -1) {
      excluded.splice(idx, 1);
    }

    await chrome.storage.sync.set({ videoControlsExcluded: excluded });
  });

  await loadSiteExclude();
});

function toKebab(camel) {
  return camel.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}
