(function () {
  let active = false;
  let observer = null;
  const processedVideos = new WeakSet();
  const BUTTON_CLASS = 'nor1c-video-download-btn';

  const styleEl = document.createElement('style');
  styleEl.textContent =
    `video:hover + .${BUTTON_CLASS}, .${BUTTON_CLASS}:hover { opacity: 1 !important; }`;
  document.documentElement.appendChild(styleEl);

  function createButton(video) {
    const btn = document.createElement('button');
    btn.className = BUTTON_CLASS;
    btn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    btn.title = 'Download Video';
    btn.style.cssText = `
      position: absolute; top: 8px; right: 8px; z-index: 2147483646;
      width: 36px; height: 36px; border: none; border-radius: 8px;
      background: rgba(0,0,0,0.65); cursor: pointer; display: flex;
      align-items: center; justify-content: center; transition: background 0.15s, opacity 0.15s;
      opacity: 0; padding: 0;
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      downloadVideo(video);
    });

    return btn;
  }

  function getVideoSrc(video) {
    if (video.src && video.src.startsWith('http')) return video.src;
    if (video.currentSrc && video.currentSrc.startsWith('http')) return video.currentSrc;

    const sources = video.querySelectorAll('source');
    for (const s of sources) {
      if (s.src && s.src.startsWith('http')) return s.src;
    }

    if (video.src && video.src.startsWith('blob:')) return video.src;

    return null;
  }

  async function downloadVideo(video) {
    const src = getVideoSrc(video);
    if (!src) return;

    const title = document.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
    const now = new Date();
    const ts =
      now.getFullYear() +
      '-' +
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getDate()).padStart(2, '0') +
      '_' +
      String(now.getHours()).padStart(2, '0') +
      '-' +
      String(now.getMinutes()).padStart(2, '0') +
      '-' +
      String(now.getSeconds()).padStart(2, '0');
    const ext = '.mp4';

    if (src.startsWith('blob:')) {
      try {
        showToast('Downloading...');
        const resp = await fetch(src);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        chrome.runtime.sendMessage({
          type: 'download',
          url: url,
          filename: `${title}_${ts}${ext}`
        });
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (_) {
        showToast('Failed to download blob video');
      }
    } else {
      chrome.runtime.sendMessage({
        type: 'download',
        url: src,
        filename: `${title}_${ts}${ext}`
      });
      showToast('Download started');
    }
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
      border-radius: 8px; font-family: 'Inter', sans-serif; font-size: 13px;
      font-weight: 500; z-index: 2147483647; pointer-events: none;
      animation: nor1c-fadeIn 0.2s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  function attachButton(video) {
    if (processedVideos.has(video)) return;
    processedVideos.add(video);

    const parent = video.parentElement;
    if (!parent) return;

    const cs = getComputedStyle(parent);
    if (cs.position === 'static') {
      parent.style.position = 'relative';
    }

    const btn = createButton(video);
    video.insertAdjacentElement('afterend', btn);
  }

  function processAll() {
    document.querySelectorAll('video').forEach(attachButton);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'VIDEO') attachButton(node);
          if (node.querySelectorAll) {
            node.querySelectorAll('video').forEach(attachButton);
          }
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function init() {
    chrome.storage.sync.get(['videoDownload'], (result) => {
      active = result.videoDownload !== undefined ? result.videoDownload : false;
      if (active) {
        processAll();
        startObserver();
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.videoDownload) return;
      active = changes.videoDownload.newValue;
      if (active) {
        processAll();
        startObserver();
      } else {
        stopObserver();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'download-video' && msg.url && msg.filename) {
      const a = document.createElement('a');
      a.href = msg.url;
      a.download = msg.filename;
      a.click();
      sendResponse(true);
    }
  });
})();
