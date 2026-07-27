const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function browserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return candidates.find(candidate => candidate && fs.existsSync(candidate));
}

test('window.open policy blocks known ads and preserves legitimate flows', async () => {
  const executablePath = browserExecutable();
  assert.ok(executablePath, 'Chrome or Edge executable is required for browser tests');
  const browser = await puppeteer.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage();
    await page.goto('https://example.com');
    await page.evaluate(() => {
      window.__opened = [];
      window.open = function() {
        window.__opened.push(Array.from(arguments));
        return { closed: false };
      };
    });
    await page.addScriptTag({ path: path.join(root, 'src', 'content', 'privacy-window-open-main.js') });
    const result = await page.evaluate(() => ({
      sameOrigin: window.open('/account', 'account').closed,
      oauth: window.open('https://accounts.example.org/oauth', 'oauth').closed,
      ad: window.open('https://sub.linkvertise.com/abc').closed,
      opened: window.__opened
    }));
    assert.equal(result.sameOrigin, false);
    assert.equal(result.oauth, false);
    assert.equal(result.ad, true);
    assert.equal(result.opened.length, 2);
    assert.deepEqual(result.opened[0], ['/account', 'account']);
  } finally {
    await browser.close();
  }
});

test('manifests use privacy registrations, lazy downloader, frame navigation, and nocookie embeds', () => {
  for (const browser of ['chrome', 'firefox']) {
    const manifest = JSON.parse(read(`src/manifest.${browser}.json`));
    assert.ok(manifest.permissions.includes('webNavigation'));
    if (browser === 'chrome') {
      assert.equal(manifest.background.type, 'module');
      assert.equal(manifest.background.service_worker, 'background.chrome.js');
    }
    const scripts = manifest.content_scripts.flatMap(entry => entry.js || []);
    assert.ok(scripts.includes('content/video-downloader-loader.js'));
    assert.ok(scripts.includes('content/video-playing-tracker.js'));
    assert.ok(!scripts.includes('content/video-downloader-inject.js'));
    assert.ok(!scripts.includes('content/video-play-reset.js'));
    assert.ok(!scripts.includes('content/privacy-main.js'));
    assert.ok(!scripts.includes('content/location-blocker.js'));
    assert.ok(!scripts.includes('content/notification-blocker.js'));
    assert.ok(manifest.content_scripts.some(entry => (entry.matches || []).includes('*://*.youtube-nocookie.com/embed/*')));
  }
});

