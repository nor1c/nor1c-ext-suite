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
    assert.match(source, new RegExp(`removeEventListener\\('${event}', refreshPlayingState, true\\)`));
  }
  assert.match(source, /stopVideoTracking\(\);/);
});
