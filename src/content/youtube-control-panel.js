const STORAGE_KEY = "ytControlPanel"
const DESKTOP = location.hostname === "www.youtube.com"
const MOBILE = location.hostname === "m.youtube.com"

const defaultConfig = {
  enabled: true,
  hideShorts: false,
  hideWatched: true,
  hideWatchedThreshold: "85",
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
  fixGhostCards: true,
  tidyGuideSidebar: true,
  restoreSidebarSubscriptionsLink: true,
  revertSidebarOrder: true,
  revertGiantRelated: true,
  displaySubscriptionsGridAsList: false,
  displayHomeGridAsList: false,
  minimumGridItemsPerRow: "+1",
  minimumShortsPerRow: "8",
  playerControlsBg: "default",
  playerFixFullScreenButton: true,
  playerHideFullScreenControls: false,
  playerHideFullScreenMoreVideos: true,
  playerHideFullScreenTitle: true,
  playerHideFullScreenVoting: true,
  restoreMiniplayerButton: true,
  searchThumbnailSize: "xsmall",
  enforceTheme: "default",
  hideEmbedShareButton: true,
  hideEmbedPauseOverlay: true,
  debug: false,
}

var config = {}
var styleEl = null
var debug = false

function applyConfig(cfg) {
  config = Object.assign({}, defaultConfig, cfg)
  debug = config.debug
  buildCSS()
}

