let videoDownloadEnabled = true;
let downloaderLoadPromise = null;
const downloaderFrames = new Set();
const playingVideosByTab = new Map();
self.__nor1cVideoDownloadEnabled = true;
self.__nor1cPlayingVideos = playingVideosByTab;
self.__nor1cIsPlayingVideo = (tabId, url) => {
  if (!url || url.startsWith('blob:')) return false;
  const frames = playingVideosByTab.get(tabId);
  if (!frames) return false;
  const playingUrls = new Set(Array.from(frames.values()).flatMap(urls => Array.from(urls)));
  try {
    const candidate = new URL(url);
    candidate.hash = '';
    return playingUrls.has(candidate.href);
  } catch (_) {
    return playingUrls.has(url);
  }
};

const originalWebRequestAddListener = chrome.webRequest && chrome.webRequest.onBeforeRequest && chrome.webRequest.onBeforeRequest.addListener;
if (originalWebRequestAddListener) {
  chrome.webRequest.onBeforeRequest.addListener = function(listener, filter, extraInfoSpec) {
    return originalWebRequestAddListener.call(this, details => {
      if (videoDownloadEnabled) return listener(details);
    }, filter, extraInfoSpec);
  };
}

function ensureVideoDownloaderBackground() {
  if (!videoDownloadEnabled) return Promise.resolve(false);
  if (downloaderLoadPromise) return downloaderLoadPromise;
  downloaderLoadPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(globalThis.__nor1cVideoDownloaderBackgroundLoaded === true);
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('background-video-downloader.js');
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load video downloader background'));
    (document.head || document.documentElement).appendChild(script);
  }).catch(error => {
    downloaderLoadPromise = null;
    console.error('Video downloader background failed to load', error);
    return false;
  });
  return downloaderLoadPromise;
}

const privacyRegistrations = {
  blockLocation: { id: 'nor1c-privacy-location', js: ['content/privacy-location-main.js'] },
  blockNotifications: { id: 'nor1c-privacy-notification', js: ['content/privacy-notification-main.js'] },
  adLinkBypass: { id: 'nor1c-privacy-window-open', js: ['content/privacy-window-open-main.js'] }
};

async function reconcilePrivacyRegistrations(settings) {
  const existing = await chrome.scripting.getRegisteredContentScripts();
  const existingIds = new Set(existing.map(registration => registration.id));
  const add = [];
  const remove = [];

  for (const [key, registration] of Object.entries(privacyRegistrations)) {
    const enabled = settings[key] !== false;
    if (enabled && !existingIds.has(registration.id)) {
      add.push({
        ...registration,
        matches: ['<all_urls>'],
        allFrames: true,
        runAt: 'document_start',
        world: 'MAIN',
        persistAcrossSessions: true
      });
    } else if (!enabled && existingIds.has(registration.id)) {
      remove.push(registration.id);
    }
  }

  if (remove.length > 0) await chrome.scripting.unregisterContentScripts({ ids: remove });
  if (add.length > 0) await chrome.scripting.registerContentScripts(add);
}

chrome.storage.sync.get({
  videoDownload: true,
  blockLocation: true,
  blockNotifications: true,
  adLinkBypass: true
}, result => {
  videoDownloadEnabled = result.videoDownload !== false;
  self.__nor1cVideoDownloadEnabled = videoDownloadEnabled;
  reconcilePrivacyRegistrations(result).catch(error => console.error('Privacy registration failed', error));
});

const badgeCounts = {};

