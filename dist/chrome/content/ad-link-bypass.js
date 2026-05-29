(function () {
  var currentHost = location.hostname.replace(/^www\./, '');
  var bypassOn = false;

  function isLikelyAdUrl(url) {
    try {
      var u = new URL(url);
      var host = u.hostname.replace(/^www\./, '');
      var path = u.pathname;

      if (host === currentHost || host.endsWith('.' + currentHost)) return false;

      var KNOWN = [
        'adf.ly', 'ouo.io', 'ouo.press', 'linkvertise.com',
        'sh.st', 'shorte.st', 'bc.vc', 'exe.io', 'fc.lc',
        'crn77.com', 'cr00.biz', 'cr87.biz',
        'gplinks.co', 'droplink.co', 'tnlink.in',
        'za.gl', 'ez4short.com', 'try2link.com',
        'link1s.com', 'mlink.in', 'atglinks.com'
      ];
      for (var i = 0; i < KNOWN.length; i++) {
        if (host === KNOWN[i] || host.endsWith('.' + KNOWN[i])) return true;
      }

      if (/^\/\d{1,3}\/\d{4,}$/.test(path)) return true;
      if (/\/(ad[s]?\/|click\/|go\/|out\/|away\/|track\/)/i.test(path)) return true;

      return false;
    } catch (_) {
      return false;
    }
  }

  // === Page-context hook: override window.open ===
  var script = document.createElement('script');
  script.textContent = '(' + function () {
    var meta = document.createElement('meta');
    meta.name = 'nor1c-ad-bypass';
    meta.content = 'false';
    document.documentElement.appendChild(meta);

    var origOpen = window.open;
    window.open = function (url, name, features) {
      var el = document.querySelector('meta[name="nor1c-ad-bypass"]');
      if (!el || el.content !== 'true' || !url) {
        return origOpen.apply(window, arguments);
      }
      console.log('[Nor1c Suite] Blocked ad popup: ' + url);
      return { closed: true, close: function () {}, focus: function () {}, blur: function () {} };
    };
  } + ')();';
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  // === Click handler: strip onclick from ad links ===
  document.addEventListener('click', function (e) {
    if (!bypassOn) return;

    var el = e.target;
    while (el && el !== document.body) {
      if (el.tagName === 'A') {
        var onclick = el.getAttribute('onclick') || '';
        var match = onclick.match(/window\.open\s*\(\s*['"]([^'"]+)['"]/);
        if (match && match[1] && isLikelyAdUrl(match[1])) {
          el.removeAttribute('onclick');
          console.log('[Nor1c Suite] Stripped ad onclick: ' + match[1]);
          setTimeout(function () {
            try { el.setAttribute('onclick', onclick); } catch (_) {}
          }, 200);
        }
        break;
      }
      el = el.parentElement;
    }
  }, true);

  // === State sync (runs early at document_start) ===
  function setState(val) {
    bypassOn = !!val;
    try {
      var meta = document.querySelector('meta[name="nor1c-ad-bypass"]');
      if (meta) meta.content = bypassOn ? 'true' : 'false';
    } catch (_) {}
  }

  // Set default immediately (ON), then confirm from storage
  setState(true);

  try {
    chrome.storage.sync.get(['adLinkBypass'], function (r) {
      setState(r.adLinkBypass !== false);
    });
  } catch (_) {}

  try {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg.type === 'toggle-changed' && msg.key === 'adLinkBypass') {
        setState(msg.value);
      }
    });
  } catch (_) {}
})();
