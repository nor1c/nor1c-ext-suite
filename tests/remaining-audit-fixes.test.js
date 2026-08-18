const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('element hider isolates each selector rule', () => {
  const source = read('src/content/element-hider.js');
  assert.match(source, /map\(rule => rule\.selector \+ ' \{ display: none !important; \}'\)/);
  assert.doesNotMatch(source, /map\(r => r\.selector\)\.join\(',\\n'\)/);
});

test('background batches setting broadcasts once per tab', () => {
  const source = read('src/background.js');
  assert.match(source, /changes: changedValues/);
  assert.doesNotMatch(source, /for \(const key of changedKeys\) \{\s*chrome\.tabs\.sendMessage/);
});

test('smooth scroll removes media tracking listeners when disabled', () => {
  const source = read('src/content/smooth-scroll.js');
  for (const event of ['playing', 'pause', 'ended', 'emptied']) {
    assert.match(source, new RegExp(`removeEventListener\\('${event}', updatePlayingState, true\\)`));
  }
  assert.match(source, /playingVideos\.clear\(\);/);
  assert.match(source, /stopVideoTracking\(\);/);
});

test('smooth scroll avoids feed-wide media rescans and caps delayed animation frames', () => {
  const source = read('src/content/smooth-scroll.js');
  assert.doesNotMatch(source, /function refreshPlayingState/);
  assert.doesNotMatch(source, /createTreeWalker/);
  assert.match(source, /if \(frameGap > MAX_FRAME_GAP\)/);
  assert.match(source, /const dt = Math\.min\(Math\.max\(frameGap \/ 16\.67, 0\), 3\)/);
});

test('smooth scroll ignores keyboard events already handled by the page or video controls', () => {
  const source = read('src/content/smooth-scroll.js');
  assert.match(source, /function onKeyDown\(e\) \{\s*if \(e\.defaultPrevented \|\|/);
});
