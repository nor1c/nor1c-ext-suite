const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/x-media-timeline.js'), 'utf8');
const observerSource = fs.readFileSync(path.join(__dirname, '../src/content/x-media-timeline-main.js'), 'utf8');
const context = vm.createContext({ URL });
vm.runInContext(source, context);
const parse = context.Nor1cXMediaTimeline.parsePage;
const request = { profileId: 'alice', userId: '42', cursor: '' };
const cursor = value => ({ content: { entryType: 'TimelineTimelineCursor', cursorType: 'Bottom', value } });
const tweet = id => ({ content: { itemContent: { tweet_results: { result: {
  rest_id: String(id), core: { user_results: { result: { rest_id: '42', core: { screen_name: 'alice' } } } },
  legacy: { extended_entities: { media: [{ type: 'photo', media_url_https: `https://pbs.twimg.com/media/img_${id}.jpg` }] } }
} } } } });
const payload = (entries, extra = []) => ({ data: { user: { result: { rest_id: '42', timeline_v2: { timeline: { instructions: [{ type: 'TimelineAddEntries', entries }, ...extra] } } } } } });

test('UserMedia reads photos and advancing cursor, including empty filtered pages', () => {
  const first = parse(payload([tweet(1), cursor('next')]), request);
  assert.equal(first.state, 'more');
  assert.equal(first.matchedUser, true);
  assert.equal(first.photos[0].postUrl, 'https://x.com/alice/status/1');
  assert.equal(parse(payload([cursor('later')]), { ...request, cursor: 'next' }, '42').state, 'more');
});

test('explicit bottom termination, no cursor and exhausted cursor report end without waiting', () => {
  for (const direction of ['Bottom', 'TopAndBottom']) {
    const result = parse(payload([tweet(1), cursor('unused')], [{ type: 'TimelineTerminateTimeline', direction }]), request);
    assert.equal(result.state, 'end');
    assert.equal(result.photos.length, 1);
  }
  assert.equal(parse(payload([tweet(1)]), request).state, 'end');
  assert.equal(parse(payload([]), { ...request, cursor: 'last' }, '42').state, 'end');
  assert.equal(parse(payload([cursor('same')]), { ...request, cursor: 'same' }, '42').state, 'end');
  assert.equal(parse(payload([tweet(1), cursor('same')]), { ...request, cursor: 'same' }, '42').state, 'more');
  assert.equal(parse(payload([tweet(1), cursor('next')], [{ type: 'TimelineTerminateTimeline', direction: 'Top' }]), request).state, 'more');
});

test('malformed, error, unknown, truncated and wrong-user responses never close a tab', () => {
  for (const data of [null, {}, { errors: [{ message: 'rate limited' }] }, { data: { user: { result: { __typename: 'UserUnavailable' } } } }, payload([], [{ type: 'NewUnknownInstruction' }])]) {
    assert.ok(['unknown', 'error'].includes(parse(data, request, '42').state));
  }
  assert.equal(parse(payload([]), request).state, 'unknown');
  const missing = payload([]);
  missing.data.user.result.timeline_v2.timeline.instructions = [];
  assert.equal(parse(missing, request, '42').state, 'unknown');
  for (const instruction of [{ type: 'TimelineAddEntries' }, { type: 'TimelineAddToModule', moduleItems: [] }, { type: 'TimelineReplaceEntry', entry: cursor('next') }]) {
    missing.data.user.result.timeline_v2.timeline.instructions = [instruction];
    assert.equal(parse(missing, request, '42').state, 'unknown');
  }
  const wrong = payload([tweet(1)]);
  wrong.data.user.result.rest_id = '99';
  assert.equal(parse(wrong, request).state, 'unknown');
  const truncated = payload([tweet(1)]);
  truncated.data.user.result.timeline_v2.timeline.instructions[0].entries[0].content.itemContent.tweet_results.result.legacy.extended_entities.media[0].media_url_https = 'https://evil.test/a';
  assert.equal(parse(truncated, request).state, 'unknown');
});

test('nested media modules collect photos without quoted-post or pinned-post contamination', () => {
  const own = tweet(1);
  own.content.itemContent.tweet_results.result.quoted_status_result = tweet(9).content.itemContent.tweet_results;
  const result = parse(payload([{ content: { items: [{ item: own.content }] } }, cursor('next')], [{ type: 'TimelinePinEntry', entry: tweet(8) }]), request);
  assert.deepEqual(Array.from(result.photos, item => item.postUrl), ['https://x.com/alice/status/1']);
});

