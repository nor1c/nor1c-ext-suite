(function () {
  const STYLE_ID = 'nor1c-cookie-consent-style';

  const HIDE_CSS = [
    '[id*="cookie" i][class*="banner" i]',
    '[class*="cookie-consent" i]',
    '[class*="cookie-notice" i]',
    '[class*="cookie-banner" i]',
    '[class*="gdpr" i][class*="banner" i]',
    '[class*="gdpr" i][class*="notice" i]',
    '[id*="gdpr" i][class*="banner" i]',
    '[class*="consent-banner" i]',
    '[class*="cookiebot" i]',
    '[class*="onetrust-banner" i]',
    '#onetrust-banner-sdk',
    '#CybotCookiebotDialog',
    '#gdpr-cookie-notice',
    '.cookie-banner',
    '.consent-banner',
    '[id*="sp_message_container"]',
    '[id*="sp_veil"]',
    'div[data-testid="cookie-policy-banner"]',
    'div[class*="CookieBanner"]',
    'section[data-testid="cookie-banner"]',
    'aside[class*="cookie" i]',
    '[class*="privacy-banner" i]',
    '[class*="cc-banner"]',
    '[id*="cookielaw"]',
    '#cookielaw-banner',
    '.CookieConsent',
    '.eu-cookie-compliance-banner',
    '.gdpr-modal',
    '#cookie-law-info-bar',
    '.cli-modal-backdrop',
    '#cookie_action_message',
    '[id*="usercentics"]',
    '[class*="usercentics"]',
    '[class*="UCB"]',
    '[class*="cmpbox"]',
    '[id*="cmpbox"]',
    '[class*="truste_"]',
    '[id*="truste_"]',
    '[class*="evidon"]',
    '[id*="evidon-banner"]',
    '[class*="iubenda"]',
    '[id*="iubenda"]',
    '[class*="cookieconsent" i]',
    '[class*="cookie_msg" i]',
    '[class*="cookies-policy" i]',
    '[class*="cookie-law" i]',
    '[class*="cookiealert" i]',
    '[class*="cookie-warning" i]',
    '[class*="cookie-bar" i]',
    '[class*="cookie-popup" i]',
    '[class*="cookie-modal" i]',
    '[class*="cookie-dialog" i]',
    '[class*="cookie-wall" i]',
    '[data-cookieconsent]',
    '[data-testid*="cookie"]',
    '[aria-label*="cookie" i][role="dialog"]',
    '[aria-label*="consent" i][role="dialog"]',
    '[aria-label*="privacy" i][role="dialog"]'
  ].join(',\n') + ' { display: none !important; visibility: hidden !important; pointer-events: none !important; }';

  let active = null;
  let style = null;
  let observer = null;
  let clickTimer = null;

  const REJECT_PATTERNS = [
    /reject\s*all/i,
    /decline\s*all/i,
    /refuse\s*all/i,
    /deny\s*all/i,
    /reject\s*cookies/i,
    /decline\s*cookies/i,
    /refuse\s*cookies/i,
    /only\s*necessary/i,
    /only\s*essential/i,
    /necessary\s*only/i,
    /essential\s*only/i,
    /manage\s*preferences/i,
    /cookie\s*settings/i,
    /customize/i,
    /alle\s*ablehnen/i,
    /alles\s*ablehnen/i,
    /rejeter\s*tout/i,
    /refuser\s*tout/i,
    /solo\s*necesarias/i,
    /nur\s*notwendige/i,
    /bara\s*nödvändiga/i,
    /kun\s*nødvendige/i,
    /alleen\s*noodzakelijke/i,
    /rechazar\s*todo/i,
    /rifiuta\s*tutti/i,
    /alle\s*ablehnen/i
  ];

  const REJECT_SELECTORS = [
    '[data-testid*="reject"]',
    '[aria-label*="reject" i]',
    'button[id*="reject" i]',
    '[id*="onetrust-reject"]',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
    '.qc-cmp2-summary-buttons button[mode="secondary"]',
    '.didomi-continue-without-agreeing',
    '[class*="uc-btn-"][class*="decline"]',
    'button[data-cky-tag="reject-button"]',
    '.onetrust-close-btn-handler'
  ];

  function apply() {
    injectCSS();
    scheduleClick();
    startObserver();
  }

  function remove() {
    removeCSS();
    stopObserver();
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
  }

  function injectCSS() {
    if (style) return;
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = HIDE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeCSS() {
    if (style) { style.remove(); style = null; }
  }

  function scheduleClick() {
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(tryClickReject, 800);
  }

  function tryClickReject() {
    for (var i = 0; i < REJECT_SELECTORS.length; i++) {
      var el = document.querySelector(REJECT_SELECTORS[i]);
      if (el && el.offsetParent !== null) {
        el.click();
        return;
      }
    }
    var buttons = document.querySelectorAll('button, a[role="button"], [type="button"]');
    for (var j = 0; j < buttons.length; j++) {
      var btn = buttons[j];
      if (btn.offsetParent === null) continue;
      var text = (btn.textContent || '').trim();
      if (!text || text.length > 50) continue;
      for (var k = 0; k < REJECT_PATTERNS.length; k++) {
        if (REJECT_PATTERNS[k].test(text)) {
          btn.click();
          return;
        }
      }
    }
  }

  function startObserver() {
    if (observer) return;
    var scanCount = 0;
    var maxScans = 10;
    var debounceTimer = null;

    observer = new MutationObserver(function(mutations) {
      if (scanCount >= maxScans) return;
      if (debounceTimer) return;
      debounceTimer = setTimeout(function() {
        debounceTimer = null;
        scanCount++;
        scheduleClick();
        if (scanCount >= maxScans && observer) {
          observer.disconnect();
          observer = null;
        }
      }, 1000);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  function setActive(val) {
    active = val;
    if (active) apply(); else remove();
  }

  chrome.storage.sync.get(['cookieConsent'], (result) => {
    const val = result.cookieConsent !== false;
    active = val;
    if (val) apply();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.cookieConsent) return;
    setActive(changes.cookieConsent.newValue);
  });
})();
