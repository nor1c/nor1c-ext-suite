const STORAGE_KEY = 'savedXPosts';
const FOLDERS_KEY = 'savedXFolders';
const BACKUP_VERSION = 1;
const LAST_BACKUP_KEY = 'savedXPostsLastBackupAt';
const POSTS_PER_PAGE = 30;
let activePlatform = document.documentElement.dataset.platform === 'pixiv' ? 'pixiv' : 'x';
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
const backupDialog = document.getElementById('backup-dialog');
const backupStatus = document.getElementById('backup-status');
const backupLastExport = document.getElementById('backup-last-export');
const backupFile = document.getElementById('backup-file');
let folderManagerPostId = '';
let viewerItems = [];
let viewerIndex = -1;
let zoomScale = 1;
let panX = 0;
let panY = 0;
let dragOrigin = null;
let dragStart = null;
let didPan = false;
let renderQueue = Promise.resolve();
let localMutationDepth = 0;

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
  if (event.target.closest('.viewer-nav, .image-viewer-close')) return;
  const media = imageViewerMedia.querySelector('.viewer-image, .viewer-video');
  const bounds = media?.getBoundingClientRect();
  const outsideMedia = !bounds || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (outsideMedia) closeImageViewer();
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

function postPlatform(post) {
  return post?.platform === 'pixiv' ? 'pixiv' : 'x';
}

function folderPlatform(folder) {
  return folder?.platform === 'pixiv' ? 'pixiv' : 'x';
}

function migrateFolderPlatforms(folders, posts) {
  return folders.map(folder => {
    if (folder?.platform === 'pixiv' || folder?.platform === 'x') return folder;
    const assignedPosts = posts.filter(post => postFolderIds(post).includes(folder.id));
    const onlyPixiv = assignedPosts.length && assignedPosts.every(post => postPlatform(post) === 'pixiv');
    return { ...folder, platform: onlyPixiv ? 'pixiv' : 'x' };
  });
}

function postFolderIds(post) {
  if (Array.isArray(post.folderIds)) return post.folderIds;
  return typeof post.folderId === 'string' && post.folderId ? [post.folderId] : [];
}

async function openFolderManager(post) {
  const result = await chrome.storage.local.get({ [STORAGE_KEY]: [], [FOLDERS_KEY]: [] });
  const platform = postPlatform(post);
  const storedPosts = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  const folders = migrateFolderPlatforms(Array.isArray(result[FOLDERS_KEY]) ? result[FOLDERS_KEY] : [], storedPosts).filter(folder => folderPlatform(folder) === platform);
  const selected = new Set(postFolderIds(post));
  folderManagerPostId = post.id;
  folderManager.dataset.platform = post.platform === 'pixiv' ? 'pixiv' : 'x';
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
    const post = folderManager.dataset.platform === 'pixiv' ? { platform: 'pixiv' } : {};
    const result = await chrome.runtime.sendMessage({ type: 'update-saved-post-folders', id: folderManagerPostId, folderIds, ...post });
    if (!result?.success) throw new Error(result?.error || 'Could not update post folders.');
    folderManager.close();
    await renderPosts();
  } catch (cause) {
    document.getElementById('page-error').textContent = cause instanceof Error ? cause.message : 'Could not update post folders.';
  } finally {
    folderManagerSave.disabled = false;
  }
});
folderManager.addEventListener('close', () => { folderManagerPostId = ''; delete folderManager.dataset.platform; });

function validateSavedPostsBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.version !== BACKUP_VERSION) throw new Error('Invalid or unsupported saved posts backup.');
  if (!Array.isArray(payload.posts) || !Array.isArray(payload.folders)) throw new Error('Backup must contain posts and folders arrays.');
  if (payload.posts.length > 500 || payload.folders.length > 100) throw new Error('Backup exceeds the saved posts or folders limit.');

  const folderIds = new Set();
  const folderNames = new Set();
  const folderPlatforms = new Map();
  const folders = payload.folders.map(folder => {
    const id = typeof folder?.id === 'string' ? folder.id : '';
    const name = typeof folder?.name === 'string' ? folder.name.trim().replace(/\s+/g, ' ') : '';
    const platform = folder.platform === 'pixiv' ? 'pixiv' : 'x';
    const nameKey = `${platform}:${name.toLowerCase()}`;
    if (!id || id.length > 100 || !name || name.length > 60 || folderIds.has(id) || folderNames.has(nameKey)) throw new Error('Backup contains an invalid folder.');
    folderIds.add(id);
    folderNames.add(nameKey);
    folderPlatforms.set(id, platform);
    return { id, name, platform, createdAt: Number.isFinite(Number(folder.createdAt)) ? Number(folder.createdAt) : Date.now() };
  });

  const postIds = new Set();
  const posts = payload.posts.map(post => {
    if (!post || typeof post !== 'object' || Array.isArray(post)) throw new Error('Backup contains an invalid saved post.');
    const platform = post.platform === 'pixiv' ? 'pixiv' : 'x';
    const canonical = platform === 'pixiv'
      ? Nor1cSavedPosts.canonicalPixivPostUrl(post.url)
      : Nor1cSavedPosts.canonicalPostUrl(post.url);
    const mediaInput = post.media == null ? [] : post.media;
    const folderInput = Array.isArray(post.folderIds)
      ? post.folderIds
      : typeof post.folderId === 'string' && post.folderId
        ? [post.folderId]
        : post.folderIds == null
          ? []
          : post.folderIds;
    const postKey = `${platform}:${canonical?.id || ''}`;
    if (!canonical || canonical.id !== String(post.id) || postIds.has(postKey) || !Array.isArray(mediaInput) || !Array.isArray(folderInput)) throw new Error('Backup contains an invalid saved post.');
    if (mediaInput.length > 5 || folderInput.some(id => typeof id !== 'string')) throw new Error('Backup contains an invalid saved post.');
    postIds.add(postKey);
    const media = mediaInput.map((item, index) => {
      if (!item || !['image', 'video'].includes(item.kind)) throw new Error('Backup contains invalid media metadata.');
      const url = item.url ? Nor1cSavedPosts.normalizeMediaUrl(item.url, item.kind, platform) : '';
      if (item.url && !url) throw new Error('Backup contains an invalid media URL.');
      const slot = typeof item.slot === 'string' && item.slot ? item.slot.slice(0, 40) : `${item.kind}-${index}`;
      return url
        ? { slot, kind: item.kind, status: 'linked', url, hint: '', error: '' }
        : { slot, kind: item.kind, status: 'unavailable', url: '', hint: '', error: 'Media link is unavailable.' };
    });
    const failures = media.filter(item => item.status === 'unavailable').length;
    return {
      id: canonical.id,
      url: canonical.url,
      platform,
      text: typeof post.text === 'string' ? post.text.trim().slice(0, 4000) : '',
      author: typeof post.author === 'string' ? post.author.trim().slice(0, 500) : '',
      createdAt: typeof post.createdAt === 'string' ? post.createdAt.trim().slice(0, 80) : '',
      savedAt: Number.isFinite(Number(post.savedAt)) ? Number(post.savedAt) : Date.now(),
      updatedAt: Number.isFinite(Number(post.updatedAt)) ? Number(post.updatedAt) : Date.now(),
      folderIds: [...new Set(folderInput.filter(id => folderIds.has(id) && folderPlatforms.get(id) === platform))],
      status: failures ? 'partial' : 'complete',
      error: failures ? `${failures} media link(s) are unavailable.` : '',
      media
    };
  });
  return { posts, folders };
}

async function updateLastBackupLabel() {
  const result = await chrome.storage.local.get({ [LAST_BACKUP_KEY]: 0 });
  const timestamp = Number(result[LAST_BACKUP_KEY]) || 0;
  backupLastExport.textContent = timestamp ? `Last backup: ${new Date(timestamp).toLocaleString()}` : 'No backup exported yet.';
}

