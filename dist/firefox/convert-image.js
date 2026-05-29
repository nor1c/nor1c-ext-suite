chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'save-to-png') return false;

  (async () => {
    try {
      const resp = await fetch(message.srcUrl);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(blobUrl);
          canvas.convertToBlob({ type: 'image/png' }).then(pngBlob => {
            const reader = new FileReader();
            reader.onload = () => sendResponse({ pngDataUrl: reader.result });
            reader.onerror = () => sendResponse({ error: 'read failed' });
            reader.readAsDataURL(pngBlob);
          }).catch(() => sendResponse({ error: 'convert failed' }));
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
