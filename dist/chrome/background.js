try { importScripts('background-video-downloader.js'); } catch (_) {}

let menusSetup = false;
async function ensureMenus() {
  if (menusSetup) return;
  menusSetup = true;
  try { await chrome.contextMenus.removeAll(); } catch (_) {}
  chrome.contextMenus.create({ id: 'copy-link-text', title: 'Copy Link Text', contexts: ['link'] });
  chrome.contextMenus.create({ id: 'open-image-viewer', title: 'Open in Image Viewer', contexts: ['image'] });
  chrome.contextMenus.create({ id: 'save-to-png', title: 'Save to PNG', contexts: ['image'] });
  chrome.contextMenus.create({ id: 'screenshot-fullpage', title: 'Screenshot Full Page', contexts: ['page', 'selection', 'link', 'image', 'video', 'audio'] });
}
ensureMenus();

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    classBlocker: false,
    blockedSelectors: '',
    imageBlocker: false,
    gifBlocker: false,
    videoControls: false,
    videoDownload: false,
    smoothScroll: false,
    adLinkBypass: true,
    urlCleaner: true,
    videoControlsExcluded: [],
    hiddenRules: {},
    elementHider: true,
    blockNotifications: true,
    quickTabSwitcher: true
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
  } else if (info.menuItemId === 'screenshot-fullpage') {
    captureFullPage(tab).catch(() => {});
  }
});

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

  const toggleKeys = ['classBlocker', 'blockedSelectors', 'imageBlocker', 'gifBlocker', 'videoControls', 'videoControlsExcluded', 'smoothScroll', 'adLinkBypass', 'hiddenRules', 'elementHider'];
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

let _quickTabSwitcherEnabled = true;
chrome.storage.sync.get(['quickTabSwitcher'], function(r) {
  _quickTabSwitcherEnabled = r.quickTabSwitcher !== false;
});
async function openTabSwitcher() {
  if (!_quickTabSwitcherEnabled) return;

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

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'trigger-screenshot-fullpage') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs[0]) {
        captureFullPage(tabs[0]).then(function() { sendResponse({ ok: true }); }).catch(function(err) { sendResponse({ ok: false, error: err.message }); });
      } else {
        sendResponse({ ok: false, error: 'No active tab' });
      }
    });
    return true;
  }
});

async function captureFullPage(tab) {
  if (!tab || !tab.id) return;

  const hostname = (function() {
    try { return new URL(tab.url).hostname.replace(/[^a-zA-Z0-9.-]/g, '_'); }
    catch (_) { return 'page'; }
  })();
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const filename = 'screenshot-' + hostname + '-' + timestamp + '.png';

  let pngDataUrl;
  if (chrome.debugger && typeof chrome.debugger.attach === 'function') {
    pngDataUrl = await captureFullPageChrome(tab);
  } else {
    pngDataUrl = await captureFullPageScroll(tab);
  }

  if (!pngDataUrl) return;
  chrome.downloads.download({ url: pngDataUrl, filename });
}

async function captureFullPageChrome(tab) {
  const debuggee = { tabId: tab.id };
  await chrome.debugger.attach(debuggee, '1.3');
  try {
    const result = await chrome.debugger.sendCommand(debuggee, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true
    });
    return 'data:image/png;base64,' + result.data;
  } catch (err) {
    return null;
  } finally {
    await chrome.debugger.detach(debuggee).catch(function() {});
  }
}

async function captureFullPageScroll(tab) {
  const [dimResult] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function() {
      return {
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        scrollY: window.scrollY
      };
    }
  });

  if (!dimResult || !dimResult.result) return null;

  const dims = dimResult.result;
  const vpHeight = dims.innerHeight;
  const totalHeight = dims.scrollHeight;
  const vpWidth = dims.scrollWidth || dims.innerWidth;
  const origScrollY = dims.scrollY;
  const steps = Math.ceil(totalHeight / vpHeight);

  const slices = [];
  for (let i = 0; i < steps; i++) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function(y) { window.scrollTo(0, y); },
      args: [i * vpHeight]
    });
    await new Promise(function(r) { setTimeout(r, 250); });
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    slices.push(dataUrl);
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function(y) { window.scrollTo(0, y); },
    args: [origScrollY]
  });

  return stitchSlices(slices, vpWidth, totalHeight, vpHeight);
}

async function stitchSlices(slices, width, height, sliceHeight) {
  const hasDOM = typeof window !== 'undefined' && window.document;

  if (hasDOM) {
    const canvas = window.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < slices.length; i++) {
      const img = await loadImage(slices[i]);
      const h = Math.min(sliceHeight, height - i * sliceHeight);
      ctx.drawImage(img, 0, i * sliceHeight, width, h);
    }
    return canvas.toDataURL('image/png');
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < slices.length; i++) {
      const response = await fetch(slices[i]);
      const blob = await response.blob();
      const img = await createImageBitmap(blob);
      const h = Math.min(sliceHeight, height - i * sliceHeight);
      ctx.drawImage(img, 0, i * sliceHeight, width, h, 0, 0, width, h);
      img.close();
    }
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Promise(function(resolve) {
      const reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.readAsDataURL(blob);
    });
  }

  if (chrome.offscreen) {
    await ensureOffscreenDocument();
    return new Promise(function(resolve, reject) {
      const timeout = setTimeout(function() { reject(new Error('timeout')); }, 60000);
      chrome.runtime.sendMessage({
        type: 'stitch-screenshots',
        slices: slices,
        width: width,
        height: height,
        sliceHeight: sliceHeight
      }).then(function(response) {
        clearTimeout(timeout);
        if (response && response.dataUrl) resolve(response.dataUrl);
        else reject(new Error('no response'));
      }).catch(reject);
    });
  }

  return null;
}

function loadImage(src) {
  return new Promise(function(resolve, reject) {
    const img = new window.Image();
    img.onload = function() { resolve(img); };
    img.onerror = reject;
    img.src = src;
  });
}
