document.addEventListener('DOMContentLoaded', async () => {
  const keys = ['imageBlocker', 'gifBlocker', 'videoControls', 'videoDownload', 'adLinkBypass', 'smoothScroll', 'elementHider'];
  const defaults = { imageBlocker: false, gifBlocker: false, videoControls: false, videoDownload: false, adLinkBypass: true, smoothScroll: false, elementHider: true };

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
      if (key === 'elementHider') updateElementHiderVisibility(e.target.checked);
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
      if (!frame.src || frame.src === 'about:blank') frame.src = 'video-downloader-popup.html';
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

  function updateElementHiderVisibility(on) {
    document.getElementById('picker-section').style.display = on ? '' : 'none';
    hiddenSection.style.display = on ? '' : 'none';
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

  const pickBtn = document.getElementById('pick-element-btn');
  pickBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'start-element-picker' }).catch(() => {});
    window.close();
  });

  const hiddenSection = document.getElementById('hidden-elements-section');
  const hiddenList = document.getElementById('hidden-elements-list');
  const hiddenCount = document.getElementById('hidden-count');
  const hiddenEmpty = document.getElementById('hidden-elements-empty');
  const unhideAllBtn = document.getElementById('unhide-all-btn');

  let hiddenDomain = null;
  let currentPath = null;

  function pathsMatch(rulePath, path) {
    if (!rulePath) return true;
    return path === rulePath || path.startsWith(rulePath + '/');
  }

  function renderHiddenList(rules) {
    hiddenList.innerHTML = '';
    const domainRules = rules[hiddenDomain] || [];
    const visibleRules = domainRules.filter(r => pathsMatch(r.path, currentPath));
    hiddenCount.textContent = visibleRules.length;
    if (visibleRules.length === 0) {
      hiddenSection.style.display = '';
      hiddenList.style.display = 'none';
      hiddenEmpty.style.display = '';
      unhideAllBtn.style.display = 'none';
      return;
    }
    hiddenSection.style.display = '';
    hiddenList.style.display = '';
    hiddenEmpty.style.display = 'none';
    unhideAllBtn.style.display = '';
    for (const rule of visibleRules) {
      const item = document.createElement('div');
      item.className = 'hidden-element-item';
      const urlPath = document.createElement('span');
      urlPath.className = 'hidden-element-url-path';
      urlPath.textContent = rule.path || 'all pages';
      const path = document.createElement('span');
      path.className = 'hidden-element-path';
      const shortPath = rule.selector.split(' > ').slice(-3).join(' > ');
      path.textContent = shortPath;
      path.title = rule.selector;
      const hint = document.createElement('span');
      hint.className = 'hidden-element-hint';
      hint.textContent = rule.contentHint || '';
      hint.title = rule.contentHint || '';
      const btn = document.createElement('button');
      btn.className = 'hidden-element-unhide';
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      btn.title = 'Unhide';
      btn.addEventListener('click', () => removeRule(rule.id));
      item.appendChild(urlPath);
      item.appendChild(path);
      if (rule.contentHint) item.appendChild(hint);
      item.appendChild(btn);
      hiddenList.appendChild(item);
    }
  }

  async function removeRule(ruleId) {
    const result = await chrome.storage.sync.get(['hiddenRules']);
    const rules = result.hiddenRules || {};
    const domainRules = rules[hiddenDomain] || [];
    const filtered = domainRules.filter(r => r.id !== ruleId);
    if (filtered.length === 0) delete rules[hiddenDomain];
    else rules[hiddenDomain] = filtered;
    await chrome.storage.sync.set({ hiddenRules: rules });
    loadHiddenElements();
  }

  async function loadHiddenElements() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) { hiddenSection.style.display = 'none'; return; }
    try {
      const url = new URL(tab.url);
      const hostname = url.hostname;
      const parts = hostname.split('.');
      hiddenDomain = parts.length <= 2 ? hostname : parts.slice(-2).join('.');
      currentPath = url.pathname.replace(/\/+$/, '') || '/';
    } catch (_) { hiddenSection.style.display = 'none'; return; }
    const result = await chrome.storage.sync.get(['hiddenRules']);
    const rules = result.hiddenRules || {};
    renderHiddenList(rules);
  }

  unhideAllBtn.addEventListener('click', async () => {
    const result = await chrome.storage.sync.get(['hiddenRules']);
    const rules = result.hiddenRules || {};
    const domainRules = rules[hiddenDomain] || [];
    const remaining = domainRules.filter(r => r.path && r.path !== currentPath);
    if (remaining.length === 0) delete rules[hiddenDomain];
    else rules[hiddenDomain] = remaining;
    await chrome.storage.sync.set({ hiddenRules: rules });
    loadHiddenElements();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.hiddenRules) {
      loadHiddenElements();
    }
  });

  const elementHiderOn = document.getElementById('element-hider-toggle').checked;
  updateElementHiderVisibility(elementHiderOn);

  await loadHiddenElements();
});

function toKebab(camel) {
  return camel.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}