function updateBadge(tabId) {
  const featureCounts = badgeCounts[tabId] || {};
  const count = Object.values(featureCounts).reduce((total, value) => total + value, 0);
  const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: '#3b82f6', tabId }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'badge-count' && sender.tab && sender.tab.id) {
    const tabId = sender.tab.id;
    if (!badgeCounts[tabId]) badgeCounts[tabId] = {};
    badgeCounts[tabId][msg.feature || 'other'] = Math.max(0, msg.count || 0);
    updateBadge(tabId);
  }
  if (msg.type === 'ensure-video-downloader-background') {
    ensureVideoDownloaderBackground().then(loaded => sendResponse({ loaded })).catch(() => sendResponse({ loaded: false }));
    return true;
  }
  if (msg.type === 'load-video-downloader') {
    if (!videoDownloadEnabled || !sender.tab || sender.frameId === undefined) {
      sendResponse({ loaded: false });
      return false;
    }
    const frameKey = sender.tab.id + ':' + sender.frameId;
    if (downloaderFrames.has(frameKey)) {
      sendResponse({ loaded: true });
      return false;
    }
    ensureVideoDownloaderBackground().then(backgroundLoaded => {
      if (!backgroundLoaded) return false;
      return chrome.scripting.executeScript({
        target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
        files: ['content/video-play-reset.js', 'content/video-downloader-inject.js']
      }).then(() => true);
    }).then(loaded => {
      if (loaded) downloaderFrames.add(frameKey);
      sendResponse({ loaded: Boolean(loaded) });
    }).catch(error => {
      console.error('Video downloader content failed to load', error);
      sendResponse({ loaded: false });
    });
    return true;
  }
  if (msg.message && ['add-video-links', 'download', 'get-video-links', 'download-video-link', 'bgXHRrequest'].includes(msg.message)) {
    if (!videoDownloadEnabled) {
      sendResponse(msg.message === 'get-video-links' ? { videoLinks: [], additionalLinks: [] } : { disabled: true });
      return false;
    }
    ensureVideoDownloaderBackground();
  }
  if (msg.type === 'video-playback-state' && sender.tab && sender.tab.id !== undefined) {
    const tabId = sender.tab.id;
    const playing = Array.isArray(msg.playing) ? msg.playing : [];
    const normalized = playing.flatMap(url => {
      if (typeof url !== 'string' || !url || url.startsWith('blob:')) return [];
      try {
        const parsed = new URL(url);
        parsed.hash = '';
        return [parsed.href];
      } catch (_) {
        return [url];
      }
    });
    const frameId = sender.frameId === undefined ? 0 : sender.frameId;
    const frames = playingVideosByTab.get(tabId) || new Map();
    if (normalized.length > 0) frames.set(frameId, new Set(normalized));
    else frames.delete(frameId);
    if (frames.size > 0) playingVideosByTab.set(tabId, frames);
    else playingVideosByTab.delete(tabId);
    chrome.runtime.sendMessage({ action: 'video-added' }).catch(() => {});
  }
  if (msg.type === 'get-playing-videos') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      const tabId = tabs && tabs[0] && tabs[0].id;
      const frames = tabId === undefined ? null : playingVideosByTab.get(tabId);
      const playing = frames ? Array.from(frames.values()).flatMap(urls => Array.from(urls)) : [];
      sendResponse({ playing: Array.from(new Set(playing)) });
    }).catch(() => sendResponse({ playing: [] }));
    return true;
  }
});

function clearDownloaderFrames(tabId) {
  const prefix = tabId + ':';
  for (const frameKey of downloaderFrames) {
    if (frameKey.startsWith(prefix)) downloaderFrames.delete(frameKey);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  delete badgeCounts[tabId];
  playingVideosByTab.delete(tabId);
  clearDownloaderFrames(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' || changeInfo.url) {
    badgeCounts[tabId] = {};
    playingVideosByTab.delete(tabId);
    clearDownloaderFrames(tabId);
    updateBadge(tabId);
  }
});

chrome.webNavigation.onCommitted.addListener(details => {
  downloaderFrames.delete(details.tabId + ':' + details.frameId);
  const frames = playingVideosByTab.get(details.tabId);
  if (!frames) return;
  frames.delete(details.frameId);
  if (frames.size === 0) playingVideosByTab.delete(details.tabId);
});

let menusSetup = false;
async function ensureMenus() {
  if (menusSetup) return;
  menusSetup = true;
  try { await chrome.contextMenus.removeAll(); } catch (_) {}
  chrome.contextMenus.create({ id: 'copy-link-text', title: 'Copy Link Text', contexts: ['link'] });
  chrome.contextMenus.create({ id: 'open-image-viewer', title: 'Open in Image Viewer', contexts: ['image'] });
  chrome.contextMenus.create({ id: 'save-to-png', title: 'Save to PNG', contexts: ['image'] });
}
ensureMenus();

chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    classBlocker: false,
    blockedSelectors: '',
    imageBlocker: false,
    gifBlocker: false,
    videoControls: false,
    videoDownload: true,
    smoothScroll: true,
    adLinkBypass: true,
    urlCleaner: true,
    videoControlsEnabledSites: [],
    hiddenRules: {},
    elementHider: true,
    blockNotifications: true,
    blockLocation: true,
    quickTabSwitcher: true,
    cookieConsent: true,
    disableAnimations: false,
    videoAutoHide: false,
    videoAutoHideDelay: 3,
    websiteBlockerRules: [],
    websiteBlockerSchedule: { start: '09:00', end: '17:00' }
  };
  const stored = await chrome.storage.sync.get(Object.keys(defaults));
  const missing = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (stored[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length > 0) await chrome.storage.sync.set(missing);
  ensureMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'copy-link-text') {
    chrome.tabs.sendMessage(tab.id, { type: 'copy-link-text', text: info.linkText }).catch(() => {});
  } else if (info.menuItemId === 'open-image-viewer') {
    chrome.tabs.sendMessage(tab.id, { type: 'open-image-viewer', srcUrl: info.srcUrl }).catch(() => {});
  } else if (info.menuItemId === 'save-to-png') {
    saveImageAsPng(info.srcUrl, tab).catch(() => {});
  }
});

let _adBypassEnabled = null;
chrome.storage.sync.get(['adLinkBypass'], r => { _adBypassEnabled = (r && r.adLinkBypass) !== false; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.adLinkBypass) _adBypassEnabled = changes.adLinkBypass.newValue !== false;
  if (area === 'sync' && changes.quickTabSwitcher) _quickTabSwitcherEnabled = changes.quickTabSwitcher.newValue !== false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (_adBypassEnabled === false) return;
  if (changeInfo.title && /domain blocked/i.test(changeInfo.title)) {
    chrome.tabs.remove(tabId).catch(() => {});
  }
});

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('convert-image.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  if (existingContexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: ['DOM_PARSER'],
    justification: 'Convert images to PNG using canvas'
  });
  await new Promise(r => setTimeout(r, 100));
}

async function saveImageAsPng(srcUrl, tab) {
  if (!srcUrl) return;

  function getFilename(url) {
    try {
      const pathname = new URL(url).pathname;
      const name = pathname.split('/').pop() || '';
      const base = name.replace(/\.[^.]+$/, '');
      return (base || 'image') + '.png';
    } catch (_) {
      return 'image.png';
    }
  }

  const filename = getFilename(srcUrl);
  let pngDataUrl;

  if (chrome.offscreen) {
    await ensureOffscreenDocument();
    pngDataUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 30000);
      chrome.runtime.sendMessage({
        type: 'save-to-png',
        srcUrl
      }).then(response => {
        clearTimeout(timeout);
        if (response && response.pngDataUrl) resolve(response.pngDataUrl);
        else reject(new Error('no response'));
      }).catch(reject);
    });
  } else {
    pngDataUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 30000);
      chrome.tabs.sendMessage(tab.id, {
        type: 'save-to-png-convert',
        srcUrl
      }).then(response => {
        clearTimeout(timeout);
        if (response && response.pngDataUrl) resolve(response.pngDataUrl);
        else reject(new Error('no response'));
      }).catch(reject);
    });
  }

  if (!pngDataUrl) return;
  chrome.downloads.download({ url: pngDataUrl, filename });
}

// ── Website Blocker ──
let websiteBlockerRules = [];
let websiteBlockerSchedule = { start: '09:00', end: '17:00' };
let websiteBlockerBlockedUrl = '';

// Derive blocked.html url once the extension id is known
function getBlockedUrl() {
  if (!websiteBlockerBlockedUrl) {
    websiteBlockerBlockedUrl = chrome.runtime.getURL('blocked.html');
  }
  return websiteBlockerBlockedUrl;
}

