const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const panelSource = fs.readFileSync(path.join(root, 'src', 'website-blocker-panel.js'), 'utf8');

function createElement(tagName = 'div') {
  return {
    tagName,
    children: [],
    dataset: {},
    style: {},
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    setAttribute(name, value) { this[name] = value; },
    set innerHTML(value) { this.children = []; this._innerHTML = value; },
    get innerHTML() { return this._innerHTML || ''; }
  };
}

test('website blocker renders the first rule after clearing the empty state', () => {
  const list = createElement();
  list.querySelectorAll = () => [];
  const count = createElement('span');
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (id === 'rules-list') return list;
      if (id === 'rules-count') return count;
      return null;
    },
    createElement
  };

  const context = { document, chrome: {}, URL, Math, Date, parseInt };
  vm.runInNewContext(`${panelSource}\nrenderRules([{ id: '1', domain: 'example.com', enabled: true }]);`, context);

  assert.equal(count.textContent, 1);
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].dataset.id, '1');
  assert.equal(list.children[0].children.length, 3);
});

test('website blocker keeps one schedule separate from website list', () => {
  assert.match(panelSource, /const SCHEDULE_STORAGE_KEY = 'websiteBlockerSchedule'/);
  assert.match(panelSource, /rules\.push\(\{ id: generateId\(\), domain: parsed, enabled: true \}\)/);
  assert.doesNotMatch(panelSource, /rules\.push\([^\n]+start/);
});
