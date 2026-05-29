# Plan: Image Blocker — Grey "BLOCKED" Placeholder

## Goal
Replace hidden images with a visible grey rectangle showing centered "BLOCKED" text, instead of the current behavior of making images invisible/collapsed.

## Current Behavior (src/content/image-blocker.js)
- CSS hides `img`, `picture`, `svg image`, `video[poster]` via `visibility:hidden`, `opacity:0`, `max-height:0`, `max-width:0`, `position:absolute` — effectively collapsing them out of layout.
- JS `hideEl()` does the same for dynamically added elements + background-image containers.
- Blocked elements are invisible — no visual placeholder.

## New Behavior
Each blocked image/container shows a grey box with "BLOCKED" centered text, preserving the original element's dimensions.

## Approach

### Strategy: Wrapper + Overlay for `<img>`/`<picture>`, inline replacement for bg-image containers

**For `<img>`, `<picture>` elements:**
1. Wrap the element in a `<div>` with `position:relative; display:inline-block;`
2. Add a sibling overlay `<div>` inside the wrapper with:
   - `position:absolute; inset:0;`
   - `background:#888; color:#fff; font-weight:700; font-size:14px;`
   - `display:flex; align-items:center; justify-content:center;`
   - Text content: `BLOCKED`
3. Hide the original image with `opacity:0` (not `display:none` — preserves dimensions)

**For background-image containers:**
1. Save original `background-image` to a data attr
2. Set `background-image:none !important; background-color:#888 !important;`
3. Insert an overlay div (if not already present) with "BLOCKED" text

**For `svg image`, `video[poster]`:**
- Same wrapper approach as `<img>`

### Key Changes to image-blocker.js

1. **Remove old CSS** — the hiding CSS block that collapses images
2. **New CSS** — minimal: just the overlay styling via class `.nor1c-img-blocked-overlay`
3. **New `hideEl(el)` function:**
   - For `IMG`/`PICTURE`: wrap in div, insert overlay, hide original
   - For bg-image containers: remove bg, set grey bg, insert overlay child
   - Track with `WeakSet` to avoid double-processing
4. **`remove()` function:** unwrap images, restore bg-images, remove overlays (undo all changes)
5. **Keep** MutationObserver, storage listener, scan logic unchanged

## Files to Change

- `src/content/image-blocker.js` — main implementation

No changes needed to popup.html, popup.js, build.js, or manifest files.

## Verification
1. `node build.js` (copies src → dist)
2. Load unpacked extension in Chrome
3. Enable Image Blocker toggle
4. Visit any page with images — should see grey "BLOCKED" rectangles in place of images
5. Disable toggle — images should restore normally
6. Test dynamic content (scroll a page that lazy-loads) — new images also get blocked
7. Test background-image containers (hero banners, CSS backgrounds) — grey + "BLOCKED"
