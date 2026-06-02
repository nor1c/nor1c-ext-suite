# Four New Features: URL Cleaner, Screenshot Full Page, Quick Tab Switcher, Notification Blocker

## Goal
Add four new capabilities to Nor1c Suite: (1) strip tracking params from URLs on copy, (2) capture full-page screenshots with auto-scroll+stitch, (3) quick fuzzy-search tab switcher with customizable hotkey, (4) auto-block browser notification permission prompts.

---

## Feature 1: URL Cleaner

### Storage Key
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| urlCleaner | bool | true | Strip tracking params on URL copy |

### Tracking Params to Strip
utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_id, utm_reader, fbclid, gclid, gclsrc, dclid, gbraid, wbraid, msclkid, ref, mc_cid, mc_eid, _ga, _gl, _hsenc, _hsmi, hsCtaTracking, __hsfp, __hssc, __hstc, trk_contact, trk_msg, trk_module, trk_sid, mc_tc, mk_tok, vgo_ee, yclid, oly_anon_id, oly_enc_id, openExternalBrowser, igshid, si, s_kwcid, twclid, sc_campaign, sc_channel, sc_content, sc_medium, sc_outcome, sc_geo, sc_country, vero_conv, vero_id, wickedid, offer_id, affiliate_id, click_id, irclickid, iraffiliateid, irpid, sharedid, ttclid, rdt_cid, beehiive_id, spm, scm, tracking_source, trk, campaign_id, utm_referrer, utm_social, utm_social_type, li_fat_id

### Files to Touch
1. `src/content/url-cleaner.js` (new) - intercept copy events, strip params, write clean URL to clipboard
2. `src/popup.html` - add toggle card after "Block Tab Ads"
3. `src/popup.js` - add `urlCleaner` to keys/defaults, wire toggle
4. `src/manifest.chrome.json` - add `url-cleaner.js` to content_scripts
5. `src/manifest.firefox.json` - same

### Steps
1. Create `src/content/url-cleaner.js`:
   - Listen for `copy` event on `document`
   - If `urlCleaner` enabled (check chrome.storage.sync), intercept; else passthrough
   - On copy: get selected text. If it starts with http/https, strip tracking params from query string. Write clean URL to clipboard via `navigator.clipboard.writeText`
   - Also handle right-click "Copy link address" by watching `contextmenu` + `copy` event sequencing
2. Add toggle card in `popup.html` after "Block Tab Ads" card (before Smooth Scroll):
   - Label: "URL Cleaner", Desc: "Strip tracking parameters from copied URLs"
3. Add `urlCleaner` to `keys` and `defaults` arrays in `popup.js`
4. Add `url-cleaner.js` to content_scripts in both manifests, same block as context-listener (run_at: document_start, all_frames: true)
5. Add `urlCleaner` to backup keys list in `popup.js`

### Expected Behavior
- Copy URL with `?utm_source=foo&other=bar` -> clipboard gets `?other=bar`
- Preserves non-tracking params, fragment, path, port, auth
- Toggle off = no cleaning
- Plain text copy passthrough

