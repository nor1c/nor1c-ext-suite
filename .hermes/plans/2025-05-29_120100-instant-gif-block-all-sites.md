# Plan: Instant GIF Block — All Websites

## Goal
Block GIFs instantly (zero flash) across ALL websites, not just Twitter/X. Works for any site that renders GIFs as `<video>` with a "GIF" label overlay.

## Known Sites Using This Pattern
- **Twitter/X**: `<video>` mp4 + `<span>GIF</span>` overlay, `aria-label="...GIF"`
- **Giphy embeds**: `<video>` with GIF overlay label
- **Tenor embeds**: similar video + label pattern
- **Reddit**: GIF awards, animated emojis rendered as video
- **Facebook/Instagram**: animated GIF stickers as video
- **Tumblr, Imgur, Discord web**: GIF-as-video with label

## Root Cause (same as before)
- CSS `img[src*=".gif"]` misses all `<video>`-based GIFs
- JS MutationObserver has paint gap → flash
- Need CSS-first approach that catches video GIFs before paint

## Solution: 3-Layer Generic Approach

### Layer 1: CSS Pre-Block (zero flash, no JS)
Add selectors targeting attributes that identify GIF videos universally:

```css
/* aria-label ends in "GIF" (Twitter, others) */
video[aria-label$="GIF"],
video[aria-label$="gif"],
video[aria-label$=" Gif"] {
  visibility: hidden !important;
  opacity: 0 !important;
}

/* title/alt ends in ".gif" (some embed players) */
video[title$=".gif"],
video[title$="GIF"],
video[alt$=".gif"] {
  visibility: hidden !important;
  opacity: 0 !important;
}
```

**Note**: Can't CSS-target "GIF" text inside child spans (no parent selector by child content). That gap is filled by Layer 2.

### Layer 2: JS Instant Detection (catches what CSS can't)
MutationObserver already runs at `document_start`. Enhance it to catch video GIFs faster:

**A) Direct `<video>` scanning in `hideImages()`:**
```js
// Check <video> elements for GIF indicators
const videos = container.querySelectorAll('video');
for (const v of videos) {
  if (isVideoGif(v)) hideElement(v);
}
```

**B) `isVideoGif(el)` — universal detection function:**
```js
function isVideoGif(el) {
  if (!el || el.tagName !== 'VIDEO') return false;
  // 1. aria-label contains "gif" (case-insensitive)
  const aria = (el.getAttribute('aria-label') || '').toLowerCase();
  if (aria.endsWith('gif')) return true;
  // 2. title/alt contains ".gif"
  const title = (el.getAttribute('title') || '').toLowerCase();
  const alt = (el.getAttribute('alt') || '').toLowerCase();
  if (title.includes('.gif') || alt.includes('.gif')) return true;
  // 3. Loop + muted + autoplay + short duration → likely GIF-as-video
  //    (only flag if combined with small dimensions typical of GIFs)
  if (el.loop && el.muted && el.autoplay) {
    const w = el.videoWidth || el.clientWidth;
    const h = el.videoHeight || el.clientHeight;
    if (w > 0 && w <= 600 && h > 0 && h <= 600) return true;
  }
  return false;
}
```

**C) Also detect via "GIF" label overlay (existing `findGifLabel` → `hideMediaFromGifLabel`):**
This catches platforms where only the label text indicates it's a GIF.

### Layer 3: Restore on Toggle-Off
Track hidden elements in a WeakSet. On `remove()`, iterate and restore inline styles.

## Files to Change

| File | Changes |
|------|---------|
| `src/content/gif-blocker.js` | Add video CSS selectors, add `isVideoGif()`, add video scanning to `hideImages()`, add `aria-label`/`title` to attributeFilter, add restore logic |
| `build.js` | No change |
| `manifest.*.json` | No change |

## Step-by-Step Implementation

1. **Expand CSS** (lines 3-23): Add `video[aria-label$="GIF"]`, `video[aria-label$="gif"]`, `video[title$="GIF"]`, `video[title$=".gif"]` selectors
2. **Add `isVideoGif(el)` function**: Universal video GIF detection (aria-label, title, loop+muted+autoplay heuristic)
3. **Add video scanning to `hideImages()`** (line 170): `querySelectorAll('video')` → `isVideoGif()` → `hideElement()`
4. **Add `aria-label`, `title` to attributeFilter** (line 212): Trigger re-check on attribute changes
5. **Handle `<video>` in MutationObserver attributes handler**: Re-check `isVideoGif()` on video attribute changes
6. **Add WeakSet tracking**: `const hiddenEls = new WeakSet()` — add on hide, iterate on remove for restore
7. **Build**: `node build.js`

## Verification
1. Load unpacked extension → enable GIF blocker
2. Test on twitter.com — GIFs should appear already blocked (no flash)
3. Test on giphy.com — embedded GIF videos blocked
4. Test on reddit.com — GIF content blocked
5. Toggle off → everything restores
6. Check non-GIF videos still play normally (YouTube, Twitch, etc.)

## Risks & Mitigations
- **False positive: loop+muted+autoplay heuristic** — could catch short looping videos that aren't GIFs. Mitigation: only apply heuristic when combined with small dimensions (≤600px), and only when no other indicators exist. Can be tuned.
- **Layout shifts** — `visibility:hidden` takes space but shows nothing. Prefer this over `display:none` which collapses container and shifts timeline layout.
- **Performance** — `querySelectorAll('video')` on every mutation batch is cheap (few video elements per page).
