(function (root) {
  const STORAGE_KEY = 'savedXProfiles';
  const MAX_PROFILES = 100;
  const MAX_BATCH = 100;
  const MAX_STORAGE_BYTES = 4 * 1024 * 1024;
  const STORAGE_LIMIT_MESSAGE = 'Profile storage budget reached. Collection is partial. Remove a saved profile to free space, then retry Load older photos.';
  const COLLECTION_MESSAGES = Object.freeze({
    loading: 'Reading X’s media timeline. Photos load as X responds; the tab closes when X reports the end.',
    finished: 'X reported the end of this media timeline. All received photo links were saved before stopping. X may still restrict older media.',
    idle: 'No new photos or scroll movement for 20 seconds despite repeated scroll attempts. Collection stopped automatically; this is not a verified full archive. Retry if X was slow.',
    stopped: 'Automatic loading stopped. Collected photos are kept. Load older photos to continue.',
    stalled: 'X did not provide a usable next page or end signal. Loading paused; the tab was kept open. Reload it and retry.',
    timeout: 'Automatic loading paused after 30 minutes. Collection may be partial. Retry to continue.',
    interrupted: 'The media tab was closed or left this profile. Collected photos are kept. Retry to continue.',
    limit: STORAGE_LIMIT_MESSAGE,
    error: 'Automatic loading could not continue. Reload the X tab, check your login or connection, then retry.'
  });
  const hosts = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);
  const reserved = new Set(['home', 'explore', 'search', 'notifications', 'messages', 'settings', 'compose', 'i', 'intent', 'login', 'logout', 'signup', 'tos', 'privacy', 'about', 'help', 'download', 'jobs']);

  function canonicalProfileUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const url = new URL(value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || !hosts.has(url.hostname.toLowerCase()) || url.username || url.password || url.port) return null;
      const match = url.pathname.match(/^\/@?([a-z0-9_]{1,15})(?:\/media)?\/?$/i);
      if (!match || reserved.has(match[1].toLowerCase())) return null;
      const username = match[1].toLowerCase();
      return { id: username, username, url: `https://x.com/${username}/media?filter=photo` };
    } catch (_) { return null; }
  }

  function isMediaPage(value) {
    try { return Boolean(canonicalProfileUrl(value)) && /\/media\/?$/.test(new URL(value).pathname); }
    catch (_) { return false; }
  }

  function normalizePhoto(item, username) {
    if (!item || typeof item.url !== 'string' || item.url.length > 2048 || typeof item.postUrl !== 'string' || item.postUrl.length > 2048) return null;
    try {
      const image = new URL(item.url);
      if (image.protocol !== 'https:' || image.hostname !== 'pbs.twimg.com' || image.port || image.username || image.password) return null;
      const media = image.pathname.match(/^\/media\/([a-z0-9_-]+)(?:\.(jpg|jpeg|png|webp))?$/i);
      if (!media) return null;
      const format = (image.searchParams.get('format') || media[2] || 'jpg').toLowerCase();
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(format)) return null;
      const post = new URL(item.postUrl);
      if (!['https:', 'http:'].includes(post.protocol) || !hosts.has(post.hostname.toLowerCase()) || post.username || post.password || post.port) return null;
      const match = post.pathname.match(/^\/([a-z0-9_]{1,15})\/status\/(\d+)(?:\/photo\/[1-4])?\/?$/i);
      if (!match || match[1].toLowerCase() !== username) return null;
      return {
        id: media[1],
        url: `https://pbs.twimg.com/media/${media[1]}?format=${format}&name=orig`,
        postUrl: `https://x.com/${username}/status/${match[2]}`,
        alt: typeof item.alt === 'string' ? item.alt.trim().slice(0, 500) : ''
      };
    } catch (_) { return null; }
  }

  function thumbnailUrl(value) {
    const url = new URL(value);
    url.searchParams.set('name', 'small');
    return url.href;
  }

  root.Nor1cSavedXProfiles = Object.freeze({ STORAGE_KEY, MAX_PROFILES, MAX_BATCH, MAX_STORAGE_BYTES, STORAGE_LIMIT_MESSAGE, COLLECTION_MESSAGES, canonicalProfileUrl, isMediaPage, normalizePhoto, thumbnailUrl });
})(globalThis);
