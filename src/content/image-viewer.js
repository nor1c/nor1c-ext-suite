(function () {
  let overlay = null;
  let img = null;
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let lastTranslateX = 0;
  let lastTranslateY = 0;

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'nor1c-viewer-overlay';

    img = document.createElement('img');
    overlay.appendChild(img);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'nor1c-viewer-close';
    closeBtn.innerHTML = '&#10005;';
    closeBtn.addEventListener('click', closeViewer);
    overlay.appendChild(closeBtn);

    const toolbar = document.createElement('div');
    toolbar.className = 'nor1c-viewer-toolbar';
    toolbar.innerHTML = `
      <button id="nor1c-zoom-out" title="Zoom Out">&#8722;</button>
      <span class="zoom-label" id="nor1c-zoom-label">100%</span>
      <button id="nor1c-zoom-in" title="Zoom In">+</button>
      <button id="nor1c-zoom-reset" title="Reset">&#8634;</button>
      <button id="nor1c-download" title="Download">&#8615;</button>
    `;
    overlay.appendChild(toolbar);

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    overlay.addEventListener('mouseleave', onMouseUp);
    overlay.addEventListener('wheel', onWheel, { passive: false });

    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);

    toolbar.querySelector('#nor1c-zoom-in').addEventListener('click', () => zoom(0.2));
    toolbar.querySelector('#nor1c-zoom-out').addEventListener('click', () => zoom(-0.2));
    toolbar.querySelector('#nor1c-zoom-reset').addEventListener('click', resetZoom);
    toolbar.querySelector('#nor1c-download').addEventListener('click', downloadImage);
  }

  function openViewer(srcUrl) {
    createOverlay();
    scale = 1;
    translateX = 0;
    translateY = 0;

    (async function () {
      const hdUrl = await detectHD(srcUrl);
      img.src = hdUrl;

      img.onload = () => {
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;
        const viewW = window.innerWidth * 0.9;
        const viewH = window.innerHeight * 0.9;
        const fitScale = Math.min(viewW / naturalW, viewH / naturalH, 1);
        scale = fitScale;
        updateTransform();
      };

      img.style.display = 'block';
      overlay.style.display = 'flex';
    })();
  }

  function closeViewer() {
    if (!overlay) return;
    overlay.style.display = 'none';
    img.style.display = 'none';
    img.src = '';
    scale = 1;
    translateX = 0;
    translateY = 0;
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    isDragging = true;
    overlay.classList.add('dragging');
    startX = e.clientX;
    startY = e.clientY;
    lastTranslateX = translateX;
    lastTranslateY = translateY;
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    translateX = lastTranslateX + (e.clientX - startX);
    translateY = lastTranslateY + (e.clientY - startY);
    updateTransform();
  }

  function onMouseUp() {
    isDragging = false;
    if (overlay) overlay.classList.remove('dragging');
  }

  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoom(delta);
  }

  function zoom(delta) {
    scale = Math.max(0.1, Math.min(scale + delta, 10));
    updateTransform();
    const label = document.getElementById('nor1c-zoom-label');
    if (label) label.textContent = Math.round(scale * 100) + '%';
  }

  function resetZoom() {
    scale = 1;
    translateX = 0;
    translateY = 0;
    updateTransform();
    const label = document.getElementById('nor1c-zoom-label');
    if (label) label.textContent = '100%';
  }

  function updateTransform() {
    if (!img) return;
    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      closeViewer();
    }
  }

  function downloadImage() {
    if (!img || !img.src) return;
    const a = document.createElement('a');
    a.href = img.src;
    a.download = img.src.split('/').pop().split('?')[0] || 'image';
    a.click();
  }

  // --- HD Image Detection ---

  async function detectHD(srcUrl) {
    const parentHdUrl = findParentLinkHD();
    if (parentHdUrl) return parentHdUrl;

    const patternHdUrl = tryPatternTransform(srcUrl);
    if (patternHdUrl && patternHdUrl !== srcUrl) {
      const valid = await testUrl(patternHdUrl);
      if (valid) return patternHdUrl;
    }

    return srcUrl;
  }

  function findParentLinkHD() {
    const allImages = document.querySelectorAll('img');
    for (const imgEl of allImages) {
      if (imgEl.naturalWidth === 0 && imgEl.naturalHeight === 0) continue;
      let parent = imgEl.parentElement;
      while (parent && parent !== document.body) {
        if (parent.tagName === 'A' && parent.href) {
          const href = parent.href;
          if (
            /\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?|$)/i.test(href)
          ) {
            return href;
          }
        }
        parent = parent.parentElement;
      }
    }
    return null;
  }

  function tryPatternTransform(url) {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/');
    const filename = pathParts.pop() || '';
    const dir = pathParts.join('/');
    let transformed = filename;

    transformed = transformed
      .replace(/[_-]thumb(?:nail)?[_-]?/i, '')
      .replace(/[_-]small[_-]?/i, '')
      .replace(/[_-]preview[_-]?/i, '')
      .replace(/[_-]\d+x\d+[_-]?/i, '')
      .replace(/[_-]s\d+[_-]?/i, '')
      .replace(/[_-]w\d+[_-]?/i, '')
      .replace(/[_-]h\d+[_-]?/i, '')
      .replace(/[_-]sq[_-]?/i, '');

    if (transformed === filename) return url;

    parsed.searchParams.delete('w');
    parsed.searchParams.delete('h');
    parsed.searchParams.delete('width');
    parsed.searchParams.delete('height');
    parsed.searchParams.delete('size');
    parsed.searchParams.delete('thumb');
    parsed.searchParams.delete('quality');
    parsed.searchParams.delete('format');

    const newPath = dir ? `${dir}/${transformed}` : transformed;
    parsed.pathname = newPath;
    return parsed.toString();
  }

  async function testUrl(url) {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      const contentType = resp.headers.get('content-type') || '';
      return resp.ok && contentType.startsWith('image/');
    } catch (_) {
      return false;
    }
  }

  // --- Listeners ---

  document.addEventListener('nor1c:open-image-viewer', function (e) {
    let srcUrl = '';
    if (e.detail && e.detail.srcUrl) {
      srcUrl = e.detail.srcUrl;
    }
    if (!srcUrl && e.target) {
      srcUrl = e.target.src;
    }
    if (srcUrl) openViewer(srcUrl);
  });
})();
