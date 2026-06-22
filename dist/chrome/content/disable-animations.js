(function () {
  const STYLE_ID = 'nor1c-disable-animations-style';
  const CSS = '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; scroll-behavior: auto !important; }';

  let active = null;
  let style = null;

  function apply() {
    if (style) return;
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function remove() {
    if (style) { style.remove(); style = null; }
  }

  function setActive(val) {
    active = val;
    if (active) apply(); else remove();
  }

  chrome.storage.sync.get(['disableAnimations'], (result) => {
    const val = result.disableAnimations === true;
    active = val;
    if (val) apply();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.disableAnimations) return;
    setActive(changes.disableAnimations.newValue);
  });
})();
