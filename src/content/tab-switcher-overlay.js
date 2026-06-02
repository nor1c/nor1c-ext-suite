(function () {
  let overlayRoot = null;

  function createOverlay() {
    if (overlayRoot) return;

    overlayRoot = document.createElement("div");
    overlayRoot.id = "nor1c-tab-switcher-overlay";
    overlayRoot.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;display:flex;align-items:center;justify-content:center;";

    const backdrop = document.createElement("div");
    backdrop.id = "nor1c-tab-switcher-backdrop";
    backdrop.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.35);";
    backdrop.addEventListener("click", destroyOverlay);

    const panel = document.createElement("div");
    panel.style.cssText = "position:relative;width:560px;max-height:80vh;background:#ffffff;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.2);overflow:hidden;";

    const iframe = document.createElement("iframe");
    iframe.src = chrome.runtime.getURL("tab-switcher.html");
    iframe.style.cssText = "width:100%;height:500px;border:none;";

    panel.appendChild(iframe);
    overlayRoot.appendChild(backdrop);
    overlayRoot.appendChild(panel);
    document.body.appendChild(overlayRoot);

    iframe.addEventListener("load", () => {
      iframe.contentWindow.postMessage({ type: 'focus-input' }, '*');
      iframe.contentWindow.addEventListener("keydown", (e) => {
        if (e.key === "Escape") destroyOverlay();
      });
    });
  }

  function destroyOverlay() {
    if (overlayRoot) {
      overlayRoot.remove();
      overlayRoot = null;
    }
  }

  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "close-tab-switcher") {
      destroyOverlay();
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "open-tab-switcher-overlay") {
      createOverlay();
      sendResponse({ ok: true });
      return true;
    }
  });
})();
