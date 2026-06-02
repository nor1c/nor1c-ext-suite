(function() {
  const TRACKING_PARAMS = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'utm_reader', 'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid',
    'wbraid', 'msclkid', 'ref', 'mc_cid', 'mc_eid', '_ga', '_gl', '_hsenc',
    '_hsmi', 'hsCtaTracking', '__hsfp', '__hssc', '__hstc', 'trk_contact',
    'trk_msg', 'trk_module', 'trk_sid', 'mc_tc', 'mk_tok', 'vgo_ee', 'yclid',
    'oly_anon_id', 'oly_enc_id', 'openExternalBrowser', 'igshid', 'si',
    's_kwcid', 'twclid', 'sc_campaign', 'sc_channel', 'sc_content',
    'sc_medium', 'sc_outcome', 'sc_geo', 'sc_country', 'vero_conv', 'vero_id',
    'wickedid', 'offer_id', 'affiliate_id', 'click_id', 'irclickid',
    'iraffiliateid', 'irpid', 'sharedid', 'ttclid', 'rdt_cid', 'beehiive_id',
    'spm', 'scm', 'tracking_source', 'trk', 'campaign_id', 'utm_referrer',
    'utm_social', 'utm_social_type', 'li_fat_id'
  ]);

  let urlCleanerEnabled = true;
  let lastContextLink = null;
  let pendingClean = false;

  chrome.storage.sync.get(['urlCleaner'], function(result) {
    urlCleanerEnabled = result.urlCleaner !== false;
  });

  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === 'sync' && changes.urlCleaner) {
      urlCleanerEnabled = changes.urlCleaner.newValue !== false;
    }
  });

  function cleanUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return rawUrl;
      let changed = false;
      for (const key of [...url.searchParams.keys()]) {
        if (TRACKING_PARAMS.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      return changed ? url.toString() : rawUrl;
    } catch (_) {
      return rawUrl;
    }
  }

  function looksLikeUrl(text) {
    return /^https?:\/\//i.test(text.trim());
  }

  document.addEventListener('contextmenu', function(e) {
    let el = e.target;
    while (el && el !== document.body) {
      if (el.tagName === 'A' && el.href) {
        lastContextLink = el.href;
        return;
      }
      el = el.parentElement;
    }
    lastContextLink = null;
  }, true);

  document.addEventListener('copy', function(e) {
    if (!urlCleanerEnabled) return;

    const selection = window.getSelection().toString().trim();
    if (selection && looksLikeUrl(selection)) {
      const cleaned = cleanUrl(selection);
      if (cleaned !== selection) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', cleaned);
      }
      return;
    }

    if (lastContextLink) {
      pendingClean = lastContextLink;
      lastContextLink = null;
      setTimeout(function() {
        if (!pendingClean) return;
        const cleaned = cleanUrl(pendingClean);
        if (cleaned !== pendingClean) {
          navigator.clipboard.writeText(cleaned).catch(function() {});
        }
        pendingClean = null;
      }, 10);
    }
  }, true);
})();
