# Plan: Use tab title as video filename

## Goal
Display the current tab title (e.g. "Funny Cat Video - YouTube") as the video filename instead of the URL-derived filename (e.g. "video.mp4" or "abc123").

## Current behavior
In `src/content/video-play-reset.js` line ~36:
```js
fileName: fileName || document.title || 'video'
```
Priority: URL pathname → document.title → "video". Since URL filenames are usually non-empty (e.g. "video.mp4"), they always win. The meaningful tab title is never used.

Background's `addVideoLinks` also falls back to `tab.title` when fileName is empty, but since the content script always provides one, that fallback never triggers.

## Proposed approach
Swap priority in `video-play-reset.js` so `document.title` takes precedence.

## Steps

1. **Edit `src/content/video-play-reset.js`** — change:
   ```js
   fileName: fileName || document.title || 'video'
   ```
   to:
   ```js
   fileName: document.title || fileName || 'video'
   ```

2. **Copy to dist** — `dist/chrome/content/video-play-reset.js` and `dist/firefox/content/video-play-reset.js`

Note: Background's `getFileName` already strips `\/:*?"<>|` from filenames, so titles like 'Video: Part 1 | "Best"' get sanitized automatically.

## Files to change
- `src/content/video-play-reset.js`
- `dist/chrome/content/video-play-reset.js`
- `dist/firefox/content/video-play-reset.js`

## Validation
- Play a video on a page with a descriptive tab title → popup should show the tab title as filename
- Play a video on a page with no title → should fall back to URL filename
