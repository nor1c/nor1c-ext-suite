const RULES_STORAGE_KEY = 'websiteBlockerRules';
const SCHEDULE_STORAGE_KEY = 'websiteBlockerSchedule';
const DEFAULT_SCHEDULE = { start: '09:00', end: '17:00' };

function generateId() {
  return 'wb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function parseDomain(raw) {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').split('/')[0];
  s = s.split(':')[0];
  return s.replace(/^www\./, '');
}

function isValidDomain(value) {
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(value) ||
    value === 'localhost' ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

async function loadSettings() {
  const result = await chrome.storage.sync.get([RULES_STORAGE_KEY, SCHEDULE_STORAGE_KEY]);
  const storedRules = Array.isArray(result[RULES_STORAGE_KEY]) ? result[RULES_STORAGE_KEY] : [];
  const schedule = result[SCHEDULE_STORAGE_KEY] || {
    start: storedRules[0] && storedRules[0].start || DEFAULT_SCHEDULE.start,
    end: storedRules[0] && storedRules[0].end || DEFAULT_SCHEDULE.end
  };
  const rules = storedRules.map(rule => ({
    id: rule.id || generateId(),
    domain: rule.domain,
    enabled: rule.enabled !== false
  }));

  if (!result[SCHEDULE_STORAGE_KEY] || storedRules.some(rule => 'start' in rule || 'end' in rule)) {
    await chrome.storage.sync.set({
      [RULES_STORAGE_KEY]: rules,
      [SCHEDULE_STORAGE_KEY]: schedule
    });
  }

  return { rules, schedule };
}

async function loadRules() {
  return (await loadSettings()).rules;
}

async function saveRules(rules) {
  await chrome.storage.sync.set({ [RULES_STORAGE_KEY]: rules });
}

async function saveSchedule(schedule) {
  await chrome.storage.sync.set({ [SCHEDULE_STORAGE_KEY]: schedule });
}

function renderRules(rules) {
  const list = document.getElementById('rules-list');
  const count = document.getElementById('rules-count');
  count.textContent = rules.length;
  list.innerHTML = '';

  if (rules.length === 0) {
    const empty = document.createElement('p');
    empty.id = 'rules-empty';
    empty.className = 'empty-msg';
    empty.textContent = 'No blocked websites yet.';
    list.appendChild(empty);
    return;
  }

  for (const rule of rules) {
    const item = document.createElement('div');
    item.className = 'rule-item' + (rule.enabled ? '' : ' inactive');
    item.dataset.id = rule.id;

    const domainEl = document.createElement('span');
    domainEl.className = 'rule-domain';
    domainEl.textContent = rule.domain;
    domainEl.title = rule.domain;

    const toggle = document.createElement('label');
    toggle.className = 'switch';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.setAttribute('aria-label', `Toggle ${rule.domain}`);
    checkbox.addEventListener('change', async () => toggleRule(rule.id, checkbox.checked));
    const slider = document.createElement('span');
    slider.className = 'slider';
    toggle.appendChild(checkbox);
    toggle.appendChild(slider);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Delete website';
    deleteBtn.setAttribute('aria-label', `Delete ${rule.domain}`);
    deleteBtn.addEventListener('click', async () => deleteRule(rule.id));

    item.appendChild(domainEl);
    item.appendChild(toggle);
    item.appendChild(deleteBtn);
    list.appendChild(item);
  }
}

async function toggleRule(id, enabled) {
  const rules = await loadRules();
  const rule = rules.find(item => item.id === id);
  if (!rule) return;
  rule.enabled = enabled;
  await saveRules(rules);
  renderRules(rules);
}

async function deleteRule(id) {
  const rules = (await loadRules()).filter(rule => rule.id !== id);
  await saveRules(rules);
  renderRules(rules);
}

async function addRule(domain) {
  const parsed = parseDomain(domain);
  if (!parsed || !isValidDomain(parsed)) {
    throw new Error('Please enter a valid domain (e.g. facebook.com)');
  }

  const rules = await loadRules();
  if (rules.some(rule => rule.domain === parsed)) {
    throw new Error(`"${parsed}" already exists.`);
  }

  rules.push({ id: generateId(), domain: parsed, enabled: true });
  await saveRules(rules);
  renderRules(rules);
}

async function addCurrentSite() {
  const domainInput = document.getElementById('domain-input');
  const errorEl = document.getElementById('add-error');

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.url) throw new Error('Could not get current site.');

    let hostname;
    try {
      hostname = new URL(tab.url).hostname;
    } catch (_) {
      throw new Error('Current page has an invalid URL.');
    }

    domainInput.value = nor1cGetDomain(hostname);
    errorEl.style.display = 'none';
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = '';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const { rules, schedule } = await loadSettings();
  renderRules(rules);

  const startInput = document.getElementById('blocked-start');
  const endInput = document.getElementById('blocked-end');
  const domainInput = document.getElementById('domain-input');
  const errorEl = document.getElementById('add-error');
  startInput.value = schedule.start;
  endInput.value = schedule.end;

  async function updateSchedule() {
    if (!startInput.value || !endInput.value) return;
    await saveSchedule({ start: startInput.value, end: endInput.value });
  }

  startInput.addEventListener('change', updateSchedule);
  endInput.addEventListener('change', updateSchedule);
  document.getElementById('add-current-btn').addEventListener('click', addCurrentSite);
  document.getElementById('add-btn').addEventListener('click', async () => {
    if (!domainInput.value.trim()) {
      errorEl.textContent = 'Please enter a domain.';
      errorEl.style.display = '';
      return;
    }

    try {
      await addRule(domainInput.value);
      domainInput.value = '';
      errorEl.style.display = 'none';
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = '';
    }
  });

  domainInput.addEventListener('keypress', event => {
    if (event.key === 'Enter') document.getElementById('add-btn').click();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes[RULES_STORAGE_KEY]) renderRules(changes[RULES_STORAGE_KEY].newValue || []);
    if (changes[SCHEDULE_STORAGE_KEY]) {
      const next = changes[SCHEDULE_STORAGE_KEY].newValue || DEFAULT_SCHEDULE;
      startInput.value = next.start;
      endInput.value = next.end;
    }
  });
});
