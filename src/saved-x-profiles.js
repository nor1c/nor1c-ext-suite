(function () {
  const store = globalThis.Nor1cSavedXProfiles;
  const $ = id => document.getElementById(id);
  const PAGE_SIZE = 30;
  let profiles = [];
  let selectedId = new URL(location.href).searchParams.get('profile') || '';
  let page = 1;
  let loadVersion = 0;
  let viewerPhotos = [];
  let viewerIndex = 0;

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text) result.textContent = text;
    return result;
  }

  async function send(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.success) throw new Error(response?.error || 'The extension could not complete this action.');
    return response;
  }

  function selectedProfile() { return profiles.find(profile => profile.id === selectedId); }

  function selectProfile(id) {
    selectedId = id;
    page = 1;
    const url = new URL(location.href);
    url.searchParams.set('profile', id);
    history.replaceState(null, '', url);
    if ($('profile-viewer').open) $('profile-viewer').close();
    render();
  }

  async function load() {
    const version = ++loadVersion;
    try {
      const result = await chrome.storage.local.get({ [store.STORAGE_KEY]: [] });
      if (version !== loadVersion) return;
      profiles = (Array.isArray(result[store.STORAGE_KEY]) ? result[store.STORAGE_KEY] : []).filter(profile => store.canonicalProfileUrl(profile?.url)?.id === profile.id);
      if (!selectedProfile()) { selectedId = profiles[0]?.id || ''; page = 1; }
      render();
    } catch (error) { $('page-error').textContent = error.message; }
  }

  function render() {
    $('profile-count').textContent = String(profiles.length);
    const list = $('profiles-list');
    const focusedProfile = list.contains(document.activeElement) ? document.activeElement.dataset.profileId : '';
    list.replaceChildren();
    for (const profile of profiles) {
      const button = node('button', `folder-chip${profile.id === selectedId ? ' is-active' : ''}`);
      button.type = 'button';
      button.dataset.profileId = profile.id;
      button.setAttribute('aria-pressed', String(profile.id === selectedId));
      button.append(node('span', 'folder-chip-name', `@${profile.username}`), node('span', 'folder-chip-count', String(profile.photos?.length || 0)));
      button.addEventListener('click', () => selectProfile(profile.id));
      list.appendChild(button);
      if (focusedProfile === profile.id) button.focus();
    }
    const profile = selectedProfile();
    $('empty-profiles').hidden = profiles.length > 0;
    $('profile-gallery').hidden = !profile;
    $('profile-actions').hidden = !profile;
    if (!profile) {
      $('gallery-title').textContent = 'Saved X Profiles';
      $('gallery-summary').textContent = '';
      $('gallery-summary').removeAttribute('title');
      $('collection-status').hidden = true;
      $('profile-photos').replaceChildren();
      if ($('profile-viewer').open) $('profile-viewer').close();
      return;
    }
    const photos = (profile.photos || []).map(photo => store.normalizePhoto(photo, profile.id)).filter(Boolean);
    $('gallery-title').textContent = `@${profile.username}`;
    const state = profile.collection?.state;
    const loading = state === 'loading';
    const closeState = profile.collection?.tabCloseState;
    $('gallery-summary').textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'}`;
    $('gallery-summary').title = `${profile.lastCollectedAt ? `Updated ${new Date(profile.lastCollectedAt).toLocaleString()}. ` : ''}Collected links, not a verified full archive.`;
    const statusLabels = {
      loading: 'Loading photos…',
      finished: closeState === 'closed' ? 'Finished · tab closed' : 'Finished',
      stopped: 'Stopped · load to continue',
      stalled: 'Loading paused · reload the X tab and retry',
      timeout: 'Time limit reached · load to continue',
      interrupted: 'X tab closed or navigated away · load to continue',
      idle: 'Partial collection · load to continue',
      error: 'Loading failed · check the X tab, then retry',
      limit: 'Storage full · remove a profile, then retry'
    };
    let status = profile.storageLimited ? statusLabels.limit : statusLabels[state] || '';
    if (closeState === 'failed') status += ' · close the X tab manually';
    if (closeState === 'kept') status += ' · navigated tab kept open';
    $('collection-status').textContent = status;
    $('collection-status').title = profile.storageLimited ? store.STORAGE_LIMIT_MESSAGE : store.COLLECTION_MESSAGES[state] || '';
    $('collection-status').hidden = !status;
    $('collection-status').dataset.state = profile.storageLimited || ['error', 'limit', 'stalled', 'timeout', 'interrupted'].includes(state) || closeState === 'failed' ? 'warning' : '';
    $('stop-profile').hidden = !loading;
    const loadLabel = loading ? 'Show loading tab' : 'Load older photos';
    $('load-profile').title = loadLabel;
    $('load-profile').setAttribute('aria-label', loadLabel);
    $('empty-photos').hidden = photos.length > 0;
    const posts = new Map();
    for (const photo of photos) {
      if (!posts.has(photo.postUrl)) posts.set(photo.postUrl, []);
      posts.get(photo.postUrl).push(photo);
    }
    const groups = [...posts.values()];
    const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    $('photo-pagination').hidden = totalPages <= 1;
    $('photos-prev').disabled = page <= 1;
    $('photos-next').disabled = page >= totalPages;
    $('photos-page').textContent = `Page ${page} of ${totalPages}`;
    const grid = $('profile-photos');
    const focusedPhoto = grid.contains(document.activeElement) ? document.activeElement.dataset.photoId : '';
    grid.replaceChildren();
    groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).forEach(group => {
      // Share Saved X Posts' images-only markup and CSS, including multi-image tiles.
      const card = node('article', 'post profile-post');
      card.dataset.postUrl = group[0].postUrl;
      const body = node('div', 'post-body');
      const media = node('div', `media-grid media-count-${Math.min(group.length, 4)}`);
      for (const photo of group) {
        const frame = node('div', 'media-item');
        const image = node('img', 'profile-photo-open');
        image.tabIndex = 0;
        image.setAttribute('role', 'button');
        image.dataset.photoId = photo.id;
        image.alt = photo.alt || `Photo from @${profile.username}`;
        image.title = 'Open image viewer';
        image.loading = 'lazy';
        image.decoding = 'async';
        const recovery = node('div', 'profile-photo-recovery');
        recovery.hidden = true;
        const retry = node('button', 'profile-photo-retry', 'Retry image');
        retry.type = 'button';
        const openOriginal = node('a', '', 'Original post');
        openOriginal.href = photo.postUrl;
        openOriginal.target = '_blank';
        openOriginal.rel = 'noopener noreferrer';
        recovery.append(retry, openOriginal);
        const start = () => {
          recovery.hidden = true;
          image.src = store.thumbnailUrl(photo.url);
        };
        image.addEventListener('error', () => { recovery.hidden = false; });
        retry.addEventListener('click', start);
        const open = () => {
          viewerPhotos = groups.flat();
          viewerIndex = viewerPhotos.indexOf(photo);
          showViewer();
          $('profile-viewer').showModal();
        };
        image.addEventListener('click', open);
        image.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
        });
        frame.append(image, recovery);
        media.appendChild(frame);
        start();
      }
      body.appendChild(media);
      card.appendChild(body);
      grid.appendChild(card);
    });
    if (focusedPhoto) Array.from(grid.querySelectorAll('[data-photo-id]')).find(image => image.dataset.photoId === focusedPhoto)?.focus();
  }

  function showViewer() {
    const photo = viewerPhotos[viewerIndex];
    if (!photo) return;
    $('viewer-error').hidden = true;
    $('viewer-image').hidden = false;
    $('viewer-image').alt = photo.alt || 'Profile photo';
    $('viewer-image').src = photo.url;
    $('viewer-post').href = photo.postUrl;
    $('viewer-count').textContent = `${viewerIndex + 1} / ${viewerPhotos.length}`;
    $('viewer-prev').disabled = viewerIndex === 0;
    $('viewer-next').disabled = viewerIndex === viewerPhotos.length - 1;
  }

  function moveViewer(direction) {
    const next = viewerIndex + direction;
    if (next < 0 || next >= viewerPhotos.length) return;
    viewerIndex = next;
    showViewer();
  }

  $('viewer-image').addEventListener('error', () => { $('viewer-image').hidden = true; $('viewer-error').hidden = false; });
  $('viewer-close').addEventListener('click', () => $('profile-viewer').close());
  $('viewer-prev').addEventListener('click', () => moveViewer(-1));
  $('viewer-next').addEventListener('click', () => moveViewer(1));
  $('profile-viewer').addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveViewer(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  $('profile-viewer').addEventListener('click', event => { if (event.target === $('profile-viewer')) $('profile-viewer').close(); });
  $('profile-viewer').addEventListener('close', () => { $('viewer-image').removeAttribute('src'); viewerPhotos = []; });

  const addDialog = $('add-profiles-dialog');
  $('add-profiles').addEventListener('click', () => {
    $('add-profiles-error').textContent = '';
    addDialog.showModal();
    $('profile-urls').focus();
  });
  $('cancel-add-profiles').addEventListener('click', () => addDialog.close());
  addDialog.addEventListener('cancel', event => {
    if ($('save-profiles').disabled) event.preventDefault();
  });
  addDialog.addEventListener('close', () => $('add-profiles').focus());

  $('add-profiles-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('page-error').textContent = '';
    $('add-profiles-error').textContent = '';
    $('save-profiles').disabled = true;
    $('cancel-add-profiles').disabled = true;
    try {
      const urls = $('profile-urls').value.trim().split(/\s+/).filter(Boolean);
      const response = await send({ type: 'save-x-profiles', urls });
      selectedId = response.ids[0];
      page = 1;
      $('profile-urls').value = '';
      addDialog.close();
      $('add-profiles').disabled = true;
      await load();
      const failures = [];
      for (const id of response.ids) {
        try { await send({ type: 'open-x-profile-media', id, active: false, autoLoad: true }); }
        catch (error) { failures.push(error.message); }
      }
      if (failures.length) $('page-error').textContent = `Profiles were saved. ${failures.join(' ')}`;
    } catch (error) { $(addDialog.open ? 'add-profiles-error' : 'page-error').textContent = error.message; }
    finally {
      $('save-profiles').disabled = false;
      $('cancel-add-profiles').disabled = false;
      $('add-profiles').disabled = false;
      if (!addDialog.open && document.activeElement === document.body) $('add-profiles').focus();
    }
  });

  $('load-profile').addEventListener('click', async () => {
    if (!selectedProfile()) return;
    $('page-error').textContent = '';
    $('load-profile').disabled = true;
    try { await send({ type: 'open-x-profile-media', id: selectedId, autoLoad: true }); }
    catch (error) { $('page-error').textContent = error.message; }
    finally { $('load-profile').disabled = false; }
  });
  $('stop-profile').addEventListener('click', async () => {
    $('stop-profile').disabled = true;
    try { await send({ type: 'stop-x-profile-collection', id: selectedId }); }
    catch (error) { $('page-error').textContent = error.message; }
    finally { $('stop-profile').disabled = false; }
  });
  $('delete-profile').addEventListener('click', async () => {
    const profile = selectedProfile();
    if (!profile || !window.confirm(`Remove @${profile.username} and its collected photo links? Individually saved X posts will not be changed.`)) return;
    $('delete-profile').disabled = true;
    $('page-error').textContent = '';
    try {
      await send({ type: 'delete-x-profile', id: profile.id });
      if ($('profile-viewer').open) $('profile-viewer').close();
      await load();
    } catch (error) { $('page-error').textContent = error.message; }
    finally { $('delete-profile').disabled = false; }
  });
  $('photos-prev').addEventListener('click', () => { if (page > 1) { page -= 1; render(); } });
  $('photos-next').addEventListener('click', () => { if (!$('photos-next').disabled) { page += 1; render(); } });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[store.STORAGE_KEY]) load(); });
  load();
})();
