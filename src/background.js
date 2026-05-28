chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    imageBlocker: false,
    gifBlocker: false,
    videoControls: false,
    videoDownload: false,
    videoControlsExcluded: []
  });

  chrome.contextMenus.create({
    id: 'copy-link-text',
    title: 'Copy Link Text',
    contexts: ['link']
  });

  chrome.contextMenus.create({
    id: 'open-image-viewer',
    title: 'Open in Image Viewer',
    contexts: ['image']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'copy-link-text' && info.linkUrl) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (linkUrl) => {
          const links = document.querySelectorAll('a');
          for (const link of links) {
            if (link.href === linkUrl) {
              const text = link.textContent || link.innerText || '';
              navigator.clipboard.writeText(text.trim());
              break;
            }
          }
        },
        args: [info.linkUrl]
      });
    } catch (_) {}
  }

  if (info.menuItemId === 'open-image-viewer' && info.srcUrl) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (srcUrl) => {
          document.dispatchEvent(new CustomEvent('nor1c:open-image-viewer', {
            detail: { srcUrl, x: 0, y: 0 }
          }));
        },
        args: [info.srcUrl]
      });
    } catch (_) {}
    return;
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'download' && msg.url && msg.filename) {
    chrome.downloads.download({
      url: msg.url,
      filename: 'Nor1c/' + msg.filename,
      saveAs: false
    }).catch(() => {});
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;

  const toggleKeys = ['imageBlocker', 'gifBlocker', 'videoControls', 'videoDownload', 'videoControlsExcluded'];
  const changedKey = Object.keys(changes).find((k) => toggleKeys.includes(k));
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
