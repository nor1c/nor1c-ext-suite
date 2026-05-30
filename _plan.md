# Plan: Fix Smooth Scrolling

## Goal
Smooth scrolling toggle in the popup does nothing because smooth-scroll.js is never injected into any page. The toggle exists in the UI and the script exists on disk but the extension never loads it.

## Constraints
- Must work in both Chrome and Firefox (both manifests).
- Toggle must take effect without page reload.
- Must not break existing content scripts.
- Follow all AGENTS.md rules (no secrets, no var, etc.).

## Root Causes Identified

| # | Issue | File(s) |
|---|-------|---------|
| 1 | smooth-scroll.js not listed in any content_scripts entry | manifest.chrome.json, manifest.firefox.json |
| 2 | Background doesn't broadcast smoothScroll toggle changes to tabs | ackground.js (	oggleKeys array) |
| 3 | Background doesn't set smoothScroll: false default on install | ackground.js (onInstalled handler) |

## Step-by-Step Steps

### Step 1 — Register script in Chrome manifest
File: src/manifest.chrome.json
- Add "content/smooth-scroll.js" to the first content_scripts group's js array.
- This group runs at document_start with ll_frames: true, matching <all_urls>.

### Step 2 — Register script in Firefox manifest
File: src/manifest.firefox.json
- Same addition as Step 1.

### Step 3 — Add smoothScroll to background broadcast list
File: src/background.js
- Insert 'smoothScroll' into the 	oggleKeys array so the background forwards toggle changes to all tabs.

### Step 4 — Add smoothScroll to install defaults
File: src/background.js
- Insert smoothScroll: false into the chrome.runtime.onInstalled storage.set call so the key is always defined.

## Files Touched

| File | Change |
|------|--------|
| src/manifest.chrome.json | Added "content/smooth-scroll.js" to content_scripts[0].js |
| src/manifest.firefox.json | Added "content/smooth-scroll.js" to content_scripts[0].js |
| src/background.js | Added smoothScroll: false to onInstalled defaults + 'smoothScroll' to toggleKeys |

## Expected Behavior

1. After extension reload, smooth-scroll.js runs on every page at document_start.
2. Toggling "Smooth Scroll" in the popup writes to chrome.storage.sync → script listens via chrome.storage.onChanged and applies/removes its wheel and keydown handlers.
3. Script adds html { scroll-behavior: smooth !important; } CSS when active.
4. On disable, all listeners and injected style are removed.

## Acceptance Criteria

- [ ] smooth-scroll.js is listed in content_scripts[0].js in both manifests.
- [ ] smoothScroll key appears in 	oggleKeys and onInstalled defaults in ackground.js.
- [ ] After rebuild and reload, enabling smooth scroll toggle adds smooth scrolling to pages.
- [ ] Disabling toggle removes smooth scrolling immediately.
- [ ] No console errors from the content script.
