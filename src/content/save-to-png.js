chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'save-to-png-convert') return false;

  (async () => {
    try {
      const resp = await fetch(message.srcUrl);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(blobUrl);
          sendResponse({ pngDataUrl: canvas.toDataURL('image/png') });
        } catch (_) {
          URL.revokeObjectURL(blobUrl);
          sendResponse({ error: 'draw failed' });
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        sendResponse({ error: 'load failed' });
      };
      img.src = blobUrl;
    } catch (_) {
      sendResponse({ error: 'fetch failed' });
    }
  })();

  return true;
});