function isInBlockedRange(schedule) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = schedule.start.split(':').map(Number);
  const [endH, endM] = schedule.end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range (e.g. 22:00 - 06:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

function getMatchingRule(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch (_) {
    return null;
  }

  // Simple domain extraction: strip www prefix
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const domain = host;
  const domainLower = domain.toLowerCase();

  return websiteBlockerRules.find(rule => {
    if (!rule.enabled) return false;
    if (domainLower !== rule.domain) {
      // Also check if domain is a subdomain of rule.domain
      if (!domainLower.endsWith('.' + rule.domain)) return false;
      // But don't match on e.g. "notfacebook.com" for "facebook.com"
      if (domainLower.length > rule.domain.length + 1 && domainLower[domainLower.length - rule.domain.length - 1] !== '.') return false;
    }
    return isInBlockedRange(websiteBlockerSchedule);
  }) || null;
}

chrome.webNavigation.onBeforeNavigate.addListener(details => {
  if (details.frameId !== 0) return; // Only top-level frames
  if (!details.url) return;

  const blockedUrl = getBlockedUrl();
  if (details.url.startsWith(blockedUrl)) return; // Don't block the blocked page itself

  const rule = getMatchingRule(details.url);
  if (!rule) return;

  const params = new URLSearchParams();
  params.set('domain', rule.domain);
  params.set('start', websiteBlockerSchedule.start);
  params.set('end', websiteBlockerSchedule.end);

  chrome.tabs.update(details.tabId, { url: blockedUrl + '?' + params.toString() }).catch(() => {});
});

chrome.storage.sync.get(['websiteBlockerRules', 'websiteBlockerSchedule'], result => {
  websiteBlockerRules = result.websiteBlockerRules || [];
  websiteBlockerSchedule = result.websiteBlockerSchedule || websiteBlockerSchedule;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.websiteBlockerRules) websiteBlockerRules = changes.websiteBlockerRules.newValue || [];
  if (changes.websiteBlockerSchedule) {
    websiteBlockerSchedule = changes.websiteBlockerSchedule.newValue || { start: '09:00', end: '17:00' };
  }
});
// ── End Website Blocker ──

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;

  if (changes.videoDownload) {
    videoDownloadEnabled = changes.videoDownload.newValue !== false;
    self.__nor1cVideoDownloadEnabled = videoDownloadEnabled;
  }
  if (changes.blockLocation || changes.blockNotifications || changes.adLinkBypass) {
    const privacySettings = await chrome.storage.sync.get({
      blockLocation: true,
      blockNotifications: true,
      adLinkBypass: true
    });
    await reconcilePrivacyRegistrations(privacySettings);
  }
  if ((changes.imageBlocker && changes.imageBlocker.newValue === false) || (changes.gifBlocker && changes.gifBlocker.newValue === false)) {
    for (const tabId of Object.keys(badgeCounts)) {
      if (!badgeCounts[tabId]) badgeCounts[tabId] = {};
      if (changes.imageBlocker && changes.imageBlocker.newValue === false) delete badgeCounts[tabId].image;
      if (changes.gifBlocker && changes.gifBlocker.newValue === false) delete badgeCounts[tabId].gif;
      updateBadge(Number(tabId));
    }
  }
  const toggleKeys = ['classBlocker', 'blockedSelectors', 'imageBlocker', 'gifBlocker', 'videoControls', 'videoControlsEnabledSites', 'videoAutoHide', 'videoAutoHideDelay', 'videoDownload', 'smoothScroll', 'adLinkBypass', 'hiddenRules', 'elementHider', 'cookieConsent', 'disableAnimations'];
  const changedKeys = Object.keys(changes).filter(key => toggleKeys.includes(key));
  if (changedKeys.length === 0) return;

  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  const changedValues = Object.fromEntries(changedKeys.map(key => [key, changes[key].newValue]));
  for (const tab of tabs) {
    if (!tab.id) continue;
    chrome.tabs.sendMessage(tab.id, {
      type: 'toggle-changed',
      changes: changedValues
    }).catch(() => {});
  }
});

let _quickTabSwitcherEnabled = null;
chrome.storage.sync.get(['quickTabSwitcher'], function(r) {
  _quickTabSwitcherEnabled = r.quickTabSwitcher !== false;
});
async function openTabSwitcher() {
  if (_quickTabSwitcherEnabled === false) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'open-tab-switcher-overlay' }).catch(() => {
      chrome.windows.create({
        url: 'tab-switcher.html',
        type: 'popup',
        width: 500,
        height: 400,
        focused: true
      });
    });
  } else {
    chrome.windows.create({
      url: 'tab-switcher.html',
      type: 'popup',
      width: 500,
      height: 400,
      focused: true
    });
  }
}

chrome.commands.onCommand.addListener(async function(command) {
  if (command !== 'switch-tab') return;
  await openTabSwitcher();
});


