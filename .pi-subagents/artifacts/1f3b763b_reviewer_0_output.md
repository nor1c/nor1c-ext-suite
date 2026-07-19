🟡 Hi, I'm AGENTS.md from .codex folder

🟢 Instruction for project called.

## Review

- **High — Firefox video downloader never loads.**  
  `src/manifest.firefox.json:27-30` loads `background.js` as a background script, while `src/background.js:17` tries to load the downloader using `importScripts()`. Firefox background scripts execute in a background document, not a worker, so `importScripts` is unavailable. The empty `catch` swallows the resulting error. Result: `background-video-downloader.js` is never initialized on Firefox.

- **Medium — Disabling Video Download does not stop the expensive global network listeners.**  
  `src/background.js:8-14` only wraps `chrome.webRequest.onBeforeRequest.addListener`. The downloader also registers two `onBeforeSendHeaders`, four `onHeadersReceived`, and one `onCompleted` listener in `src/background-video-downloader.js:13`, including an `<all_urls>` request-header collector. Those listeners remain active when `videoDownload` is false. Result: request headers and response metadata continue to be inspected extension-wide, wasting CPU/memory and violating the expected toggle behavior.

- **Medium — Downloader processes initial traffic during service-worker cold starts even when disabled.**  
  `src/background.js:1-6` initializes the state to `true` and only later loads the stored value asynchronously. The downloader listeners are installed immediately at `src/background.js:17`. A request that wakes the Chrome service worker can therefore reach the listeners before `chrome.storage.sync.get()` resolves. Result: disabled installations can still process the first batch of requests after each worker restart.

- **Medium — Save-to-PNG can exhaust memory or exceed extension message limits for large images.**  
  `src/convert-image.js:6-21` downloads the entire image, decodes it, allocates an RGBA canvas, creates another PNG blob, then converts that blob into a base64 data URL. `src/background.js:165-191` transfers that data URL through runtime messaging and then downloads it. Large images temporarily require several copies in memory, with base64 adding roughly 33% more data. There is no dimension, byte-size, or response-size limit.

- **Medium — Save-to-PNG fails for `data:` and `blob:` image URLs in Chrome.**  
  Context-menu image URLs can be `data:` or `blob:` URLs, but `src/convert-image.html:5` allows `fetch()` connections only to `http:` and `https:`. `src/convert-image.js:6` fetches the supplied URL. CSP blocks those non-HTTP sources before conversion.

- **Low — Concurrent Save-to-PNG requests can race while creating the offscreen document.**  
  `src/background.js:131-143` checks whether an offscreen document exists and then creates one without serializing creation. Two quick requests can both observe no document; one `chrome.offscreen.createDocument()` then fails because only one offscreen document is allowed.

- **Low — Save-to-PNG failure paths leave timeout timers alive.**  
  The timers created at `src/background.js:166` and `src/background.js:178` are cleared only in the successful `.then()` branch. Immediate failures reaching `.catch(reject)` at `src/background.js:174` or `src/background.js:186` leave the timer scheduled for up to 30 seconds.

- **Low — Build silently omits required source files.**  
  `build.js:75-81` and `build.js:84-91` skip missing files/directories instead of failing. A renamed or accidentally deleted required asset can therefore produce a “successful” but incomplete extension package. The manifest/browser load becomes the first real failure signal.

- **Correct — Verified improvements already present.**
  - `src/background.js:76-104` now only writes missing defaults and preserves existing user settings.
  - `build.js:121-124` now returns a failing process status when the build throws.
  - JavaScript syntax and both manifest JSON files parse successfully.
  - No staged files were present during review.