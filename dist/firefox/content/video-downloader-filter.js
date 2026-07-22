(function() {

  function parseQuality(q) {
    if (q == null || q === '') return 0;
    var s = String(q).trim().toLowerCase();
    if (s === 'n/a' || s === 'unknown') return 0;
    if (s === 'hd') return 720;
    if (s === 'sd') return 480;
    var m = s.match(/^(\d+)\s*[x×]\s*(\d+)$/);
    if (m) return Math.max(parseInt(m[1], 10), parseInt(m[2], 10));
    var p = s.match(/^(\d+)\s*p?$/);
    if (p) return parseInt(p[1], 10);
    var n = parseInt(s, 10);
    return isNaN(n) ? 0 : n;
  }

  function normalizeQuality(q) {
    var n = parseQuality(q);
    if (n > 1080) n = Math.round(n / 1.78);
    return n;
  }

  function normalizeFilename(name) {
    if (!name) return '';
    var s = name.replace(/\.[^.]+$/, '');
    s = s.replace(/[\s._-]*(\d{3,4}p?|4k|8k|hd|sd|hq|lq)[\s._-]*/gi, ' ');
    s = s.replace(/[\s._-]+/g, ' ').trim().toLowerCase();
    return s;
  }

  function filterArray(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return 0;
    var groups = {}, order = [];
    for (var i = 0; i < arr.length; i++) {
      var fileName = arr[i].fileName || arr[i].filename || arr[i].title || arr[i].name || '';
      var norm = normalizeFilename(fileName);
      if (!norm) {
        var url = arr[i].url || '';
        try { norm = 'url::' + normalizeFilename(new URL(url).pathname.split('/').filter(Boolean).pop() || ''); } catch(e) { norm = null; }
        if (!norm || norm === 'url::') norm = '__unique_' + i;
      }
      if (!groups[norm]) { groups[norm] = []; order.push(norm); }
      groups[norm].push(i);
    }
    var remove = [];
    for (var j = 0; j < order.length; j++) {
      var indices = groups[order[j]];
      if (indices.length < 2) continue;
      var bestIdx = indices[0], bestQ = normalizeQuality(arr[indices[0]].quality);
      for (var k = 1; k < indices.length; k++) {
        var q = normalizeQuality(arr[indices[k]].quality);
        if (q > bestQ) { bestIdx = indices[k]; bestQ = q; }
      }
      for (var k = 0; k < indices.length; k++) {
        if (indices[k] !== bestIdx) remove.push(indices[k]);
      }
    }
    if (remove.length === 0) return 0;
    remove.sort(function(a, b) { return b - a; });
    for (var i = 0; i < remove.length; i++) arr.splice(remove[i], 1);
    return remove.length;
  }

  function getTitleText(el) {
    if (!el) return '';
    var clone = el.cloneNode(true);
    var qs = clone.querySelectorAll('.quality');
    for (var i = 0; i < qs.length; i++) qs[i].remove();
    return clone.textContent.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
  }

  function notifyParent(hasVideos, msg) {
    try {
      window.parent.postMessage({ type: 'video-detection-status', hasVideos: hasVideos, message: msg || '' }, location.origin);
    } catch(e) {}
  }

  function hookVue() {
    var el = document.querySelector('#app');
    if (!el || !el.__vue__) return setTimeout(hookVue, 100);
    var comp = el.__vue__;

    var desc = Object.getOwnPropertyDescriptor(comp, 'videos');
    if (desc && typeof desc.set === 'function') {
      var origSet = desc.set;
      var origGet = desc.get;
      var _reentrant = false;
      Object.defineProperty(comp, 'videos', {
        get: origGet,
        set: function(newVal) {
          if (!_reentrant && Array.isArray(newVal) && newVal.length > 1) {
            _reentrant = true;
            filterArray(newVal);
            _reentrant = false;
          }
          origSet.call(this, newVal);
        },
        enumerable: true,
        configurable: true
      });
    }

    try {
      var vids = comp.$data.videos || comp.videos;
      if (Array.isArray(vids) && vids.length > 1) {
        filterArray(vids);
      }
    } catch(e) {}
  }
  hookVue();

  var lastStatus = null;

  function enforceFilter() {
    var list = document.querySelector('.videos-list');
    if (!list) return;

    var items = list.querySelectorAll('.video');
    if (items.length < 2) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].style.display === 'none') items[i].style.removeProperty('display');
      }
      var hasItems = items.length > 0;
      if (lastStatus !== hasItems) {
        lastStatus = hasItems;
        notifyParent(hasItems, '');
      }
      return;
    }

    var entries = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var titleEl = item.querySelector('.title');
      var qualityEl = item.querySelector('.quality');
      var titleText = getTitleText(titleEl);
      var qualityText = qualityEl ? qualityEl.textContent.replace(/^\s+|\s+$/g, '') : '';
      entries.push({ el: item, title: titleText, quality: normalizeQuality(qualityText) });
    }

    var groups = {};
    var groupOrder = [];
    for (var i = 0; i < entries.length; i++) {
      var norm = normalizeFilename(entries[i].title);
      if (!norm) norm = '__unmatched_' + i;
      if (!groups[norm]) { groups[norm] = []; groupOrder.push(norm); }
      groups[norm].push(entries[i]);
    }

    var showSet = new Set();
    for (var g = 0; g < groupOrder.length; g++) {
      var group = groups[groupOrder[g]];
      var best = group[0];
      for (var k = 1; k < group.length; k++) {
        if (group[k].quality > best.quality) best = group[k];
      }
      showSet.add(best.el);
    }

    for (var i = 0; i < items.length; i++) {
      if (showSet.has(items[i])) {
        if (items[i].style.display === 'none') items[i].style.removeProperty('display');
      } else {
        items[i].style.setProperty('display', 'none', 'important');
      }
    }

    var hasVideos = showSet.size > 0;
    if (lastStatus !== hasVideos) {
      lastStatus = hasVideos;
      notifyParent(hasVideos, '');
    }
  }

  var filterTimer = null;
  var observer = new MutationObserver(function() {
    if (filterTimer) clearTimeout(filterTimer);
    filterTimer = setTimeout(enforceFilter, 50);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  enforceFilter();

})();