function observerHarness() {
  const messages = [];
  const pending = [];
  const listeners = {};
  const location = { href: 'https://x.com/alice/media?filter=photo', hostname: 'x.com', pathname: '/alice/media', origin: 'https://x.com' };
  const originalFetch = function (...args) { return new Promise((resolve, reject) => pending.push({ resolve, reject, args })); };
  class XHR {
    open(method, url) { this.url = url; this.method = method; }
    send() { this.sent = true; }
    addEventListener(type, callback) { this[type] = callback; }
  }
  const root = { URL, location, XMLHttpRequest: XHR, fetch: originalFetch, addEventListener(type, fn) { listeners[type] = fn; }, postMessage(message) { messages.push(structuredClone(message)); } };
  root.window = root;
  const ctx = vm.createContext(root);
  vm.runInContext(source, ctx);
  vm.runInContext(observerSource, ctx);
  const url = cursorValue => `https://x.com/i/api/graphql/dynamic-query/UserMedia?variables=${encodeURIComponent(JSON.stringify({ userId: '42', ...(cursorValue ? { cursor: cursorValue } : {}) }))}`;
  const respond = async (index, data, status = 200) => {
    pending[index].resolve({ status, headers: { get() { return ''; } }, clone() { return { async text() { return JSON.stringify(data); } }; } });
    await new Promise(resolve => setImmediate(resolve));
  };
  return { ctx, messages, pending, listeners, location, XHR, url, respond };
}

test('passive fetch observer does not issue requests or expose credentials and rejects stale-route responses', async () => {
  const h = observerHarness();
  const result = h.ctx.fetch(h.url(), { headers: { Authorization: 'FAKE_SECRET_DO_NOT_EXPOSE' } });
  assert.equal(h.pending.length, 1);
  assert.equal(h.messages.at(-1).pending, 1);
  await h.respond(0, payload([tweet(1), cursor('next')]));
  await result;
  assert.equal(h.messages.at(-1).state, 'more');
  assert.equal(h.messages.at(-1).pending, 0);
  assert.doesNotMatch(JSON.stringify(h.messages), /FAKE_SECRET|Authorization|next|userId/);
  h.ctx.fetch(h.url('next'));
  await h.respond(1, payload([]));
  assert.equal(h.messages.at(-1).state, 'end');
  h.ctx.fetch(h.url('later'));
  h.location.href = 'https://x.com/bob/media';
  h.location.pathname = '/bob/media';
  await h.respond(2, payload([]));
  h.listeners.message({ source: h.ctx, origin: h.location.origin, data: { channel: 'nor1c-x-media-timeline-v1', kind: 'read' } });
  assert.ok(h.messages.at(-1).href !== 'https://x.com/bob/media' || h.messages.at(-1).state !== 'end');
});

test('concurrent out-of-order pages retain all photos before publishing a terminal signal', async () => {
  const h = observerHarness();
  h.ctx.fetch(h.url());
  h.ctx.fetch(h.url('next'));
  await h.respond(1, payload([tweet(2)]));
  assert.equal(h.messages.at(-1).state, 'end');
  assert.equal(h.messages.at(-1).pending, 1);
  await h.respond(0, payload([tweet(1), cursor('next')]));
  assert.equal(h.messages.at(-1).state, 'end');
  assert.equal(h.messages.at(-1).pending, 0);
  assert.deepEqual(h.messages.at(-1).photos.map(photo => photo.postUrl).sort(), ['https://x.com/alice/status/1', 'https://x.com/alice/status/2']);
});

test('XHR observer handles actual JSON bodies, HTTP errors and unrelated endpoints', () => {
  const h = observerHarness();
  const xhr = new h.XHR();
  xhr.open('GET', h.url());
  xhr.send();
  xhr.status = 200;
  xhr.responseType = 'json';
  xhr.response = payload([tweet(2)]);
  xhr.loadend();
  assert.equal(h.messages.at(-1).state, 'end');
  const bad = new h.XHR();
  bad.open('GET', h.url()); bad.send(); bad.status = 429; bad.responseType = 'json'; bad.response = {};
  bad.loadend();
  assert.equal(h.messages.at(-1).state, 'error');
  const count = h.messages.length;
  const unrelated = new h.XHR(); unrelated.open('GET', 'https://x.com/i/api/graphql/id/HomeTimeline'); unrelated.send();
  assert.equal(h.messages.length, count);
});
