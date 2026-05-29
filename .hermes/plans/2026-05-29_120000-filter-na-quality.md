# Plan: Filter out N/A quality videos from popup list

## Goal
Hide videos with "N/A" or no resolution from the video download popup list.

## Current behavior
`displayedVideos` in `src/video-downloader-popup.js` only filters blob URLs:
```js
this.videos.filter(t => t.url && !t.url.startsWith("blob")).reverse()
```
Videos with `quality: "N/A"` (set by `video-play-reset.js` when `videoHeight` is 0) still show.

## Proposed approach
Add quality check to the `displayedVideos` filter in the minified popup JS.

## Steps

1. **Edit `src/video-downloader-popup.js`** — find the `displayedVideos` filter function and add a quality gate:
   - Change: `t.url&&!t.url.startsWith("blob")`
   - To: `t.url&&!t.url.startsWith("blob")&&t.quality&&"n/a"!==t.quality.toLowerCase()`
   - This filters out entries where quality is falsy, `"N/A"`, `"n/a"`, etc.

2. **Copy to dist** — `dist/chrome/` and `dist/firefox/` copies of `video-downloader-popup.js`

3. **Also edit `src/video-downloader-popup.html`** if the filter lives there instead (check both)

## Files to change
- `src/video-downloader-popup.js` (line ~13, minified)
- `dist/chrome/video-downloader-popup.js`
- `dist/firefox/video-downloader-popup.js`

## Validation
- Reload extension, play a video with known resolution → should appear
- Play a video with no detectable resolution (blob/MSE) → should NOT appear
- Previously detected videos with valid quality should still show
