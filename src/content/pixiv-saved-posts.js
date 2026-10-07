(function () {
  const SAVED_POSTS_KEY = 'savedXPosts';
  const BUTTON_ID = 'nor1c-save-pixiv-post';
  const savedPosts = new Map();
  let currentArtworkId = '';
  let artworkPromise = null;

  function postKey(post) {
    return `${post?.platform === 'pixiv' ? 'pixiv' : 'x'}:${post?.id}`;
  }

  function refreshSavedPosts(posts) {
    savedPosts.clear();
    for (const post of posts || []) savedPosts.set(postKey(post), post);
    updateButton();
  }

  chrome.storage.local.get({ [SAVED_POSTS_KEY]: [] })
    .then(result => refreshSavedPosts(result[SAVED_POSTS_KEY]))
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SAVED_POSTS_KEY]) refreshSavedPosts(changes[SAVED_POSTS_KEY].newValue);
  });

  function artworkFromLocation() {
    const match = location.pathname.match(/^\/(?:[a-z]{2}\/)?artworks\/(\d+)\/?$/i);
    return match ? { id: match[1], url: `https://www.pixiv.net/artworks/${match[1]}` } : null;
  }

  function normalizeImageUrl(value) {
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'i.pximg.net' || url.username || url.password) return '';
      url.hash = '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function stripHtml(value) {
    const document = new DOMParser().parseFromString(typeof value === 'string' ? value : '', 'text/html');
    return document.body.textContent?.trim() || '';
  }

  async function fetchArtwork(post) {
    const [detailsResponse, pagesResponse] = await Promise.all([
      fetch(`/ajax/illust/${post.id}`, { credentials: 'same-origin' }),
      fetch(`/ajax/illust/${post.id}/pages`, { credentials: 'same-origin' })
    ]);
    if (!detailsResponse.ok || !pagesResponse.ok) throw new Error('Could not load this Pixiv artwork.');
    const [detailsPayload, pagesPayload] = await Promise.all([detailsResponse.json(), pagesResponse.json()]);
    if (detailsPayload?.error || pagesPayload?.error || !detailsPayload?.body || !Array.isArray(pagesPayload?.body)) {
      throw new Error(detailsPayload?.message || pagesPayload?.message || 'Could not load this Pixiv artwork.');
    }
    const details = detailsPayload.body;
    const availablePages = pagesPayload.body
      .map(page => normalizeImageUrl(page?.urls?.original || page?.urls?.regular || page?.urls?.small))
      .filter(Boolean);
    const media = availablePages
      .slice(0, 5)
      .map(url => ({ kind: 'image', url }));
    if (!media.length) throw new Error('No accessible images were found for this Pixiv post.');
    return {
      id: post.id,
      url: post.url,
      platform: 'pixiv',
      text: [details.title || details.illustTitle, stripHtml(details.description || details.illustComment)].filter(Boolean).join('\n\n'),
      author: details.userName || '',
      createdAt: details.createDate || details.uploadDate || '',
      media,
      mediaNote: availablePages.length > media.length ? `Only the first ${media.length} of ${availablePages.length} images are stored.` : ''
    };
  }

  function savedFolderIds(post) {
    if (Array.isArray(post?.folderIds)) return post.folderIds;
    return typeof post?.folderId === 'string' && post.folderId ? [post.folderId] : [];
  }

  async function chooseFolder(initialFolderIds = [], canDelete = false) {
    const result = await chrome.runtime.sendMessage({ type: 'get-saved-folders', platform: 'pixiv' });
    if (!result?.success) throw new Error(result?.error || 'Could not load saved folders.');
    return new Promise(resolve => {
      const host = document.createElement('div');
      host.className = 'nor1c-pixiv-folder-modal-host';
      const shadow = host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = `<style>
        :host { all: initial; }
        .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px; overflow: hidden; overscroll-behavior: none; background: rgba(0,0,0,.45); font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; line-height: 1.45; }
        .modal { width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 24px); overflow: hidden; padding: 20px; border-radius: 16px; background: #fff; color: #1f1f1f; box-shadow: 0 18px 50px rgba(0,0,0,.25); }
        h2 { margin: 0 0 4px; font-size: 19px; } p { margin: 0 0 12px; color: #6f6f6f; }
        .folders { display: grid; gap: 3px; max-height: min(680px, calc(100vh - 210px)); overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; padding: 4px; border: 1px solid #e5e5e5; border-radius: 10px; background: #f7f7f7; }
        .folder { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 30px; padding: 3px 10px; border: 1px solid #d6d6d6; border-radius: 6px; background: #fff; color: #1f1f1f; text-align: left; font: inherit; cursor: pointer; }
        .folder-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .folder-count { flex: 0 0 auto; min-width: 24px; padding: 1px 6px; border-radius: 999px; background: #f0f0f0; color: #6f6f6f; font-size: 12px; font-weight: 700; line-height: 1.3; text-align: center; }
        .folder:hover, .folder.selected { border-color: #0096fa; background: #eef8ff; }
        .new-folder { display: flex; gap: 8px; margin-top: 12px; } input { min-width: 0; flex: 1; height: 36px; padding: 0 10px; border: 1px solid #d6d6d6; border-radius: 8px; font: inherit; }
        button { height: 36px; padding: 0 13px; border: 1px solid #d6d6d6; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
        button.primary { border-color: #0096fa; background: #0096fa; color: #fff; } button:hover { background: #f3f3f3; } button.primary:hover { background: #0086df; }
        .actions { display: flex; align-items: center; gap: 8px; margin-top: 16px; } .cancel { margin-left: auto; } .delete-all { border-color: #f0b4b4; color: #b42318; }
      </style><div class="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="nor1c-pixiv-folder-title"><h2 id="nor1c-pixiv-folder-title">Save Pixiv post</h2><p>Choose one or more folders for this saved post.</p><div class="folders"><button type="button" class="folder" data-id="" aria-pressed="false">No folder</button></div><div class="new-folder"><input maxlength="60" placeholder="New folder name" aria-label="New folder name"><button type="button" class="create">Create</button></div><div class="actions"><button type="button" class="delete-all">Delete from all folders</button><button type="button" class="cancel">Cancel</button><button type="button" class="primary confirm">Save</button></div></section></div>`;
      document.documentElement.appendChild(host);
      const foldersEl = shadow.querySelector('.folders');
      const input = shadow.querySelector('input');
      const selectedIds = new Set(initialFolderIds.filter(id => (result.folders || []).some(folder => folder.id === id)));
      const deleteAll = shadow.querySelector('.delete-all');
      deleteAll.hidden = !canDelete;
      let settled = false;
      const onKeyDown = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      };
      document.addEventListener('keydown', onKeyDown, true);
      const finish = value => { if (settled) return; settled = true; document.removeEventListener('keydown', onKeyDown, true); host.remove(); resolve(value); };
      const syncNoFolder = () => {
        const node = foldersEl.querySelector('[data-id=""]');
        node.classList.toggle('selected', selectedIds.size === 0);
        node.setAttribute('aria-pressed', String(selectedIds.size === 0));
      };
      const toggle = (id, node) => {
        if (!id) {
          selectedIds.clear();
          foldersEl.querySelectorAll('.folder[data-id]:not([data-id=""])').forEach(item => { item.classList.remove('selected'); item.setAttribute('aria-pressed', 'false'); });
        } else if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
        node.classList.toggle('selected', id ? selectedIds.has(id) : selectedIds.size === 0);
        node.setAttribute('aria-pressed', String(id ? selectedIds.has(id) : selectedIds.size === 0));
        syncNoFolder();
      };
      const addFolder = (folder, selected = false) => {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'folder';
        node.dataset.id = folder.id;
        node.innerHTML = '<span class="folder-name"></span><span class="folder-count"></span>';
        node.querySelector('.folder-name').textContent = folder.name;
        node.querySelector('.folder-count').textContent = String(Number(folder.itemCount) || 0);
        if (selected) selectedIds.add(folder.id);
        node.classList.toggle('selected', selectedIds.has(folder.id));
        node.setAttribute('aria-pressed', String(selectedIds.has(folder.id)));
        node.addEventListener('click', () => toggle(folder.id, node));
        foldersEl.appendChild(node);
      };
      foldersEl.querySelector('.folder').addEventListener('click', event => toggle('', event.currentTarget));
      for (const folder of [...(result.folders || [])].sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0))) addFolder(folder);
      syncNoFolder();
      shadow.querySelector('.create').addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name) return input.focus();
        const created = await chrome.runtime.sendMessage({ type: 'create-saved-folder', name, platform: 'pixiv' });
        if (!created?.success) return;
        addFolder({ ...created.folder, itemCount: 0 }, true);
        input.value = '';
        syncNoFolder();
      });
      shadow.querySelector('.confirm').addEventListener('click', () => finish({ action: 'save', folderIds: Array.from(selectedIds) }));
      deleteAll.addEventListener('click', () => finish({ action: 'delete' }));
      shadow.querySelector('.cancel').addEventListener('click', () => finish(null));
      shadow.querySelector('.backdrop').addEventListener('click', event => { if (event.target === event.currentTarget) finish(null); });
      host.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') finish(null); }, true);
      host.addEventListener('keypress', event => event.stopPropagation(), true);
      host.addEventListener('keyup', event => event.stopPropagation(), true);
      foldersEl.querySelector('.folder').focus();
      shadow.querySelector('.backdrop').addEventListener('wheel', event => {
        if (!event.target.closest('.folders')) event.preventDefault();
      }, { passive: false });
    });
  }

  function setButtonState(button, state, message) {
    const label = message || ({ saved: 'Edit saved Pixiv post folders', saving: 'Saving Pixiv post…', partial: 'Refresh saved Pixiv images', idle: 'Save Pixiv post' })[state];
    if (button.dataset.state === state && button.title === label) return;
    button.dataset.state = state;
    button.disabled = state === 'saving';
    button.innerHTML = state === 'saving'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg><span>SAVING</span>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM4 14h4l2 3h4l2-3h4"/><path class="saved-check" d="m9 11 2 2 4-4"/></svg><span>SAVE</span>';
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  function updateButton() {
    const button = document.getElementById(BUTTON_ID);
    if (!button || button.dataset.state === 'saving') return;
    const saved = savedPosts.get(`pixiv:${button.dataset.postId}`);
    setButtonState(button, saved?.status === 'partial' ? 'partial' : saved ? 'saved' : 'idle');
  }

  async function handleSave(button, post) {
    const savedPost = savedPosts.get(`pixiv:${post.id}`);
    const selection = await chooseFolder(savedFolderIds(savedPost), Boolean(savedPost));
    if (!selection) return;
    const previousState = button.dataset.state;
    setButtonState(button, 'saving');
    try {
      const response = selection.action === 'delete'
        ? await chrome.runtime.sendMessage({ type: 'remove-pixiv-post', id: post.id })
        : await chrome.runtime.sendMessage({
          type: 'save-pixiv-post',
          post: { ...(await fetchArtwork(post)), folderIds: selection.folderIds },
          retry: previousState === 'partial'
        });
      if (!response?.success) throw new Error(response?.error || 'Could not save this Pixiv post.');
      if (selection.action === 'delete') savedPosts.delete(`pixiv:${post.id}`);
      else savedPosts.set(`pixiv:${post.id}`, response.post);
      updateButton();
    } catch (error) {
      setButtonState(button, savedPost ? savedPost.status === 'partial' ? 'partial' : 'saved' : 'idle', error instanceof Error ? error.message : 'Could not save this Pixiv post.');
    }
  }

  function isVisible(node) {
    return node.getClientRects().length > 0 && getComputedStyle(node).visibility === 'visible';
  }

  function findActionPlacement(post) {
    const bookmarkLink = Array.from(document.querySelectorAll('main a[href*="bookmark_add.php"]')).find(link => {
      if (!isVisible(link)) return false;
      try {
        const url = new URL(link.href, location.href);
        return url.origin === location.origin && url.pathname === '/bookmark_add.php' &&
          url.searchParams.get('type') === 'illust' && url.searchParams.get('illust_id') === post.id;
      } catch (_) {
        return false;
      }
    });
    if (bookmarkLink?.parentElement?.parentElement) {
      return { area: bookmarkLink.parentElement.parentElement, after: bookmarkLink.parentElement };
    }
    const bookmark = Array.from(document.querySelectorAll('main [data-ga4-label="bookmark_button"]')).find(isVisible);
    if (bookmark?.parentElement) {
      return { area: bookmark.parentElement, after: bookmark };
    }
    const heart = Array.from(document.querySelectorAll('main button.gtm-main-bookmark')).find(isVisible);
    if (heart?.parentElement?.parentElement) {
      return { area: heart.parentElement.parentElement, after: heart.parentElement };
    }
    const like = Array.from(document.querySelectorAll('main button')).find(button => button.textContent.trim() === 'Like' && isVisible(button));
    if (like?.parentElement) return { area: like.parentElement, after: like };
    const heading = Array.from(document.querySelectorAll('main h1')).find(isVisible);
    const area = heading?.parentElement || Array.from(document.querySelectorAll('main')).find(isVisible);
    return area ? { area, after: null } : null;
  }

  function placeButton(button, placement) {
    if (placement.after) {
      if (placement.after.nextElementSibling !== button) placement.after.insertAdjacentElement('afterend', button);
    } else if (button.parentElement !== placement.area) {
      placement.area.appendChild(button);
    }
  }

  function mount() {
    const post = artworkFromLocation();
    let existing = document.getElementById(BUTTON_ID);
    if (!post) {
      existing?.remove();
      currentArtworkId = '';
      artworkPromise = null;
      return;
    }
    if (post.id !== currentArtworkId) {
      currentArtworkId = post.id;
      artworkPromise = null;
      existing?.remove();
      existing = null;
    }
    const placement = findActionPlacement(post);
    if (!placement) return;
    if (existing) {
      placeButton(existing, placement);
      updateButton();
      return;
    }
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.dataset.postId = post.id;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      artworkPromise ||= handleSave(button, post).finally(() => { artworkPromise = null; });
    });
    setButtonState(button, 'idle');
    placeButton(button, placement);
    updateButton();
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); });
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'data-ga4-label', 'href']
  });
  window.addEventListener('popstate', mount);
  mount();
})();
