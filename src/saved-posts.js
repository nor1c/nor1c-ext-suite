const STORAGE_KEY = 'savedXPosts';
const FOLDERS_KEY = 'savedXFolders';
const POSTS_PER_PAGE = 30;
let activeFolderId = '';
let currentPage = 1;
const mediaUrls = new Set();
const imageViewer = document.getElementById('image-viewer');
const imageViewerClose = document.getElementById('image-viewer-close');
const imageViewerMedia = document.getElementById('image-viewer-media');
const imageViewerPrev = document.getElementById('image-viewer-prev');
const imageViewerNext = document.getElementById('image-viewer-next');
const folderManager = document.getElementById('folder-manager');
const folderManagerList = document.getElementById('folder-manager-list');
const folderManagerCancel = document.getElementById('folder-manager-cancel');
const folderManagerSave = document.getElementById('folder-manager-save');
const pagination = document.getElementById('pagination');
const paginationPrev = document.getElementById('pagination-prev');
const paginationNext = document.getElementById('pagination-next');
const paginationStatus = document.getElementById('pagination-status');
let folderManagerPostId = '';
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

function postFolderIds(post) {
  if (Array.isArray(post.folderIds)) return post.folderIds;
  return typeof post.folderId === 'string' && post.folderId ? [post.folderId] : [];
}

async function openFolderManager(post) {
  const result = await chrome.storage.local.get({ [FOLDERS_KEY]: [] });
  const folders = Array.isArray(result[FOLDERS_KEY]) ? result[FOLDERS_KEY] : [];
  const selected = new Set(postFolderIds(post));
  folderManagerPostId = post.id;
  folderManagerList.replaceChildren();
  if (!folders.length) folderManagerList.appendChild(element('p', 'empty-state', 'Create a folder first.'));
  for (const folder of folders) {
    const option = element('label', 'folder-option');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.value = folder.id;
    checkbox.checked = selected.has(folder.id);
    option.append(checkbox, element('span', '', folder.name));
    folderManagerList.appendChild(option);
  }
  folderManager.showModal();
}

folderManagerCancel.addEventListener('click', () => folderManager.close());
folderManagerSave.addEventListener('click', async () => {
  if (!folderManagerPostId) return;
  folderManagerSave.disabled = true;
  const folderIds = Array.from(folderManagerList.querySelectorAll('input:checked'), input => input.value);
  try {
    const result = await chrome.runtime.sendMessage({ type: 'update-saved-post-folders', id: folderManagerPostId, folderIds });
    if (!result?.success) throw new Error(result?.error || 'Could not update post folders.');
    folderManager.close();
    await renderPosts();
  } catch (cause) {
    document.getElementById('page-error').textContent = cause instanceof Error ? cause.message : 'Could not update post folders.';
  } finally {
    folderManagerSave.disabled = false;
  }
});
folderManager.addEventListener('close', () => { folderManagerPostId = ''; });

function renderPagination(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / POSTS_PER_PAGE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  pagination.hidden = totalPages <= 1;
  paginationStatus.textContent = `Page ${currentPage} of ${totalPages}`;
  paginationPrev.disabled = currentPage === 1;
  paginationNext.disabled = currentPage === totalPages;
  return { start: (currentPage - 1) * POSTS_PER_PAGE, end: currentPage * POSTS_PER_PAGE };
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
    renderFolders(folders, posts);
    const visiblePosts = activeFolderId ? posts.filter(post => postFolderIds(post).includes(activeFolderId)) : posts;
    const pageRange = renderPagination(visiblePosts.length);
    empty.hidden = visiblePosts.length !== 0;

    for (const post of visiblePosts.slice(pageRange.start, pageRange.end)) {
      list.appendChild(await createPost(post));
    }
  } catch (cause) {
    empty.hidden = true;
    pagination.hidden = true;
    error.textContent = cause instanceof Error ? cause.message : 'Could not load saved posts.';
  }
}

function renderFolders(folders, posts) {
  const bar = document.getElementById('folders-bar');
  bar.querySelectorAll('.folder-chip:not([data-folder-id=""])').forEach(node => node.remove());
  const folderCounts = new Map(folders.map(folder => [folder.id, 0]));
  for (const post of posts) {
    for (const folderId of postFolderIds(post)) {
      if (folderCounts.has(folderId)) folderCounts.set(folderId, folderCounts.get(folderId) + 1);
    }
  }
  for (const folder of folders) {
    const chip = element('button', 'folder-chip');
    chip.type = 'button';
    chip.dataset.folderId = folder.id;
    chip.title = `${folder.name} (${folderCounts.get(folder.id) || 0})`;
    chip.append(element('span', 'folder-chip-name', folder.name), element('span', 'folder-chip-count', String(folderCounts.get(folder.id) || 0)));
    chip.classList.toggle('is-active', folder.id === activeFolderId);
    chip.addEventListener('click', () => { activeFolderId = folder.id; currentPage = 1; renderPosts(); });
    bar.insertBefore(chip, document.getElementById('new-folder-btn'));
  }
  const allPosts = bar.querySelector('[data-folder-id=""]');
  const allCount = allPosts?.querySelector('.folder-chip-count');
  if (allCount) allCount.textContent = String(posts.length);
  if (allPosts) allPosts.title = `All posts (${posts.length})`;
  allPosts?.classList.toggle('is-active', !activeFolderId);
  allPosts?.removeEventListener('click', selectAllPosts);
  allPosts?.addEventListener('click', selectAllPosts);
}

