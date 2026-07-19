(function() {
  const searchInput = document.getElementById('search-input');
  const tabList = document.getElementById('tab-list');
  const noResults = document.getElementById('no-results');


  function closeSwitcher() {
    if (window !== window.top) {
      window.parent.postMessage({ type: 'close-tab-switcher' }, chrome.runtime.getURL(''));
    } else {
      window.close();
    }
  }


  let allTabs = [];
  let filteredTabs = [];
  let selectedIndex = 0;
  let renderRafId = null;

  async function loadTabs() {
    const tabs = await chrome.tabs.query({});
    const currentWindowId = (await chrome.windows.getCurrent()).id;
    allTabs = tabs.map(function(tab) {
      let hostname = '';
      try { hostname = new URL(tab.url).hostname; } catch (_) {}
      return {
        id: tab.id,
        title: tab.title || 'Untitled',
        url: tab.url || '',
        hostname: hostname,
        favIconUrl: tab.favIconUrl || '',
        windowId: tab.windowId,
        lastAccessed: tab.lastAccessed || 0,
        active: tab.active,
        isCurrentWindow: tab.windowId === currentWindowId
      };
    });

    allTabs.sort(function(a, b) {
      if (a.active && a.isCurrentWindow) return -1;
      if (b.active && b.isCurrentWindow) return 1;
      if (a.isCurrentWindow && !b.isCurrentWindow) return -1;
      if (!a.isCurrentWindow && b.isCurrentWindow) return 1;
      return b.lastAccessed - a.lastAccessed;
    });

    filterTabs();
  }

  function fuzzyMatch(text, query) {
    if (!query) return true;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    if (lowerText.includes(lowerQuery)) return true;
    let qi = 0;
    for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
      if (lowerText[ti] === lowerQuery[qi]) qi++;
    }
    return qi === lowerQuery.length;
  }

  function filterTabs() {
    const query = searchInput.value.trim();
    filteredTabs = allTabs.filter(function(tab) {
      return fuzzyMatch(tab.title + ' ' + tab.url + ' ' + tab.hostname, query);
    });
    selectedIndex = 0;
    if (renderRafId) cancelAnimationFrame(renderRafId);
    renderRafId = requestAnimationFrame(render);
  }

  function render() {
    tabList.innerHTML = '';
    noResults.style.display = filteredTabs.length === 0 ? '' : 'none';

    if (filteredTabs.length === 0) return;

    for (let i = 0; i < filteredTabs.length; i++) {
      const tab = filteredTabs[i];
      const row = document.createElement('div');
      row.className = 'tab-row' + (i === selectedIndex ? ' selected' : '');
      row.setAttribute('data-index', i);

      if (tab.favIconUrl) {
        const img = document.createElement('img');
        img.className = 'tab-favicon';
        img.src = tab.favIconUrl;
        img.alt = '';
        img.onerror = function() { img.style.display = 'none'; };
        row.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'tab-favicon-placeholder';
        placeholder.textContent = tab.hostname.charAt(0).toUpperCase();
        row.appendChild(placeholder);
      }

      const info = document.createElement('div');
      info.className = 'tab-info';

      const title = document.createElement('div');
      title.className = 'tab-title';
      title.textContent = tab.title;

      const url = document.createElement('div');
      url.className = 'tab-url';
      url.textContent = (tab.isCurrentWindow ? '' : '[Other Window] ') + tab.url;

      info.appendChild(title);
      info.appendChild(url);
      row.appendChild(info);

      row.addEventListener('click', function() { switchToTab(i); });
      row.addEventListener('mouseenter', function() {
        selectedIndex = i;
        updateSelection();
      });

      tabList.appendChild(row);
    }

    scrollToSelected();
  }

  function updateSelection() {
    const rows = tabList.querySelectorAll('.tab-row');
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('selected', i === selectedIndex);
    }
    scrollToSelected();
  }

  function scrollToSelected() {
    const selected = tabList.querySelector('.tab-row.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  function switchToTab(index) {
    const tab = filteredTabs[index];
    if (!tab) return;
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
    closeSwitcher();
  }

  searchInput.addEventListener('input', filterTabs);

  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredTabs.length === 0) return;
      selectedIndex = (selectedIndex + 1) % filteredTabs.length;
      updateSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredTabs.length === 0) return;
      selectedIndex = (selectedIndex - 1 + filteredTabs.length) % filteredTabs.length;
      updateSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      switchToTab(selectedIndex);
    } else if (e.key === 'Escape') {
      closeSwitcher();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeSwitcher();
    }
  });

  loadTabs();

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'focus-input') {
      searchInput.focus();
    }
  });

  searchInput.focus();
  setTimeout(function() { searchInput.focus(); }, 100);
})();
