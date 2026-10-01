(function () {
  const SAVED_POSTS_KEY = 'savedXPosts';
  const BUTTON_CLASS = 'nor1c-save-x-post';
  const savedPosts = new Map();

  chrome.storage.local.get({ [SAVED_POSTS_KEY]: [] }).then(result => {
    for (const post of result[SAVED_POSTS_KEY] || []) savedPosts.set(post.id, post.status);
    updateButtons();
  }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SAVED_POSTS_KEY]) return;
    savedPosts.clear();
    for (const post of changes[SAVED_POSTS_KEY].newValue || []) savedPosts.set(post.id, post.status);
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
    for (const image of own('[data-testid="tweetPhoto"] img')) {
      if (hasVideo && image.closest('[data-testid="videoPlayer"], [data-testid="videoComponent"]')) continue;
      const url = mediaUrl(image.currentSrc || image.src, 'image');
      if (!url || seen.has(url)) continue;
      seen.add(url);
      media.push({ kind: 'image', url });
      if (media.length >= 10) break;
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
    const labels = { saved: 'Remove saved post', saving: 'Saving post…', partial: 'Retry saving media', idle: 'Save post' };
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

  async function chooseFolder() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'get-saved-folders' });
      if (!result?.success) return '';
      return await new Promise(resolve => {
        const host = document.createElement('div');
        host.className = 'nor1c-save-folder-modal-host';
        const shadow = host.attachShadow({ mode: 'closed' });
        shadow.innerHTML = `<style>
          :host { all: initial; }
          .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px; background: rgba(15, 20, 25, .42); font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          line-height: 1.45; }
          .modal { width: min(380px, calc(100vw - 32px)); padding: 20px; border-radius: 16px; background: #fff; color: #0f1419; box-shadow: 0 18px 50px rgba(0,0,0,.25); }
          h2 { margin: 0 0 6px; font-size: 19px; } p { margin: 0 0 14px; color: #536471; font-size: 13px; }
          .folders { display: grid; gap: 6px; max-height: 230px; overflow: auto; }
          .folder { width: 100%; min-height: 42px; padding: 9px 12px; border: 1px solid #cfd9de; border-radius: 9px; background: #fff; color: #0f1419; text-align: left; font: inherit; font-size: 14px; cursor: pointer; }
          .folder:hover, .folder.selected { border-color: #1d9bf0; background: #eff7ff; }
          .new-folder { display: flex; gap: 8px; margin-top: 12px; } input { min-width: 0; flex: 1; height: 36px; padding: 0 10px; border: 1px solid #cfd9de; border-radius: 8px; font: inherit; } button { height: 36px; padding: 0 13px; border: 1px solid #cfd9de; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; } button.primary { border-color: #1d9bf0; background: #1d9bf0; color: #fff; } button:hover { background: #eff3f4; } button.primary:hover { background: #1a8cd8; }
          .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
        </style><div class="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="nor1c-folder-title"><h2 id="nor1c-folder-title">Save post</h2><p>Choose a folder for this saved post.</p><div class="folders"><button type="button" class="folder selected" data-id="">No folder</button></div><div class="new-folder"><input maxlength="60" placeholder="New folder name" aria-label="New folder name"><button type="button" class="create">Create</button></div><div class="actions"><button type="button" class="cancel">Cancel</button><button type="button" class="primary confirm">Save</button></div></section></div>`;
        document.documentElement.appendChild(host);
        const foldersEl = shadow.querySelector('.folders');
        const input = shadow.querySelector('input');
        let selectedId = '';
        let settled = false;
        const finish = value => { if (settled) return; settled = true; host.remove(); resolve(value); };
        const selectFolder = (id, node) => { selectedId = id; foldersEl.querySelectorAll('.folder').forEach(item => item.classList.remove('selected')); node.classList.add('selected'); };
        const noFolder = foldersEl.querySelector('.folder');
        noFolder.addEventListener('click', () => selectFolder('', noFolder));
        for (const folder of result.folders || []) { const node = document.createElement('button'); node.type = 'button'; node.className = 'folder'; node.dataset.id = folder.id; node.textContent = folder.name; node.addEventListener('click', () => selectFolder(folder.id, node)); foldersEl.appendChild(node); }
        shadow.querySelector('.create').addEventListener('click', async () => { const name = input.value.trim(); if (!name) return input.focus(); const created = await chrome.runtime.sendMessage({ type: 'create-saved-folder', name }); if (!created?.success) return; const node = document.createElement('button'); node.type = 'button'; node.className = 'folder'; node.dataset.id = created.folder.id; node.textContent = created.folder.name; node.addEventListener('click', () => selectFolder(created.folder.id, node)); foldersEl.appendChild(node); selectFolder(created.folder.id, node); input.value = ''; });
        shadow.querySelector('.confirm').addEventListener('click', () => finish(selectedId));
        shadow.querySelector('.cancel').addEventListener('click', () => finish(null));
        shadow.querySelector('.backdrop').addEventListener('click', event => { if (event.target === event.currentTarget) finish(null); });
        host.addEventListener('keydown', event => {
          event.stopPropagation();
          if (event.key === 'Escape') finish(null);
        }, true);
        host.addEventListener('keypress', event => event.stopPropagation(), true);
        host.addEventListener('keyup', event => event.stopPropagation(), true);
        shadow.querySelector('.folder').focus();
      });
    } catch (_) { return ''; }
  }

  function updateButtons() {
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => {
      if (button.dataset.state === 'saving') return;
      const status = savedPosts.get(button.dataset.postId);
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
      const isSaved = previousState === 'saved';
      const retry = previousState === 'partial';
      if (isSaved) setButtonState(button, 'saving');
      try {
        const response = isSaved
          ? await chrome.runtime.sendMessage({ type: 'remove-x-post', id: post.id })
          : await (async () => {
            const payload = collectPost(article, post);
            const folderId = await chooseFolder();
            if (folderId === null) return { cancelled: true };
            setButtonState(button, 'saving');
            payload.folderId = folderId;
            return chrome.runtime.sendMessage({ type: 'save-x-post', post: payload, retry });
          })();
        if (response?.cancelled) {
          setButtonState(button, 'idle');
          return;
        }
        if (!response || !response.success) throw new Error(response?.error || 'Could not save this post.');
        if (isSaved) {
          savedPosts.delete(post.id);
          setButtonState(button, 'idle', 'Save post and media to Nor1c Suite');
        } else {
          savedPosts.set(post.id, response.post.status);
          if (response.post.status === 'complete') setButtonState(button, 'saved', 'Remove saved post');
          else setButtonState(button, 'partial', response.post.error || 'Some media could not be saved. Select to retry.');
        }
      } catch (error) {
        setButtonState(button, 'idle', error instanceof Error ? error.message : 'Could not save this post.');
      }
    });

    const status = savedPosts.get(post.id);
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
