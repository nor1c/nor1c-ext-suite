const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(root, 'src', 'content', name), 'utf8');

function browserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function withPage(run) {
  const executablePath = browserExecutable();
  assert.ok(executablePath, 'Chrome or Edge executable is required for browser tests');
  const browser = await puppeteer.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage();
    await run(page);
  } finally {
    await browser.close();
  }
}

test('image viewer closes with Escape after every reopen', async () => {
  await withPage(async (page) => {
    await page.evaluateOnNewDocument(() => {
      window.chrome = { runtime: { onMessage: { addListener() {} } } };
    });
    await page.goto('about:blank');
    await page.addScriptTag({ path: path.join(root, 'src', 'content', 'image-viewer.js') });

    const displays = await page.evaluate(async () => {
      const open = () => document.dispatchEvent(new CustomEvent('nor1c:open-image-viewer', {
        detail: { srcUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' }
      }));
      const display = () => document.querySelector('.nor1c-viewer-overlay').style.display;
      open();
      await new Promise((resolve) => setTimeout(resolve));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      const first = display();
      open();
      await new Promise((resolve) => setTimeout(resolve));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return [first, display()];
    });

    assert.deepEqual(displays, ['none', 'none']);
  });
});

test('image blocker restores nested image and background inline styles exactly', async () => {
  await withPage(async (page) => {
    await page.evaluateOnNewDocument(() => {
      window.__storageListener = null;
      window.chrome = {
        runtime: {
          lastError: null,
          sendMessage() { return Promise.resolve(); }
        },
        storage: {
          sync: { get(_keys, callback) { callback({ imageBlocker: true }); } },
          onChanged: { addListener(listener) { window.__storageListener = listener; } }
        }
      };
    });
    await page.goto('about:blank');
    await page.setContent('<div id="bg" style="width:100px;height:100px;background-image:url(https://example.invalid/a.png) !important;background-color:rgb(1, 2, 3);position:static !important"><picture id="picture" style="opacity:.7 !important;visibility:collapse"><img id="image" width="80" height="80" style="opacity:.4;visibility:visible !important"></picture></div>');
    await page.addScriptTag({ path: path.join(root, 'src', 'content', 'image-blocker.js') });
    await page.evaluate(() => window.__storageListener({ imageBlocker: { newValue: false } }, 'sync'));

    const restored = await page.evaluate(() => {
      const read = (id, property) => {
        const style = document.getElementById(id).style;
        return [style.getPropertyValue(property), style.getPropertyPriority(property)];
      };
      return {
        nesting: document.getElementById('picture').parentElement.id,
        pictureOpacity: read('picture', 'opacity'),
        pictureVisibility: read('picture', 'visibility'),
        imageOpacity: read('image', 'opacity'),
        imageVisibility: read('image', 'visibility'),
        backgroundImage: read('bg', 'background-image'),
        backgroundColor: read('bg', 'background-color'),
        position: read('bg', 'position'),
        wrappers: document.querySelectorAll('.nor1c-img-blocked-wrapper').length,
        overlays: document.querySelectorAll('.nor1c-img-blocked-overlay').length
      };
    });

    assert.equal(restored.nesting, 'bg');
    assert.deepEqual(restored.pictureOpacity, ['0.7', 'important']);
    assert.deepEqual(restored.pictureVisibility, ['collapse', '']);
    assert.deepEqual(restored.imageOpacity, ['0.4', '']);
    assert.deepEqual(restored.imageVisibility, ['visible', 'important']);
    assert.deepEqual(restored.backgroundImage, ['url("https://example.invalid/a.png")', 'important']);
    assert.deepEqual(restored.backgroundColor, ['rgb(1, 2, 3)', '']);
    assert.deepEqual(restored.position, ['static', 'important']);
    assert.equal(restored.wrappers, 0);
    assert.equal(restored.overlays, 0);
  });
});

test('image blocker restores detached images before reinsertion', async () => {
  await withPage(async (page) => {
    await page.evaluateOnNewDocument(() => {
      window.chrome = {
        runtime: { sendMessage() { return Promise.resolve(); } },
        storage: {
          sync: { get(_keys, callback) { callback({ imageBlocker: true }); } },
          onChanged: { addListener() {} }
        }
      };
    });
    await page.goto('about:blank');
    await page.setContent('<div id="host"><img id="image" width="80" height="80" style="opacity:.4;visibility:visible"></div>');
    await page.addScriptTag({ path: path.join(root, 'src', 'content', 'image-blocker.js') });
    await page.waitForSelector('.nor1c-img-blocked-wrapper');
    const restored = await page.evaluate(async () => {
      const wrapper = document.querySelector('.nor1c-img-blocked-wrapper');
      const image = wrapper.querySelector('#image');
      wrapper.remove();
      await new Promise(resolve => setTimeout(resolve));
      return [image.style.opacity, image.style.visibility];
    });
    assert.deepEqual(restored, ['0.4', 'visible']);
  });
});

test('video controls attach and detach dynamic auto-hide listeners and cancel delayed shadow work', async () => {
  await withPage(async (page) => {
    await page.evaluateOnNewDocument(() => {
      window.__storageListener = null;
      window.nor1cGetDomain = () => 'example.test';
      window.IntersectionObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
      window.chrome = {
        runtime: { onMessage: { addListener() {} } },
        storage: {
          sync: {
            get(keys, callback) {
              if (keys.includes('videoControls')) {
                callback({
                  videoControls: true,
                  videoControlsEnabledSites: ['example.test'],
                  videoAutoHide: true,
                  videoAutoHideDelay: 30
                });
              } else {
                callback({ videoControlsEnabledSites: ['example.test'] });
              }
            }
          },
          onChanged: { addListener(listener) { window.__storageListener = listener; } }
        }
      };
    });
    await page.goto('about:blank');
    await page.addScriptTag({ path: path.join(root, 'src', 'content', 'video-controls.js') });

    const result = await page.evaluate(async () => {
      const video = document.createElement('video');
      const videoHost = document.createElement('div');
      videoHost.appendChild(video);
      document.body.appendChild(videoHost);
      let fullscreenElement = null;
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
      videoHost.requestFullscreen = async () => {
        fullscreenElement = videoHost;
        document.dispatchEvent(new Event('fullscreenchange'));
      };
      document.exitFullscreen = async () => {
        fullscreenElement = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      };
      await new Promise((resolve) => setTimeout(resolve, 300));
      const controls = document.querySelector('.nor1c-player-controls');
      const controlUsesBorderBox = getComputedStyle(controls).boxSizing === 'border-box';
      let paused = true;
      Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
      video.play = async () => { paused = false; video.dispatchEvent(new Event('play')); };
      video.pause = () => { paused = true; video.dispatchEvent(new Event('pause')); };
      video.dispatchEvent(new PointerEvent('pointerdown'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      const spaceHandled = !paused;
      const mutePathBefore = controls.querySelector('[aria-label="Mute"] path').getAttribute('d');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
      const hotkeyMuted = video.muted;
      const mutePathAfter = controls.querySelector('[aria-label="Unmute"] path').getAttribute('d');
      const muteIconChanged = mutePathBefore !== mutePathAfter;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
      await new Promise(resolve => setTimeout(resolve));
      const hotkeyFullscreen = fullscreenElement === videoHost;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
      await new Promise(resolve => setTimeout(resolve, 120));
      const speed = controls.querySelector('.nor1c-player-speed');
      const hasVolumeSlider = Boolean(controls.querySelector('.nor1c-player-volume'));
      speed.value = '1.5';
      speed.dispatchEvent(new Event('change'));
      controls.querySelector('[aria-label="Unmute"]').click();
      const muted = video.muted;
      controls.querySelector('[aria-label="Enter fullscreen"]').click();
      await new Promise(resolve => setTimeout(resolve));
      const fullscreenUsesVideoHost = fullscreenElement === videoHost && controls.parentElement === videoHost;
      controls.querySelector('[aria-label="Enter fullscreen"]').click();
      await new Promise(resolve => setTimeout(resolve, 120));
      const controlsRestoredAfterFullscreen = controls.parentElement === document.documentElement && !controls.hidden;
      video.dispatchEvent(new MouseEvent('mouseleave'));
      const hidden = controls.classList.contains('nor1c-player-controls--hidden');
      const playbackRate = video.playbackRate;
      video.remove();
      await new Promise((resolve) => setTimeout(resolve));
      video.dispatchEvent(new MouseEvent('mouseenter'));
      const detached = !video.hasAttribute('controls');
      window.__storageListener({ videoControls: { newValue: false } }, 'sync');
      await new Promise((resolve) => setTimeout(resolve, 2100));
      return {
        hidden,
        detached,
        playbackRate,
        muted,
        controlUsesBorderBox,
        spaceHandled,
        hotkeyMuted,
        muteIconChanged,
        hotkeyFullscreen,
        hasVolumeSlider,
        fullscreenUsesVideoHost,
        controlsRestoredAfterFullscreen,
        customControlsRemoved: !document.querySelector('.nor1c-player-controls'),
        forceStylePresent: Boolean(document.getElementById('nor1c-video-controls-force'))
      };
    });

    assert.deepEqual(result, {
      hidden: true,
      detached: true,
      playbackRate: 1.5,
      muted: false,
      controlUsesBorderBox: true,
      spaceHandled: true,
      hotkeyMuted: true,
      muteIconChanged: true,
      hotkeyFullscreen: true,
      hasVolumeSlider: false,
      fullscreenUsesVideoHost: true,
      controlsRestoredAfterFullscreen: true,
      customControlsRemoved: true,
      forceStylePresent: false
    });
  });
});

test('video lifecycle fixes retain no permanent tracker polling or uncancelled shadow walk', () => {
  const tracker = source('video-playing-tracker.js');
  const controls = source('video-controls.js');
  const reset = source('video-play-reset.js');

  assert.doesNotMatch(tracker, /setInterval\s*\(/);
  assert.doesNotMatch(tracker, /MutationObserver/);
  assert.doesNotMatch(tracker, /querySelectorAll\('video'\)/);
  assert.match(tracker, /document\.addEventListener\(type, handlePlaybackEvent, true\)/);
  assert.match(tracker, /event\.type === 'playing'/);
  assert.match(tracker, /new IntersectionObserver/);
  assert.match(tracker, /if \(!entry\.isIntersecting \|\| entry\.intersectionRatio === 0/);
  assert.match(tracker, /document\.addEventListener\('visibilitychange'/);
  assert.doesNotMatch(tracker, /addEventListener\('blur'/);
  assert.doesNotMatch(tracker, /document\.hasFocus\(\)/);
  assert.match(tracker, /document\.hidden \|\| !isRendered\(video\)/);
  assert.match(controls, /walkTimeout = setTimeout\(walkShadowRoots, 2000\)/);
  assert.match(controls, /clearTimeout\(walkTimeout\)/);
  assert.match(controls, /if \(!active\) return;/);
  assert.match(controls, /videoObserver\.unobserve\(video\)/);
  assert.match(controls, /volumeListeners = new WeakMap\(\)/);
  assert.match(controls, /removeEventListener\('volumechange', listeners\.volumechange\)/);
  assert.match(controls, /originalElementStyles\.delete\(element\)/);
  assert.match(controls, /autoHideVideos\.forEach\(detachAutoHideVideo\)/);
  assert.match(reset, /observers\.src\.disconnect\(\)/);
  assert.match(reset, /if \(observers\.parent\) observers\.parent\.disconnect\(\)/);
  assert.doesNotMatch(reset, /_origScanForVideos/);
});
