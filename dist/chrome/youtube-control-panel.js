(function() {

var STORAGE_KEY = "ytControlPanel"

var defaultConfig = {
  enabled: true,
  hideShorts: false,
  hideWatched: true,
  hideMusic: true,
  hideWatchedThreshold: "85",
  hideLowViews: false,
  hideLive: true,
  hideUpcoming: true,
  hideStreamed: true,
  hideMixes: true,
  hidePlaylists: false,
  hideMoviesAndTV: false,
  hideChannels: true,
  hideAI: true,
  hideVoiceSearch: true,
  hideComments: false,
  hideChat: false,
  hideChatFullScreen: false,
  hideRelated: false,
  hideRelatedBelow: true,
  hideEndCards: true,
  hideEndVideos: true,
  hideInfoPanels: true,
  hideMetadata: true,
  hideChannelBanner: false,
  hideChannelWatermark: true,
  hidePremiumUpsells: true,
  hideMembersOnly: true,
  hideHiddenVideos: true,
  hideHomeCategories: true,
  hideHomePosts: true,
  hideSuggestedSections: true,
  hideShareThanksClip: false,
  hideAskButton: false,
  hideAutoDubbed: false,
  hideCollaborations: true,
  hideNextButton: true,
  hideShortsMusicLink: true,
  hideShortsRelatedLink: true,
  hideShortsSuggestedActions: true,
  hideShortsMetadataUntilHover: true,
  hideShortsRemixButton: true,
  hideExperiencingInterruptions: false,
  hideJumpAheadButton: false,
  hideExploreButton: true,
  hideSubscriptionsChannelList: true,
  hideSubscriptionsLatestBar: true,
  hideSidebarSubscriptions: false,
  disableAmbientMode: true,
  disableAutoplay: false,
  disableStableVolume: false,
  disableHomeFeed: false,
  disableThemedHover: true,
  disableVideoPreviews: false,
  stopShortsLooping: false,
  redirectShorts: false,
  alwaysShowShortsProgressBar: true,
  alwaysUseOriginalAudio: false,
  alwaysUseTheaterMode: false,
  pauseChannelTrailers: false,
  allowBackgroundPlay: false,
  removePink: true,
  useSquareCorners: false,
  showFullVideoTitles: false,
  fullSizeTheaterMode: false,
  fullSizeTheaterModeHideHeader: false,
  fullWidthChannelPage: false,
  animateHiding: true,
  fixGhostCards: true,
  tidyGuideSidebar: true,
  restoreSidebarSubscriptionsLink: true,
  revertSidebarOrder: true,
  revertGiantRelated: true,
  displaySubscriptionsGridAsList: false,
  displayHomeGridAsList: false,
  showChannelHeadersInListView: false,
  minimumGridItemsPerRow: "+1",
  minimumShortsPerRow: "8",
  mobileGridView: true,
  playerControlsBg: "default",
  playerFixFullScreenButton: true,
  playerHideFullScreenControls: false,
  playerHideFullScreenMoreVideos: true,
  playerHideFullScreenTitle: true,
  playerHideFullScreenVoting: true,
  playerRemoveDelhiExperimentFlags: false,
  restoreMiniplayerButton: true,
  addTakeSnapshot: false,
  downloadTranscript: false,
  searchThumbnailSize: "xsmall",
  enforceTheme: "default",
  snapshotFormat: "jpeg",
  snapshotQuality: "0.92",
  redirectLogoToSubscriptions: false,
  hideEmbedShareButton: true,
  hideEmbedPauseOverlay: true,
  debug: false,
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
  window.parent.postMessage({ type: "yt-panel-config", config: cfg }, "*")
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
  window.parent.postMessage({ type: "yt-panel-config", config: defaultConfig }, "*")
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
})

})()
