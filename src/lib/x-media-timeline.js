(function (root) {
  const MAX_PHOTOS = 1600;

  function parsePage(data, request, knownUserId = '') {
    const photos = [];
    if (!data || typeof data !== 'object' || (Array.isArray(data.errors) && data.errors.length)) return { state: 'error', photos };
    const user = data.data?.user?.result;
    if (!user || user.__typename === 'UserUnavailable') return { state: 'error', photos };
    const sets = [user.timeline_v2?.timeline?.instructions, user.timeline?.timeline?.instructions].filter(Array.isArray);
    if (!sets.length) return { state: 'unknown', photos };
    const instructions = sets.flat();
    let matchedUser = knownUserId === request.userId;
    const handle = user.legacy?.screen_name || user.core?.screen_name;
    if (handle && String(handle).toLowerCase() !== request.profileId) return { state: 'unknown', photos };
    if (user.rest_id && String(user.rest_id) !== request.userId) return { state: 'unknown', photos };
    if (handle && String(user.rest_id) === request.userId) matchedUser = true;
    let cursor = '';
    let terminated = false;
    let hasPage = false;
    let partial = false;
    let unknown = false;
    let tweets = 0;
    let visited = 0;
    const seen = new Set();
    const knownTypes = new Set(['TimelineAddEntries', 'TimelineAddToModule', 'TimelineReplaceEntry', 'TimelineClearCache', 'TimelinePinEntry', 'TimelineTerminateTimeline']);

    function visit(value, depth = 0) {
      if (!value || typeof value !== 'object') return;
      if (++visited > 20000 || depth > 30) { unknown = true; return; }
      if (value.type === 'TimelinePinEntry') return;
      if (['Bottom', 'ShowMore'].includes(value.cursorType)) {
        if (typeof value.value === 'string' && value.value.length <= 4096) cursor = value.value;
        else unknown = true;
      }
      if (value.tweet_results) {
        const raw = value.tweet_results.result;
        const tweet = raw?.tweet || raw;
        const author = tweet?.core?.user_results?.result;
        const username = author?.legacy?.screen_name || author?.core?.screen_name;
        if (String(author?.rest_id) === request.userId && String(username).toLowerCase() === request.profileId) {
          matchedUser = true;
          tweets += 1;
          if (!/^\d+$/.test(String(tweet.rest_id))) { unknown = true; return; }
          for (const media of tweet.legacy?.extended_entities?.media || []) {
            if (media.type !== 'photo') continue;
            if (photos.length >= MAX_PHOTOS) { unknown = true; break; }
            try {
              const url = new URL(media.media_url_https);
              if (url.protocol !== 'https:' || url.hostname !== 'pbs.twimg.com' || url.username || url.password || url.port || !/^\/media\/[a-z0-9_-]+(?:\.(?:jpg|jpeg|png|webp))?$/i.test(url.pathname)) { unknown = true; continue; }
              if (seen.has(url.href)) continue;
              seen.add(url.href);
              photos.push({ url: url.href, postUrl: `https://x.com/${request.profileId}/status/${tweet.rest_id}`, alt: typeof media.ext_alt_text === 'string' ? media.ext_alt_text.slice(0, 500) : '' });
            } catch (_) { unknown = true; }
          }
        }
        // Do not collect nested quoted/retweeted posts from a timeline item.
        return;
      }
      for (const child of Object.values(value)) visit(child, depth + 1);
    }

    for (const instruction of instructions) {
      if (!knownTypes.has(instruction?.type)) unknown = true;
      if (instruction?.type === 'TimelineAddEntries') {
        if (!Array.isArray(instruction.entries)) unknown = true;
        else hasPage = true;
      }
      if (instruction?.type === 'TimelineAddToModule') {
        partial = true;
        if (!Array.isArray(instruction.moduleItems)) unknown = true;
      }
      if (instruction?.type === 'TimelineReplaceEntry') {
        partial = true;
        if (!instruction.entry || typeof instruction.entry !== 'object') unknown = true;
      }
      if (instruction?.type === 'TimelineTerminateTimeline' && ['Bottom', 'TopAndBottom'].includes(instruction.direction)) terminated = true;
      visit(instruction);
    }
    if (!matchedUser || unknown || ((!hasPage || partial) && !terminated)) return { state: 'unknown', photos, matchedUser };
    // An empty page WITH an advancing cursor is not the end (e.g. filtered videos).
    const ended = terminated || !cursor || (request.cursor && cursor === request.cursor && tweets === 0);
    return { state: ended ? 'end' : 'more', photos, matchedUser };
  }

  root.Nor1cXMediaTimeline = Object.freeze({ parsePage, MAX_PHOTOS });
})(globalThis);
