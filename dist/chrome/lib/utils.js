function nor1cGetDomain(hostname) {
  var h = hostname || location.hostname;
  var parts = h.split('.');
  if (parts.length <= 2) return h;
  return parts.slice(-2).join('.');
}
