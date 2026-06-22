try { importScripts('background-video-downloader.js'); } catch (_) {}

const badgeCounts = {};

function updateBadge(tabId) {
  const count = badgeCounts[tabId] || 0;
  const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: '#3b82f6', tabId }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'badge-count' && sender.tab && sender.tab.id) {
    const tabId = sender.tab.id;
    badgeCounts[tabId] = (badgeCounts[tabId] || 0) + (msg.count || 1);
    updateBadge(tabId);
  }
  if (msg.type === 'get-playing-videos') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs[0] || !tabs[0].id) {
        sendResponse({ playing: [] });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { type: 'get-playing-videos' }, function (response) {
        sendResponse(response || { playing: [] });
      });
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete badgeCounts[tabId];
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

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
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
    quickTabSwitcher: true,
    cookieConsent: true,
    disableAnimations: false,
    videoAutoHide: false,
    videoAutoHideDelay: 3
  });

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

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;

  const toggleKeys = ['classBlocker', 'blockedSelectors', 'imageBlocker', 'gifBlocker', 'videoControls', 'videoControlsEnabledSites', 'videoAutoHide', 'videoAutoHideDelay', 'smoothScroll', 'adLinkBypass', 'hiddenRules', 'elementHider', 'cookieConsent', 'disableAnimations'];
  const changedKey = Object.keys(changes).find(k => toggleKeys.includes(k));
  if (!changedKey) return;

  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      chrome.tabs.sendMessage(tab.id, {
        type: 'toggle-changed',
        key: changedKey,
        value: changes[changedKey].newValue
      }).catch(() => {});
    } catch (_) {}
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


