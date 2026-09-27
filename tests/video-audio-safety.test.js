const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const http = require('node:http');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'src', 'content', name), 'utf8');

function toneWav() {
  const rate = 8000;
  const samples = rate * 2;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 8192), 44 + i * 2);
  return wav;
}

async function withPlayer(run, options = {}) {
  const executablePath = [process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find(candidate => candidate && fs.existsSync(candidate));
  assert.ok(executablePath, 'Chrome or Edge is required');
  const browser = await puppeteer.launch({ headless: true, executablePath, waitForInitialPage: false });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(4000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (options.url) await page.goto(options.url);
    else await page.setContent(options.html || '<video id="video" muted style="width:640px;height:360px"></video>');
    // The page and extension must use separate JS worlds, as in the real extension.
    const session = await page.createCDPSession();
    const { frameTree } = await session.send('Page.getFrameTree');
    const { executionContextId } = await session.send('Page.createIsolatedWorld', {
      frameId: frameTree.frame.id, worldName: 'audio-regression'
    });
    const evaluate = async expression => {
      const result = await session.send('Runtime.evaluate', {
        expression, contextId: executionContextId, returnByValue: true, awaitPromise: true
      });
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const stored = {
      videoControls: true, videoControlsEnabledSites: ['example.test'],
      videoPlayerMode: 'custom', volumeControl: true, volumeControlLevel: 100,
      ...options.stored
    };
    await evaluate(`
      window.nor1cGetDomain = () => 'example.test';
      window.__stored = ${JSON.stringify(stored)};
      window.__listeners = [];
      window.__change = changes => {
        for (const [key, change] of Object.entries(changes)) __stored[key] = change.newValue;
        __listeners.forEach(listener => listener(changes, 'sync'));
      };
      window.chrome = {
        storage: {
          sync: {
            get(keys, callback) { callback({ ...__stored }); },
            set(values) {
              __change(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, {newValue}])));
              return Promise.resolve();
            }
          },
          onChanged: { addListener(listener) { __listeners.push(listener); } }
        },
        runtime: { onMessage: { addListener() {} }, sendMessage() { return Promise.resolve(); } }
      };
    `);
    await evaluate(source('video-controls.js'));
    if (options.volume) await evaluate(source('volume-control.js'));
    await run(page, evaluate);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

for (const mode of ['basic', 'custom']) {
  test(`${mode}: existing and dynamically added videos default to sound`, async () => {
    await withPlayer(async page => {
      await page.waitForFunction(() => !document.getElementById('video').muted);
      await page.evaluate(() => {
        const video = document.createElement('video');
        video.id = 'late';
        video.muted = true;
        video.volume = 0;
        document.body.appendChild(video);
      });
      await page.waitForFunction(() => !document.getElementById('late').muted && document.getElementById('late').volume > 0);
    }, { stored: { videoPlayerMode: mode } });
  });
}

test('page-world auto mute and zero volume are corrected without clicking site audio buttons', async () => {
  await withPlayer(async page => {
    await page.evaluate(() => {
      window.audioClicks = 0;
      document.getElementById('site-audio').onclick = () => {
        window.audioClicks++;
        document.querySelectorAll('video').forEach(video => { video.muted = true; });
      };
      const video = document.getElementById('video');
      video.muted = true;
      video.volume = 0;
      video.dispatchEvent(new Event('seeking'));
      video.dispatchEvent(new Event('playing'));
    });
    await page.waitForFunction(() => !document.getElementById('video').muted && document.getElementById('video').volume > 0);
    assert.equal(await page.evaluate(() => window.audioClicks), 0);
  }, { html: '<article><video id="video" muted style="width:640px;height:360px"></video><button id="site-audio"><svg aria-label="Audio is muted"></svg></button></article>' });
});

test('explicit custom mute survives seek/play/source events and never mutes a second video', async () => {
  await withPlayer(async page => {
    await page.waitForSelector('.nor1c-player-controls [aria-label="Mute"]', { visible: true });
    await page.click('.nor1c-player-controls [aria-label="Mute"]');
    await page.evaluate(() => {
      const video = document.getElementById('video');
      for (const type of ['loadstart', 'loadedmetadata', 'seeking', 'playing']) video.dispatchEvent(new Event(type));
      const second = document.createElement('video');
      second.id = 'second'; second.muted = true;
      document.body.appendChild(second);
    });
    await page.waitForFunction(() => !document.getElementById('second').muted);
    assert.equal(await page.evaluate(() => document.getElementById('video').muted), true);
    await page.click('.nor1c-player-controls [aria-label="Unmute"]');
    await page.waitForFunction(() => !document.getElementById('video').muted);
  });
});

test('trusted site audio click is respected, unlike a script-initiated mute', async () => {
  await withPlayer(async page => {
    await page.evaluate(() => {
      document.getElementById('site-audio').onclick = () => {
        const video = document.getElementById('video');
        video.muted = !video.muted;
      };
    });
    await page.waitForFunction(() => !document.getElementById('video').muted);
    await page.click('#site-audio');
    await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('playing')));
    assert.equal(await page.evaluate(() => document.getElementById('video').muted), true);
    await page.click('#site-audio');
    await page.waitForFunction(() => !document.getElementById('video').muted);
  }, { html: '<article><video id="video" muted style="width:640px;height:360px"></video><button id="site-audio" aria-label="Toggle audio">Sound</button></article>' });
});

test('custom video click cannot authorize a page handler to mute all videos', async () => {
  await withPlayer(async page => {
    await page.evaluate(() => {
      document.getElementById('video').onclick = () => { document.getElementById('video').muted = true; };
    });
    await page.click('#video');
    await page.waitForFunction(() => !document.getElementById('video').muted);
    await page.keyboard.press('m');
    await page.waitForFunction(() => document.getElementById('video').muted);
    await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('seeking')));
    assert.equal(await page.evaluate(() => document.getElementById('video').muted), true);
    await page.keyboard.press('m');
    await page.waitForFunction(() => !document.getElementById('video').muted);
  });
});

