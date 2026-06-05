(function() {
  const MUSIC_D = "M5.5 1.383";
  const RENDERER_TAGS = new Set([
    "YTD-RICH-ITEM-RENDERER",
    "YTD-VIDEO-RENDERER",
    "YTD-COMPACT-VIDEO-RENDERER",
    "YTD-GRID-VIDEO-RENDERER",
    "YTD-PLAYLIST-VIDEO-RENDERER",
    "YTD-COMPACT-PLAYLIST-RENDERER",
    "YTD-PLAYLIST-RENDERER",
    "YTD-RADIO-RENDERER",
    "YT-LOCKUP-VIEW-MODEL",
    "YTD-LOCKUP-VIEW-MODEL",
    "YT-RICH-ITEM-RENDERER",
    "YT-VIDEO-RENDERER",
    "YT-COMPACT-VIDEO-RENDERER",
    "YT-GRID-VIDEO-RENDERER",
    "YT-PLAYLIST-VIDEO-RENDERER",
    "YT-COMPACT-PLAYLIST-RENDERER",
    "YT-PLAYLIST-RENDERER",
    "YT-RADIO-RENDERER",
    "YTD-RICH-ITEM-RENDERER"
  ]);

  let enabled = false;
  let rafId = null;
  let observer = null;
  let styleEl = null;

  function buildCSS() {
    const rules = [];
    RENDERER_TAGS.forEach(function(tag) {
      rules.push(tag.toLowerCase() + ':has(path[d*="' + MUSIC_D + '"]){display:none!important;visibility:hidden!important;height:0!important;min-height:0!important;padding:0!important;margin:0!important;overflow:hidden!important;opacity:0!important}');
    });
    return rules.join("");
  }

  function injectCSS() {
    if (styleEl) return;
    styleEl = document.createElement("style");
    styleEl.textContent = buildCSS();
    document.documentElement.appendChild(styleEl);
  }

  function removeCSS() {
    if (styleEl) { styleEl.remove(); styleEl = null; }
  }

  function collectCandidates(root, out) {
    try {
      const paths = root.querySelectorAll("path");
      for (let i = 0; i < paths.length; i++) out.push(paths[i]);
    } catch (e) {}
    try {
      const icons = root.querySelectorAll('[class*="BadgeShapeIcon"]');
      for (let i = 0; i < icons.length; i++) out.push(icons[i]);
    } catch (e) {}
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node;
    while (node = walker.nextNode()) {
      if (node.shadowRoot) {
        collectCandidates(node.shadowRoot, out);
      }
    }
  }

  function hasMusicIcon(el) {
    if (el.getAttribute) {
      const d = el.getAttribute("d");
      if (d && d.indexOf(MUSIC_D) !== -1) return true;
    }
    try {
      const paths = el.querySelectorAll("path");
      for (let i = 0; i < paths.length; i++) {
        const d = paths[i].getAttribute("d");
        if (d && d.indexOf(MUSIC_D) !== -1) return true;
      }
    } catch (e) {}
    if (el.shadowRoot) return hasMusicIcon(el.shadowRoot);
    return false;
  }

  function findRenderer(el) {
    let cur = el;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (cur.nodeType === Node.DOCUMENT_FRAGMENT_NODE) { cur = cur.host; continue; }
      if (cur.nodeType !== Node.ELEMENT_NODE) break;
      if (RENDERER_TAGS.has(cur.tagName)) return cur;
      if (cur.parentNode) {
        cur = cur.parentNode;
      } else {
        const root = cur.getRootNode();
        cur = root && root.host ? root.host : null;
      }
    }
    return null;
  }

  function hideRenderer(el) {
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("height", "0px", "important");
    el.style.setProperty("min-height", "0px", "important");
    el.style.setProperty("padding", "0px", "important");
    el.style.setProperty("margin", "0px", "important");
    el.style.setProperty("overflow", "hidden", "important");
    el.style.setProperty("opacity", "0", "important");
  }

  function scanAndHide() {
    if (!enabled) return;
    const candidates = [];
    collectCandidates(document.documentElement, candidates);
    for (let i = 0; i < candidates.length; i++) {
      if (!hasMusicIcon(candidates[i])) continue;
      const renderer = findRenderer(candidates[i]);
      if (renderer) hideRenderer(renderer);
    }
  }

  function startRAF() {
    if (rafId) return;
    let lastScan = 0;
    function loop(ts) {
      if (ts - lastScan > 600) {
        scanAndHide();
        lastScan = ts;
      }
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
  }

  function stopRAF() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function(muts) {
      for (let i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes.length > 0) { scanAndHide(); break; }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  function loadState(cb) {
    chrome.storage.sync.get(["youtubeHideMusic"], function(r) {
      enabled = r.youtubeHideMusic !== false;
      if (cb) cb();
    });
  }

  function start() {
    injectCSS();
    scanAndHide();
    startRAF();
    startObserver();
  }

  function stop() {
    removeCSS();
    stopRAF();
    stopObserver();
  }

  function apply() {
    if (enabled) start();
    else stop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      loadState(function() { apply(); });
    });
  } else {
    loadState(function() { apply(); });
  }

  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.type === "toggle-changed" && msg.key === "youtubeHideMusic") {
      enabled = msg.value !== false;
      apply();
    }
  });
})();
