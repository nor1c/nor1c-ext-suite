# GIF Blocker: Fix Missed GIFs on Some Websites

## Goal
Improve `gif-blocker.js` to catch GIFs that currently slip through — X/Twitter, Salesforce-like pages with `.gif` in `alt`/filename but not in `src`, and dynamically-swapped images.

## Root Causes Identified

### 1. MutationObserver only watches `addedNodes`, not attribute changes
- When an existing `<img>` gets its `src` swapped to a GIF (lazy loading, SPA route change), the observer misses it.
- Fix: add `attributes: true, attributeFilter: ['src', 'data-src', 'data-lazy-src']` to observer config, and handle `m.type === 'attributes'`.

### 2. `isGif()` and CSS selectors only check `src`-like attributes
- Example: `<img src="/customers/servlet/rtaImage?eid=..." alt="DancingNana.gif">` — `.gif` is in `alt`, not `src`.
- Fix: also check `alt` attribute, `title`, and common `data-*` attrs for `.gif` pattern.

### 3. Twitter/X uses CDN proxy URLs without `.gif` extension
- Twitter images often served via `pbs.twimg.com` with query params, no `.gif` in URL.
- Possible fix: check `Content-Type` via `webRequest` API (heavy), or detect Twitter-specific patterns (`data-testid="tweetPhoto"`, `.gif` in original URL params).
- Scope decision needed: site-specific heuristics vs generic improvement.

### 4. CSS selectors miss `<picture>` source with `data-lazy-srcset`
- Only `srcset` and `data-srcset` are covered.

## Proposed Approach

### Phase 1: Generic improvements (high confidence, no site-specific hacks)
1. **Extend `isGif()`** to check: `src`, `data-src`, `data-lazy-src`, `alt`, `title`, `data-testid`, any `data-*` attribute containing `.gif`.
2. **MutationObserver**: watch `attributes` in addition to `childList`, so src-swapped images get re-checked.
3. **CSS selectors**: add `img[alt$=".gif"]`, `img[alt*=".gif "]`, and `img[data-lazy-srcset*=".gif"]`.
4. **Attribute mutation handler**: when `src` or `data-src` changes on an existing img, re-run `isGif()` check.

### Phase 2: Site-specific / advanced (optional, deferred)
- Twitter: intercept `pbs.twimg.com` images, check if URL contains `format=gif` or `.gif` param.
- Background-image GIFs: scan computed styles for `.gif` URLs (expensive, opt-in).

## Files to Change
- `src/content/gif-blocker.js` — main changes

## Step-by-Step Plan

### Step 1: Enhance `isGif()` function
- Extract check into a reusable `matchesGif(el)` that tests `src`, `data-src`, `data-lazy-src`, `alt`, `title`, and iterates `el.attributes` for any value matching `/\.gif([?# ]|$)/i`.

### Step 2: Extend MutationObserver to watch attributes
```js
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['src', 'data-src', 'data-lazy-src', 'alt']
});
```
- In callback, handle `m.type === 'attributes'` → re-check `m.target`.

### Step 3: Extend CSS selectors
Add to the CSS string:
```
img[alt$=".gif"],
img[alt*=".gif "],
img[data-lazy-srcset*=".gif"]
```

### Step 4: Build & test
- `node build.js`
- Load unpacked extension in Chrome, test on:
  - Example `<img src="..." alt="DancingNana.gif">` markup
  - X/Twitter feed with GIFs
  - A page with lazy-loaded GIFs (src swaps after load)

## Risks & Tradeoffs
- Checking all `data-*` attributes adds CPU cost per mutation; mitigate by only checking on `attributes` mutations and `addedNodes`.
- Twitter GIFs served via CDN without `.gif` in URL may still slip through Phase 1; need Phase 2 site-specific logic for full coverage.
- CSS `alt` attribute selectors are a heuristic — an image with `alt="not a gif.gif"` would be hidden. Low false-positive risk in practice.

## Open Questions
- Should we add a user-facing "aggressive mode" toggle for Phase 2 (site-specific, background-image scanning)?
- Any other sites besides Twitter where GIFs consistently slip through?
