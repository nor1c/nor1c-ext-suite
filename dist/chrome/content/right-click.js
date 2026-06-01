// world: MAIN — runs directly in the page's main world, no <script> injection needed
(function () {
  // 1. Neutralize CSS user-select / pointer-events blocks
  var style = document.createElement('style');
  style.textContent = '*,*::before,*::after,iframe,img,video,audio{-webkit-user-select:auto!important;-moz-user-select:auto!important;-ms-user-select:auto!important;user-select:auto!important;-webkit-touch-callout:default!important;pointer-events:auto!important}';
  (document.documentElement || document.head).appendChild(style);

  // 2. Patch Event.prototype.preventDefault — nuclear option
  //    When a page calls e.preventDefault() on contextmenu/mousedown/etc,
  //    it becomes a no-op. This defeats ALL blocker patterns regardless of timing.
  var BLOCKED = {contextmenu:1, mousedown:1, mouseup:1, selectstart:1, dragstart:1, copy:1, cut:1, paste:1};
  var KEYS = {65:1, 67:1, 73:1, 80:1, 83:1, 85:1, 86:1, 88:1, 123:1};

  var origPreventDefault = Event.prototype.preventDefault;
  Event.prototype.preventDefault = function () {
    if (BLOCKED[this.type]) return this;
    return origPreventDefault.call(this);
  };

  // Patch returnValue setter (some scripts use e.returnValue = false)
  var rvDesc = Object.getOwnPropertyDescriptor(Event.prototype, 'returnValue');
  if (rvDesc && rvDesc.set) {
    var origRvSet = rvDesc.set;
    Object.defineProperty(Event.prototype, 'returnValue', {
      configurable: true, enumerable: true,
      get: rvDesc.get || function () { return true; },
      set: function (v) {
        if (BLOCKED[this.type]) return;
        return origRvSet.call(this, v);
      }
    });
  }

  // 3. Capture-phase stopImmediatePropagation on BOTH window and document
  function killPropagation(e) { e.stopImmediatePropagation(); }

  function killKeyPropagation(e) {
    if (e.keyCode === 123) { e.stopImmediatePropagation(); return; }
    if ((e.ctrlKey || e.metaKey) && KEYS[e.keyCode]) e.stopImmediatePropagation();
  }

  var PROP_TYPES = ['contextmenu','selectstart','dragstart','mousedown','mouseup','copy','cut','paste'];
  var targets = [window, document];
  for (var t = 0; t < targets.length; t++) {
    for (var p = 0; p < PROP_TYPES.length; p++) {
      targets[t].addEventListener(PROP_TYPES[p], killPropagation, true);
    }
    targets[t].addEventListener('keydown', killKeyPropagation, true);
    targets[t].addEventListener('keypress', killKeyPropagation, true);
    targets[t].addEventListener('keyup', killKeyPropagation, true);
  }

  // 4. Prevent inline handler assignment via Object.defineProperty traps
  var HANDLER_EVENTS = [
    'contextmenu','mousedown','mouseup','selectstart','dragstart',
    'copy','cut','paste','keydown','keyup','keypress'
  ];

  function trapOnProps(obj) {
    for (var i = 0; i < HANDLER_EVENTS.length; i++) {
      (function (name) {
        try {
          Object.defineProperty(obj, 'on' + name, {
            configurable: true, enumerable: true,
            get: function () { return null; },
            set: function () {} // silently eat all assignments
          });
        } catch (e) {}
      })(HANDLER_EVENTS[i]);
    }
  }
  trapOnProps(document);
  trapOnProps(window);

  // 5. Fast polling sweep — backup for edge cases that bypass traps
  setInterval(function () {
    for (var i = 0; i < HANDLER_EVENTS.length; i++) {
      try { document['on' + HANDLER_EVENTS[i]] = null; } catch (e) {}
      try { window['on' + HANDLER_EVENTS[i]] = null; } catch (e) {}
    }
  }, 50);

  // 6. Iframe context menu override
  function patchIframes() {
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          iframes[i].contentDocument.oncontextmenu = null;
          iframes[i].contentDocument.onmousedown = null;
        }
      } catch (e) {} // cross-origin — ignore
    }
  }
  new MutationObserver(patchIframes).observe(document, {childList: true, subtree: true});
  patchIframes();
})();
