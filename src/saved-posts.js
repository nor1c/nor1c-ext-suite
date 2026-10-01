const STORAGE_KEY = 'savedXPosts';
const FOLDERS_KEY = 'savedXFolders';
let activeFolderId = '';
const mediaUrls = new Set();
const imageViewer = document.getElementById('image-viewer');
const imageViewerClose = document.getElementById('image-viewer-close');
const imageViewerMedia = document.getElementById('image-viewer-media');
const imageViewerPrev = document.getElementById('image-viewer-prev');
const imageViewerNext = document.getElementById('image-viewer-next');
let viewerItems = [];
let viewerIndex = -1;
let zoomScale = 1;
let panX = 0;
let panY = 0;
let dragOrigin = null;
let dragStart = null;
let didPan = false;

function applyImageTransform() {
  const image = imageViewerMedia.querySelector('.viewer-image');
  if (image) image.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
}

function setZoom(value) {
  zoomScale = Math.min(5, Math.max(1, value));
  if (zoomScale === 1) { panX = 0; panY = 0; }
  applyImageTransform();
}

function resetImageTransform() {
  zoomScale = 1;
  panX = 0;
  panY = 0;
  applyImageTransform();
}
function closeImageViewer() {
  if (imageViewer.open) imageViewer.close();
  imageViewerMedia.replaceChildren();
  viewerIndex = -1;
  resetImageTransform();
}

function updateViewerNavigation() {
  const hasPrevious = viewerIndex > 0;
  const hasNext = viewerIndex >= 0 && viewerIndex < viewerItems.length - 1;
  imageViewerPrev.disabled = !hasPrevious;
  imageViewerNext.disabled = !hasNext;
  imageViewerPrev.hidden = !imageViewer.open || viewerItems.length < 2;
  imageViewerNext.hidden = !imageViewer.open || viewerItems.length < 2;
}

function showViewerItem(index) {
  if (index < 0 || index >= viewerItems.length) return;
  imageViewerMedia.replaceChildren();
  const item = viewerItems[index];
  let content;
  if (item.kind === 'video') {
    content = element('video', 'viewer-video');
    content.controls = true;
    content.autoplay = true;
    content.preload = 'auto';
    content.playsInline = true;
    content.src = item.src;
    content.addEventListener('error', () => {
      const fallback = element('a', 'viewer-video-fallback', 'Open video in a new tab');
      fallback.href = item.src;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      imageViewerMedia.appendChild(fallback);
    }, { once: true });
    content.play().catch(() => {});
  } else {
    content = element('img', 'viewer-image');
    content.src = item.src;
    content.alt = item.alt || 'Expanded saved post image';
  }
  imageViewerMedia.appendChild(content);
  resetImageTransform();
  viewerIndex = index;
  updateViewerNavigation();
}

function openImageViewer(items, index) {
  viewerItems = items;
  showViewerItem(index);
  imageViewer.showModal();
  updateViewerNavigation();
}

function navigateViewer(direction) {
  showViewerItem(viewerIndex + direction);
}


