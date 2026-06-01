# Right-Click Blocker Investigation

## Findings
These things caused unable to right click on right click blocked site even though the extension is running.

### 1. Primary Blocker — Line 76-77

```javascript
function mousedwn(e){
  try{
    if(event.button==2||event.button==3)return false
  }catch(e){
    if(e.which==3)return false
  }
}
document.oncontextmenu=function(){return false};
document.ondragstart=function(){return false};
document.onmousedown=mousedwn
```

**What it does:**
- `document.oncontextmenu` — intercepts right-click context menu
- `document.onmousedown` — blocks right/middle mouse buttons (button 2 & 3)
- `document.ondragstart` — blocks drag operations

### 2. Keyboard Shortcut Blocker — Line 77 (end)

```javascript
window.addEventListener("keydown",function(e){
  if(e.ctrlKey&&(e.which==65||e.which==66||e.which==67||e.which==73||e.which==80||e.which==83||e.which==85||e.which==86)){
    e.preventDefault()
  }
});
document.keypress=function(e){
  if(e.ctrlKey&&(e.which==65||e.which==66||e.which==67||e.which==73||e.which==80||e.which==83||e.which==85||e.which==86)){}
  return false
}
```

**What it does:** Blocks Ctrl+A, B, C, I, P, S, U, V (select all, bold, copy, inspect, print, save, view source, paste)

### 3. DevTools Blocker — Line 77 (end)

```javascript
document.onkeydown=function(e){
  e=e||window.event;
  if(e.keyCode==123||e.keyCode==18){return false}
}
```

**What it does:** Blocks F12 (devtools) and Alt key

### 4. CSS-based Text Selection Blocker — Line 77

```css
*:(input,textarea){-webkit-touch-callout:none;-webkit-user-select:none}
img{-webkit-touch-callout:none;-webkit-user-select:none}
```

### 5. Iframe Context Menu Blocker — Line 82 (end)

```javascript
$('iframe').on('contextmenu', function(e){e.preventDefault();});
```

## Summary

All blockers are inline scripts/styles injected directly into the HTML page. To unblock right-click, need to neutralize all 5 mechanisms listed above.
