# Plan: Adaptive Intensity Smooth Scroll

## Goal
Make smooth scroll adapt to scroll intensity:
- Gentle/slow scroll → really smooth and slow motion (more glide)
- Hard/fast scroll → responsive, near-normal feel (less glide)

## Current State
File: `src/content/smooth-scroll.js` (also copied to `dist/chrome/` and `dist/firefox/`)

Current behavior: fixed multiplier (`deltaY * 0.5`) and fixed decay (`0.90`). Every scroll input is treated the same regardless of intensity.

## Approach: Scale multiplier + decay by |deltaY|

`e.deltaY` already encodes scroll intensity:
- Trackpad slow drag: deltaY ~5-30
- Mouse wheel notch: deltaY ~53-100
- Fast flick / fast wheel: deltaY ~100-200+

Use this to dynamically scale two things per wheel event:

### 1. Delta multiplier (how much velocity to add)
- Gentle (|deltaY| < 30): `scale = 0.12` → very small movement, really smooth/slow
- Moderate (|deltaY| ~80): `scale = 0.45` → medium movement
- Vigorous (|deltaY| > 140): `scale = 0.75` → large movement, feels close to normal

Formula: `scale = 0.12 + 0.63 * Math.min(|deltaY| / 150, 1)`

### 2. Decay rate (how quickly motion stops)
- Gentle: `decay = 0.93` → extended glide, really smooth
- Vigorous: `decay = 0.78` → quick stop, feels direct/normal

Formula: `decay = 0.93 - 0.15 * Math.min(|deltaY| / 150, 1)`

Store decay in a `currentDecay` variable that `tick()` reads instead of the constant `DECAY`.

### 3. maxVel cap
Increase from 60 to 80 so vigorous scrolling isn't artificially capped.

## Files to change

### `src/content/smooth-scroll.js` (and copy to both dist/)

Changes:
1. Remove constant `DECAY = 0.90`
2. Add `let currentDecay = 0.90;` (mutable, updated per event)
3. In `handleScroll()`, replace `velocity += delta` with adaptive scaling:
   - Compute `absDelta = Math.abs(delta)`
   - Compute `scale` and `decay` from absDelta
   - Apply: `velocity += delta * (scale / 0.5)` (normalize so the current deltaY*0.5 in onWheel doesn't double-scale)
   - Actually simpler: change `onWheel` to pass raw `e.deltaY`, and let `handleScroll` do all scaling
4. Update `tick()`: replace `Math.pow(DECAY, dt)` with `Math.pow(currentDecay, dt)`
5. Increase maxVel from 60 to 80

## Specific edits

### In `onWheel` (line 114):
```js
// Before:
if (handleScroll(e, e.deltaY * 0.5)) e.preventDefault();
// After:
if (handleScroll(e, e.deltaY)) e.preventDefault();
```

### In `handleScroll` (lines 88-110):
Replace the velocity calculation with:
```js
var absDelta = Math.abs(delta);
var intensity = Math.min(absDelta / 150, 1);
var scale = 0.12 + 0.63 * intensity;
currentDecay = 0.93 - 0.15 * intensity;

velocity += delta * scale;

var maxVel = 80;
```

### In `tick` (line 78):
```js
// Before:
velocity *= Math.pow(DECAY, dt);
// After:
velocity *= Math.pow(currentDecay, dt);
```

### Remove or keep DECAY constant:
Remove `const DECAY = 0.90;` since it's replaced by `currentDecay`.

## Keyboard keys (onKeyDown)
Keep keyboard keys at fixed behavior since they're discrete (Page Up/Down, Arrows). They don't have a "gentle vs vigorous" concept.

## Validation
1. Slow trackpad drag → very slow, silky smooth motion with extended glide
2. Normal mouse wheel → moderate smooth scroll
3. Fast/vigorous mouse wheel → responsive, moves quickly, minimal afterglide
4. Gradual speed changes → transitions feel natural (no sudden jumps)
5. Modals still scroll natively
6. Keyboard keys still work as before

## Risks
- If user scrolls slowly then suddenly fast, `currentDecay` jumps from 0.93 to 0.78 mid-animation → might cause a slight stutter. Mitigation: the rAF loop handles this gracefully since decay is applied per-frame; the velocity just decays faster on the next frame.
- Very small deltaY values (< 5) might produce near-zero velocity → scroll feels unresponsive. Mitigation: the 0.12 floor on scale ensures even tiny inputs produce some movement.
