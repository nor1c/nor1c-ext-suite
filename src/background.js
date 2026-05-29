try { importScripts('background-video-downloader.js'); } catch (_) {}

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
    imageBlocker: false,
    gifBlocker: false,
    videoControls: false,
    videoDownload: false,
    adLinkBypass: true,
    videoControlsExcluded: [],
    hiddenRules: {},
    elementHider: true
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

// Auto-close tabs blocked by Brave ad blocker
let _adBypassEnabled = true;
chrome.storage.sync.get(['adLinkBypass'], r => { _adBypassEnabled = (r && r.adLinkBypass) !== false; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.adLinkBypass) _adBypassEnabled = changes.adLinkBypass.newValue !== false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!_adBypassEnabled) return;
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

  const toggleKeys = ['imageBlocker', 'gifBlocker', 'videoControls', 'videoControlsExcluded', 'adLinkBypass', 'hiddenRules', 'elementHider'];
  const changedKey = Object.keys(changes).find(k => toggleKeys.includes(k));
  if (!changedKey) return;

  // Only query http/https tabs — skip chrome://, edge://, about:, etc.
  // These can't receive content script messages anyway.
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