imageViewerClose.addEventListener('click', closeImageViewer);
imageViewerPrev.addEventListener('click', () => navigateViewer(-1));
imageViewerNext.addEventListener('click', () => navigateViewer(1));
imageViewer.addEventListener('cancel', event => {
  event.preventDefault();
  closeImageViewer();
});
imageViewer.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); navigateViewer(-1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); navigateViewer(1); }
  if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(zoomScale + 0.25); }
  if (event.key === '-') { event.preventDefault(); setZoom(zoomScale - 0.25); }
  if (event.key === '0') { event.preventDefault(); resetImageTransform(); }
});
imageViewerMedia.addEventListener('wheel', event => {
  const image = imageViewerMedia.querySelector('.viewer-image');
  if (!image) return;
  event.preventDefault();
  setZoom(zoomScale + (event.deltaY < 0 ? 0.15 : -0.15));
}, { passive: false });
imageViewerMedia.addEventListener('pointerdown', event => {
  const image = imageViewerMedia.querySelector('.viewer-image');
  if (!image || event.button !== 0) return;
  event.preventDefault();
  didPan = false;
  dragStart = { x: event.clientX, y: event.clientY };
  dragOrigin = { x: event.clientX - panX, y: event.clientY - panY };
  imageViewerMedia.classList.add('is-panning');
  imageViewerMedia.setPointerCapture(event.pointerId);
});
imageViewerMedia.addEventListener('pointermove', event => {
  if (!dragOrigin) return;
  event.preventDefault();
  const movedX = event.clientX - dragStart.x;
  const movedY = event.clientY - dragStart.y;
  if (!didPan && Math.hypot(movedX, movedY) < 3) return;
  didPan = true;
  panX = event.clientX - dragOrigin.x;
  panY = event.clientY - dragOrigin.y;
  applyImageTransform();
});
imageViewerMedia.addEventListener('click', event => {
  if (didPan) {
    event.preventDefault();
    event.stopPropagation();
    didPan = false;
  }
});
const stopPan = event => {
  if (event && imageViewerMedia.hasPointerCapture?.(event.pointerId)) imageViewerMedia.releasePointerCapture(event.pointerId);
  dragOrigin = null;
  dragStart = null;
  imageViewerMedia.classList.remove('is-panning');
};
imageViewerMedia.addEventListener('pointerup', stopPan);
imageViewerMedia.addEventListener('pointercancel', stopPan);
imageViewer.addEventListener('click', event => {
  if (event.target === imageViewer) closeImageViewer();
});

