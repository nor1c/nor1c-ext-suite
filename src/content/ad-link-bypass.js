(function () {
  const currentHost = location.hostname.replace(/^www\./, '');
  let bypassOn = false;

  function isLikelyAdUrl(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      const path = u.pathname;

      if (host === currentHost || host.endsWith('.' + currentHost)) return false;

      const KNOWN = [
        'adf.ly', 'ouo.io', 'ouo.press', 'linkvertise.com',
        'sh.st', 'shorte.st', 'bc.vc', 'exe.io', 'fc.lc',
        'crn77.com', 'cr00.biz', 'cr87.biz',
        'gplinks.co', 'droplink.co', 'tnlink.in',
        'za.gl', 'ez4short.com', 'try2link.com',
        'link1s.com', 'mlink.in', 'atglinks.com'
      ];
      for (let i = 0; i < KNOWN.length; i++) {
        if (host === KNOWN[i] || host.endsWith('.' + KNOWN[i])) return true;
      }

      if (/^\/\d{1,3}\/\d{4,}$/.test(path)) return true;
      if (/\/(ad[s]?\/|click\/|go\/|out\/|away\/|track\/)/i.test(path)) return true;

      return false;
    } catch (_) {
      return false;
    }
  }

  document.addEventListener('click', function (e) {
    if (!bypassOn) return;

    let el = e.target;
    while (el && el !== document.body) {
      if (el.tagName === 'A') {
        const onclick = el.getAttribute('onclick') || '';
        const match = onclick.match(/window\.open\s*\(\s*['"]([^'"]+)['"]/);
        if (match && match[1] && isLikelyAdUrl(match[1])) {
          el.removeAttribute('onclick');
          setTimeout(function () {
            try { el.setAttribute('onclick', onclick); } catch (_) {}
          }, 200);
        }
        break;
      }
      el = el.parentElement;
    }
  }, true);

  function setState(val) {
    bypassOn = !!val;
    try {
      const meta = document.querySelector('meta[name="nor1c-ad-bypass"]');
      if (meta) meta.content = bypassOn ? 'true' : 'false';
    } catch (_) {}
  }

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