### Acceptance Criteria
- `urlCleaner` defaults to `true` in storage
- Toggle appears in popup, saves to chrome.storage.sync
- Known tracking params stripped, unknown params preserved
- Fragment (#) preserved, auth preserved
- No errors on plain text copy

---

## Feature 2: Screenshot Full Page

### Storage Key
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| screenshotFullPage | bool | true | Enable full-page screenshot context menu |

### Approach
Chrome: use `chrome.debugger` with `Page.captureScreenshot` for native full-page capture.
Firefox: scroll+stitch approach via content script, capture viewport slices, combine with offscreen canvas.

### Files to Touch
1. `src/background.js` - add context menu entry + debugger logic for Chrome, fallback for Firefox
2. `src/content/screenshot-fullpage.js` (new) - Firefox fallback: scroll+stitch via canvas
3. `src/popup.html` - add toggle card
4. `src/popup.js` - add key/default, wire toggle
5. `src/manifest.chrome.json` - add `debugger` permission
6. `src/manifest.firefox.json` - add content script entry

### Steps
1. Add `screenshot-fullpage` context menu in `background.js` alongside existing menus (after "Save to PNG")
2. Create `src/content/screenshot-fullpage.js`:
   - On message `take-fullpage-screenshot`: scroll to bottom in viewport-height increments, capture each viewport via `chrome.tabs.captureVisibleTab`, stitch into one tall offscreen canvas, return data URL
   - Use `window.scrollY`, `window.innerHeight`, `document.documentElement.scrollHeight`
   - Restore original scroll position after capture
3. In `background.js`:
   - Handle `screenshot-fullpage` context menu click:
     - Chrome: attach `chrome.debugger` to tab, call `Page.captureScreenshot` with `captureBeyondViewport: true` and `format: 'png'`, detach, download result
     - Firefox: send message to content script for scroll-stitch, receive data URL, download
   - Filename: `screenshot-{hostname}-{timestamp}.png`
4. Add toggle card in `popup.html`
5. Add key wiring in `popup.js`
6. Add `debugger` permission to `manifest.chrome.json` only (Firefox manifest excluded)

### Expected Behavior
- Right-click page -> "Screenshot Full Page" -> captures entire scrollable page as PNG -> auto-downloads
- Chrome: true full-page via DevTools protocol, single pass
- Firefox: scrolls page in steps, stitches viewport captures
- File name includes domain and timestamp

### Acceptance Criteria
- Context menu entry visible and functional
- Chrome: captures content beyond viewport, single seamless image
- Firefox: stitched result covers full scrollHeight
- Download triggers with reasonable filename
- Toggle hides/shows context menu entry
- Debugger permission only in Chrome manifest

---

## Feature 3: Quick Tab Switcher

### Storage Key
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| quickTabSwitcher | bool | true | Enable tab switcher |
| quickTabHotkey | string | "Ctrl+Shift+K" | Hotkey reference (actual binding via commands API) |

### Approach
Use `chrome.commands` for customizable hotkey. Command opens `tab-switcher.html` as a popup window. UI: dark search palette with fuzzy-filtered tab list, keyboard navigation.

### Files to Touch
1. `src/tab-switcher.html` (new) - search input + tab list UI
2. `src/tab-switcher.js` (new) - fuzzy search, keyboard nav, tab switching
3. `src/tab-switcher.css` (new) - dark overlay panel styling
4. `src/background.js` - add `chrome.commands.onCommand` listener, open switcher window
5. `src/popup.html` - add toggle card
6. `src/popup.js` - add keys/defaults, wire toggle
7. `src/manifest.chrome.json` - add `commands` and `tabs` permission
8. `src/manifest.firefox.json` - same
9. `src/build.js` - add tab-switcher files to COPY_FILES

### Steps
1. Create `src/tab-switcher.html`: Centered dark panel (480x360). Search input at top, scrollable tab list below. Each row: favicon (16px), title truncated, URL muted. No header/footer chrome.
2. Create `src/tab-switcher.css`: Dark bg `#1e1e2e`, rounded corners, input styled like popup, rows with hover/selected highlight (`#3b82f6`).
3. Create `src/tab-switcher.js`:
   - On load: `chrome.tabs.query({})` -> sort by `lastAccessed` desc -> render
   - Input event: fuzzy filter tabs (match title + URL against query)
   - ArrowUp/Down: move `.selected` class on rows
   - Enter: `chrome.tabs.update(selectedTab.id, { active: true })` + `chrome.windows.update(selectedTab.windowId, { focused: true })` + `window.close()`
   - Escape: `window.close()`
   - Click on row: same as Enter
4. In `background.js`:
   - `chrome.commands.onCommand.addListener((command) => { if (command === 'switch-tab') { ... } })`
   - Check `quickTabSwitcher` enabled before opening
   - Open with `chrome.windows.create({ url: 'tab-switcher.html', type: 'popup', width: 500, height: 400, focused: true })`
5. Update both manifests:
   - Add `"tabs"` permission
   - Add `"commands": { "switch-tab": { "suggested_key": { "default": "Ctrl+Shift+K" }, "description": "Open quick tab switcher" } }`
6. Add toggle card in popup.html + wiring in popup.js
7. Add `tab-switcher.html`, `tab-switcher.js`, `tab-switcher.css` to COPY_FILES in `build.js`

### Expected Behavior
- Press Ctrl+Shift+K -> dark search panel opens
- Type to fuzzy-filter open tabs by title/URL
- Arrow keys navigate, Enter switches to selected tab
- Escape closes panel
- Toggle in popup disables the command
- Hotkey reconfigurable via browser extension shortcuts page
- Switching brings target tab + window to front

### Acceptance Criteria
- `commands` manifest with `switch-tab` present for both browsers
- `tabs` permission added
- Switcher opens as focused popup window
- Fuzzy search: partial title/URL match, case-insensitive
- Keyboard: Up/Down/Enter/Escape all functional
- Toggle on/off respected
- Switch activates correct tab+window
- Switcher window self-closes after switch
- Esc closes without switching
- `build.js` copies new files

---

## Feature 4: Notification Permission Blocker

### Storage Key
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| blockNotifications | bool | true | Auto-deny notification permission prompts |

### Approach
Inject content script at `document_start` that overrides `Notification.requestPermission()` and patches `navigator.permissions.query()` for notifications. Must run before any page script.

### Files to Touch
1. `src/content/notification-blocker.js` (new) - override Notification API
2. `src/popup.html` - add toggle card
3. `src/popup.js` - add key/default, wire toggle
4. `src/manifest.chrome.json` - add to content_scripts
5. `src/manifest.firefox.json` - same

### Steps
1. Create `src/content/notification-blocker.js`:
   - Save original `Notification.requestPermission`
   - Override `Notification.requestPermission` to return `Promise.resolve('denied')` when blocker enabled, otherwise call original
   - Override `Notification.permission` getter to return `'denied'` when enabled
   - Patch `navigator.permissions.query` to intercept `{name: 'notifications'}` and return mock PermissionStatus with `state: 'denied'`, `onchange: null`
   - Listen on `chrome.storage.onChanged` for toggle updates
   - Wrap in IIFE, use `run_at: document_start`
2. Add toggle card in `popup.html`:
   - Label: "Block Notification Prompts", Desc: "Auto-deny notification permission requests"
3. Add `blockNotifications` to `keys`, `defaults`, and backup keys in `popup.js`
4. Add `notification-blocker.js` to content_scripts in both manifests (same block as image-blocker etc., run_at: document_start, all_frames: true)

### Expected Behavior
- When enabled: `Notification.requestPermission()` auto-resolves to `'denied'`, no browser prompt
- When disabled: normal browser behavior
- `Notification.permission` reads `'denied'` to page scripts
- `navigator.permissions.query({name:'notifications'})` returns state `'denied'`
- Settings persist, toggle in popup reflects state
- Toggle off requires page reload (noted in description)

### Acceptance Criteria
- `blockNotifications` defaults to `true` in storage
- Content script injected before page scripts (document_start)
- Sites see `Notification.permission === 'denied'`
- `requestPermission()` returns `'denied'` with no browser prompt
- `navigator.permissions.query({name:'notifications'})` returns state `'denied'`
- Toggle reflects in popup
- Works in iframes (all_frames: true)
- No console errors
- Restore note about page reload for toggle-off

---

## Cross-Feature: Update backupKeys

All four new keys must be added to the `backupKeys` array in `popup.js`:
`urlCleaner`, `screenshotFullPage`, `quickTabSwitcher`, `blockNotifications`

Also update `background.js` `onInstalled` defaults to include all new keys.
