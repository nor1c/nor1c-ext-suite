(function() {
  const knownHosts = [
    'adf.ly', 'ouo.io', 'ouo.press', 'linkvertise.com',
    'sh.st', 'shorte.st', 'bc.vc', 'exe.io', 'fc.lc',
    'crn77.com', 'cr00.biz', 'cr87.biz', 'gplinks.co',
    'droplink.co', 'tnlink.in', 'za.gl', 'ez4short.com',
    'try2link.com', 'link1s.com', 'mlink.in', 'atglinks.com'
  ];
  const currentHost = location.hostname.replace(/^www\./, '');

  function isLikelyAdUrl(value) {
    try {
      const url = new URL(String(value), location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      const host = url.hostname.replace(/^www\./, '');
      if (host === currentHost || host.endsWith('.' + currentHost)) return false;
      if (knownHosts.some(known => host === known || host.endsWith('.' + known))) return true;
      if (/^\/\d{1,3}\/\d{4,}$/.test(url.pathname)) return true;
      return /\/(ad[s]?\/|click\/|go\/|out\/|away\/|track\/)/i.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  const nativeOpen = window.open;
  window.open = function(url) {
    if (!url || !isLikelyAdUrl(url)) return Reflect.apply(nativeOpen, this, arguments);
    return { closed: true, close() {}, focus() {}, blur() {} };
  };
})();
