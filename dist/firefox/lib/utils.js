function nor1cGetDomain(hostname) {
  const host = (hostname || location.hostname).toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const privateSuffixes = new Set(['appspot.com', 'blogspot.com', 'github.io', 'gitlab.io', 'herokuapp.com', 'netlify.app', 'pages.dev', 'vercel.app', 'web.app']);
  const suffix = parts.slice(-2).join('.');
  if (privateSuffixes.has(suffix)) return parts.slice(-3).join('.');
  const commonSecondLevelDomains = new Set(['ac', 'co', 'com', 'edu', 'gov', 'net', 'org']);
  const countryCode = parts[parts.length - 1].length === 2;
  const secondLevel = parts[parts.length - 2];
  const labelCount = countryCode && commonSecondLevelDomains.has(secondLevel) ? 3 : 2;
  return parts.slice(-labelCount).join('.');
}
