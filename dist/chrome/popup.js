const BACKUP_VERSION = 1;
const BOOLEAN_SETTING_KEYS = new Set([
  'imageBlocker',
  'gifBlocker',
  'videoControls',
  'videoAutoHide',
  'videoDownload',
  'adLinkBypass',
  'urlCleaner',
  'smoothScroll',
  'quickTabSwitcher',
  'elementHider',
  'classBlocker',
  'cookieConsent',
  'disableAnimations',
  'blockNotifications',
  'blockLocation'
]);
const BACKUP_KEYS = [
  ...BOOLEAN_SETTING_KEYS,
  'videoAutoHideDelay',
  'videoControlsEnabledSites',
  'hiddenRules',
  'blockedSelectors',
  'ytControlPanel'
];
const YT_STRING_SETTING_KEYS = new Set([
  'enforceTheme',
  'hideWatchedThreshold',
  'minimumGridItemsPerRow',
  'minimumShortsPerRow',
  'playerControlsBg',
  'searchThumbnailSize'
]);
const YT_BOOLEAN_SETTING_KEYS = new Set([
  'enabled', 'debug', 'alwaysShowShortsProgressBar', 'blockAds', 'disableAmbientMode', 'disableAutoplay',
  'disableHomeFeed', 'disableStableVolume', 'disableThemedHover', 'disableVideoPreviews', 'hideAI',
  'hideAskButton', 'hideAutoDubbed', 'hideChannelBanner', 'hideChannelWatermark', 'hideChannels',
  'hideCollaborations', 'hideComments', 'hideEndCards', 'hideEndVideos', 'hideExperiencingInterruptions',
  'hideExploreButton', 'hideHiddenVideos', 'hideHomeCategories', 'hideHomePosts', 'hideInfoPanels',
  'hideJumpAheadButton', 'hideLive', 'hideLowViews', 'hideMembersOnly', 'hideMetadata', 'hideMixes',
  'hideMoviesAndTV', 'hideMusic', 'hideNextButton', 'hidePlaylists', 'hidePremiumUpsells', 'hideRelated',
  'hideRelatedBelow', 'hideShareThanksClip', 'hideShorts', 'hideShortsMusicLink', 'hideShortsRelatedLink',
  'hideShortsSuggestedActions', 'hideShortsMetadataUntilHover', 'hideShortsRemixButton',
  'hideSidebarSubscriptions', 'hideSponsored', 'hideStreamed', 'hideSuggestedSections', 'hideUpcoming',
  'hideVoiceSearch', 'hideWatched', 'playerFixFullScreenButton', 'playerHideFullScreenControls',
  'playerHideFullScreenMoreVideos', 'playerHideFullScreenTitle', 'playerHideFullScreenVoting', 'redirectShorts',
  'removePink', 'restoreMiniplayerButton', 'restoreSidebarSubscriptionsLink', 'revertGiantRelated',
  'revertSidebarOrder', 'showFullVideoTitles', 'stopShortsLooping', 'useSquareCorners',
  'alwaysUseOriginalAudio', 'alwaysUseTheaterMode', 'fullSizeTheaterMode', 'fullSizeTheaterModeHideHeader',
  'fullWidthChannelPage', 'hideChat', 'hideChatFullScreen', 'fixGhostCards', 'tidyGuideSidebar',
  'displaySubscriptionsGridAsList', 'displayHomeGridAsList', 'pauseChannelTrailers', 'allowBackgroundPlay',
  'hideEmbedShareButton', 'hideEmbedPauseOverlay', 'hideSubscriptionsChannelList',
  'hideSubscriptionsLatestBar', 'mobileGridView'
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateHiddenRules(value) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every(rules => Array.isArray(rules) && rules.every(rule => {
    if (!isPlainObject(rule) || typeof rule.id !== 'string' || typeof rule.selector !== 'string') return false;
    if (rule.path !== undefined && typeof rule.path !== 'string') return false;
    if (rule.contentHint !== undefined && typeof rule.contentHint !== 'string') return false;
    return rule.createdAt === undefined || (typeof rule.createdAt === 'number' && Number.isFinite(rule.createdAt));
  }));
}

function validateSetting(key, value) {
  if (BOOLEAN_SETTING_KEYS.has(key)) return typeof value === 'boolean';
  if (key === 'videoAutoHideDelay') return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 1 && value <= 10;
  if (key === 'videoControlsEnabledSites') return Array.isArray(value) && value.every(domain => typeof domain === 'string' && domain.trim().length > 0);
  if (key === 'blockedSelectors') return typeof value === 'string';
  if (key === 'hiddenRules') return validateHiddenRules(value);
  if (key === 'ytControlPanel') {
    if (!isPlainObject(value)) return false;
    return Object.entries(value).every(([optionKey, option]) => {
      if (YT_BOOLEAN_SETTING_KEYS.has(optionKey)) return typeof option === 'boolean';
      if (YT_STRING_SETTING_KEYS.has(optionKey)) return typeof option === 'string';
      return false;
    });
  }
  return false;
}

function validateBackupPayload(payload) {
  if (!isPlainObject(payload)) throw new Error('Invalid backup file format.');
  if (payload.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version: ${String(payload.version)}`);
  if (!isPlainObject(payload.data)) throw new Error('Invalid backup data.');

  const unknownKey = Object.keys(payload.data).find(key => !BACKUP_KEYS.includes(key));
  if (unknownKey) throw new Error(`Unknown setting: ${unknownKey}`);

  const settings = {};
  for (const key of BACKUP_KEYS) {
    if (!(key in payload.data)) continue;
    if (!validateSetting(key, payload.data[key])) throw new Error(`Invalid setting: ${key}`);
    settings[key] = key === 'videoControlsEnabledSites'
      ? Array.from(new Set(payload.data[key].map(domain => domain.trim().toLowerCase())))
      : payload.data[key];
  }
  return settings;
}

document.addEventListener('DOMContentLoaded', async () => {
  const keys = ['imageBlocker', 'gifBlocker', 'videoControls', 'videoDownload', 'adLinkBypass', 'urlCleaner', 'smoothScroll', 'quickTabSwitcher', 'elementHider', 'classBlocker', 'cookieConsent', 'disableAnimations'];
  const defaults = { imageBlocker: false, gifBlocker: false, videoControls: false, videoDownload: true, adLinkBypass: true, urlCleaner: true, smoothScroll: true, quickTabSwitcher: true, elementHider: true, classBlocker: false, cookieConsent: true, disableAnimations: false };

  const result = await chrome.storage.sync.get(keys);
  for (const key of keys) {
    const val = result[key] !== undefined ? result[key] : defaults[key];
    document.getElementById(`${toKebab(key)}-toggle`).checked = val;
  }

  for (const key of keys) {
    document.getElementById(`${toKebab(key)}-toggle`).addEventListener('change', async e => {
      await chrome.storage.sync.set({ [key]: e.target.checked });
      if (key === 'videoControls') {
        updateSiteExcludeVisibility(e.target.checked);
        updateAutoHideVisibility(e.target.checked);
      }
      if (key === 'videoDownload') updateVideoDownloaderFrame(e.target.checked);
      if (key === 'elementHider') updateElementHiderVisibility(e.target.checked);
    });
  }

  const siteCard = document.getElementById('site-exclude-card');
  const siteToggle = document.getElementById('site-exclude-toggle');
  const siteDesc = document.getElementById('site-exclude-desc');

  let currentDomain = null;

  function updateSiteExcludeVisibility(videoControlsOn) {
    siteCard.style.display = videoControlsOn && currentDomain ? '' : 'none';
  }

  let frameResizeTimer = null;
  let frameResizeObserver = null;

  async function updateVideoDownloaderFrame(videoDownloadOn) {
    const section = document.getElementById('video-sources-section');
    const frame = document.getElementById('video-downloader-frame');
    if (videoDownloadOn) {
      const response = await chrome.runtime.sendMessage({ type: 'ensure-video-downloader-background' }).catch(() => null);
      if (!response || !response.loaded) {
        section.style.display = 'none';
        return;
      }
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
    const section = document.getElementById('video-sources-section');
    frameResizeTimer = setInterval(function() {
      try {
        const body = frame.contentDocument && frame.contentDocument.body;
        if (!body) return;
        clearInterval(frameResizeTimer);
        frameResizeTimer = null;

        const resizeFrame = function() {
          const videos = frame.contentDocument.querySelectorAll('.videos-list .video');
          if (videos.length === 0) {
            section.style.display = 'none';
            return;
          }
          section.style.display = '';
          const h = body.scrollHeight;
          if (h > 0 && frame.style.height !== h + 'px') {
            frame.style.height = h + 'px';
          }
        };

        resizeFrame();
        frameResizeObserver = new MutationObserver(resizeFrame);
        frameResizeObserver.observe(body, { childList: true, subtree: true });
      } catch(e) {}
    }, 300);
  }

  function stopFrameResize() {
    if (frameResizeTimer) { clearInterval(frameResizeTimer); frameResizeTimer = null; }
    if (frameResizeObserver) { frameResizeObserver.disconnect(); frameResizeObserver = null; }
  }

  function updateElementHiderVisibility(on) {
    document.getElementById('picker-section').style.display = on ? '' : 'none';
    hiddenSection.style.display = on ? '' : 'none';
  }

  const autoHideCard = document.getElementById('auto-hide-card');
  const autoHideToggle = document.getElementById('auto-hide-toggle');
  const autoHideDelayCard = document.getElementById('auto-hide-delay-card');
  const autoHideDelaySelect = document.getElementById('auto-hide-delay-select');

  function updateAutoHideVisibility(videoControlsOn) {
    autoHideCard.style.display = videoControlsOn ? '' : 'none';
    if (videoControlsOn) {
      updateAutoHideDelayVisibility(autoHideToggle.checked);
    } else {
      autoHideDelayCard.style.display = 'none';
    }
  }

  function updateAutoHideDelayVisibility(autoHideOn) {
    autoHideDelayCard.style.display = autoHideOn ? '' : 'none';
  }

  autoHideToggle.addEventListener('change', async e => {
    await chrome.storage.sync.set({ videoAutoHide: e.target.checked });
    updateAutoHideDelayVisibility(e.target.checked);
  });

  autoHideDelaySelect.addEventListener('change', async e => {
    await chrome.storage.sync.set({ videoAutoHideDelay: parseInt(e.target.value, 10) });
  });

  async function loadSiteExclude() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    try {
      const hostname = new URL(tab.url).hostname;
      currentDomain = nor1cGetDomain(hostname);
      siteDesc.textContent = currentDomain;
    } catch (_) {
      siteCard.style.display = 'none';
      return;
    }

    const enabledResult = await chrome.storage.sync.get(['videoControlsEnabledSites']);
    const enabled = enabledResult.videoControlsEnabledSites || [];
    siteToggle.checked = enabled.indexOf(currentDomain) !== -1;
    updateSiteExcludeVisibility(document.getElementById('video-controls-toggle').checked);

    sendTabTitle(tab.title);
  }

  function sendTabTitle(title) {
    const frame = document.getElementById('video-downloader-frame');
    if (!title || !frame) return;
    function post(t) {
      try { frame.contentWindow.postMessage({ type: 'tab-title', title: t }, chrome.runtime.getURL('')); } catch(e) {}
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
    const res = await chrome.storage.sync.get(['videoControlsEnabledSites']);
    const enabled = res.videoControlsEnabledSites || [];
    const idx = enabled.indexOf(currentDomain);
    if (e.target.checked && idx === -1) enabled.push(currentDomain);
    else if (!e.target.checked && idx !== -1) enabled.splice(idx, 1);
    await chrome.storage.sync.set({ videoControlsEnabledSites: enabled });
  });

  await loadSiteExclude();

  const autoHideResult = await chrome.storage.sync.get(['videoAutoHide', 'videoAutoHideDelay']);
  autoHideToggle.checked = autoHideResult.videoAutoHide === true;
  autoHideDelaySelect.value = String(typeof autoHideResult.videoAutoHideDelay === 'number' ? autoHideResult.videoAutoHideDelay : 3);
  updateAutoHideVisibility(document.getElementById('video-controls-toggle').checked);

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
      hiddenDomain = nor1cGetDomain(url.hostname);
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
    const remaining = domainRules.filter(rule => !pathsMatch(rule.path, currentPath));
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

  const classBlockerOn = document.getElementById('class-blocker-toggle').checked;
  const blockerSection = document.getElementById('class-blocker-section');
  const blockerInput = document.getElementById('blocked-selectors-input');
  blockerSection.style.display = classBlockerOn ? '' : 'none';

  document.getElementById('class-blocker-toggle').addEventListener('change', async e => {
    await chrome.storage.sync.set({ classBlocker: e.target.checked });
    blockerSection.style.display = e.target.checked ? '' : 'none';
  });

  const result2 = await chrome.storage.sync.get(['blockedSelectors']);
  blockerInput.value = result2.blockedSelectors || '';
  let saveTimer = null;
  blockerInput.addEventListener('input', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const val = blockerInput.value;
      await chrome.storage.sync.set({ blockedSelectors: val });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'blockedSelectors-changed', value: val }).catch(() => {});
      }
    }, 400);
  });



    await loadHiddenElements();
  document.getElementById('export-btn').addEventListener('click', async () => {
    const data = await chrome.storage.sync.get(BACKUP_KEYS);
    const payload = { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    await chrome.downloads.download({ url, filename: `nor1c-suite-settings-${date}.json` });
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const toSet = validateBackupPayload(payload);
      await chrome.storage.sync.set(toSet);
      window.location.reload();
    } catch (err) {
      const importBtn = document.getElementById('import-btn');
      const originalText = importBtn.textContent;
      importBtn.textContent = err instanceof Error ? err.message : 'Import failed';
      importBtn.style.color = '#ef4444';
      setTimeout(() => { importBtn.textContent = originalText; importBtn.style.color = ''; }, 3000);
    }
    e.target.value = '';
  });

  document.getElementById("yt-control-panel-btn").addEventListener("click", async function() {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    var tab = tabs[0]
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: "toggle-yt-panel" }).catch(function() {})
    }
  })

});

function toKebab(camel) {
  return camel.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}