test('global volume zero is intentional; explicit Unmute restores audible level', async () => {
  await withPlayer(async (page, evaluate) => {
    await page.waitForFunction(() => document.getElementById('video').volume === 0);
    await page.click('.nor1c-player-controls [aria-label="Unmute"]');
    await page.waitForFunction(() => !document.getElementById('video').muted && document.getElementById('video').volume > 0);
    assert.equal(await evaluate('__stored.volumeControlLevel'), 100);
  }, { stored: { volumeControlLevel: 0 }, volume: true });
});

test('real media keeps native playback across origins and produces audible samples at boost level', async () => {
  const wav = toneWav();
  const server = http.createServer((req, res) => {
    if (req.url === '/tone.wav') {
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length });
      res.end(wav);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<video id="video" muted loop style="width:640px;height:360px"></video>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mediaServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length });
    res.end(wav);
  });
  await new Promise(resolve => mediaServer.listen(0, '127.0.0.1', resolve));
  try {
    await withPlayer(async (page, evaluate) => {
      await evaluate(`
        window.__graphCalls = 0;
        const createSource = AudioContext.prototype.createMediaElementSource;
        AudioContext.prototype.createMediaElementSource = function (...args) {
          window.__graphCalls++;
          return createSource.apply(this, args);
        };
      `);
      await page.evaluate(url => { document.getElementById('video').src = url; }, `http://127.0.0.1:${mediaServer.address().port}/tone.wav`);
      await page.waitForFunction(() => document.getElementById('video').readyState >= 2);
      await page.click('.nor1c-player-controls [aria-label="Play"]');
      await page.waitForFunction(() => !document.getElementById('video').paused);
      await page.waitForFunction(() => document.getElementById('video').currentTime > 0);
      assert.equal(await evaluate('__graphCalls'), 0, 'non-CORS audio must stay on the native path');
      // Browsers prohibit capturing non-CORS audio. Use the same fixture on the
      // page origin for the signal measurement, without changing the extension.
      await page.evaluate(url => {
        const video = document.getElementById('video'); video.pause(); video.src = url;
      }, `http://127.0.0.1:${port}/tone.wav`);
      await page.waitForFunction(() => document.getElementById('video').readyState >= 2);
      await page.evaluate(() => document.getElementById('video').play());
      await page.waitForFunction(() => !document.getElementById('video').paused);
      const peak = await page.evaluate(async () => {
        const video = document.getElementById('video');
        const context = new AudioContext();
        await context.resume();
        const stream = video.captureStream();
        const analyser = context.createAnalyser();
        const source = context.createMediaStreamSource(stream);
        source.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        let peak = 0;
        for (let i = 0; i < 30 && peak < 0.01; i++) {
          await new Promise(resolve => setTimeout(resolve, 30));
          analyser.getFloatTimeDomainData(samples);
          peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
        }
        source.disconnect();
        await context.close();
        return peak;
      });
      assert.ok(peak > 0.01, `Expected audible samples, peak=${peak}`);
      await evaluate('__change({volumeControl:{newValue:false}})');
      assert.equal(await page.evaluate(() => document.getElementById('video').muted), false);
    }, { url: `http://127.0.0.1:${port}/`, volume: true, stored: { volumeControlLevel: 250 } });
  } finally {
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => mediaServer.close(resolve))]);
  }
});

test('manual mute survives mode switches and cleanup on detach', async () => {
  await withPlayer(async (page, evaluate) => {
    await page.click('.nor1c-player-controls [aria-label="Mute"]');
    await evaluate('__change({videoPlayerMode:{newValue:"basic"}})');
    await evaluate('__change({videoPlayerMode:{newValue:"custom"}})');
    assert.equal(await page.evaluate(() => document.getElementById('video').muted), true);
    await page.evaluate(() => { window.detached = document.getElementById('video'); window.detached.remove(); });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
    await page.evaluate(() => { window.detached.muted = false; window.detached.dispatchEvent(new Event('playing')); });
    assert.equal(await page.evaluate(() => window.detached.muted), false);
  });
});

test('default audio cooperates with nonzero global volume and disabling leaves no guard behind', async () => {
  await withPlayer(async (page, evaluate) => {
    await page.waitForFunction(() => !document.getElementById('video').muted && document.getElementById('video').volume === 0.4);
    assert.equal(await evaluate('Object.hasOwn(document.getElementById("video"), "muted")'), false);
    await evaluate('__change({videoControls:{newValue:false}})');
    await page.evaluate(() => {
      const video = document.getElementById('video');
      video.muted = true;
      video.dispatchEvent(new Event('playing'));
    });
    // Wait for media-event tasks, not just a synchronous property read.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    assert.equal(await page.evaluate(() => document.getElementById('video').muted), true);
  }, { stored: { volumeControlLevel: 40 }, volume: true });
});
