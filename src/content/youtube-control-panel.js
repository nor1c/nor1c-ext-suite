const STORAGE_KEY = 'ytControlPanel'
const DESKTOP = location.hostname === 'www.youtube.com'
const MOBILE = location.hostname === 'm.youtube.com'

const defaultConfig = {
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
  enforceTheme: 'default',
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
  hideUpcoming: true,
  hideVoiceSearch: true,
  hideWatched: true,
  hideWatchedThreshold: '85',
  minimumGridItemsPerRow: '+1',
  minimumShortsPerRow: '8',
  playerControlsBg: 'default',
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
  searchThumbnailSize: 'xsmall',
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
  hideSubscriptionsChannelList: true,
  hideSubscriptionsLatestBar: true,
  mobileGridView: true
}

var config = {}
var styleEl = null
var stableVolumeState = new WeakMap()

function applyConfig(cfg) {
  config = Object.assign({}, defaultConfig, cfg)
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
    rules.push(`.ytPlayerProgressBarHostHidden { opacity: 100 !important; }`)
    rules.push(`.ytMwebShortsPlayerControlsHostHideProgressBar { visibility: visible !important; }`)
  }

  if (config.disableAmbientMode) {
    h('#cinematics')
    h('#cinematic-container.ytd-reel-video-renderer')
    h('.below-the-player-cinematic-container')
  }

  if (config.disableAutoplay) {
    h('button[data-tooltip-target-id="ytp-autonav-toggle-button"]')
    h('button.ytm-autonav-toggle-button-container')
  }

  if (config.hideAI) {
    if (DESKTOP) {
      h('#expandable-metadata:has(path[d="M480-80q0-83-31.5-156T363-363q-54-54-127-85.5T80-480q83 0 156-31.5T363-597q54-54 85.5-127T480-880q0 83 31.5 156T597-597q54 54 127 85.5T880-480q-83 0-156 31.5T597-363q-54 54-85.5 127T480-80Z"])')
      h('#video-summary.ytd-structured-description-content-renderer')
    }
    if (MOBILE) {
      h('ytm-expandable-metadata-renderer:has(path[d="M1 12c6.075 0 11 4.925 11 11 0-6.075 4.925-11 11-11-6.075 0-11-4.925-11-11 0 6.075-4.925 11-11 11z"])')
    }
  }

  if (config.hideAskButton) {
    h('yt-button-view-model:has(path[d="M480-80q0-83-31.5-156T363-363q-54-54-127-85.5T80-480q83 0 156-31.5T363-597q54-54 85.5-127T480-880q0 83 31.5 156T597-597q54 54 127 85.5T880-480q-83 0-156 31.5T597-363q-54 54-85.5 127T480-80Z"])')
    h('button-view-model:has(path[d="M1 12c6.075 0 11 4.925 11 11 0-6.075 4.925-11 11-11-6.075 0-11-4.925-11-11 0 6.075-4.925 11-11 11z"])')
  }

  if (config.hideChannelBanner) {
    h('ytd-browse[page-subtype="channels"] #page-header-banner')
    h('html[cpfyt-page="channel"] .ytPageHeaderViewModelBannerContainer')
  }

  if (config.hideChannelWatermark) {
    if (DESKTOP) {
      h('.annotation.iv-branding')
      h('#pivot-button.ytd-reel-player-overlay-renderer')
    }
    if (MOBILE) {
      h('.reel-player-overlay-actions > pivot-button-view-model')
    }
  }

  if (config.hideCollaborations) {
    h('.cpfyt-hide-collaborations')
    rules.push(`.cpfyt-hide-collaborations { outline: 2px solid aqua !important; }`)
  }

  if (config.hideExperiencingInterruptions) {
    h('.ExperiencingInterruptions')
    h('.ExperiencingInterruptions #action-button')
  }

  if (config.hideExploreButton) {
    h('ytm-chip-cloud-chip-renderer[chip-style="STYLE_EXPLORE_LAUNCHER_CHIP"]')
  }

  if (config.hideHiddenVideos) {
    h('.cpfyt-hide-hidden')
    rules.push(`.cpfyt-hide-hidden { outline: 2px solid magenta !important; }`)
  }

  if (config.hideHomeCategories) {
    h('ytd-browse[page-subtype="home"] #header')
    h('.tab-content[tab-identifier="FEwhat_to_watch"] .rich-grid-sticky-header')
  }

  if (config.hideHomePosts) {
    h('.tab-content[tab-identifier="FEwhat_to_watch"] ytm-rich-section-renderer:has(> div > ytm-backstage-post-thread-renderer)')
  }

  if (config.hideJumpAheadButton) {
    h('#movie_player .ytp-timely-actions-content')
  }

  if (config.hideLowViews) {
    h('.cpfyt-hide-low-views')
    rules.push(`.cpfyt-hide-low-views { outline: 2px solid hotpink !important; }`)
  }

  if (config.hideRelated) {
    if (DESKTOP) {
      h(config.hideRelatedBelow ? '#below #related' : '#related')
    }
    if (MOBILE) {
      h('ytm-item-section-renderer[section-identifier="related-items"]')
    }
  }

  if (config.hideShorts) {
    if (DESKTOP) {
      h('ytd-guide-entry-renderer:has(> a[title="Shorts"])')
      h('ytd-mini-guide-entry-renderer:has(> a[aria-label="Shorts"])')
      h('ytd-rich-shelf-renderer[is-shorts]')
      h('ytd-reel-shelf-renderer')
      h('ytd-rich-section-renderer:has(> #content > ytd-rich-shelf-renderer[is-shorts])')
    }
    if (MOBILE) {
      h('ytm-pivot-bar-item-renderer:has(> div.pivot-shorts)')
      h('ytm-reel-shelf-renderer')
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

  if (config.hideSponsored) {
    h('#masthead-ad')
    h('ytd-rich-section-renderer:has(> #content > ytd-statement-banner-renderer)')
    h('ytd-action-companion-ad-renderer')
    h('.ytp-ad-module')
    h('ytd-compact-promoted-video-renderer')
    h('ytd-promoted-sparkles-web-renderer')
    h('ytd-display-ad-renderer')
  }

  if (config.hideStreamed) {
    h('.cpfyt-hide-streamed')
    rules.push(`.cpfyt-hide-streamed { outline: 2px solid blue !important; }`)
  }

  if (config.hideVoiceSearch) {
    h('#voice-search-button')
  }

  if (config.hideWatched) {
    h('.cpfyt-hide-watched')
    rules.push(`.cpfyt-hide-watched { outline: 2px solid green !important; }`)
  }

  if (config.playerHideFullScreenControls) {
    h('player-fullscreen-action-menu .action-menu-engagement-buttons-wrapper')
  }

  if (config.playerHideFullScreenMoreVideos) {
    h('.fullscreen-watch-next-entrypoint-wrapper')
  }

  if (config.playerHideFullScreenTitle) {
    h('.ytp-fullscreen-metadata')
  }

  if (config.playerHideFullScreenVoting) {
    h('yt-player-quick-action-buttons :is(like-button-view-model, dislike-button-view-model)')
  }

  if (config.restoreMiniplayerButton) {
    h('ytd-watch-flexy[fullscreen] #cpfyt-miniplayer-button')
    h('#cpfyt-miniplayer-button')
  }

  if (config.restoreSidebarSubscriptionsLink) {
    h('#sections.ytd-guide-renderer [cpfyt-section="subscriptions"]')
    rules.push(`#sections.ytd-guide-renderer > .ytd-guide-renderer[cpfyt-section=""] { border-bottom: none; }`)
  }

  if (config.hideChat) {
    h('yt-player-quick-action-buttons > toggle-button-view-model:has(path[d="M16 2H4a3 3 0 00-3 3v8a3 3 0 003 3h1v2.14a.8.8 0 001.188.7L11.3 16H16a3 3 0 003-3V5a3 3 0 00-3-3ZM4 4h12a1 1 0 011 1v8a1 1 0 01-1 1h-5.218l-.452.252L7 16.1V14H4a1 1 0 01-1-1V5a1 1 0 011-1Zm17 2.174A3 3 0 0123 9v8a3 3 0 01-2.846 2.996L20 20v2.14a.8.8 0 01-1.189.7L13.701 20H8.216l3.6-2h2.402l.453.252L18 20.101V18.05l1.95-.05.113-.003A1 1 0 0021 17V6.174Z"])')
  }

  if (config.hideChatFullScreen) {
    h('ytd-watch-flexy[fullscreen][live-chat-present-and-expanded] #panels-full-bleed-container')
  }

  if (config.fixGhostCards) {
    h('#cpfyt-snaphot-menu-item')
  }

  if (config.hideSubscriptionsChannelList) {
    h('.tab-content[tab-identifier="FEsubscriptions"] ytm-channel-list-sub-menu-renderer')
  }

  if (config.hideSubscriptionsLatestBar) {
    h('ytd-browse[page-subtype="subscriptions"] ytd-rich-shelf-renderer[is-shorts] .expand-collapse-button')
  }

  if (config.searchThumbnailSize !== 'large') {
    var sizes = { medium: 420, small: 360, xsmall: 280 }
    var w = sizes[config.searchThumbnailSize] || 280
    rules.push('ytd-search ytd-video-renderer ytd-thumbnail.ytd-video-renderer, ytd-search ytd-movie-renderer .thumbnail-container.ytd-movie-renderer, ytd-search yt-lockup-view-model .ytLockupViewModelContentImage, ytd-search ytd-channel-renderer #avatar-section { max-width: ' + w + 'px !important; }')
  }

  if (config.showFullVideoTitles) {
    if (DESKTOP) {
      rules.push('#video-title, .ytLockupMetadataViewModelTitle, .ytPlayerOverlayVideoDetailsRendererTitle, .ytp-modern-videowall-still-info-title, .shortsLockupViewModelHostOutsideMetadataTitle, .ytShortsVideoTitleViewModelShortsVideoTitle, .ytShortsVideoTitleViewModelShortsVideoTitleLarge { max-height: unset !important; -webkit-line-clamp: unset !important; }')
    }
    if (MOBILE) {
      rules.push('.media-item-headline, .video-card-title, .YtmCompactMediaItemHeadline, .shortsLockupViewModelHostMetadataTitle { max-height: unset !important; -webkit-line-clamp: unset !important; }')
    }
  }

  if (config.removePink) {
    rules.push('.ytp-play-progress, .thumbnail-overlay-resume-playback-progress, .ytCoreAttributedStringCircularProgressBarOverlayViewModelCircularProgressBarProgress { background: #f03 !important; }')
    rules.push('.ytp-swatch-background-color { background-color: #f03 !important; }')
  }

  if (config.useSquareCorners) {
    rules.push('.ytThumbnailViewModelSmall, .ytThumbnailViewModelMedium, .ytThumbnailViewModelLarge, .ytThumbnailViewModelXLarge, .rounded-thumbnail, .thumbnail-cover-rounded, .yt-core-image, ytd-thumbnail, yt-img-shadow img, .html5-video-player, video, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer { border-radius: 0 !important; }')
  }

  if (config.fixGhostCards) {
    rules.push('ytd-rich-grid-renderer #contents > ytd-rich-item-renderer:empty, #contents.ytd-rich-grid-renderer > ytd-continuation-item-renderer { display: none !important; }')
  }

  if (config.fullSizeTheaterMode) {
    if (config.fullSizeTheaterModeHideHeader) {
      rules.push('ytd-watch-flexy[theater]:not([fullscreen]) #masthead-container { display: none !important; }')
    }
    rules.push('ytd-watch-flexy[theater]:not([fullscreen]) #full-bleed-container { max-height: 100vh !important; }')
  }

  if (config.fullWidthChannelPage) {
    rules.push('ytd-browse[page-subtype="channels"] ytd-two-column-browse-results-renderer { max-width: none !important; }')
  }

  if (config.tidyGuideSidebar) {
    rules.push('ytd-guide-section-renderer:has(#items:empty), ytd-guide-collapsible-section-entry-renderer.ytd-guide-section-renderer:has(#items:empty) { display: none !important; }')
  }

  if (config.revertGiantRelated) {
    rules.push('ytd-watch-next-secondary-results-renderer[use-dynamic-secondary-columns] #items.ytd-item-section-renderer, ytd-watch-next-secondary-results-renderer[use-dynamic-secondary-columns] #contents.ytd-item-section-renderer { grid-template-columns: 1fr; }')
    rules.push('ytd-watch-next-secondary-results-renderer[use-dynamic-secondary-columns] .lockup.ytd-watch-next-secondary-results-renderer { margin-bottom: 0; }')
  }

  if (config.minimumGridItemsPerRow && DESKTOP) {
    var g = config.minimumGridItemsPerRow
    var gridVal = g
    if (g === '+1') gridVal = 'calc(var(--ytd-rich-grid-base-items-per-row, 4) + 1)'
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
    var isEmbed = location.hostname.indexOf('youtube.com/embed') !== -1 || location.hostname.indexOf('youtube-nocookie.com/embed') !== -1
    if (isEmbed) {
      if (config.hideEmbedShareButton) h('.ytp-share-button')
      if (config.hideEmbedPauseOverlay) h('.ytp-pause-overlay-container')
    }
  }


  if (config.disableHomeFeed) {
    if (DESKTOP) {
      h('ytd-browse[page-subtype="home"]')
    }
    if (MOBILE) {
      h('.tab-content[tab-identifier="FEwhat_to_watch"]')
    }
  }

  if (config.hideAutoDubbed) {
    var adPath = 'path[d="M19.4.2a1 1 0 00-.2 1.4 9 9 0 01-.022 10.83 1 1 0 001.595 1.206A11 11 0 0020.8.4a1 1 0 00-1.4-.2ZM10 2a5 5 0 100 10 5 5 0 000-10Zm6.17.3a1 1 0 00-.028 1.414c.895.932 1.365 2.114 1.358 3.312-.006 1.199-.49 2.378-1.396 3.302a1.001 1.001 0 101.427 1.4c1.257-1.281 1.959-2.953 1.969-4.69.009-1.738-.673-3.416-1.916-4.71A1 1 0 0016.17 2.3ZM10 13a8 8 0 00-8 8 1 1 0 001 1h14l.102-.005A1 1 0 0018 21a8 8 0 00-8-8Z"]'
    if (DESKTOP) {
      h('ytd-browse[page-subtype="home"] ytd-rich-item-renderer:has(' + adPath + '), ytd-browse[page-subtype="home"] ytd-video-preview:has(' + adPath + ')')
      h('#related yt-lockup-view-model:has(' + adPath + ')')
    }
    if (MOBILE) {
      h('.tab-content[tab-identifier="FEwhat_to_watch"] ytm-rich-item-renderer:has(' + adPath + ')')
      h('ytm-item-section-renderer[section-identifier="related-items"] ytm-video-with-context-renderer:has(' + adPath + ')')
    }
  }

  if (config.hideComments) {
    if (DESKTOP) {
      h('#comments')
      h('#comments-button.ytd-reel-player-overlay-renderer')
      h('reel-action-bar-view-model > button-view-model:nth-of-type(1)')
    }
    if (MOBILE) {
      h('ytm-slim-video-metadata-section-renderer + ytm-item-section-renderer')
      h('reel-action-bar-view-model > button-view-model:nth-of-type(1)')
    }
  }

  if (config.hideEndCards || config.hideEndVideos) {
    h('.ytp-ce-element, .videowall-endscreen, .html5-endscreen')
  }

  if (config.hideInfoPanels) {
    if (DESKTOP) {
      h('ytd-clarification-renderer')
      h('ytd-info-panel-container-renderer')
      h('#middle-row.ytd-watch-metadata:has(> ytd-info-panel-content-renderer:only-child)')
      h('ytd-info-panel-content-renderer')
      h('#clarify-box')
    }
    if (MOBILE) {
      h('ytm-clarification-renderer')
      h('ytm-info-panel-container-renderer')
    }
  }

  if (config.hideLive) {
    if (DESKTOP) {
      h('ytd-browse:not([page-subtype="channels"]) ytd-rich-item-renderer:has(ytd-thumbnail[is-live-video]), ytd-browse:not([page-subtype="channels"]) ytd-video-preview:has(ytd-thumbnail[is-live-video])')
      h('ytd-browse:not([page-subtype="channels"]) ytd-rich-item-renderer:has(.yt-badge-shape--thumbnail-live), ytd-browse:not([page-subtype="channels"]) ytd-video-preview:has(.yt-badge-shape--thumbnail-live)')
      h('ytd-video-renderer:has(ytd-thumbnail[is-live-video])')
      h('#related yt-lockup-view-model:has(.yt-badge-shape--thumbnail-live)')
    }
  }

  if (config.hideMembersOnly) {
    if (DESKTOP) {
      h('ytd-rich-item-renderer:has(.badge-style-type-members-only), ytd-video-preview:has(.badge-style-type-members-only)')
      h('ytd-rich-item-renderer:has(.yt-badge-shape--membership), ytd-video-preview:has(.yt-badge-shape--membership)')
    }
  }

  if (config.hideMetadata) {
    if (DESKTOP) {
      h('#movie_player :is(.ytp-cards-button, .ytp-cards-teaser)')
      h('#top-row')
      h('ytd-metadata-row-container-renderer:has(> ytd-metadata-row-container-renderer:only-child)')
    }
  }

  if (config.hideMixes) {
    if (DESKTOP) {
      h('yt-chip-cloud-chip-renderer:has(> #chip-container > yt-formatted-string[title="Mixes"])')
      h('ytd-rich-item-renderer:has(a[href*="start_radio=1"]), ytd-video-preview:has(a[href*="start_radio=1"])')
      h('ytd-radio-renderer')
      h('ytd-compact-radio-renderer')
      h('yt-lockup-view-model:has(a[href*="start_radio=1"]), ytd-video-preview:has(a[href*="start_radio=1"])')
      h('.ytp-videowall-still[data-is-mix="true"]')
    }
    if (MOBILE) {
      h('ytm-chip-cloud-chip-renderer:has(> .chip-container[aria-label="Mixes"])')
      h('ytm-rich-item-renderer:has(> ytm-radio-renderer)')
      h('ytm-compact-radio-renderer')
    }
  }

  if (config.hideMoviesAndTV) {
    if (DESKTOP) {
      h('ytd-rich-item-renderer.ytd-rich-grid-renderer:has(a[href*="/movies"]), ytd-video-preview:has(a[href*="/movies"])')
      h('ytd-movie-renderer')
    }
  }

  if (config.hidePlaylists) {
    if (DESKTOP) {
      h('ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer:has(a[href^="/playlist"]), ytd-browse[page-subtype="subscriptions"] ytd-video-preview:has(a[href^="/playlist"])')
      h('ytd-browse[page-subtype="home"] ytd-rich-item-renderer:has(a[href^="/playlist"]), ytd-browse[page-subtype="home"] ytd-video-preview:has(a[href^="/playlist"])')
    }
  }

  if (config.hidePremiumUpsells) {
    h('#endpoint.ytd-guide-entry-renderer[href="/premium"]')
    h('ytd-menu-service-item-download-renderer')
    h('ytd-browse[page-subtype="home"] ytd-rich-section-renderer:has(ytd-statement-banner-renderer)')
  }

  if (config.hideSuggestedSections) {
    if (DESKTOP) {
      h('ytd-search #contents.ytd-item-section-renderer > ytd-shelf-renderer')
    }
  }

  if (config.hideUpcoming) {
    if (DESKTOP) {
      h('ytd-browse:not([page-subtype="channels"]) ytd-rich-item-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"]), ytd-browse:not([page-subtype="channels"]) ytd-video-preview:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"])')
      h('ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"])')
    }
  }

  if (config.hideMusic) {
    var musicD = 'M5.5 1.383'
    var musicTags = ['ytd-rich-item-renderer', 'ytd-video-preview', 'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-grid-video-renderer', 'ytd-playlist-video-renderer', 'ytd-compact-playlist-renderer', 'ytd-playlist-renderer', 'ytd-radio-renderer']
    for (var mi = 0; mi < musicTags.length; mi++) {
      h(musicTags[mi].toLowerCase() + ':has(path[d*="' + musicD + '"])')
    }
  }

  if (config.disableThemedHover) {
    rules.push('ytd-browse:is([page-subtype="home"], [page-subtype="subscriptions"]) ytd-rich-item-renderer:hover, ytd-browse:is([page-subtype="home"], [page-subtype="subscriptions"]) ytd-video-renderer:hover, ytd-browse:is([page-subtype="home"], [page-subtype="subscriptions"]) ytd-compact-video-renderer:hover { background-color: transparent !important; }')
  }

  if (config.hideShortsMetadataUntilHover) {
    rules.push('ytd-reel-player-overlay-renderer > .metadata-container { opacity: 0; transition: opacity 0.2s; }')
    rules.push('ytd-reel-player-overlay-renderer:hover > .metadata-container { opacity: 1; }')
  }

  if (config.hideSidebarSubscriptions) {
    rules.push('ytd-guide-section-renderer[cpfyt-section="subscriptions"] { display: none !important; }')
  }

  if (config.disableVideoPreviews) h('ytd-moving-thumbnail-renderer, ytd-video-preview, .ytd-video-preview')
  if (config.hideChannels) h('ytd-channel-renderer, ytm-compact-channel-renderer')
  if (config.hideNextButton) h('.ytp-next-button')
  if (config.hideShareThanksClip) h('button[aria-label*="Share" i], button[aria-label*="Thanks" i], button[aria-label*="Clip" i], ytd-button-renderer:has(path[d*="M15 5.63"])')
  if (config.hideShortsRemixButton) h('button[aria-label*="Remix" i], .yt-spec-button-shape-next[aria-label*="Remix" i]')
  if (config.playerFixFullScreenButton) rules.push('.ytp-fullscreen-button { display: inline-block !important; visibility: visible !important; }')
  if (config.revertSidebarOrder) rules.push('ytd-guide-renderer #sections { display: flex !important; flex-direction: column !important; } ytd-guide-section-renderer { order: initial !important; }')
  if (config.mobileGridView && MOBILE) rules.push('ytm-rich-grid-renderer .rich-grid-renderer-contents { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important; }')

  if (config.playerControlsBg !== 'default') {
    rules.push('#movie_player { --yt-frosted-glass-backdrop-filter-override: unset !important; --yt-spec-static-overlay-background-hover: ' + config.playerControlsBg + ' !important; }')
  }

  for (var i = 0; i < hide.length; i++) {
    if (hide[i]) rules.push(hide[i] + ' { display: none !important; }')
  }

  var css = rules.join('\n')
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'yt-control-panel-styles'
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
  if (area !== 'sync') return
  if (changes[STORAGE_KEY]) applyConfig(changes[STORAGE_KEY].newValue || {})
}

window.addEventListener('message', function(event) {
  if (event.origin !== chrome.runtime.getURL('').replace(/\/$/, '') || !event.data || event.data.type !== 'yt-panel-config') return
  applyConfig(event.data.config)
})

function init() {
  loadConfig()
  chrome.storage.onChanged.addListener(onStorageChanged)
  var obs = new MutationObserver(function() {
    if (styleEl && !document.head.contains(styleEl)) document.head.appendChild(styleEl)
  })
  obs.observe(document.documentElement, { childList: true, subtree: false })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

(function() {
  var cfg = {}

  function getCfg(cb) {
    chrome.storage.sync.get([STORAGE_KEY], function(r) { cb(Object.assign({}, defaultConfig, r[STORAGE_KEY] || {})) })
  }

  function applyJS(c) {
    cfg = Object.assign({}, defaultConfig, c || {})
    if (!cfg.enabled) return

    if (cfg.redirectShorts && location.pathname.startsWith('/shorts/')) {
      var v = location.pathname.split('/')[2]
      if (v) location.replace('/watch?v=' + v)
    }

    if (cfg.disableAutoplay) {
      var b = document.querySelector('button[data-tooltip-target-id="ytp-autonav-toggle-button"]')
      if (b && b.getAttribute('aria-checked') === 'true') b.click()
    }

    if (cfg.alwaysUseTheaterMode && location.pathname.startsWith('/watch')) {
      var s = document.querySelector('.ytp-size-button')
      if (s) {
        var tip = s.getAttribute('data-tooltip-text') || ''
        if (tip.indexOf('theater') === -1 && tip.indexOf('Theater') === -1) {
          if (!document.querySelector('ytd-watch-flexy[theater]')) s.click()
        }
      }
    }

    if (cfg.stopShortsLooping) {
      var vs = document.querySelectorAll('.html5-video-player video')
      for (var i = 0; i < vs.length; i++) {
        vs[i].loop = false
        vs[i].addEventListener('ended', function() { this.pause() }, { once: true })
      }
    }

    if (cfg.pauseChannelTrailers) {
      var tv = document.querySelector('ytd-channel-video-player-renderer video')
      if (tv && !tv.paused) tv.pause()
    }

    document.querySelectorAll('video').forEach(function(video) {
      if (cfg.disableStableVolume) {
        if (!stableVolumeState.has(video)) stableVolumeState.set(video, { volume: video.volume, muted: video.muted })
      } else {
        var stableVolume = stableVolumeState.get(video)
        if (stableVolume) {
          video.volume = stableVolume.volume
          video.muted = stableVolume.muted
          stableVolumeState.delete(video)
        }
      }
    })

    if (cfg.blockAds) {
      var adVideo = document.querySelector('.ad-showing video')
      if (adVideo && Number.isFinite(adVideo.duration)) adVideo.currentTime = adVideo.duration
      var skip = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, button[id^="skip-button"]')
      if (skip) skip.click()
    }

    if (cfg.hideWatched) {
      var threshold = Math.max(0, Math.min(100, parseInt(cfg.hideWatchedThreshold, 10) || 85))
      document.querySelectorAll('#progress, .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment').forEach(function(progress) {
        var width = parseFloat(progress.style.width || getComputedStyle(progress).width) || 0
        var parentWidth = progress.parentElement ? progress.parentElement.getBoundingClientRect().width : 0
        var percent = progress.style.width.indexOf('%') !== -1 ? width : (parentWidth ? width / parentWidth * 100 : 0)
        var card = progress.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytm-video-with-context-renderer')
        if (card) card.classList.toggle('cpfyt-hide-watched', percent >= threshold)
      })
    }

    if (cfg.alwaysUseOriginalAudio) {
      var player = document.getElementById('movie_player')
      if (player && typeof player.getAudioTrack === 'function' && typeof player.setAudioTrack === 'function') {
        var track = player.getAudioTrack()
        if (track && track.audioTrack && track.audioTrack.isDefault === false) player.setAudioTrack({ audioTrack: Object.assign({}, track.audioTrack, { id: track.audioTrack.id.split('.')[0] }) })
      }
    }

    if (cfg.allowBackgroundPlay) {
      document.querySelectorAll('video').forEach(function(video) {
        if (!video.dataset.nor1cBackgroundPlay) {
          video.dataset.nor1cBackgroundPlay = '1'
          video.addEventListener('pause', function() {
            if (document.hidden && cfg.allowBackgroundPlay && !video.ended) video.play().catch(function() {})
          })
        }
      })
    }

    if (cfg.enforceTheme && cfg.enforceTheme !== 'default') {
      document.documentElement.setAttribute('dark', cfg.enforceTheme === 'dark' ? '' : null)
      if (cfg.enforceTheme === 'light') document.documentElement.removeAttribute('dark')
    }
  }

  getCfg(applyJS)

  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'sync' || !changes[STORAGE_KEY]) return
    applyJS(Object.assign({}, defaultConfig, changes[STORAGE_KEY].newValue || {}))
  })

  window.addEventListener('message', function(e) {
    if (e.origin !== chrome.runtime.getURL('').replace(/\/$/, '') || !e.data || e.data.type !== 'yt-panel-config') return
    applyJS(e.data.config)
  })

  var applyTimer = null
  function scheduleApply() {
    if (applyTimer) clearTimeout(applyTimer)
    applyTimer = setTimeout(function() { applyJS(cfg) }, 100)
  }
  document.addEventListener('yt-navigate-finish', scheduleApply)
  document.addEventListener('yt-page-data-updated', scheduleApply)
  new MutationObserver(scheduleApply).observe(document.documentElement, { childList: true, subtree: true })
})()