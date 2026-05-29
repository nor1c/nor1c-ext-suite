# Quick Element Hider — Implementation Plan

## Summary

Add a "Quick Element Hider" feature to Nor1c Suite that lets users pick any element on a page to permanently hide it. Rules are stored using **structural fingerprints** (tag + nth-child chain from nearest stable ancestor) instead of class/ID names, so they survive React/framework random hashing on every page reload.

Always-on feature — no toggle. Accessible via a "Pick Element" button in the popup.

---

## Key Changes

### 1. New Content Script: `src/content/element-hider.js`

**Picker Mode**

- Activated by message `{ type: "start-element-picker" }` from popup/background
- Injects a `<style>` for hover highlight (blue dashed border `2px dashed #3b82f6`, pointer cursor) and a small floating label (tag name + structural hint, e.g. `aside > div:nth-child(3)`)
- On `mouseover`: highlight the target element, show label near cursor
- On `mouseout`: remove highlight
- On `click`: capture the element, build its structural fingerprint, save rule, apply `display: none !important`, exit picker mode
- On `Escape`: exit picker mode without selecting
- Prevent the click from navigating or triggering site handlers (`e.preventDefault()`, `e.stopPropagation()`, `e.stopImmediatePropagation()`)
- Add a small floating "Cancel" pill at top-center of page while picker is active

**Structural Fingerprint Algorithm**

Given a selected element, build a CSS selector path:

1. Walk up from the element to `document.body`
2. At each level, determine the element's `tag` and its `:nth-child()` index among siblings of the same tag
3. **Stop climbing** when reaching an ancestor that has a **stable identifier**:
   - A non-random `id` (not matching patterns like `css-*, jss-*, __[a-z0-9]+, radix-*, headlessui-*`)
   - A semantic landmark tag: `main`, `header`, `footer`, `nav`, `article`, `section`, `aside`, `form[role]`
   - A `data-testid` or `data-cy` attribute
4. The resulting selector is: `[stable ancestor] > tag:nth-child(n) > tag:nth-child(n) > ... > tag:nth-child(n)`
5. Store alongside: optional `data-nor1c-content-hint` with the element's trimmed `textContent` (first 80 chars) for fuzzy fallback matching

**Fuzzy Re-match on Page Load**

When applying saved rules:

1. Try the structural selector first → if it matches exactly, hide it
2. If no match (DOM shifted slightly), try a relaxed match:
   - Walk the same path but allow `nth-child` tolerance of ±1 at each level
   - Match against the content hint (`textContent` similarity) at the leaf node
