(function() {

var ytPanelOverlay = null

function showPanel() {
  if (ytPanelOverlay) {
    ytPanelOverlay.style.display = ""
    return
  }

  var root = document.createElement("div")
  root.id = "nor1c-yt-panel-overlay"
  root.setAttribute("role", "dialog")
  root.setAttribute("aria-modal", "true")
  root.setAttribute("aria-label", "YouTube Control Panel")
  root.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;display:flex;align-items:center;justify-content:center;"

  var backdrop = document.createElement("div")
  backdrop.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);"
  backdrop.addEventListener("click", hidePanel)

  var panel = document.createElement("div")
  panel.style.cssText = "position:relative;width:50vw;height:80vh;min-width:min(600px, 90vw);min-height:min(400px, 80vh);background:#fff;border-radius:14px;box-shadow:0 12px 60px rgba(0,0,0,0.15);overflow:hidden;display:flex;flex-direction:row;"

  var iframe = document.createElement("iframe")
  iframe.src = chrome.runtime.getURL("youtube-control-panel.html")
  iframe.style.cssText = "flex:1;width:0;height:100%;border:none;display:block;"

  panel.appendChild(iframe)
  root.appendChild(backdrop)
  root.appendChild(panel)
  document.body.appendChild(root)

  ytPanelOverlay = root
}

function hidePanel() {
  if (ytPanelOverlay) {
    ytPanelOverlay.style.display = "none"
  }
}

function togglePanel() {
  if (ytPanelOverlay && ytPanelOverlay.style.display !== "none") {
    hidePanel()
  } else {
    showPanel()
  }
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === "toggle-yt-panel") {
    if (!document.body) {
      sendResponse({ visible: false })
      return false
    }
    togglePanel()
    sendResponse({ visible: !!(ytPanelOverlay && ytPanelOverlay.style.display !== "none") })
    return false
  }
})

})()


