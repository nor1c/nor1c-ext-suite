(function () {
  const SAVED_POSTS_KEY = 'savedXPosts';
  const BUTTON_CLASS = 'nor1c-save-x-post';
  const savedPosts = new Map();

  chrome.storage.local.get({ [SAVED_POSTS_KEY]: [] }).then(result => {
    for (const post of result[SAVED_POSTS_KEY] || []) {
      if (post.platform !== 'pixiv') savedPosts.set(post.id, post);
    }
    updateButtons();
  }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SAVED_POSTS_KEY]) return;
    savedPosts.clear();
    for (const post of changes[SAVED_POSTS_KEY].newValue || []) {
      if (post.platform !== 'pixiv') savedPosts.set(post.id, post);
    }
    updateButtons();
  });

  function canonicalPostUrl(value) {
    try {
      const url = new URL(value, location.href);
      if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname.toLowerCase())) return null;
      const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/i);
      if (!match) return null;
      return { id: match[2], url: `https://x.com/${match[1]}/status/${match[2]}` };
    } catch (_) {
      return null;
    }
  }

  function mediaUrl(value, kind) {
    try {
      const url = new URL(value, location.href);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      if (kind === 'image' && host !== 'pbs.twimg.com') return '';
      if (kind === 'video' && host !== 'video.twimg.com') return '';
      url.hash = '';
      if (kind === 'image') url.searchParams.set('name', 'orig');
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function findPost(article) {
    const anchors = Array.from(article.querySelectorAll('a[href*="/status/"]'))
      .filter(anchor => anchor.closest('article') === article);
    const routePost = canonicalPostUrl(location.href);
    if (routePost) {
      const matchingAnchor = anchors.find(anchor => canonicalPostUrl(anchor.href)?.id === routePost.id);
      return matchingAnchor ? routePost : null;
    }
    const permalink = anchors.find(anchor => anchor.querySelector('time'));
    for (const anchor of permalink ? [permalink, ...anchors] : anchors) {
      const post = canonicalPostUrl(anchor.href);
      if (post) return post;
    }
    return null;
  }

  function xMediaHint(value) {
    try {
      const match = new URL(value, location.href).pathname.match(/\/(?:amplify_video|ext_tw_video|tweet_video)(?:_thumb)?\/(\d+)(?:\/|$)/i);
      return match ? match[1] : '';
    } catch (_) {
      return '';
    }
  }

  function collectPost(article, post) {
    const own = selector => Array.from(article.querySelectorAll(selector)).filter(node => node.closest('article') === article);
    const text = own('[data-testid="tweetText"]')[0]?.innerText?.trim() || '';
    const author = own('[data-testid="User-Name"]')[0]?.innerText?.trim() || '';
    const time = own('time')[0]?.dateTime || '';
    const media = [];
    const seen = new Set();

    const hasVideo = own('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]').length > 0;
    const routePost = canonicalPostUrl(location.href);
    const photoRoute = routePost?.id === post.id && /\/status\/\d+\/photo\/\d+/i.test(location.pathname);
    let images;
    if (photoRoute) {
      const dialog = document.querySelector('[role="dialog"]');
      const modalImages = dialog
        ? Array.from(dialog.querySelectorAll('img[src*="pbs.twimg.com/media/"]'))
        : [];
      const modalBackgrounds = dialog
        ? Array.from(dialog.querySelectorAll('[style*="background-image"]')).map(node => {
          const match = node.style.backgroundImage.match(/url\\(["']?([^"')]+)["']?\\)/i);
          return match ? { currentSrc: match[1], src: match[1] } : null;
        }).filter(Boolean)
        : [];
      images = [...modalImages, ...modalBackgrounds];
    } else {
      images = own('[data-testid="tweetPhoto"] img, a[href*="/photo/"] img, img[src*="pbs.twimg.com/media/"]');
    }
    for (const image of images) {
      if (hasVideo && image.closest?.('[data-testid="videoPlayer"], [data-testid="videoComponent"]')) continue;
      const url = mediaUrl(image.currentSrc || image.src, 'image');
      if (!url || !/\/media\//i.test(new URL(url).pathname) || seen.has(url)) continue;
      seen.add(url);
      media.push({ kind: 'image', url });
      if (photoRoute || media.length >= 10) break;
    }

    const video = own('video')[0];
    if (hasVideo && media.length < 10) {
      const candidates = video
        ? [video.currentSrc, video.src, ...Array.from(video.querySelectorAll('source'), source => source.src)]
        : [];
      const url = candidates.map(candidate => mediaUrl(candidate, 'video')).find(Boolean) || '';
      const posterCandidates = [
        video?.poster,
        ...own('[data-testid="videoPlayer"] img, [data-testid="videoComponent"] img').map(image => image.currentSrc || image.src)
      ];
      const hint = xMediaHint(url) || posterCandidates.map(xMediaHint).find(Boolean) || '';
      if (!media.some(item => item.kind === 'video')) media.push({ kind: 'video', url, hint });
    }

    return { id: post.id, url: post.url, text, author, createdAt: time, media };
  }

  function setButtonState(button, state, message) {
    button.dataset.state = state;
    button.disabled = state === 'saving';
    const labels = { saved: 'Edit saved post folders', saving: 'Saving post…', partial: 'Refresh saved media links', idle: 'Save post' };
    const paths = {
      saved: '<path d="M4 6h16v12H4zM4 14h4l2 3h4l2-3h4"/><path d="m9 11 2 2 4-4"/>',
      saving: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
      partial: '<path d="M20 11a8 8 0 1 0 1 4"/><path d="M20 6v5h-5"/>',
      idle: '<path d="M4 6h16v12H4zM4 14h4l2 3h4l2-3h4"/>'
    };
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[state] || paths.idle}</svg><span>SAVE</span>`;
    button.title = message || labels[state] || labels.idle;
    button.setAttribute('aria-label', button.title);
  }

  function savedFolderIds(post) {
    if (Array.isArray(post?.folderIds)) return post.folderIds;
    return typeof post?.folderId === 'string' && post.folderId ? [post.folderId] : [];
  }

  async function chooseFolder(initialFolderIds = [], canDelete = false) {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'get-saved-folders', platform: 'x' });
      if (!result?.success) return '';
      return await new Promise(resolve => {
        const host = document.createElement('div');
        host.className = 'nor1c-save-folder-modal-host';
        const shadow = host.attachShadow({ mode: 'closed' });
        shadow.innerHTML = `<style>
          :host { all: initial; }
          .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px; overflow: hidden; overscroll-behavior: none; background: rgba(15, 20, 25, .42); font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          line-height: 1.45; }
          .modal { width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 24px); overflow: hidden; padding: 20px; border-radius: 16px; background: #fff; color: #0f1419; box-shadow: 0 18px 50px rgba(0,0,0,.25); }
          h2 { margin: 0 0 4px; font-size: 19px; } p { margin: 0 0 12px; color: #536471; font-size: 13px; }
          .folders { display: grid; gap: 3px; max-height: min(680px, calc(100vh - 210px)); overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; padding: 4px; border: 1px solid #e5eaed; border-radius: 10px; background: #f7f9fa; }
          .folder { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 30px; padding: 3px 10px; border: 1px solid #cfd9de; border-radius: 6px; background: #fff; color: #0f1419; text-align: left; font: inherit; font-size: 14px; cursor: pointer; }
          .folder-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .folder-count { flex: 0 0 auto; min-width: 24px; padding: 1px 6px; border-radius: 999px; background: #eef3f5; color: #536471; font-size: 12px; font-weight: 700; line-height: 1.3; text-align: center; }
          .folder:hover, .folder.selected { border-color: #1d9bf0; background: #eff7ff; }
          .new-folder { display: flex; gap: 8px; margin-top: 12px; } input { min-width: 0; flex: 1; height: 36px; padding: 0 10px; border: 1px solid #cfd9de; border-radius: 8px; font: inherit; } button { height: 36px; padding: 0 13px; border: 1px solid #cfd9de; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; } button.primary { border-color: #1d9bf0; background: #1d9bf0; color: #fff; } button:hover { background: #eff3f4; } button.primary:hover { background: #1a8cd8; }
          .actions { display: flex; align-items: center; gap: 8px; margin-top: 16px; } .actions .cancel { margin-left: auto; }
          button.delete-all { border-color: #f0b4b4; color: #b42318; } button.delete-all:hover { border-color: #e48787; background: #fff1f1; }
        </style><div class="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="nor1c-folder-title"><h2 id="nor1c-folder-title">Save post</h2><p>Choose one or more folders for this saved post.</p><div class="folders"><button type="button" class="folder" data-id="" aria-pressed="false">No folder</button></div><div class="new-folder"><input maxlength="60" placeholder="New folder name" aria-label="New folder name"><button type="button" class="create">Create</button></div><div class="actions"><button type="button" class="delete-all">Delete from all folders</button><button type="button" class="cancel">Cancel</button><button type="button" class="primary confirm">Save</button></div></section></div>`;
        document.documentElement.appendChild(host);
        const foldersEl = shadow.querySelector('.folders');
        const input = shadow.querySelector('input');
        const allowedIds = new Set((result.folders || []).map(folder => folder.id));
        const selectedIds = new Set(initialFolderIds.filter(id => allowedIds.has(id)));
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
          node?.classList.toggle('selected', selectedIds.size === 0);
          node?.setAttribute('aria-pressed', String(selectedIds.size === 0));
        };
        const toggleFolder = (id, node) => {
          if (!id) {
            selectedIds.clear();
            foldersEl.querySelectorAll('.folder[data-id]:not([data-id=""])').forEach(item => { item.classList.remove('selected'); item.setAttribute('aria-pressed', 'false'); });
          } else if (selectedIds.has(id)) {
            selectedIds.delete(id);
            node.classList.remove('selected');
          } else {
            selectedIds.add(id);
            node.classList.add('selected');
          }
          syncNoFolder();
        };
        const noFolder = foldersEl.querySelector('.folder');
        noFolder.addEventListener('click', () => toggleFolder('', noFolder));
        const folders = [...(result.folders || [])].sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0));
        for (const folder of folders) { const node = document.createElement('button'); node.type = 'button'; node.className = 'folder'; node.dataset.id = folder.id; node.innerHTML = `<span class="folder-name"></span><span class="folder-count">${Number(folder.itemCount) || 0}</span>`; node.querySelector('.folder-name').textContent = folder.name; node.classList.toggle('selected', selectedIds.has(folder.id)); node.setAttribute('aria-pressed', String(selectedIds.has(folder.id))); node.addEventListener('click', () => { toggleFolder(folder.id, node); node.setAttribute('aria-pressed', String(selectedIds.has(folder.id))); }); foldersEl.appendChild(node); }
        syncNoFolder();
        shadow.querySelector('.create').addEventListener('click', async () => { const name = input.value.trim(); if (!name) return input.focus(); const created = await chrome.runtime.sendMessage({ type: 'create-saved-folder', name, platform: 'x' }); if (!created?.success) return; const node = document.createElement('button'); node.type = 'button'; node.className = 'folder'; node.dataset.id = created.folder.id; node.innerHTML = '<span class="folder-name"></span><span class="folder-count">0</span>'; node.querySelector('.folder-name').textContent = created.folder.name; node.setAttribute('aria-pressed', 'true'); node.addEventListener('click', () => { toggleFolder(created.folder.id, node); node.setAttribute('aria-pressed', String(selectedIds.has(created.folder.id))); }); foldersEl.appendChild(node); toggleFolder(created.folder.id, node); input.value = ''; });
        shadow.querySelector('.confirm').addEventListener('click', () => finish({ action: 'save', folderIds: Array.from(selectedIds) }));
        deleteAll.addEventListener('click', () => finish({ action: 'delete' }));
        shadow.querySelector('.cancel').addEventListener('click', () => finish(null));
        shadow.querySelector('.backdrop').addEventListener('click', event => { if (event.target === event.currentTarget) finish(null); });
        host.addEventListener('keydown', event => {
          event.stopPropagation();
          if (event.key === 'Escape') finish(null);
        }, true);
        host.addEventListener('keypress', event => event.stopPropagation(), true);
        host.addEventListener('keyup', event => event.stopPropagation(), true);
        shadow.querySelector('.folder').focus();
        shadow.querySelector('.backdrop').addEventListener('wheel', event => {
          if (!event.target.closest('.folders')) event.preventDefault();
        }, { passive: false });
      });
    } catch (_) { return ''; }
  }

  function updateButtons() {
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => {
      if (button.dataset.state === 'saving') return;
      const status = savedPosts.get(button.dataset.postId)?.status;
      if (status === 'partial') setButtonState(button, 'partial');
      else if (status === 'complete') setButtonState(button, 'saved');
      else setButtonState(button, 'idle');
    });
  }

  function actionSlot(article) {
    const reply = Array.from(article.querySelectorAll('[data-testid="reply"]'))
      .find(node => node.closest('article') === article);
    const toolbar = reply?.closest('[role="group"]');
    if (!toolbar || toolbar.closest('article') !== article) return null;
    const bookmark = Array.from(toolbar.querySelectorAll('[data-testid="bookmark"], [data-testid="removeBookmark"]'))[0];
    if (!bookmark) return null;
    let slot = bookmark;
    while (slot.parentElement && slot.parentElement !== toolbar) slot = slot.parentElement;
    return slot.parentElement === toolbar ? slot : null;
  }

  function addButton(article) {
    const existing = Array.from(article.querySelectorAll(`.${BUTTON_CLASS}`))
      .find(button => button.closest('article') === article);
    const slot = actionSlot(article);
    const post = findPost(article);
    if (!post || !slot) {
      existing?.closest('.nor1c-save-x-post-wrapper')?.remove();
      return;
    }
    if (existing?.dataset.postId === post.id && existing.closest('.nor1c-save-x-post-wrapper')?.previousElementSibling === slot) return;
    existing?.closest('.nor1c-save-x-post-wrapper')?.remove();

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.dataset.postId = post.id;
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const previousState = button.dataset.state;
      const savedPost = savedPosts.get(post.id);
      const retry = previousState === 'partial';
      try {
        const selection = await chooseFolder(savedFolderIds(savedPost), Boolean(savedPost));
        if (selection === null) return;
        setButtonState(button, 'saving');
        const response = selection.action === 'delete'
          ? await chrome.runtime.sendMessage({ type: 'remove-x-post', id: post.id })
          : await (async () => {
            const payload = collectPost(article, post);
            payload.folderIds = selection.folderIds;
            return chrome.runtime.sendMessage({ type: 'save-x-post', post: payload, retry });
          })();
        if (!response || !response.success) throw new Error(response?.error || 'Could not save this post.');
        if (selection.action === 'delete') {
          savedPosts.delete(post.id);
          setButtonState(button, 'idle', 'Save post link to Nor1c Suite');
        } else {
          savedPosts.set(post.id, response.post);
          if (response.post.status === 'complete') setButtonState(button, 'saved', 'Edit saved post folders');
          else setButtonState(button, 'partial', response.post.error || 'Some media links are unavailable. Select to refresh.');
        }
      } catch (error) {
        setButtonState(button, savedPost?.status === 'complete' ? 'saved' : retry ? 'partial' : 'idle', error instanceof Error ? error.message : 'Could not save this post.');
      }
    });

    const status = savedPosts.get(post.id)?.status;
    setButtonState(button, status === 'partial' ? 'partial' : status === 'complete' ? 'saved' : 'idle');
    const wrapper = document.createElement('div');
    wrapper.className = 'nor1c-save-x-post-wrapper';
    wrapper.appendChild(button);
    slot.after(wrapper);
  }

  function scan() {
    document.querySelectorAll('article').forEach(addButton);
  }

  const pendingArticles = new Set();
  let scanScheduled = false;
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const article = record.target.closest('article');
        if (article) pendingArticles.add(article);
        continue;
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('article')) pendingArticles.add(node);
        node.querySelectorAll('article').forEach(article => pendingArticles.add(article));
        const parentArticle = node.closest('article');
        if (parentArticle) pendingArticles.add(parentArticle);
      }
    }
    if (scanScheduled || pendingArticles.size === 0) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      for (const article of pendingArticles) addButton(article);
      pendingArticles.clear();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  scan();
})();