document.getElementById('backup-btn').addEventListener('click', async () => {
  backupStatus.textContent = '';
  backupStatus.removeAttribute('data-state');
  await updateLastBackupLabel();
  backupDialog.showModal();
});
document.getElementById('backup-close').addEventListener('click', () => backupDialog.close());
document.getElementById('backup-form').addEventListener('submit', event => event.preventDefault());
document.getElementById('backup-export').addEventListener('click', async () => {
  const button = document.getElementById('backup-export');
  button.disabled = true;
  try {
    const result = await chrome.storage.local.get({ [STORAGE_KEY]: [], [FOLDERS_KEY]: [] });
    const payload = validateSavedPostsBackup({ version: BACKUP_VERSION, posts: result[STORAGE_KEY], folders: result[FOLDERS_KEY] });
    payload.exportedAt = new Date().toISOString();
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const date = new Date().toISOString().slice(0, 10);
    await chrome.downloads.download({ url, filename: `nor1c-saved-posts-${date}.json`, saveAs: true });
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const reminder = await chrome.runtime.sendMessage({ type: 'saved-posts-backup-completed' });
    if (!reminder?.success) throw new Error(reminder?.error || 'Could not update the backup reminder.');
    backupStatus.textContent = 'Backup exported successfully.';
    backupStatus.dataset.state = 'success';
    await updateLastBackupLabel();
  } catch (error) {
    backupStatus.textContent = error instanceof Error ? error.message : 'Backup export failed.';
    backupStatus.dataset.state = 'error';
  } finally { button.disabled = false; }
});
document.getElementById('backup-import').addEventListener('click', () => backupFile.click());
backupFile.addEventListener('change', async () => {
  const file = backupFile.files?.[0];
  backupFile.value = '';
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Backup file is too large.');
    const restored = validateSavedPostsBackup(JSON.parse(await file.text()));
    if (!window.confirm(`Replace local data with ${restored.posts.length} post(s) and ${restored.folders.length} folder(s)?`)) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: restored.posts, [FOLDERS_KEY]: restored.folders });
    currentPage = 1;
    activeFolderId = '';
    await renderPosts();
    backupStatus.textContent = 'Backup imported successfully.';
    backupStatus.dataset.state = 'success';
  } catch (error) {
    backupStatus.textContent = error instanceof Error ? error.message : 'Backup import failed.';
    backupStatus.dataset.state = 'error';
  }
});

function renderPagination(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / POSTS_PER_PAGE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  pagination.hidden = totalPages <= 1;
  paginationStatus.textContent = `Page ${currentPage} of ${totalPages}`;
  paginationPrev.disabled = currentPage === 1;
  paginationNext.disabled = currentPage === totalPages;
  return { start: (currentPage - 1) * POSTS_PER_PAGE, end: currentPage * POSTS_PER_PAGE };
}

function renderPosts() {
  const result = renderQueue.then(renderPostsOnce);
  renderQueue = result.catch(() => {});
  return result;
}

async function renderPostsOnce() {
  const list = document.getElementById('posts-list');
  const empty = document.getElementById('empty-state');
  const error = document.getElementById('page-error');
  const nextMediaUrls = new Set();
  error.textContent = '';

  try {
    const result = await chrome.storage.local.get({ [STORAGE_KEY]: [], [FOLDERS_KEY]: [] });
    const posts = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    const allFolders = migrateFolderPlatforms(Array.isArray(result[FOLDERS_KEY]) ? result[FOLDERS_KEY] : [], posts);
    const platformPosts = posts.filter(post => postPlatform(post) === activePlatform);
    const folders = allFolders.filter(folder => folderPlatform(folder) === activePlatform);
    if (activeFolderId && !folders.some(folder => folder.id === activeFolderId)) activeFolderId = '';
    const visiblePosts = activeFolderId ? platformPosts.filter(post => postFolderIds(post).includes(activeFolderId)) : platformPosts;
    const pageRange = renderPagination(visiblePosts.length);
    const folderNames = new Map(folders.map(folder => [folder.id, folder.name]));
    const cards = [];
    for (const post of visiblePosts.slice(pageRange.start, pageRange.end)) {
      cards.push(await createPost(post, folderNames, nextMediaUrls));
    }

    const fragment = document.createDocumentFragment();
    fragment.append(...cards);
    clearMediaUrls();
    for (const url of nextMediaUrls) mediaUrls.add(url);
    viewerItems = [];
    renderFolders(folders, platformPosts);
    empty.hidden = visiblePosts.length !== 0;
    list.replaceChildren(fragment);
  } catch (cause) {
    for (const url of nextMediaUrls) URL.revokeObjectURL(url);
    error.textContent = cause instanceof Error ? cause.message : 'Could not load saved posts.';
  }
}

