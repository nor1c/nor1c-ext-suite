try { importScripts('background-video-downloader.js'); } catch (_) {}

let menusSetup = false;
async function ensureMenus() {
  if (menusSetup) return;
  menusSetup = true;
  try { await chrome.contextMenus.removeAll(); } catch (_) {}
  chrome.contextMenus.create({ id: 'copy-link-text', title: 'Copy Link Text', contexts: ['link'] });
  chrome.contextMenus.create({ id: 'open-image-viewer', title: 'Open in Image Viewer', contexts: ['image'] });
}
ensureMenus();

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    imageBlocker: false,
    gifBlocker: false,
    videoControls: false,
    videoDownload: false,
    adLinkBypass: true,
    videoControlsExcluded: []
  });

  ensureMenus();
});


chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'copy-link-text') {
    chrome.tabs.sendMessage(tab.id, { type: 'copy-link-text', text: info.linkText }).catch(() => {});
  } else if (info.menuItemId === 'open-image-viewer') {
    chrome.tabs.sendMessage(tab.id, { type: 'open-image-viewer', srcUrl: info.srcUrl }).catch(() => {});
  }
});

// Auto-close tabs blocked by Brave ad blocker
let _adBypassEnabled = true;
chrome.storage.sync.get(['adLinkBypass'], r => { _adBypassEnabled = r.adLinkBypass !== false; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.adLinkBypass) _adBypassEnabled = changes.adLinkBypass.newValue !== false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!_adBypassEnabled) return;
  if (changeInfo.title && /domain blocked/i.test(changeInfo.title)) {
    chrome.tabs.remove(tabId).catch(() => {});
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;

  const toggleKeys = ['imageBlocker', 'gifBlocker', 'videoControls', 'videoControlsExcluded', 'adLinkBypass'];
  const changedKey = Object.keys(changes).find(k => toggleKeys.includes(k));
  if (!changedKey) return;

  const tabs = await chrome.tabs.query({});
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
