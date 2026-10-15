(function () {
  if (globalThis.__nor1cMediaTimelineObserver) return;
  globalThis.__nor1cMediaTimelineObserver = true;
  const parser = globalThis.Nor1cXMediaTimeline;
  const CHANNEL = 'nor1c-x-media-timeline-v1';
  let route = '';
  let generation = 0;
  let sequence = 0;
  let latestSequence = 0;
  let knownUserId = '';
  let snapshot = { state: 'unknown', photos: [], revision: 0 };
  const bufferedPhotos = new Map();
  let overflow = false;
  let uncertain = false;
  const pending = new Set();
  const readSnapshot = () => {
    syncRoute();
    return { href: route, profileId: profileRoute(), state: snapshot.state, pending: pending.size, revision: snapshot.revision };
  };
  Object.defineProperty(window, '__nor1cReadMediaTimeline', { value: readSnapshot, writable: false, configurable: false });

  function profileRoute() {
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(location.hostname)) return '';
    return /^\/@?([a-z0-9_]{1,15})\/media\/?$/i.exec(location.pathname)?.[1].toLowerCase() || '';
  }

  function syncRoute() {
    const next = profileRoute();
    const key = next ? location.href : '';
    if (route !== key) {
      route = key;
      generation += 1;
      latestSequence = 0;
      knownUserId = '';
      pending.clear();
      bufferedPhotos.clear();
      overflow = false;
      uncertain = false;
      snapshot = { state: 'unknown', photos: [], revision: ++sequence };
    }
    return next;
  }

  function emit() {
    const profileId = syncRoute();
    if (!profileId) return;
    // Only sanitized photo links and lifecycle state leave the page world. Never headers,
    // cookies, raw responses, user IDs, or request cursors.
    window.postMessage({ channel: CHANNEL, kind: 'state', profileId, href: route, pending: pending.size, ...snapshot, photos: [...bufferedPhotos.values()] }, location.origin);
  }

  function begin(input, method = 'GET') {
    const profileId = syncRoute();
    if (!profileId || method.toUpperCase() !== 'GET') return null;
    try {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
      if (url.origin !== location.origin || !/^\/i\/api\/graphql\/[^/]+\/UserMedia$/.test(url.pathname)) return null;
      const encoded = url.searchParams.get('variables') || '';
      if (encoded.length > 16000) return null;
      const vars = JSON.parse(encoded);
      if (!/^\d+$/.test(String(vars.userId)) || (vars.cursor != null && (typeof vars.cursor !== 'string' || vars.cursor.length > 4096))) return null;
      const request = { profileId, userId: String(vars.userId), cursor: vars.cursor || '', generation, sequence: ++sequence };
      latestSequence = request.sequence;
      pending.add(request.sequence);
      snapshot = { state: 'loading', photos: [], revision: snapshot.revision };
      emit();
      return request;
    } catch (_) { return null; }
  }

  function finish(request, data, status) {
    syncRoute();
    if (!request || request.generation !== generation) return;
    pending.delete(request.sequence);
    const result = status >= 200 && status < 300 ? parser.parsePage(data, request, knownUserId) : { state: 'error', photos: [] };
    if (result.matchedUser) knownUserId = request.userId;
    for (const photo of result.photos) {
      if (bufferedPhotos.has(photo.url)) continue;
      if (bufferedPhotos.size >= parser.MAX_PHOTOS) { overflow = true; break; }
      bufferedPhotos.set(photo.url, photo);
    }
    // Never discard a slower page's photos, or close after a concurrent failed page.
    if (['unknown', 'error'].includes(result.state)) uncertain = true;
    const state = result.state === 'error' ? 'error' : overflow || uncertain ? 'unknown' : request.sequence === latestSequence ? result.state : snapshot.state;
    snapshot = { state, photos: [], revision: ++sequence };
    emit();
  }

  const originalFetch = window.fetch;
  window.fetch = function (input, options) {
    const request = begin(input, options?.method || input?.method || 'GET');
    let result;
    try { result = Reflect.apply(originalFetch, this, arguments); }
    catch (error) { finish(request, null, 0); throw error; }
    if (request) result.then(async response => {
      try {
        const size = Number(response.headers.get('content-length'));
        if (size > 8 * 1024 * 1024) { finish(request, null, response.status); return; }
        const text = await response.clone().text();
        finish(request, text.length <= 8 * 1024 * 1024 ? JSON.parse(text) : null, response.status);
      } catch (_) { finish(request, null, 0); }
    }, () => finish(request, null, 0));
    return result;
  };

  const requests = new WeakMap();
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    const result = Reflect.apply(open, this, arguments);
    requests.set(this, { method, url });
    return result;
  };
  XMLHttpRequest.prototype.send = function () {
    const meta = requests.get(this);
    const request = meta && begin(meta.url, meta.method);
    if (request) {
      this.addEventListener('loadend', () => {
        try {
          const data = this.responseType === 'json' ? this.response : this.responseText.length <= 8 * 1024 * 1024 ? JSON.parse(this.responseText) : null;
          finish(request, data, this.status);
        } catch (_) { finish(request, null, 0); }
      }, { once: true });
    }
    try { return Reflect.apply(send, this, arguments); }
    catch (error) { finish(request, null, 0); throw error; }
  };
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== CHANNEL) return;
    if (event.data.kind === 'read') emit();
    if (event.data.kind === 'ack' && event.data.href === route && event.data.revision === snapshot.revision) bufferedPhotos.clear();
  });
})();