function selectAllPosts() {
  activeFolderId = '';
  currentPage = 1;
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
      const sourceUrl = typeof item.url === 'string' ? Nor1cSavedPosts.normalizeMediaUrl(item.url, item.kind) : null;
      const legacyMedia = !sourceUrl && item.mediaKey && item.status === 'saved';
      if (!sourceUrl && !legacyMedia) {
        frame.appendChild(element('p', 'media-error', item.error || 'Media link is unavailable. Open the original post to view it.'));
      } else {
        try {
          let url = sourceUrl;
          if (!url && legacyMedia) {
            const blob = await Nor1cSavedPosts.getMedia(item.mediaKey);
            if (!blob || !blob.size) throw new Error('Saved media is missing.');
            url = URL.createObjectURL(blob);
            mediaUrls.add(url);
          }
          const content = item.kind === 'video' ? element('video') : element('img');
          content.src = url;
          content.dataset.sourceUrl = url;
          content.addEventListener('error', () => {
            frame.replaceChildren(element('p', 'media-error', 'Media could not be loaded. Open the original post to refresh the link.'));
          }, { once: true });
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

  const failed = mediaItems.filter(item => item.status === 'unavailable');
  const actions = element('div', 'post-actions');
  if (failed.length) {
    body.appendChild(element('p', 'post-status', post.error || 'Some media could not be saved.'));
    const retry = iconButton('button', 'retry-link', 'Open post to retry', 'M20 11a8 8 0 1 0 2 5.3M20 5v6h-6');
    retry.type = 'button';
    retry.addEventListener('click', () => chrome.tabs.create({ url: post.url }));
    actions.appendChild(retry);
  }
  card.appendChild(body);

  const folders = iconButton('button', 'folder-button', 'Organize post folders', 'M3 6h7l2 2h9v10H3zM7 12h10M12 9v6');
  folders.type = 'button';
  folders.addEventListener('click', () => openFolderManager(post));
  actions.appendChild(folders);

  const link = iconButton('a', 'post-link', 'Open original post on X', 'M18.3 5.7 8.2 15.8M9 6h9v9M5 8v11h11');
  link.href = post.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  actions.appendChild(link);

  const removeLabel = activeFolderId ? 'Remove post from this folder' : 'Remove saved post';
  const remove = iconButton('button', 'delete-button', removeLabel, 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3');
  remove.type = 'button';
  remove.addEventListener('click', () => removePost(post, card, activeFolderId));
  actions.appendChild(remove);
  card.appendChild(actions);
  return card;
}

async function removePost(post, card, folderId) {
  const button = card.querySelector('.delete-button');
  const removingFromFolder = Boolean(folderId);
  const idleLabel = removingFromFolder ? 'Remove post from this folder' : 'Remove saved post';
  const pendingLabel = removingFromFolder ? 'Removing post from folder…' : 'Removing saved post…';
  button.disabled = true;
  button.setAttribute('aria-label', pendingLabel);
  button.title = pendingLabel;
  const error = document.getElementById('page-error');
  error.textContent = '';
  try {
    const message = removingFromFolder
      ? { type: 'update-saved-post-folders', id: post.id, folderIds: postFolderIds(post).filter(id => id !== folderId) }
      : { type: 'delete-x-post', id: post.id };
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.success) throw new Error(result?.error || (removingFromFolder ? 'Could not remove post from this folder.' : 'Could not remove saved post.'));
    await renderPosts();
  } catch (cause) {
    button.disabled = false;
    button.setAttribute('aria-label', idleLabel);
    button.title = idleLabel;
    error.textContent = cause instanceof Error ? cause.message : removingFromFolder ? 'Could not remove post from this folder.' : 'Could not remove saved post.';
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
paginationPrev.addEventListener('click', () => {
  if (currentPage <= 1) return;
  currentPage -= 1;
  renderPosts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
paginationNext.addEventListener('click', () => {
  currentPage += 1;
  renderPosts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[STORAGE_KEY] || changes[FOLDERS_KEY])) renderPosts();
});
window.addEventListener('beforeunload', clearMediaUrls);
renderPosts();