function renderFolders(folders, posts) {
  const bar = document.getElementById('folders-bar');
  bar.querySelectorAll('.folder-chip-row').forEach(node => node.remove());
  const folderCounts = new Map(folders.map(folder => [folder.id, 0]));
  for (const post of posts) {
    for (const folderId of postFolderIds(post)) {
      if (folderCounts.has(folderId)) folderCounts.set(folderId, folderCounts.get(folderId) + 1);
    }
  }
  for (const folder of folders) {
    const row = element('div', 'folder-chip-row');
    const chip = element('button', 'folder-chip');
    chip.type = 'button';
    chip.dataset.folderId = folder.id;
    chip.title = `${folder.name} (${folderCounts.get(folder.id) || 0})`;
    chip.append(element('span', 'folder-chip-name', folder.name), element('span', 'folder-chip-count', String(folderCounts.get(folder.id) || 0)));
    chip.classList.toggle('is-active', folder.id === activeFolderId);
    chip.addEventListener('click', () => { activeFolderId = folder.id; currentPage = 1; renderPosts(); });
    const remove = iconButton('button', 'folder-delete-button', `Delete ${folder.name} folder`, 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3');
    remove.type = 'button';
    remove.addEventListener('click', () => deleteFolder(folder, folderCounts.get(folder.id) || 0));
    row.append(chip, remove);
    bar.insertBefore(row, document.getElementById('new-folder-btn'));
  }
  const allPosts = bar.querySelector('[data-folder-id=""]');
  const allCount = allPosts?.querySelector('.folder-chip-count');
  if (allCount) allCount.textContent = String(posts.length);
  if (allPosts) allPosts.title = `All posts (${posts.length})`;
  allPosts?.classList.toggle('is-active', !activeFolderId);
  allPosts?.removeEventListener('click', selectAllPosts);
  allPosts?.addEventListener('click', selectAllPosts);
}

async function deleteFolder(folder, postCount) {
  if (postCount > 0 && !window.confirm(`Delete "${folder.name}" folder? ${postCount} saved post(s) in this folder will remain saved, but will be removed from the folder.`)) return;
  const error = document.getElementById('page-error');
  error.textContent = '';
  const result = await chrome.runtime.sendMessage({ type: 'delete-saved-folder', id: folder.id });
  if (!result?.success) {
    error.textContent = result?.error || 'Could not delete folder.';
    return;
  }
  if (activeFolderId === folder.id) activeFolderId = '';
  currentPage = 1;
  await renderPosts();
}

function selectAllPosts() {
  activeFolderId = '';
  currentPage = 1;
  renderPosts();
}

function updatePlatformUi() {
  const isPixiv = activePlatform === 'pixiv';
  document.documentElement.dataset.platform = activePlatform;
  document.title = `Saved ${isPixiv ? 'Pixiv' : 'X'} Posts — Nor1c Suite`;
  document.getElementById('page-title').textContent = `Saved ${isPixiv ? 'Pixiv' : 'X'} Posts`;
  document.getElementById('page-subtitle').textContent = `${isPixiv ? 'Pixiv' : 'X'} posts stored locally in this browser`;
  document.querySelector('[data-folder-id=""] .folder-chip-name').textContent = `All ${isPixiv ? 'Pixiv' : 'X'} posts`;
  const add = document.getElementById('new-folder-btn');
  add.title = `Create ${isPixiv ? 'Pixiv' : 'X'} folder`;
  add.setAttribute('aria-label', add.title);
}

async function createPost(post, folderNames = new Map(), createdMediaUrls = mediaUrls) {
  const card = element('article', 'post post-entering');
  card.dataset.postId = String(post.id);
  const header = element('header', 'post-header');
  const isPixiv = post.platform === 'pixiv';
  const author = element('div', 'post-author', post.author || (isPixiv ? 'Pixiv post' : 'X post'));
  const time = element('div', 'post-time', post.savedAt ? `Saved ${new Date(post.savedAt).toLocaleString()}` : '');
  author.appendChild(time);
  header.appendChild(author);

  const assignedFolders = [...new Set(postFolderIds(post).map(id => folderNames.get(id)).filter(Boolean))];
  const badges = element('div', 'post-folder-badges');
  badges.setAttribute('aria-label', assignedFolders.length ? `Saved in folders: ${assignedFolders.join(', ')}` : 'Not assigned to a folder');
  badges.title = assignedFolders.length ? assignedFolders.join(', ') : 'Not assigned to a folder';
  if (assignedFolders.length) {
    for (const name of assignedFolders) {
      const badge = element('span', 'post-folder-badge', name);
      badge.title = name;
      badges.appendChild(badge);
    }
  } else {
    badges.appendChild(element('span', 'post-folder-badge is-unfiled', 'Unfiled'));
  }

  card.append(header, badges);
  const postUrl = element('a', 'post-url', post.url);
  postUrl.href = post.url;
  postUrl.target = '_blank';
  postUrl.rel = 'noopener noreferrer';
  postUrl.title = post.url;
  card.appendChild(postUrl);
  const body = element('div', 'post-body');

  const mediaItems = post.media || [];
  if (mediaItems.length) {
    const grid = element('div', `media-grid media-count-${Math.min(mediaItems.length, 4)}`);
    for (const item of mediaItems) {
      const frame = element('div', 'media-item');
      const sourceUrl = typeof item.url === 'string' ? Nor1cSavedPosts.normalizeMediaUrl(item.url, item.kind, isPixiv ? 'pixiv' : 'x') : null;
      const legacyMedia = !sourceUrl && item.mediaKey && item.status === 'saved';
      const addRawImageButton = () => {
        if (item.kind !== 'image' || frame.querySelector('.fetch-raw-image')) return;
        const button = element('button', 'fetch-raw-image', 'Fetch image again');
        button.type = 'button';
        button.hidden = true;
        button.addEventListener('click', () => {
          const candidates = [];
          for (const value of [sourceUrl, item.url]) {
            if (!value) continue;
            try {
              const raw = new URL(value);
              raw.searchParams.set('name', 'orig');
              candidates.push(raw.href);
              raw.search = '';
              candidates.push(raw.href);
            } catch (_) {}
          }
          const unique = [...new Set(candidates)];
          if (!unique.length) return;
          button.disabled = true;
          const image = element('img');
          image.alt = 'Saved post image';
          image.loading = 'eager';
          let index = 0;
          image.addEventListener('error', () => {
            index += 1;
            if (index < unique.length) image.src = unique[index];
            else {
              image.remove();
              button.disabled = false;
              button.textContent = 'RAW image unavailable';
            }
          });
          image.addEventListener('load', () => {
            button.remove();
          }, { once: true });
          frame.prepend(image);
          image.src = unique[0];
        });
        frame.appendChild(button);
      };
      const revealFetchButton = () => {
        addRawImageButton();
        const button = frame.querySelector('.fetch-raw-image');
        if (button) button.hidden = false;
      };
      if (!sourceUrl && !legacyMedia) {
        frame.appendChild(element('p', 'media-error', item.error || 'Media link is unavailable. Open the original post to view it.'));
        revealFetchButton();
      } else {
        try {
          let url = sourceUrl;
          if (isPixiv && sourceUrl) {
            const response = await chrome.runtime.sendMessage({ type: 'get-pixiv-media', url: sourceUrl, artworkUrl: post.url });
            if (!response?.success || response.url !== sourceUrl) throw new Error(response?.error || 'Pixiv image could not be loaded.');
            url = response.url;
          } else if (!url && legacyMedia) {
            const blob = await Nor1cSavedPosts.getMedia(item.mediaKey);
            if (!blob || !blob.size) throw new Error('Saved media is missing.');
            url = URL.createObjectURL(blob);
            createdMediaUrls.add(url);
          }
          const content = item.kind === 'video' ? element('video') : element('img');
          content.dataset.sourceUrl = sourceUrl || url;
          const fallbackUrl = !isPixiv && item.kind === 'image' ? (() => {
            try {
              const fallback = new URL(sourceUrl);
              fallback.searchParams.set('name', 'orig');
              return fallback.href === url ? '' : fallback.href;
            } catch (_) {
              return '';
            }
          })() : '';
          let retried = false;
          let failureTimer;
          const showFetchButton = message => {
            clearTimeout(failureTimer);
            content.remove();
            frame.replaceChildren(element('p', 'media-error', message));
            revealFetchButton();
          };
          content.addEventListener('load', () => {
            if (item.kind === 'image' && content.naturalWidth === 0) {
              showFetchButton('Image could not be decoded.');
              return;
            }
            clearTimeout(failureTimer);
          }, { once: true });
          content.addEventListener('error', () => {
            if (!retried && fallbackUrl) {
              retried = true;
              content.src = fallbackUrl;
              return;
            }
            showFetchButton('Media could not be loaded.');
          });
          if (item.kind === 'image' && sourceUrl) {
            failureTimer = setTimeout(() => showFetchButton('Image fetch timed out.'), 1500);
          }
          if (item.kind === 'video') {
            content.controls = true;
            content.preload = 'metadata';
            content.playsInline = true;
          } else {
            content.alt = 'Saved post image';
            content.loading = 'eager';
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
          content.src = url;
          if (item.kind === 'image') {
            setTimeout(() => {
              if (content.isConnected && content.complete && content.naturalWidth === 0) {
                showFetchButton('Image could not be loaded.');
              }
            }, 0);
          }
        } catch (cause) {
          frame.appendChild(element('p', 'media-error', cause instanceof Error ? cause.message : 'Saved media could not be loaded.'));
          revealFetchButton();
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

  const link = iconButton('a', 'post-link', `Open original post on ${isPixiv ? 'Pixiv' : 'X'}`, 'M18.3 5.7 8.2 15.8M9 6h9v9M5 8v11h11');
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
  card.classList.add('post-removing');
  const error = document.getElementById('page-error');
  error.textContent = '';
  localMutationDepth += 1;
  try {
    const message = removingFromFolder
      ? { type: 'update-saved-post-folders', id: post.id, platform: post.platform, folderIds: postFolderIds(post).filter(id => id !== folderId) }
      : { type: 'delete-x-post', id: post.id, platform: post.platform };
    const minimumTransition = new Promise(resolve => setTimeout(resolve, 180));
    const result = await chrome.runtime.sendMessage(message);
    await minimumTransition;
    if (!result?.success) throw new Error(result?.error || (removingFromFolder ? 'Could not remove post from this folder.' : 'Could not remove saved post.'));
    await renderPosts();
  } catch (cause) {
    card.classList.remove('post-removing');
    button.disabled = false;
    button.setAttribute('aria-label', idleLabel);
    button.title = idleLabel;
    error.textContent = cause instanceof Error ? cause.message : removingFromFolder ? 'Could not remove post from this folder.' : 'Could not remove saved post.';
  } finally {
    localMutationDepth -= 1;
  }
}

document.getElementById('new-folder-btn').addEventListener('click', async () => {
  const name = window.prompt(`${activePlatform === 'pixiv' ? 'Pixiv' : 'X'} folder name:`);
  if (!name?.trim()) return;
  const result = await chrome.runtime.sendMessage({ type: 'create-saved-folder', name, platform: activePlatform });
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
  if (area !== 'local' || (!changes[STORAGE_KEY] && !changes[FOLDERS_KEY])) return;
  if (localMutationDepth > 0) return;
  renderPosts();
});
window.addEventListener('beforeunload', clearMediaUrls);
updatePlatformUi();
renderPosts();