3. If still no match, mark the rule as "unresolved" (don't show BLOCKED label — just skip silently)

**Applying Saved Rules**

- On `DOMContentLoaded` and on `chrome.storage.onChanged`, load rules for current domain and apply
- Use `MutationObserver` to catch dynamically added elements matching saved rules
- Hidden elements get `display: none !important` via inline style

### 2. Popup UI Changes: `src/popup.html` + `src/popup.css` + `src/popup.js`

**New "Pick Element" Button**

- Placed in the footer area (always-active features section), replacing or alongside the current footer text
- Style: a full-width button with a crosshair/target icon, label "Pick Element to Hide"
- Clicking it sends `{ type: "start-element-picker" }` to the active tab's content script, then closes the popup

**New "Hidden Elements" Management Section**

- Below the toggles, collapsible section titled "Hidden Elements" with a count badge (like video sources)
- Shows per-site rules for the current tab's domain
- Each item shows: tag path summary (e.g. `aside > div:nth-child(3)`), a small preview of the content hint if available, and a red "Unhide" (trash/X) button
- "Unhide All for This Site" button at the top of the list
- Empty state: "No hidden elements on this site"

### 3. Background Script: `src/background.js`

- Add `hiddenRules` to default storage on install: `hiddenRules: {}`
- Relay `{ type: "start-element-picker" }` message from popup to the active tab
- Broadcast `hiddenRules` changes to all tabs (like existing toggle-changed pattern)

### 4. Storage: `lib/storage.js`

- No structural changes needed — existing `getToggles` and `onStorageChange` helpers cover the pattern
- New storage key: `hiddenRules` — shape:
```js
{
  "example.com": [
    {
      "id": "uuid",
      "selector": "main > div:nth-child(2) > aside:nth-child(1) > div:nth-child(3)",
      "contentHint": "Sponsored · Buy now...",
      "createdAt": 1717000000000
    }
  ]
}
```

### 5. Manifest Changes: `src/manifest.chrome.json` + `src/manifest.firefox.json`

- Add `content/element-hider.js` to the first `content_scripts` entry (always-on, `document_start`, `all_frames: true`)

---

## Popup Layout (Updated Footer)

The footer area becomes a two-part section:

```
┌─────────────────────────────────────┐
│ [Pick Element to Hide]  (full-width)│
│                                     │
│ ▼ Hidden Elements (2)               │
│   aside > div:nth-child(3)  [X]     │
│   section > div:nth-child(1) [X]    │
│   [Unhide All for This Site]        │
└─────────────────────────────────────┘
Always active: Force Right-Click · Copy Link Text · Image Viewer · Element Hider
```

---

## Edge Cases & Failure Modes

- **Dynamic class detection**: A regex blacklist checks for common random patterns: `css-[a-z0-9]+`, `jss\d+`, `_[a-zA-Z0-9]{5,}`, `makeStyles-\w+`, `Component_\w+`, `sc-\w+`, `styled-\w+`, `emotion-\w+`. If an `id` or class matches, it's treated as unstable and the algorithm climbs higher.
- **Iframes**: `all_frames: true` ensures it works inside iframes. Rules are keyed by domain, so cross-origin iframes get their own rules.
- **Very generic selectors**: If the structural path is too short (only 1–2 segments), add a `data-nor1c-hint` attribute to the hidden element for more precise re-matching.
- **Shadow DOM**: Not in v1 scope — the feature works on light DOM only, consistent with other features in the extension.
- **Picker mode conflicts**: If the user has an ad blocker or other extension that intercepts clicks, the picker's `stopImmediatePropagation` on the capturing phase should take priority.
- **Storage size**: `chrome.storage.sync` has a ~100KB limit. Each rule is ~200 bytes, so ~500 rules max. Sufficient for typical use.

---

## Test Plan

1. **Basic picker flow**: Open any site → popup → "Pick Element to Hide" → hover highlights element → click → element disappears → reload page → element still hidden
2. **React site test**: Go to a React app (e.g., Twitter, a Create React App site) → hide an element with hashed class → reload → verify it's still hidden via structural fingerprint
3. **Rule management**: Open popup → see "Hidden Elements" list → click unhide on one → element reappears → "Unhide All" → all reappear
4. **Escape/cancel**: Start picker → press Escape → picker exits, nothing saved
5. **Iframe test**: Hide element inside an iframe → verify rule applies per-domain
6. **Dynamic content**: Hide element → site loads more content dynamically → verify MutationObserver catches new matches
7. **Edge: DOM restructure**: Save a rule → site changes its DOM structure significantly → verify graceful fallback (no error, rule silently skipped)

---

## Assumptions

- Always-on feature (no master toggle), consistent with Force Right-Click and Image Viewer
- Light DOM only — no Shadow DOM support in v1
- `chrome.storage.sync` for rule persistence (syncs across devices)
- Picker uses a single-click to select; no drag-to-select-area
- Hidden elements are fully removed visually (`display: none`), not replaced with a "BLOCKED" label (cleaner for arbitrary elements)

## Coding Conventions (from AGENTS.md)

- No code comments
- Use `const`/`let`, never `var`
- Single quotes for strings unless string contains single quotes
- 2-space indentation
- Meaningful variable names
- Separate presentation and business logic
- Think about edge cases and error handling
- Keep code small and reusable
