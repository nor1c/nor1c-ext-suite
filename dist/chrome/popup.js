const BACKUP_VERSION = 1;
const BOOLEAN_SETTING_KEYS = new Set([
  'imageBlocker',
  'gifBlocker',
  'videoControls',
  'videoAutoHide',
  'volumeControl',
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
  'volumeControlLevel',
  'videoPlayerMode',
  'videoControlsEnabledSites',
  'hiddenRules',
  'blockedSelectors',
  'ytControlPanel',
  'websiteBlockerRules',
  'websiteBlockerSchedule'
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
  if (key === 'volumeControlLevel') {
    return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= 500;
  }
  if (key === 'videoPlayerMode') return value === 'basic' || value === 'custom';
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
  if (key === 'websiteBlockerRules') {
    if (!Array.isArray(value)) return false;
    return value.every(rule =>
      isPlainObject(rule) &&
      typeof rule.id === 'string' && rule.id.length > 0 &&
      typeof rule.domain === 'string' && rule.domain.length > 0 &&
      typeof rule.enabled === 'boolean'
    );
  }
  if (key === 'websiteBlockerSchedule') {
    return isPlainObject(value) &&
      typeof value.start === 'string' && /^\d{2}:\d{2}$/.test(value.start) &&
      typeof value.end === 'string' && /^\d{2}:\d{2}$/.test(value.end);
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
  const keys = ['imageBlocker', 'gifBlocker', 'videoControls', 'volumeControl', 'videoDownload', 'adLinkBypass', 'urlCleaner', 'smoothScroll', 'quickTabSwitcher', 'elementHider', 'classBlocker', 'cookieConsent', 'disableAnimations'];
  const defaults = { imageBlocker: false, gifBlocker: false, videoControls: false, volumeControl: true, videoDownload: true, adLinkBypass: true, urlCleaner: true, smoothScroll: true, quickTabSwitcher: true, elementHider: true, classBlocker: false, cookieConsent: true, disableAnimations: false };

  const result = await chrome.storage.sync.get(keys);
  for (const key of keys) {
    const val = result[key] !== undefined ? result[key] : defaults[key];
    document.getElementById(`${toKebab(key)}-toggle`).checked = val;
  }

  for (const key of keys) {
    document.getElementById(`${toKebab(key)}-toggle`).addEventListener('change', async e => {
      await chrome.storage.sync.set({ [key]: e.target.checked });
      if (key === 'videoControls') {
        updatePlayerModeVisibility(e.target.checked);
        updateSiteExcludeVisibility(e.target.checked);
        updateAutoHideVisibility(e.target.checked);
      }
      if (key === 'volumeControl') updateVolumeControlVisibility(e.target.checked);
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

  function videoFilename(url, index, metadata) {
    const serverName = metadata && metadata.filename;
    if (serverName && /\.(?:mp4|m4v|webm|mov|flv|ogv|ts)$/i.test(serverName)) return serverName;
    try {
      const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
      if (/\.(?:mp4|m4v|webm|mov|flv|ogv|ts)$/i.test(name)) return name;
    } catch (_) {}
    const contentType = metadata && metadata.contentType;
    const extensionByType = {
      'video/mp4': '.mp4',
      'video/x-m4v': '.m4v',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'video/x-flv': '.flv',
      'video/ogg': '.ogv',
      'video/mp2t': '.ts'
    };
    return `video-${index + 1}${extensionByType[contentType] || '.mp4'}`;
  }

  function isHlsUrl(url) {
    return /\.m3u8(?:$|[?#])/i.test(url);
  }

  async function downloadHls(tabId, frameId, manifestUrl, filename) {
    const results = await chrome.scripting.executeScript({
      target: frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] },
      args: [manifestUrl, filename],
      func: async (initialUrl, outputName) => {
        const readPlaylist = async url => {
          const response = await fetch(url, { credentials: 'include' });
          if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
          return { url: response.url || url, text: await response.text() };
        };
        let playlist = await readPlaylist(initialUrl);
        const variants = [];
        const masterLines = playlist.text.split(/\r?\n/);
        for (let i = 0; i < masterLines.length; i++) {
          if (!masterLines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
          const bandwidth = Number((masterLines[i].match(/BANDWIDTH=(\d+)/i) || [0, 0])[1]);
          const next = masterLines.slice(i + 1).find(line => line && !line.startsWith('#'));
          if (next) variants.push({ bandwidth, url: new URL(next, playlist.url).href });
        }
        if (variants.length) {
          variants.sort((a, b) => b.bandwidth - a.bandwidth);
          playlist = await readPlaylist(variants[0].url);
        }
        if (/#EXT-X-KEY:(?![^\n]*METHOD=NONE)/i.test(playlist.text)) {
          throw new Error('HLS terenkripsi tidak dapat digabung langsung');
        }
        const segmentUrls = [];
        let initUrl = '';
        for (const line of playlist.text.split(/\r?\n/)) {
          const map = line.match(/^#EXT-X-MAP:.*URI="([^"]+)"/i);
          if (map) initUrl = new URL(map[1], playlist.url).href;
          if (line && !line.startsWith('#')) segmentUrls.push(new URL(line, playlist.url).href);
        }
        if (!segmentUrls.length) throw new Error('Manifest tidak memiliki segmen video');
        const urls = initUrl ? [initUrl, ...segmentUrls] : segmentUrls;
        const parts = [];
        for (let i = 0; i < urls.length; i += 6) {
          const batch = await Promise.all(urls.slice(i, i + 6).map(async url => {
            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) throw new Error(`Segmen HTTP ${response.status}`);
            return response.arrayBuffer();
          }));
          parts.push(...batch);
        }
        const isMp4 = Boolean(initUrl);
        const blob = new Blob(parts, { type: isMp4 ? 'video/mp4' : 'video/mp2t' });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = outputName.replace(/\.mp4$/i, isMp4 ? '.mp4' : '.ts');
        anchor.style.display = 'none';
        document.documentElement.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        return { segments: segmentUrls.length };
      }
    });
    if (!results.some(result => result.result && result.result.segments)) {
      throw new Error('HLS tidak berhasil diproses pada tab aktif');
    }
  }

  function sourceKind(source) {
    const url = source.url || '';
    const contentType = source.contentType || '';
    if (/\.m3u8(?:$|[?#])/i.test(url) || /(?:mpegurl|vnd\.apple\.mpegurl)/i.test(contentType)) return 'hls';
    if (/\.mpd(?:$|[?#])/i.test(url) || /dash\+xml/i.test(contentType)) return 'dash';
    if (/\.(?:m4s|ts)(?:$|[?#])/i.test(url)) return 'segment';
    if (/^video\//i.test(contentType) || source.type === 'media') return 'file';
    return 'unknown';
  }

  function selectCurrentNetworkSource(sources, frameIds) {
    const now = Date.now();
    const candidates = sources
      .filter(source => source && typeof source.url === 'string' && /^https?:/i.test(source.url))
      .filter(source => !frameIds.length || frameIds.includes(source.frameId))
      .filter(source => now - (source.detectedAt || 0) < 120000)
      .map(source => ({ ...source, kind: sourceKind(source) }))
      .filter(source => source.kind !== 'segment' && source.kind !== 'unknown')
      .sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0));
    const hls = candidates.find(source => source.kind === 'hls');
    const completeFiles = candidates
      .filter(source => source.kind === 'file')
      .filter(source => !/[?&](?:rn|sq|part|segment)=/i.test(source.url))
      .sort((a, b) => (b.contentLength || 0) - (a.contentLength || 0));
    return hls || completeFiles[0] || candidates.find(source => source.kind === 'dash') || null;
  }

  async function scanPlayingVideoSources() {
    const list = document.getElementById('video-sources-list');
    const empty = document.getElementById('video-sources-empty');
    list.replaceChildren();
    empty.textContent = 'Memindai video yang sedang diputar…';
    empty.style.display = '';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id === undefined) {
      empty.textContent = 'Tab aktif tidak dapat dipindai.';
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        const playing = Array.from(document.querySelectorAll('video'))
          .filter(video => !video.paused && !video.ended);
        return {
          hasPlayingVideo: playing.length > 0,
          directUrls: playing
            .flatMap(video => [video.currentSrc, video.src, ...Array.from(video.querySelectorAll('source'), source => source.src)])
            .filter(url => typeof url === 'string' && /^https?:/i.test(url))
        };
      }
    }).catch(() => []);

    const frameStates = results
      .map(result => result.result)
      .filter(result => result && typeof result === 'object');
    const playingResults = results.filter(result => result.result && result.result.hasPlayingVideo);
    const hasPlayingVideo = playingResults.length > 0;
    const playingFrameIds = playingResults.map(result => result.frameId);
    const directSources = playingResults.flatMap(result =>
      (Array.isArray(result.result.directUrls) ? result.result.directUrls : [])
        .map(url => {
          try {
            const parsed = new URL(url);
            parsed.hash = '';
            ['bytestart', 'byteend', 'start', 'end', 'range'].forEach(key => parsed.searchParams.delete(key));
            url = parsed.href;
          } catch (_) {}
          return { url, frameId: result.frameId, type: 'media', contentType: '', contentLength: 0 };
        })
    );
    let urls = Array.from(new Set(directSources.map(source => source.url)));
    const sourceMetadata = new Map(directSources.map(source => [source.url, source]));
    const detected = await chrome.runtime.sendMessage({
      type: 'get-detected-video-sources',
      tabId: tab.id
    }).catch(() => ({ sources: [] }));
    const detectedSources = detected && Array.isArray(detected.sources) ? detected.sources : [];

    // Enrich direct element URLs with response headers so extensionless media
    // receives the correct playable filename extension.
    for (const source of detectedSources) {
      if (sourceMetadata.has(source.url)) sourceMetadata.set(source.url, source);
    }

    // A blob/MediaSource player has no HTTP URL on the element. In that case,
    // use only the best current manifest/media request instead of listing every
    // segment and every video request previously seen in the tab.
    if (hasPlayingVideo && urls.length === 0) {
      const current = selectCurrentNetworkSource(detectedSources, playingFrameIds);
      if (current) {
        urls = [current.url];
        sourceMetadata.set(current.url, current);
      }
    }
    empty.style.display = urls.length ? 'none' : '';
    empty.textContent = 'Belum ada source terdeteksi. Putar video lalu tekan Scan ulang.';

    urls.forEach((url, index) => {
      const row = document.createElement('div');
      row.className = 'video-source-row';
      const info = document.createElement('div');
      info.className = 'video-source-info';
      const name = document.createElement('strong');
      const metadata = sourceMetadata.get(url) || { url, contentType: '', type: '' };
      name.textContent = videoFilename(url, index, metadata);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = url;
      const download = document.createElement('button');
      download.type = 'button';
      download.textContent = 'Download';
      download.addEventListener('click', async () => {
        download.disabled = true;
        const originalText = download.textContent;
        try {
          const kind = sourceKind(metadata);
          if (isHlsUrl(url) || kind === 'hls') {
            download.textContent = 'Memproses…';
            await downloadHls(tab.id, metadata.frameId, url, videoFilename(url, index, metadata));
          } else if (/\.mpd(?:$|[?#])/i.test(url) || kind === 'dash') {
            throw new Error('Stream DASH memerlukan penggabungan audio dan video terpisah');
          } else {
            const options = {
              url,
              filename: videoFilename(url, index, metadata),
              saveAs: false,
              conflictAction: 'uniquify'
            };
            const downloadId = await chrome.downloads.download(options);
            if (downloadId === undefined) throw new Error('Browser menolak download video');
          }
        } catch (error) {
          empty.textContent = error && error.message ? error.message : 'Video gagal diproses.';
          empty.style.display = '';
        } finally {
          download.disabled = false;
          download.textContent = originalText;
        }
      });
      info.append(name, link);
      row.append(info, download);
      list.appendChild(row);
    });
  }

  async function updateVideoDownloaderFrame(videoDownloadOn) {
    const section = document.getElementById('video-sources-section');
    section.style.display = videoDownloadOn ? '' : 'none';
    if (videoDownloadOn) await scanPlayingVideoSources();
  }

  document.getElementById('video-sources-refresh').addEventListener('click', scanPlayingVideoSources);

  function updateElementHiderVisibility(on) {
    document.getElementById('picker-section').style.display = on ? '' : 'none';
    hiddenSection.style.display = on ? '' : 'none';
  }

  const VOLUME_DEFAULT_LEVEL = 100;
  const volumeControlCard = document.getElementById('volume-control-card');
  const volumeControlSlider = document.getElementById('volume-control-slider');
  const volumeControlValue = document.getElementById('volume-control-value');
  const volumeControlReset = document.getElementById('volume-control-reset');

  function clampVolumeLevel(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return VOLUME_DEFAULT_LEVEL;
    return Math.min(500, Math.max(0, Math.round(value)));
  }

  function renderVolumeLevel(level) {
    volumeControlSlider.value = String(level);
    volumeControlValue.textContent = `${level}%`;
    volumeControlCard.classList.toggle('volume-control-card--boost', level > 100);
  }

  function updateVolumeControlVisibility(on) {
    volumeControlCard.style.display = on ? '' : 'none';
  }

  async function persistVolumeLevel(level) {
    await chrome.storage.sync.set({ volumeControlLevel: level });
  }

  volumeControlSlider.addEventListener('input', e => {
    renderVolumeLevel(clampVolumeLevel(Number(e.target.value)));
  });

  volumeControlSlider.addEventListener('change', async e => {
    await persistVolumeLevel(clampVolumeLevel(Number(e.target.value)));
  });

  volumeControlReset.addEventListener('click', async () => {
    renderVolumeLevel(VOLUME_DEFAULT_LEVEL);
    await persistVolumeLevel(VOLUME_DEFAULT_LEVEL);
  });

  const playerModeCard = document.getElementById('player-mode-card');
  const playerModeInputs = Array.from(document.querySelectorAll('input[name="video-player-mode"]'));
  const autoHideCard = document.getElementById('auto-hide-card');
  const autoHideToggle = document.getElementById('auto-hide-toggle');
  const autoHideDelayCard = document.getElementById('auto-hide-delay-card');
  const autoHideDelaySelect = document.getElementById('auto-hide-delay-select');
  let videoPlayerMode = 'custom';

  function updatePlayerModeVisibility(videoControlsOn) {
    playerModeCard.style.display = videoControlsOn ? '' : 'none';
  }

  function updateAutoHideVisibility(videoControlsOn) {
    const showAutoHide = videoControlsOn && videoPlayerMode === 'custom';
    autoHideCard.style.display = showAutoHide ? '' : 'none';
    if (showAutoHide) {
      updateAutoHideDelayVisibility(autoHideToggle.checked);
    } else {
      autoHideDelayCard.style.display = 'none';
    }
  }

  function updateAutoHideDelayVisibility(autoHideOn) {
    autoHideDelayCard.style.display = autoHideOn ? '' : 'none';
  }

  playerModeInputs.forEach(input => input.addEventListener('change', async e => {
    if (!e.target.checked) return;
    videoPlayerMode = e.target.value;
    await chrome.storage.sync.set({ videoPlayerMode });
    updateAutoHideVisibility(document.getElementById('video-controls-toggle').checked);
  }));

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
      const subtitle = document.getElementById('app-subtitle');
      if (subtitle && currentDomain) subtitle.textContent = currentDomain;
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

  function sendTabTitle() {}

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

  const volumeStored = await chrome.storage.sync.get(['volumeControlLevel']);
  renderVolumeLevel(clampVolumeLevel(volumeStored.volumeControlLevel));

  const autoHideResult = await chrome.storage.sync.get(['videoAutoHide', 'videoAutoHideDelay', 'videoPlayerMode']);
  videoPlayerMode = autoHideResult.videoPlayerMode === 'basic' ? 'basic' : 'custom';
  playerModeInputs.forEach(input => { input.checked = input.value === videoPlayerMode; });
  autoHideToggle.checked = autoHideResult.videoAutoHide === true;
  autoHideDelaySelect.value = String(typeof autoHideResult.videoAutoHideDelay === 'number' ? autoHideResult.videoAutoHideDelay : 3);
  const videoControlsOn = document.getElementById('video-controls-toggle').checked;
  updatePlayerModeVisibility(videoControlsOn);
  updateAutoHideVisibility(videoControlsOn);
  updateVolumeControlVisibility(document.getElementById('volume-control-toggle').checked);

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

  // Website Blocker toggle & panel opener
  document.getElementById('website-blocker-panel-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('website-blocker-panel.html') });
  });

});

function toKebab(camel) {
  return camel.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}







