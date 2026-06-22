(function() {

var STORAGE_KEY = "ytControlPanel"

var defaultConfig = {
  enabled: true,
  debug: false,
  alwaysShowShortsProgressBar: true,
  blockAds: true,
  disableAmbientMode: true,
  disableAutoplay: true,
  disableHomeFeed: false,
  disableStableVolume: false,
  disableThemedHover: true,
  disableVideoPreviews: false,
  enforceTheme: "default",
  hideAI: true,
  hideAskButton: false,
  hideAutoDubbed: false,
  hideChannelBanner: false,
  hideChannelWatermark: true,
  hideChannels: true,
  hideCollaborations: true,
  hideComments: false,
  hideEndCards: true,
  hideEndVideos: true,
  hideExperiencingInterruptions: false,
  hideExploreButton: true,
  hideHiddenVideos: true,
  hideHomeCategories: false,
  hideHomePosts: true,
  hideInfoPanels: true,
  hideJumpAheadButton: false,
  hideLive: false,
  hideLowViews: true,
  hideMembersOnly: true,
  hideMetadata: true,
  hideMixes: true,
  hideMoviesAndTV: false,
  hideMusic: true,
  hideNextButton: true,
  hidePlaylists: false,
  hidePremiumUpsells: true,
  hideRelated: true,
  hideRelatedBelow: true,
  hideShareThanksClip: false,
  hideShorts: true,
  hideShortsMusicLink: true,
  hideShortsRelatedLink: true,
  hideShortsSuggestedActions: true,
  hideShortsMetadataUntilHover: true,
  hideShortsRemixButton: true,
  hideSidebarSubscriptions: false,
  hideSponsored: true,
  hideStreamed: true,
  hideSuggestedSections: true,
  hideSubscriptionsChannelList: true,
  hideSubscriptionsLatestBar: true,
  hideUpcoming: true,
  hideVoiceSearch: true,
  hideWatched: true,
  hideWatchedThreshold: "85",
  minimumGridItemsPerRow: "+1",
  minimumShortsPerRow: "8",
  playerControlsBg: "default",
  playerFixFullScreenButton: true,
  playerHideFullScreenControls: false,
  playerHideFullScreenMoreVideos: true,
  playerHideFullScreenTitle: true,
  playerHideFullScreenVoting: true,
  redirectShorts: true,
  removePink: true,
  restoreMiniplayerButton: true,
  restoreSidebarSubscriptionsLink: true,
  revertGiantRelated: true,
  revertSidebarOrder: true,
  searchThumbnailSize: "xsmall",
  showFullVideoTitles: false,
  stopShortsLooping: true,
  useSquareCorners: false,
  alwaysUseOriginalAudio: true,
  alwaysUseTheaterMode: false,
  fullSizeTheaterMode: false,
  fullSizeTheaterModeHideHeader: true,
  fullWidthChannelPage: false,
  hideChat: false,
  hideChatFullScreen: false,
  fixGhostCards: true,
  tidyGuideSidebar: true,
  displaySubscriptionsGridAsList: false,
  displayHomeGridAsList: false,
  pauseChannelTrailers: true,
  allowBackgroundPlay: true,
  hideEmbedShareButton: true,
  hideEmbedPauseOverlay: true,
  mobileGridView: true,
}

function loadConfig() {
  chrome.storage.sync.get([STORAGE_KEY], function(result) {
    var cfg = result[STORAGE_KEY] || {}
    cfg = Object.assign({}, defaultConfig, cfg)
    var els = document.querySelectorAll("input, select")
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      if (!el.name || !cfg.hasOwnProperty(el.name)) continue
      if (el.type === "checkbox") { el.checked = !!cfg[el.name] }
      else { el.value = cfg[el.name] }
    }
    updateRanges()
  })
}

function saveConfig() {
  var cfg = {}
  var els = document.querySelectorAll("input, select")
  for (var i = 0; i < els.length; i++) {
    var el = els[i]
    if (!el.name) continue
    if (el.type === "checkbox") { cfg[el.name] = el.checked }
    else { cfg[el.name] = el.value }
  }
  var data = {}
  data[STORAGE_KEY] = cfg
  chrome.storage.sync.set(data)
  window.parent.postMessage({ type: "yt-panel-config", config: cfg }, chrome.runtime.getURL(""))
}

function resetConfig() {
  var els = document.querySelectorAll("input, select")
  for (var i = 0; i < els.length; i++) {
    var el = els[i]
    if (!el.name || !defaultConfig.hasOwnProperty(el.name)) continue
    if (el.type === "checkbox") { el.checked = !!defaultConfig[el.name] }
    else { el.value = defaultConfig[el.name] }
  }
  var data = {}
  data[STORAGE_KEY] = defaultConfig
  chrome.storage.sync.set(data)
  window.parent.postMessage({ type: "yt-panel-config", config: defaultConfig }, chrome.runtime.getURL(""))
  updateRanges()
}

function updateRanges() {
  var wt = document.querySelector('input[name="hideWatchedThreshold"]')
  var wv = document.getElementById("watchedThresholdVal")
  if (wt && wv) wv.textContent = wt.value + "%"
  var sp = document.querySelector('input[name="minimumShortsPerRow"]')
  var sv = document.getElementById("shortsPerRowVal")
  if (sp && sv) sv.textContent = sp.value
}

function switchTab(name) {
  document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active") })
  var panel = document.getElementById("tab-" + name)
  if (panel) panel.classList.add("active")
  document.querySelectorAll(".nav-item").forEach(function(n) { n.classList.remove("active") })
  var btn = document.querySelector('.nav-item[data-tab="' + name + '"]')
  if (btn) btn.classList.add("active")
}

document.addEventListener("DOMContentLoaded", function() {
  loadConfig()

  document.querySelectorAll(".nav-item").forEach(function(btn) {
    btn.addEventListener("click", function() {
      switchTab(this.getAttribute("data-tab"))
    })
  })

  var saveTimer = null
  document.querySelector("form").addEventListener("change", function(e) {
    if (e.target.type === "range") updateRanges()
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveConfig, 300)
  })

  document.getElementById("resetBtn").addEventListener("click", function() {
    if (confirm("Reset all settings to defaults?")) resetConfig()
  })

  var rangeInputs = document.querySelectorAll('input[type="range"]')
  for (var k = 0; k < rangeInputs.length; k++) {
    rangeInputs[k].addEventListener("input", updateRanges)
  }

  var searchInput = document.getElementById("settings-search")
  if (searchInput) {
    searchInput.addEventListener("input", function() {
      var query = this.value.trim().toLowerCase()
      var rows = document.querySelectorAll(".row")
      var panels = document.querySelectorAll(".tab-panel")
      if (!query) {
        rows.forEach(function(r) { r.classList.remove("search-hidden") })
        panels.forEach(function(p) { p.style.display = "" })
        return
      }
      var tabsWithMatches = new Set()
      rows.forEach(function(row) {
        var title = row.querySelector(".row-title")
        if (!title) return
        var match = title.textContent.toLowerCase().indexOf(query) !== -1
        row.classList.toggle("search-hidden", !match)
        if (match) {
          var panel = row.closest(".tab-panel")
          if (panel) tabsWithMatches.add(panel.id)
        }
      })
      panels.forEach(function(p) {
        p.style.display = tabsWithMatches.has(p.id) ? "" : "none"
      })
      if (tabsWithMatches.size === 1) {
        var tabId = tabsWithMatches.values().next().value.replace("tab-", "")
        switchTab(tabId)
      }
    })
  }
})

})()
