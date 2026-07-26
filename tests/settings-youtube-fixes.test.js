const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const popupSource = fs.readFileSync(path.join(root, 'src', 'popup.js'), 'utf8');
const youtubeSource = fs.readFileSync(path.join(root, 'src', 'content', 'youtube-control-panel.js'), 'utf8');

function popupValidators() {
  const context = {
    document: { addEventListener() {} },
    exports: {},
    Set,
    Object,
    Array,
    Number,
    Error,
    String
  };
  vm.runInNewContext(`${popupSource}\nexports.validateBackupPayload = validateBackupPayload;`, context);
  return context.exports;
}

test('backup validation accepts consumed setting shapes', () => {
  const { validateBackupPayload } = popupValidators();
  const data = {
    imageBlocker: true,
    blockLocation: false,
    videoAutoHideDelay: 10,
    videoControlsEnabledSites: ['example.com'],
    blockedSelectors: '.advert',
    hiddenRules: {
      'example.com': [{ id: 'rule-1', selector: '#advert', path: '/watch', contentHint: 'Ad', createdAt: 1 }]
    },
    ytControlPanel: { enabled: true, enforceTheme: 'dark' }
  };

  assert.equal(Object.keys(validateBackupPayload({ version: 1, data })).sort().join(','), Object.keys(data).sort().join(','));
  assert.deepEqual(Array.from(validateBackupPayload({ version: 1, data: { videoControlsEnabledSites: [' Example.com ', 'example.com'] } }).videoControlsEnabledSites), ['example.com']);
});

test('backup validation rejects exact version, invalid key values, and unknown keys', () => {
  const { validateBackupPayload } = popupValidators();
  assert.throws(() => validateBackupPayload({ version: 2, data: {} }), /Unsupported backup version: 2/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { imageBlocker: 'true' } }), /Invalid setting: imageBlocker/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { videoAutoHideDelay: Infinity } }), /Invalid setting: videoAutoHideDelay/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { videoAutoHideDelay: 11 } }), /Invalid setting: videoAutoHideDelay/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { videoAutoHideDelay: 1.5 } }), /Invalid setting: videoAutoHideDelay/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { videoControlsEnabledSites: ['ok.test', 4] } }), /Invalid setting: videoControlsEnabledSites/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { videoControlsEnabledSites: [''] } }), /Invalid setting: videoControlsEnabledSites/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { blockedSelectors: [] } }), /Invalid setting: blockedSelectors/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { hiddenRules: { 'example.com': [{ id: '1' }] } } }), /Invalid setting: hiddenRules/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { ytControlPanel: { unknown: true } } }), /Invalid setting: ytControlPanel/);
  assert.throws(() => validateBackupPayload({ version: 1, data: { surprise: true } }), /Unknown setting: surprise/);
});

test('import validates completely before one atomic storage write and displays key failure', () => {
  assert.match(popupSource, /const toSet = validateBackupPayload\(payload\);\s+await chrome\.storage\.sync\.set\(toSet\);/);
  assert.match(popupSource, /importBtn\.textContent = err instanceof Error \? err\.message : 'Import failed';/);
  const importHandler = popupSource.slice(popupSource.indexOf("document.getElementById('import-file')"), popupSource.indexOf("document.getElementById(\"yt-control-panel-btn\")"));
  assert.equal((importHandler.match(/chrome\.storage\.sync\.set\(/g) || []).length, 1);
});

test('YouTube embeds use hostname and pathname including nocookie', () => {
  assert.match(youtubeSource, /location\.hostname === 'www\.youtube-nocookie\.com'/);
  assert.match(youtubeSource, /isEmbedHost && location\.pathname\.startsWith\('\/embed\/'\)/);
  assert.doesNotMatch(youtubeSource, /hostname\.indexOf\('youtube(?:-nocookie)?\.com\/embed'/);
});

test('background playback does not force hidden YouTube videos to resume after pause', () => {
  assert.doesNotMatch(youtubeSource, /addEventListener\('pause'/);
  assert.doesNotMatch(youtubeSource, /document\.hidden && cfg\.allowBackgroundPlay/);
});

test('YouTube mutation observer filters relevant nodes and keeps navigation triggers', () => {
  assert.match(youtubeSource, /mutations\.some\(mutationNeedsApply\)/);
  assert.match(youtubeSource, /node\.matches\(relevantMutationSelector\)/);
  assert.match(youtubeSource, /node\.querySelector\(relevantMutationSelector\)/);
  assert.match(youtubeSource, /addEventListener\('yt-navigate-finish', scheduleApply\)/);
  assert.match(youtubeSource, /addEventListener\('yt-page-data-updated', scheduleApply\)/);
  assert.doesNotMatch(youtubeSource, /new MutationObserver\(scheduleApply\)/);
});