function clearMediaUrls() {
  for (const url of mediaUrls) URL.revokeObjectURL(url);
  mediaUrls.clear();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function iconButton(tag, className, label, path) {
  const node = element(tag, className);
  node.setAttribute('aria-label', label);
  node.title = label;
  node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg>`;
  return node;
}

async function renderPosts() {
  const list = document.getElementById('posts-list');
  const empty = document.getElementById('empty-state');
  const error = document.getElementById('page-error');
  error.textContent = '';
  clearMediaUrls();
  viewerItems = [];
  list.replaceChildren();

  try {
    const result = await chrome.storage.local.get({ [STORAGE_KEY]: [], [FOLDERS_KEY]: [] });
    const posts = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    const folders = Array.isArray(result[FOLDERS_KEY]) ? result[FOLDERS_KEY] : [];
    renderFolders(folders);
    const visiblePosts = activeFolderId ? posts.filter(post => post.folderId === activeFolderId) : posts;
    empty.hidden = visiblePosts.length !== 0;

    for (const post of visiblePosts) {
      list.appendChild(await createPost(post));
    }
  } catch (cause) {
    empty.hidden = true;
    error.textContent = cause instanceof Error ? cause.message : 'Could not load saved posts.';
  }
}

function renderFolders(folders) {
  const bar = document.getElementById('folders-bar');
  bar.querySelectorAll('.folder-chip:not([data-folder-id=""])').forEach(node => node.remove());
  for (const folder of folders) {
    const chip = element('button', 'folder-chip', folder.name);
    chip.type = 'button';
    chip.dataset.folderId = folder.id;
    chip.classList.toggle('is-active', folder.id === activeFolderId);
    chip.addEventListener('click', () => { activeFolderId = folder.id; renderPosts(); });
    bar.insertBefore(chip, document.getElementById('new-folder-btn'));
  }
  const allPosts = bar.querySelector('[data-folder-id=""]');
  allPosts?.classList.toggle('is-active', !activeFolderId);
  allPosts?.removeEventListener('click', selectAllPosts);
  allPosts?.addEventListener('click', selectAllPosts);
}

function selectAllPosts() {
  activeFolderId = '';
  renderPosts();
}

async function createPost(post) {
  const card = element('article', 'post');
  const header = element('header', 'post-header');
  const author = element('div', 'post-author', post.author || 'X post');
  const time = element('div', 'post-time', post.savedAt ? `Saved ${new Date(post.savedAt).toLocaleString()}` : '');
  author.appendChild(time);
  header.appendChild(author);

  card.appendChild(header);
  const body = element('div', 'post-body');

  const mediaItems = post.media || [];
  if (mediaItems.length) {
    const grid = element('div', `media-grid media-count-${Math.min(mediaItems.length, 4)}`);
    for (const item of mediaItems) {
      const frame = element('div', 'media-item');
      if (item.status !== 'saved' || !item.mediaKey) {
        frame.appendChild(element('p', 'media-error', item.error || 'Media was not saved.'));
      } else {
        try {
          const blob = await Nor1cSavedPosts.getMedia(item.mediaKey);
          if (!blob || !blob.size) throw new Error('Saved media is missing.');
          const url = URL.createObjectURL(blob);
          mediaUrls.add(url);
          const content = item.kind === 'video' ? element('video') : element('img');
          content.src = url;
          if (item.kind === 'video') {
            content.controls = true;
            content.preload = 'metadata';
            content.playsInline = true;
          } else {
            content.alt = 'Saved post image';
            content.loading = 'lazy';
            content.tabIndex = 0;
            content.title = 'Open image viewer';
            content.addEventListener('click', () => {
              const postCards = Array.from(document.querySelectorAll('#posts-list .post'));
              viewerItems = postCards.flatMap(card => Array.from(card.querySelectorAll('.media-item img, .media-item video')).map(media => ({ src: media.src, alt: media.alt || 'Saved post video', kind: media.tagName.toLowerCase() })));
              const currentPost = content.closest('.post');
              const targetMedia = currentPost.querySelector('.media-item img, .media-item video');
              const index = viewerItems.findIndex(item => item.src === targetMedia?.src);
              openImageViewer(viewerItems, index);
            });
            content.addEventListener('keydown', event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const postCards = Array.from(document.querySelectorAll('#posts-list .post'));
                viewerItems = postCards.flatMap(card => Array.from(card.querySelectorAll('.media-item img, .media-item video')).map(media => ({ src: media.src, alt: media.alt || 'Saved post video', kind: media.tagName.toLowerCase() })));
                const index = viewerItems.findIndex(item => item.src === url);
                openImageViewer(viewerItems, index);
              }
            });
          }
          frame.appendChild(content);
        } catch (cause) {
          frame.appendChild(element('p', 'media-error', cause instanceof Error ? cause.message : 'Saved media could not be loaded.'));
        }
      }
      grid.appendChild(frame);
    }
    body.appendChild(grid);
  }

  const failed = mediaItems.filter(item => item.status !== 'saved');
  const actions = element('div', 'post-actions');
  if (post.status !== 'complete' || failed.length) {
    body.appendChild(element('p', 'post-status', post.error || 'Some media could not be saved.'));
    const retry = iconButton('button', 'retry-link', 'Open post to retry', 'M20 11a8 8 0 1 0 2 5.3M20 5v6h-6');
    retry.type = 'button';
    retry.addEventListener('click', () => chrome.tabs.create({ url: post.url }));
    actions.appendChild(retry);
  }
  card.appendChild(body);

  const link = iconButton('a', 'post-link', 'Open original post on X', 'M18.3 5.7 8.2 15.8M9 6h9v9M5 8v11h11');
  link.href = post.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  actions.appendChild(link);

  const remove = iconButton('button', 'delete-button', 'Remove saved post', 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3');
  remove.type = 'button';
  remove.addEventListener('click', () => removePost(post.id, card));
  actions.appendChild(remove);
  card.appendChild(actions);
  return card;
}

async function removePost(id, card) {
  const button = card.querySelector('.delete-button');
  button.disabled = true;
  button.setAttribute('aria-label', 'Removing saved post…');
  button.title = 'Removing saved post…';
  const error = document.getElementById('page-error');
  error.textContent = '';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'delete-x-post', id });
    if (!result?.success) throw new Error(result?.error || 'Could not remove saved post.');
    await renderPosts();
  } catch (cause) {
    button.disabled = false;
    button.setAttribute('aria-label', 'Remove saved post');
    button.title = 'Remove saved post';
    error.textContent = cause instanceof Error ? cause.message : 'Could not remove saved post.';
  }
}

document.getElementById('new-folder-btn').addEventListener('click', async () => {
  const name = window.prompt('Folder name:');
  if (!name?.trim()) return;
  const result = await chrome.runtime.sendMessage({ type: 'create-saved-folder', name });
  if (!result?.success) document.getElementById('page-error').textContent = result?.error || 'Could not create folder.';
  else renderPosts();
});
document.getElementById('refresh-btn').addEventListener('click', renderPosts);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) renderPosts();
});
window.addEventListener('beforeunload', clearMediaUrls);
renderPosts();