test('background loads downloader lazily per browser and injects after listener readiness', () => {
  const background = read('src/background.js');
  const chromeEntry = read('src/background.chrome.js');
  assert.doesNotMatch(background, /importScripts\('background-video-downloader\.js'\)/);
  assert.match(chromeEntry, /import '.\/background-video-downloader\.js'/);
  assert.match(background, /__nor1cVideoDownloaderBackgroundLoaded === true/);
  assert.match(background, /document\.createElement\('script'\)/);
  assert.match(background, /ensureVideoDownloaderBackground\(\)\.then\(backgroundLoaded/);
  assert.match(background, /files: \['content\/video-play-reset\.js', 'content\/video-downloader-inject\.js'\]/);
  assert.match(background, /frameIds: \[sender\.frameId\]/);
  assert.doesNotMatch(background, /chrome\.webNavigation\.getAllFrames/);
  assert.match(background, /chrome\.webNavigation\.onCommitted\.addListener/);
  assert.doesNotMatch(background, /Promise\.allSettled/);
});

test('privacy registration is browser-owned and downloader filename regex is escaped', () => {
  const background = read('src/background.js');
  const adBypass = read('src/content/ad-link-bypass.js');
  const filenameFilter = read('src/background-video-downloader.js');
  assert.match(background, /persistAcrossSessions: true/);
  assert.match(background, /world: 'MAIN'/);
  assert.match(background, /registerContentScripts/);
  assert.match(background, /unregisterContentScripts/);
  assert.doesNotMatch(adBypass, /nor1c-ad-bypass/);
  assert.match(filenameFilter, /\\s\.\_\-/);
  assert.match(filenameFilter, /\\d\{3,4\}p\?/);
});

test('popup directly scans source URLs from playing video elements', () => {
  const popup = read('src/popup.js');
  const html = read('src/popup.html');
  assert.match(popup, /chrome\.scripting\.executeScript/);
  assert.match(popup, /!video\.paused && !video\.ended/);
  assert.match(popup, /video\.currentSrc, video\.src/);
  assert.match(popup, /hasPlayingVideo: playing\.length > 0/);
  assert.match(popup, /get-detected-video-sources/);
  assert.match(popup, /if \(hasPlayingVideo && urls\.length === 0\)/);
  assert.match(popup, /playingFrameIds/);
  assert.match(popup, /sort\(\(a, b\) => \(b\.contentLength \|\| 0\) - \(a\.contentLength \|\| 0\)\)/);
  assert.match(popup, /rn\|sq\|part\|segment/);
  assert.match(popup, /'bytestart', 'byteend', 'start', 'end', 'range'/);
  assert.match(popup, /now - \(source\.detectedAt \|\| 0\) < 120000/);
  assert.doesNotMatch(popup, /performance\.getEntriesByType\('resource'\)/);
  assert.doesNotMatch(popup, /async function downloadDirectVideo/);
  assert.doesNotMatch(popup, /File video lengkap tidak berhasil dibuat/);
  assert.match(popup, /chrome\.downloads\.download\(options\)/);
  assert.match(popup, /saveAs: false/);
  assert.match(popup, /extensionByType/);
  assert.match(popup, /sourceMetadata\.has\(source\.url\)/);
  assert.match(popup, /async function downloadHls\(tabId, frameId/);
  assert.match(popup, /frameIds: \[frameId\]/);
  assert.match(popup, /#EXT-X-STREAM-INF/);
  assert.match(popup, /#EXT-X-MAP/);
  assert.match(popup, /new Blob\(parts/);
  assert.match(popup, /Stream DASH memerlukan penggabungan audio dan video terpisah/);
  assert.match(html, /id="video-sources-list"/);
  assert.doesNotMatch(html, /video-downloader-frame/);
});

test('background captures media and streaming manifest network requests', () => {
  const background = read('src/background.js');
  assert.match(background, /details\.type === 'media'/);
  assert.match(background, /m3u8\|mpd\|mp4/);
  assert.match(background, /onBeforeRequest\.addListener\(rememberVideoSource/);
  assert.match(background, /onHeadersReceived\.addListener/);
  assert.match(background, /source\.contentType/);
  assert.match(background, /source\.contentLength/);
  assert.match(background, /source\.filename/);
  assert.match(background, /function fullVideoUrl/);
  assert.match(background, /'bytestart', 'byteend', 'start', 'end', 'range'/);
  assert.match(background, /content-disposition/);
  assert.match(background, /frameId: details\.frameId/);
  assert.match(background, /msg\.type === 'get-detected-video-sources'/);
});

test('video downloader only exposes currently playing media without polling', () => {
  const background = read('src/background.js');
  const filter = read('src/content/video-downloader-filter.js');
  const loader = read('src/content/video-downloader-loader.js');
  const downloader = read('src/background-video-downloader.js');

  assert.match(background, /msg\.type === 'video-playback-state'/);
  assert.match(background, /__nor1cIsPlayingVideo/);
  assert.match(background, /playingUrls\.has\(url\)/);
  assert.match(background, /playingUrl\.startsWith\('blob:'\)/);
  assert.match(background, /if \(url\.startsWith\('blob:'\)\) return \[url\]/);
  assert.doesNotMatch(read('src/content/video-playing-tracker.js'), /filter\(url =>[^\n]+!url\.startsWith\('blob:'\)/);
  assert.match(downloader, /__nor1cFilterVideos\(resp\.videoLinks,e\.tabId\)/);
  assert.match(downloader, /__nor1cIsPlayingVideo\(tabId, item\.url\)/);
  assert.doesNotMatch(filter, /setInterval\s*\(/);
  assert.doesNotMatch(filter, /get-playing-videos/);
  assert.match(loader, /document\.addEventListener\('play'/);
  assert.doesNotMatch(loader, /videoDownload !== false\) load\(\)/);
});
