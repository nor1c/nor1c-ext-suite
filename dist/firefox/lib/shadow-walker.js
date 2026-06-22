/**
 * Walks through all shadow roots within a root element.
 * Calls `callback(node, rootElement)` for each element that matches `selector`.
 *
 * Usage: walkShadowDOM(document.body, 'video', (el) => { el.controls = true; });
 */
function walkShadowDOM(root, selector, callback) {
  const nodes = root.querySelectorAll(selector);
  nodes.forEach((el) => callback(el));

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.shadowRoot) {
      walkShadowDOM(node.shadowRoot, selector, callback);
    }
  }
}

/**
 * Continuously watches for new shadow roots being attached
 * by patching Element.prototype.attachShadow.
 */
let patchInstalled = false;

function installShadowPatch(selector, callback) {
  if (patchInstalled) return;
  patchInstalled = true;

  const orig = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const shadow = orig.call(this, init);
    const el = shadow.querySelectorAll(selector);
    el.forEach(callback);
    return shadow;
  };
}