function buildCSS() {
  if (!config.enabled) {
    if (styleEl) { styleEl.remove(); styleEl = null }
    return
  }

  var rules = []
  var hide = []

  function h(s) { if (s) hide.push(s) }

  if (config.alwaysShowShortsProgressBar) {
    if (DESKTOP) rules.push('.ytPlayerProgressBarHostHidden { opacity: 1 !important; }')
    if (MOBILE) rules.push('.ytMwebShortsPlayerControlsHostHideProgressBar { visibility: visible !important; }')
  }

  if (config.disableAmbientMode) {
    if (DESKTOP) h('#cinematics, #cinematic-container.ytd-reel-video-renderer')
    if (MOBILE) h('.below-the-player-cinematic-container')
  }

  if (config.disableAutoplay) {
    if (DESKTOP) h('button[data-tooltip-target-id="ytp-autonav-toggle-button"]')
    if (MOBILE) h('button.ytm-autonav-toggle-button-container')
  }

  if (config.hideAI) {
    if (DESKTOP) {
      h('#expandable-metadata:has(path[d^="M480-80q0-83"])')
      h('#video-summary.ytd-structured-description-content-renderer')
    }
    if (MOBILE) {
      h('ytm-expandable-metadata-renderer:has(path[d^="M1 12c6.075"])')
    }
  }

  if (config.hideAskButton) {
    if (DESKTOP) h('yt-button-view-model:has(path[d^="M480-80q0-83"])')
  }

  if (config.hideChannelBanner) {
    if (DESKTOP) h('ytd-browse[page-subtype="channels"] #page-header-banner')
    if (MOBILE) h('html[cpfyt-page="channel"] .ytPageHeaderViewModelBannerContainer')
  }

  if (config.hideChannelWatermark) {
    if (DESKTOP) {
      h('.annotation.iv-branding')
      h('#player-ads ytd-button-renderer:has(a[href*="/channel/"])')
    }
  }

  if (config.hideComments) {
    if (DESKTOP) h('#comments')
  }

  if (config.hideEndCards || config.hideEndVideos) {
    h('.ytp-ce-element, .videowall-endscreen, .html5-endscreen')
  }

  if (config.hideInfoPanels) {
    h('.ytp-info-panel-preview, .ytp-info-panel-detail')
  }

  if (config.hideMetadata) {
    if (DESKTOP) h('#top-row, ytd-video-primary-info-renderer #top-row')
  }

  if (config.hideNextButton) {
    if (DESKTOP) {
      rules.push('.ytp-chrome-controls .ytp-next-button { display: none !important; }')
      rules.push('.ytp-chrome-controls .ytp-prev-button[aria-disabled="false"] ~ .ytp-next-button { display: revert !important; }')
    }
    if (MOBILE) {
      h('.player-controls-middle-core-buttons button[aria-label="Next video"]')
    }
  }

  if (config.hideShorts) {
    if (DESKTOP) {
      h('ytd-guide-entry-renderer:has(> a[title="Shorts"])')
      h('ytd-mini-guide-entry-renderer:has(> a[aria-label="Shorts"])')
      h('ytd-rich-section-renderer:has(> #content > ytd-rich-shelf-renderer[is-shorts])')
      h('ytd-browse[page-subtype="home"] ytd-rich-grid-group')
      h('ytd-browse[page-subtype="home"] ytd-rich-item-renderer[is-slim-media][rendered-from-rich-grid]')
      h('ytd-browse:not([page-subtype="history"]) ytd-reel-shelf-renderer')
      h('ytd-search ytd-reel-shelf-renderer')
      h('ytd-browse:not([page-subtype="history"]) ytd-video-renderer:has(a[href^="/shorts"])')
      h('ytd-search ytd-video-renderer:has(a[href^="/shorts"])')
      h('#related ytd-reel-shelf-renderer')
      h('#related ytd-compact-video-renderer:has(a[href^="/shorts"])')
    }
    if (MOBILE) {
      h('ytm-pivot-bar-item-renderer:has(> div.pivot-shorts)')
      h('.tab-content:is([tab-identifier="FEwhat_to_watch"], [tab-identifier="FEsubscriptions"]) ytm-rich-section-renderer:has(ytm-reel-shelf-renderer)')
      h('.tab-content[tab-identifier="FEwhat_to_watch"] ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model)')
      h('ytm-search lazy-list > ytm-reel-shelf-renderer')
      h('ytm-search ytm-video-with-context-renderer:has(a[href^="/shorts"])')
      h('ytm-item-section-renderer[section-identifier="related-items"] ytm-video-with-context-renderer:has(a[href^="/shorts"])')
    }
  }

  if (config.hideShortsMusicLink) {
    h('.ytReelMetapanelViewModelMetapanelItem:has(> reel-sound-metadata-view-model)')
  }

  if (config.hideShortsRelatedLink) {
    h('.ytReelMetapanelViewModelMetapanelItem:has(> yt-reel-multi-format-link-view-model)')
  }

  if (config.hideShortsSuggestedActions) {
    h('yt-shorts-suggested-action-view-model')
  }

  if (config.hideSuggestedSections) {
    if (DESKTOP) {
      h('ytd-browse[page-subtype="home"] ytd-rich-section-renderer:not(:has(> #content > ytd-rich-shelf-renderer[is-shorts]))')
      h('ytd-browse[page-subtype="home"] ytd-rich-item-renderer:has(> #content > ytd-feed-nudge-renderer)')
      h('ytd-browse[page-subtype="subscriptions"] ytd-rich-section-renderer:not(:first-child):not(:has(> #content > ytd-rich-shelf-renderer[is-shorts]))')
      h('ytd-search #contents.ytd-item-section-renderer > ytd-shelf-renderer')
      h('ytd-search #contents.ytd-item-section-renderer > ytd-horizontal-card-list-renderer')
      h('ytd-browse[page-subtype="playlist"] ytd-item-section-renderer[is-playlist-video-container]')
      h('ytd-browse[page-subtype="playlist"] ytd-item-section-renderer[is-playlist-video-container] + ytd-item-section-renderer')
    }
    if (MOBILE) {
      h('.tab-content[tab-identifier="FEwhat_to_watch"] ytm-rich-section-renderer:not(:has(> div > ytm-backstage-post-thread-renderer))')
      h('ytm-rich-item-renderer:has(> .feed-nudge-wrapper)')
      h('.tab-content[tab-identifier="FEsubscriptions"] ytm-rich-section-renderer:has(ytm-rich-shelf-renderer)')
    }
  }

  if (config.hideLive || config.hideStreamed) {
    if (DESKTOP) {
      h('ytd-browse:not([page-subtype="channels"]) ytd-rich-item-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"])')
      h('ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"])')
    }
  }

  if (config.hideUpcoming) {
    if (DESKTOP) {
      h('ytd-browse:not([page-subtype="channels"]) ytd-rich-item-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"])')
      h('ytd-browse:not([page-subtype="channels"]) ytd-rich-item-renderer:has(lockup-attachments-view-model)')
      h('ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"])')
    }
    if (MOBILE) {
      h('.tab-content[tab-identifier="FEsubscriptions"] ytm-rich-item-renderer:has(ytm-thumbnail-overlay-time-status-renderer[data-style="UPCOMING"])')
    }
  }

  if (config.hideVoiceSearch) {
    if (DESKTOP) h('#voice-search-button')
    if (MOBILE) h('.ytSearchboxComponentVoiceSearchWrapper, .mobile-topbar-header-voice-search-button, .search-bar-entry-point-voice-search-button')
  }

  if (config.hidePremiumUpsells) {
    if (DESKTOP) {
      h('#endpoint.ytd-guide-entry-renderer[href="/premium"]')
      h('ytd-menu-service-item-download-renderer, yt-download-list-item-view-model')
      h('.ytp-quality-menu .ytp-menuitem:has(.ytp-premium-label)')
      h('.ytp-settings-menu .ytp-menuitem[role="menuitemradio"]:has(.ytp-menuitem-premium-badge)')
      h('ytd-download-button-renderer')
    }
    if (MOBILE) {
      h('.tab-content[tab-identifier="FElibrary"] ytm-compact-link-renderer:has(> a[href="/premium"])')
    }
  }

  if (config.hideRelated) {
    if (DESKTOP) h(config.hideRelatedBelow ? '#below #related' : '#related')
    if (MOBILE) h('ytm-item-section-renderer[section-identifier="related-items"]')
  }

  if (config.hideShareThanksClip) {
    if (DESKTOP) {
      h('button.ytp-share-button')
      h('#share-button.ytd-reel-player-overlay-renderer')
    }
  }

  if (config.hidePlaylists) {
    if (DESKTOP) {
      h('ytd-browse[page-subtype="home"] ytd-rich-item-renderer:has(a[href^="/playlist?"])')
      h(':is(#related, ytd-search) yt-lockup-view-model:has(a[href^="/playlist?"])')
      h('.ytp-videowall-still[data-is-list="true"][data-is-mix="false"]')
    }
    if (MOBILE) {
      h('.tab-content[tab-identifier="FEwhat_to_watch"] ytm-rich-item-renderer:has(a[href^="/playlist?"])')
      h('ytm-search ytm-compact-playlist-renderer')
      h('ytm-item-section-renderer[section-identifier="related-items"] ytm-compact-playlist-renderer')
    }
  }

  if (config.hideMixes) {
    if (DESKTOP) {
      h('ytd-rich-item-renderer:has(a[href*="&list=RD"])')
      h('ytd-rich-item-renderer:has(a[href*="start_radio=1"])')
      h('ytd-radio-renderer')
      h('ytd-compact-radio-renderer')
      h('yt-lockup-view-model:has(a[href*="start_radio=1"])')
      h('.ytLockupViewModelCollectionStack2')
      h('yt-lockup-view-model:has(yt-collection-thumbnail-view-model)')
      h('.ytp-videowall-still[data-is-mix="true"]')
    }
  }

  if (config.playerHideFullScreenControls) {
    if (DESKTOP) h('#movie_player .ytp-overlay-top-right, #movie_player .ytp-fullscreen-quick-actions')
    if (MOBILE) h('player-fullscreen-action-menu .action-menu-engagement-buttons-wrapper')
  }

  if (config.playerHideFullScreenMoreVideos) {
    if (MOBILE) h('.fullscreen-watch-next-entrypoint-wrapper')
  }

  if (config.showFullVideoTitles) {
    if (DESKTOP) rules.push('#video-title, .ytLockupMetadataViewModelTitle { white-space: normal !important; }')
  }

  if (config.removePink) {
    rules.push('.ytp-play-progress { background: #f03 !important; }')
    rules.push('.ytp-swatch-background-color { background-color: #f03 !important; }')
  }

  if (config.useSquareCorners) {
    rules.push('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-thumbnail, yt-img-shadow img, .html5-video-player, video { border-radius: 0 !important; }')
  }

  if (config.fixGhostCards) {
    rules.push('ytd-rich-grid-renderer #contents > ytd-rich-item-renderer:empty, #contents.ytd-rich-grid-renderer > ytd-continuation-item-renderer { display: none !important; }')
  }

  if (config.disableThemedHover) {
    rules.push('ytd-rich-item-renderer:hover, ytd-video-renderer:hover, ytd-compact-video-renderer:hover { background-color: transparent !important; }')
  }

  if (config.fullSizeTheaterMode) {
    rules.push('ytd-watch-flexy[theater] #player-theater-container.ytd-watch-flexy, ytd-watch-flexy[theater] #player-wide-container.ytd-watch-flexy { max-height: 100vh !important; }')
    if (config.fullSizeTheaterModeHideHeader) {
      rules.push('ytd-watch-flexy[theater] #masthead-container.ytd-watch-flexy { display: none !important; }')
    }
  }

  if (config.fullWidthChannelPage) {
    rules.push('ytd-browse[page-subtype="channels"] #primary.ytd-two-column-browse-results-renderer { max-width: none !important; }')
  }

  if (config.playerFixFullScreenButton) {
    rules.push('.ytp-size-button { display: inline-block !important; }')
  }

  if (config.restoreMiniplayerButton) {
    rules.push('.ytp-miniplayer-button { display: inline-block !important; }')
  }

  if (config.revertGiantRelated) {
    rules.push('ytd-compact-video-renderer { display: flex !important; flex-direction: row !important; }')
    rules.push('ytd-compact-video-renderer ytd-thumbnail { width: 168px !important; min-width: 168px !important; }')
  }

  if (config.disableVideoPreviews) {
    rules.push('ytd-video-preview { display: none !important; }')
  }

  if (config.tidyGuideSidebar) {
    h('#items.ytd-guide-section-renderer > ytd-guide-entry-renderer:nth-child(n+4):not(:has(a[title="Subscriptions"])):not(:has(a[title="Library"]))')
  }

  if (config.hideSidebarSubscriptions) {
    h('#sections.ytd-guide-section-renderer > ytd-guide-collapsible-section-entry-renderer')
  }

  if (config.hideHomeCategories) {
    if (DESKTOP) h('#chips-wrapper, ytd-feed-filter-chip-bar-renderer')
  }

  if (config.hideChat || config.hideChatFullScreen) {
    if (DESKTOP) h('#chat-container, #chat, ytd-live-chat-frame')
  }

  if (config.hideMembersOnly) {
    if (DESKTOP) h('ytd-rich-item-renderer:has(.badge-style-type-members-only)')
  }

  if (config.hideHiddenVideos) {
    if (DESKTOP) h('ytd-rich-item-renderer:has(#dismissed)')
  }

  if (config.hideCollaborations) {
    if (DESKTOP) h('ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer:has(yt-avatar-stack-view-model)')
  }

  if (config.hideChannels) {
    if (DESKTOP) h('ytd-rich-section-renderer:has(> #content > ytd-rich-shelf-renderer:not([is-shorts]):has(ytd-channel-renderer))')
  }

  if (config.hideMoviesAndTV) {
    if (DESKTOP) {
      h('ytd-rich-item-renderer:has(a[href*="/movies"])')
      h('ytd-rich-item-renderer:has(a[href*="/tv"])')
    }
  }

  if (config.hideJumpAheadButton) {
    h('.ytp-jump-ahead-button')
  }

  if (config.hideShortsMetadataUntilHover) {
    rules.push('ytd-reel-player-overlay-renderer #overlay ytd-reel-video-renderer #metadata:not(:hover) { opacity: 0 !important; }')
  }

  if (config.hideShortsRemixButton) {
    if (DESKTOP) h('#remix-button.ytd-reel-player-overlay-renderer')
  }

  if (config.disableStableVolume) {
    rules.push('.ytp-menuitem[aria-label*="Stable volume"], .ytp-stable-volume-menu-item { display: none !important; }')
  }

  if (config.enforceTheme === "dark") {
    rules.push('html { --yt-spec-general-background-a: #0f0f0f !important; --yt-spec-general-background-b: #0f0f0f !important; }')
  } else if (config.enforceTheme === "light") {
    rules.push('html { --yt-spec-general-background-a: #fff !important; --yt-spec-general-background-b: #fff !important; }')
  }

  if (config.playerControlsBg === "transparent") {
    rules.push('.ytp-chrome-bottom { background: transparent !important; }')
  } else if (config.playerControlsBg === "blur") {
    rules.push('.ytp-chrome-bottom { background: rgba(0,0,0,0.3) !important; backdrop-filter: blur(10px) !important; }')
  } else if (config.playerControlsBg === "dark") {
    rules.push('.ytp-chrome-bottom { background: rgba(0,0,0,0.8) !important; }')
  } else if (config.playerControlsBg === "light") {
    rules.push('.ytp-chrome-bottom { background: rgba(255,255,255,0.8) !important; }')
  }

  if (config.searchThumbnailSize === "xsmall") {
    rules.push('ytd-video-renderer:not([use-video-thumbnail-preview]) ytd-thumbnail { width: 120px !important; }')
  } else if (config.searchThumbnailSize === "small") {
    rules.push('ytd-video-renderer:not([use-video-thumbnail-preview]) ytd-thumbnail { width: 160px !important; }')
  } else if (config.searchThumbnailSize === "medium") {
    rules.push('ytd-video-renderer:not([use-video-thumbnail-preview]) ytd-thumbnail { width: 240px !important; }')
  } else if (config.searchThumbnailSize === "large") {
    rules.push('ytd-video-renderer:not([use-video-thumbnail-preview]) ytd-thumbnail { width: 360px !important; }')
  }

  if (config.minimumGridItemsPerRow && DESKTOP) {
    var g = config.minimumGridItemsPerRow
    var gridVal = g
    if (g === "+1") gridVal = "calc(var(--ytd-rich-grid-base-items-per-row, 4) + 1)"
    rules.push('ytd-browse:is([page-subtype="home"], [page-subtype="subscriptions"]) ytd-rich-grid-renderer, html:is([cpfyt-channel-tab="videos"], [cpfyt-channel-tab="streams"]) ytd-browse[page-subtype="channels"] ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ' + gridVal + ' !important; }')
  }

  if (config.minimumShortsPerRow && DESKTOP) {
    var n = parseInt(config.minimumShortsPerRow) || 8
    rules.push('ytd-browse[page-subtype="home"] ytd-rich-shelf-renderer[is-shorts], ytd-browse[page-subtype="subscriptions"] ytd-rich-shelf-renderer[is-shorts], ytd-browse[page-subtype="filteredsubscriptions"] ytd-rich-grid-renderer[is-shorts-grid] { --ytd-rich-grid-slim-items-per-row: ' + n + ' !important; --ytd-rich-grid-items-per-row: ' + n + ' !important; }')
    rules.push('ytd-browse[page-subtype="home"] ytd-rich-item-renderer[is-slim-media]:nth-child(-n+' + n + '), ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer[is-slim-media]:nth-child(-n+' + n + ') { display: block !important; }')
  }

  if (config.displaySubscriptionsGridAsList) {
    rules.push('ytd-browse[page-subtype="subscriptions"] ytd-rich-grid-renderer #contents { display: flex !important; flex-direction: column !important; }')
  }

  if (config.displayHomeGridAsList) {
    rules.push('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer #contents { display: flex !important; flex-direction: column !important; }')
  }

  if (config.hideEmbedShareButton || config.hideEmbedPauseOverlay) {
    var isEmbed = location.hostname.indexOf("youtube.com/embed") !== -1 || location.hostname.indexOf("youtube-nocookie.com/embed") !== -1
    if (isEmbed) {
      if (config.hideEmbedShareButton) h('.ytp-share-button')
      if (config.hideEmbedPauseOverlay) h('.ytp-pause-overlay-container')
    }
  }

  for (var i = 0; i < hide.length; i++) {
    if (hide[i]) rules.push(hide[i] + " { display: none !important; }")
  }

  var css = rules.join("\n")
  if (!styleEl) {
    styleEl = document.createElement("style")
    styleEl.id = "yt-control-panel-styles"
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = css
}

function loadConfig() {
  chrome.storage.sync.get([STORAGE_KEY], function(result) {
    applyConfig(result[STORAGE_KEY] || {})
  })
}

function onStorageChanged(changes, area) {
  if (area !== "sync") return
  if (changes[STORAGE_KEY]) applyConfig(changes[STORAGE_KEY].newValue || {})
}

window.addEventListener("message", function(event) {
  if (event.data && event.data.type === "yt-panel-config") applyConfig(event.data.config)
})

function init() {
  loadConfig()
  chrome.storage.onChanged.addListener(onStorageChanged)
  var obs = new MutationObserver(function() {
    if (styleEl && !document.head.contains(styleEl)) document.head.appendChild(styleEl)
  })
  obs.observe(document.documentElement, { childList: true, subtree: false })
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}


(function() {
  var STORAGE_KEY = "ytControlPanel"
  var cfg = {}

  function getCfg(cb) {
    chrome.storage.sync.get([STORAGE_KEY], function(r) { cb(r[STORAGE_KEY] || {}) })
  }

  function applyJS(c) {
    cfg = c

    if (cfg.redirectShorts && location.pathname.startsWith("/shorts/")) {
      var v = location.pathname.split("/")[2]
      if (v) location.replace("/watch?v=" + v)
    }

    if (cfg.disableAutoplay) {
      var b = document.querySelector('button[data-tooltip-target-id="ytp-autonav-toggle-button"]')
      if (b && b.getAttribute("aria-checked") === "true") b.click()
    }

    if (cfg.alwaysUseTheaterMode && location.pathname.startsWith("/watch")) {
      var s = document.querySelector('.ytp-size-button')
      if (s) {
        var tip = s.getAttribute("data-tooltip-text") || ""
        if (tip.indexOf("theater") === -1 && tip.indexOf("Theater") === -1) {
          if (!document.querySelector('ytd-watch-flexy[theater]')) s.click()
        }
      }
    }

    if (cfg.stopShortsLooping) {
      var vs = document.querySelectorAll('.html5-video-player video')
      for (var i = 0; i < vs.length; i++) {
        vs[i].loop = false
        vs[i].addEventListener("ended", function() { this.pause() }, { once: true })
      }
    }

    if (cfg.pauseChannelTrailers) {
      var tv = document.querySelector('ytd-channel-video-player-renderer video')
      if (tv && !tv.paused) tv.pause()
    }
  }

  getCfg(applyJS)

  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== "sync" || !changes[STORAGE_KEY]) return
    applyJS(changes[STORAGE_KEY].newValue || {})
  })

  window.addEventListener("message", function(e) {
    if (e.data && e.data.type === "yt-panel-config") applyJS(e.data.config)
  })
})()




