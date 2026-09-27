const RULES_STORAGE_KEY = 'websiteBlockerRules';
const SCHEDULE_STORAGE_KEY = 'websiteBlockerSchedule';
const CHALLENGE_STORAGE_KEY = 'websiteBlockerChallengeEnabled';
const DEFAULT_SCHEDULE = { start: '09:00', end: '17:00' };
const CHALLENGE_LENGTH = 3;
let settingsChangePending = false;

function createChallengeQuestion() {
  const random = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const a = random(12, 79);
  const b = random(12, 49);
  const c = random(11, 39);
  const d = random(11, 29);
  const e = random(100, Math.min(499, a * b + c * d - 1));
  return { text: `(${a} × ${b}) + (${c} × ${d}) − ${e}`, answer: a * b + c * d - e };
}

function createChallengeSession() {
  return {
    correct: 0,
    question: createChallengeQuestion(),
    submit(value) {
      if (!/^-?\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) return 'invalid';
      if (Number(value) !== this.question.answer) {
        this.correct = 0;
        this.question = createChallengeQuestion();
        return 'wrong';
      }
      this.correct += 1;
      if (this.correct === CHALLENGE_LENGTH) return 'complete';
      this.question = createChallengeQuestion();
      return 'next';
    }
  };
}

function requestChallenge(action) {
  const dialog = document.getElementById('unblock-challenge');
  const form = document.getElementById('challenge-form');
  const answer = document.getElementById('challenge-answer');
  const progress = document.getElementById('challenge-progress');
  const error = document.getElementById('challenge-error');
  const cancel = document.getElementById('challenge-cancel');
  const session = createChallengeSession();
  document.getElementById('challenge-action').textContent = action;

  function renderQuestion() {
    progress.textContent = `Question ${session.correct + 1} of ${CHALLENGE_LENGTH}`;
    document.getElementById('challenge-question').textContent = session.question.text;
    answer.value = '';
    answer.focus();
  }

  return new Promise(resolve => {
    let settled = false;
    function finish(approved) {
      if (settled) return;
      settled = true;
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', cancelChallenge);
      dialog.removeEventListener('cancel', cancelChallenge);
      dialog.removeEventListener('close', cancelChallenge);
      dialog.close();
      resolve(approved);
    }
    function cancelChallenge(event) {
      event.preventDefault();
      finish(false);
    }
    function submit(event) {
      event.preventDefault();
      const result = session.submit(answer.value);
      if (result === 'complete') {
        finish(true);
        return;
      }
      error.textContent = result === 'wrong'
        ? 'Incorrect. Progress reset — start again with a new question.'
        : result === 'invalid' ? 'Enter a whole number, without spaces or separators.' : '';
      if (result !== 'invalid') renderQuestion();
      else answer.focus();
    }
    form.addEventListener('submit', submit);
    cancel.addEventListener('click', cancelChallenge);
    dialog.addEventListener('cancel', cancelChallenge);
    dialog.addEventListener('close', cancelChallenge);
    error.textContent = '';
    dialog.showModal();
    renderQuestion();
  });
}

function renderSettings(settings) {
  renderRules(settings.rules);
  document.getElementById('blocked-start').value = settings.schedule.start;
  document.getElementById('blocked-end').value = settings.schedule.end;
  document.getElementById('challenge-enabled').checked = settings.challengeEnabled;
}

async function runSettingsChange(action, needsChallenge, apply) {
  if (settingsChangePending) return;
  settingsChangePending = true;
  const controls = document.getElementById('blocker-settings');
  const error = document.getElementById('settings-error');
  const active = document.activeElement;
  const activeRuleId = active?.closest('.rule-item')?.dataset.id;
  controls.disabled = true;
  error.textContent = '';
  try {
    let settings = await loadSettings();
    if (settings.challengeEnabled && needsChallenge(settings)) {
      if (!await requestChallenge(action)) return;
      // Another panel may have changed the list while the quiz was open.
      settings = await loadSettings();
    }
    await apply(settings);
  } catch (failure) {
    error.textContent = `Could not save settings: ${failure.message}`;
  } finally {
    try {
      renderSettings(await loadSettings());
    } catch (_) {
      error.textContent = 'Could not reload settings. Reopen this panel to try again.';
    }
    controls.disabled = false;
    settingsChangePending = false;
    // The rule list is rebuilt, so the original focused control may no longer exist.
    if (activeRuleId) {
      const item = Array.from(document.getElementById('rules-list').children)
        .find(element => element.dataset.id === activeRuleId);
      const target = item?.querySelector(active.tagName === 'BUTTON' ? 'button' : 'input');
      (target || document.getElementById('domain-input')).focus();
    } else if (active?.isConnected) {
      active.focus();
    }
  }
}

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
  const result = await chrome.storage.sync.get([RULES_STORAGE_KEY, SCHEDULE_STORAGE_KEY, CHALLENGE_STORAGE_KEY]);
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

  return { rules, schedule, challengeEnabled: result[CHALLENGE_STORAGE_KEY] === true };
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
    checkbox.addEventListener('change', () => {
      const enabled = checkbox.checked;
      checkbox.checked = rule.enabled;
      toggleRule(rule.id, enabled);
    });
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
  await runSettingsChange('Disable blocking for this website',
    settings => !enabled && settings.rules.some(rule => rule.id === id && rule.enabled),
    async settings => {
      const rule = settings.rules.find(item => item.id === id);
      if (!rule) return;
      rule.enabled = enabled;
      await saveRules(settings.rules);
    });
}

async function deleteRule(id) {
  await runSettingsChange('Remove this website from the block list',
    settings => settings.rules.some(rule => rule.id === id),
    settings => saveRules(settings.rules.filter(rule => rule.id !== id)));
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
  renderSettings(await loadSettings());

  const startInput = document.getElementById('blocked-start');
  const endInput = document.getElementById('blocked-end');
  const domainInput = document.getElementById('domain-input');
  const errorEl = document.getElementById('add-error');
  const challengeToggle = document.getElementById('challenge-enabled');

  document.getElementById('save-schedule-btn').addEventListener('click', async () => {
    if (!startInput.value || !endInput.value) return;
    const schedule = { start: startInput.value, end: endInput.value };
    await runSettingsChange('Change the blocking schedule',
      settings => settings.schedule.start !== schedule.start || settings.schedule.end !== schedule.end,
      () => saveSchedule(schedule));
  });

  challengeToggle.addEventListener('change', async () => {
    const enabled = challengeToggle.checked;
    challengeToggle.checked = !enabled;
    await runSettingsChange('Turn off challenge protection', () => !enabled,
      () => chrome.storage.sync.set({ [CHALLENGE_STORAGE_KEY]: enabled }));
  });
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
    if (changes[CHALLENGE_STORAGE_KEY]) {
      challengeToggle.checked = changes[CHALLENGE_STORAGE_KEY].newValue === true;
    }
  });
});
