# Quick Element Hider — Two Bug Fixes

## Summary

Fix two usability issues in `src/content/element-hider.js`:

1. **Picker stays active until explicitly exited** — remove the `exitPicker()` call after each selection so the user can hide multiple elements in one session. Exit only via Escape key or Cancel pill.
2. **Iframe child selection** — when hovering over an `<iframe>`, temporarily set `pointer-events: none` on it so the parent frame's click handler receives the event and can select the `<iframe>` element itself. Restore `pointer-events` after selection or mouseout.

## Key Changes — `src/content/element-hider.js`

### Picker persistence (fix 1)

- In `onPickerClick`: remove the `exitPicker()` call inside the `chrome.storage.sync.set` callback
- After hiding the element, add a brief visual confirmation — a quick green flash outline (e.g. `2px solid #22c55e` for 400ms) on the selected element before it disappears
- Keep highlight/label/cancel pill active so the user can immediately pick the next element
- Ensure `lastHovered` is cleared after hiding so the next hover starts clean

### Iframe selection (fix 2)

- In `onPickerMouseOver`: if `e.target.tagName === 'IFRAME'`, store a reference and set `e.target.style.pointerEvents = 'none'` — this lets the parent document receive the subsequent click on the `<iframe>` element
- In `onPickerMouseOut`: if the previously hovered element was an iframe, restore `pointer-events` to its original value
- In `onPickerClick`: after selecting an iframe element, restore its `pointer-events` immediately
- Track the iframe reference with a dedicated variable (e.g. `let iframeOverride = null`) separate from `lastHovered`

## No other files changed

The popup UI (HTML/CSS/JS), background script, manifests, and storage remain unchanged. These are content-script-only fixes.

## Test Plan

1. Open a site → Pick Element → click element A → element A hidden → picker still active → click element B → element B hidden → press Escape → picker exits
2. Open a site with iframes → Pick Element → hover over iframe area → iframe element highlights → click → iframe hidden
3. Hover over iframe then move away without clicking → iframe pointer-events restored → iframe interactive again
4. Click Cancel pill → picker exits without selecting anything

## Assumptions

- The "brief flash" feedback is a CSS outline animation, not a toast/notification — minimal visual noise
- `pointer-events: none` on the iframe while hovered is acceptable because the user's intent is to select, not interact
- No changes needed to popup.js, background.js, or manifest files
