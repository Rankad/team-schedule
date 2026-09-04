// Headless smoke test for the manager app (public/manager.html + manager.js).
//
//   node tests/manager_smoke.js
//
// Needs Node only (no npm packages). Builds a tiny fake DOM, loads the real
// public/manager.js against a stubbed fetch (both the authenticated
// /api/manager/* endpoints and the public data/*.json files), drives the
// login + dashboard + settings flows, and asserts the visible output.

const path = require('path');
const ROOT = path.join(__dirname, '..');

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ok   ' + msg); }
  else { console.log('  FAIL ' + msg); failures++; }
}

// ---------- fake "today" ----------
const RealDate = Date;
let FAKE_NOW = new RealDate(2026, 8, 10, 12, 0, 0).getTime(); // 2026-09-10 local noon (Thursday)
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FAKE_NOW);
    else super(...args);
  }
  static now() { return FAKE_NOW; }
}
global.Date = FakeDate;

// ---------- minimal DOM ----------
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = []; this.parentNode = null;
    this._text = ''; this.attrs = {}; this.style = {};
    this.hidden = false; this._listeners = {};
    this.classList = {
      _s: new Set(),
      add: (...c) => c.forEach(x => this.classList._s.add(x)),
      remove: (...c) => c.forEach(x => this.classList._s.delete(x)),
      toggle: (c, on) => { if (on === undefined) on = !this.classList._s.has(c); on ? this.classList._s.add(c) : this.classList._s.delete(c); return on; },
      contains: (c) => this.classList._s.has(c),
    };
  }
  set className(v) { this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classList._s].join(' '); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this.children.length ? this.children.map(c => c.textContent).join('') : this._text; }
  set innerHTML(v) { if (v === '') { this.children = []; this._text = ''; } }
  get innerHTML() { return ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = v; }
  getAttribute(k) { return this.attrs[k] != null ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i !== -1) this.children.splice(i, 1); c.parentNode = null; return c; }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  dispatch(t) { (this._listeners[t] || []).forEach(fn => fn.call(this, { target: this })); }
  click() { this.dispatch('click'); }
  focus() {}
  // <dialog> shims
  showModal() { this._open = true; this.setAttribute('open', ''); }
  show() { this._open = true; this.setAttribute('open', ''); }
  close(v) { this._open = false; delete this.attrs.open; if (v !== undefined) this.returnValue = String(v); this.dispatch('close'); }
  _walk(fn) { fn(this); this.children.forEach(c => c._walk(fn)); }
  querySelectorAll(sel) { const out = []; this._walk(n => { if (n !== this && m(n, sel)) out.push(n); }); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function m(n, sel) {
  if (sel.startsWith('.')) return n.classList.contains(sel.slice(1));
  if (sel.startsWith('[')) { const g = /\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/.exec(sel); if (!g) return false; return g[2] === undefined ? n.attrs[g[1]] !== undefined : n.attrs[g[1]] === g[2]; }
  return n.tagName === sel.toUpperCase();
}

const root = new El('body');
const byId = {};
function mk(tag, id, cls, attrs) {
  const e = new El(tag);
  if (id) { e.id = id; e.setAttribute('id', id); byId[id] = e; }
  if (cls) e.className = cls;
  Object.assign(e.attrs, attrs || {});
  return e;
}

// login dialog
const login = mk('dialog', 'mgr-login');
login.appendChild(mk('input', 'mgr-login-pass', null, { type: 'password' }));
login.appendChild(mk('p', 'mgr-login-error'));
login.appendChild(mk('button', 'mgr-login-submit', null, { type: 'button' }));
root.appendChild(login);

// app shell
const app = mk('div', 'mgr-app');
root.appendChild(app);
app.appendChild(mk('button', 'mgr-logout', null, { type: 'button' }));
app.appendChild(mk('button', 'mgr-tab-dashboard-btn', null, { type: 'button' }));
app.appendChild(mk('button', 'mgr-tab-settings-btn', null, { type: 'button' }));
app.appendChild(mk('button', 'mgr-tab-stats-btn', null, { type: 'button' }));

const tabDash = mk('section', 'tab-dashboard');
app.appendChild(tabDash);
const dayNav = mk('nav', 'mgr-day-nav', 'week-nav');
tabDash.appendChild(dayNav);
dayNav.appendChild(mk('button', 'mgr-day-prev', 'week-arrow', { type: 'button' }));
dayNav.appendChild(mk('span', 'mgr-day-range', 'week-range'));
dayNav.appendChild(mk('button', 'mgr-day-next', 'week-arrow', { type: 'button' }));
tabDash.appendChild(mk('div', 'mgr-day-header'));
tabDash.appendChild(mk('div', 'mgr-day-body'));
tabDash.appendChild(mk('button', 'mgr-copy-day', null, { type: 'button' }));
tabDash.appendChild(mk('p', 'mgr-copy-msg'));
tabDash.appendChild(mk('footer', 'mgr-health'));

const tabSettings = mk('section', 'tab-settings'); tabSettings.hidden = true;
app.appendChild(tabSettings);
tabSettings.appendChild(mk('div', 'mgr-locations'));
tabSettings.appendChild(mk('input', 'mgr-new-location-name', null, { type: 'text' }));
tabSettings.appendChild(mk('button', 'mgr-add-location', null, { type: 'button' }));
tabSettings.appendChild(mk('input', 'mgr-ret-default', null, { type: 'number' }));
tabSettings.appendChild(mk('button', 'mgr-settings-save', null, { type: 'button' }));
tabSettings.appendChild(mk('p', 'mgr-settings-msg'));

const tabStats = mk('section', 'tab-stats'); tabStats.hidden = true;
app.appendChild(tabStats);
tabStats.appendChild(mk('div', 'mgr-stats-body'));

let domLoaded = null;
global.document = {
  getElementById: (id) => {
    if (byId[id]) return byId[id];
    let found = null;
    root._walk((n) => { if (!found && n.attrs && n.attrs.id === id) found = n; });
    return found;
  },
  createElement: (t) => new El(t),
  createTextNode: (t) => { const e = new El('#text'); e._text = String(t); return e; },
  addEventListener: (t, fn) => { if (t === 'DOMContentLoaded') domLoaded = fn; },
};
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.window = {
  location: { origin: 'http://localhost:8000', pathname: '/manager.html', search: '', hash: '' },
};
global.navigator = { clipboard: null };

// ---------- fixtures ----------
const SCHEDULE = {
  weeks: ['2026-09-06', '2026-09-13'],
  sessions: [
    { id: 'S1', team_id: 'T1', location: 'אולם קציר', date: '2026-09-10', weekday: 4,
      start: '2026-09-10T17:00:00+03:00', end: '2026-09-10T18:30:00+03:00' },
    { id: 'S2', team_id: 'T2', location: 'אולם עין חרוד', date: '2026-09-10', weekday: 4,
      start: '2026-09-10T18:00:00+03:00', end: '2026-09-10T19:30:00+03:00' },
  ],
};
const TEAMS = [
  { team_id: 'T1', display_name: 'נערות א' },
  { team_id: 'T2', display_name: 'נערים ב' },
];
const DASHBOARD_BY_WEEK = {
  '2026-09-06': {
    week: '2026-09-06',
    days: [{
      date: '2026-09-10', weekday: 4,
      totals: { riders: 4, rides: 7 },
      practices: [{
        teamId: 'T1', teamName: 'נערות א', location: 'אולם קציר',
        start: '2026-09-10T17:00:00+03:00', date: '2026-09-10', weekday: 4, sessionId: 'S1',
        depart: { outbound: '16:20', ret: '18:45' },
        byDirection: { round: ['דניאל כהן', 'מאיה לוי', 'נועה בר'], out: ['יונתן שמש'], back: [] },
        riders: 4,
      }],
    }],
    orphans: [{ sessionId: 'S-GONE', teamId: 'T1', fullName: 'עידן זהבי', direction: 'round' }],
    stats: { playersWeek: 5, playersAll: 12, ridesOut: 4, ridesBack: 3, activeLocations: 2, opensToday: 3, opens7d: 20 },
    lastPurge: '2026-09-04',
    rideStatus: {},
  },
  '2026-09-13': {
    week: '2026-09-13', days: [], orphans: [],
    stats: { playersWeek: 0, playersAll: 12, ridesOut: 0, ridesBack: 0, activeLocations: 0, opensToday: 0, opens7d: 0 },
    lastPurge: '2026-09-04', rideStatus: {},
  },
};
const CONFIG = {
  locations: {
    'אולם קציר': { outbound: 40, ret: 15, manual: false },
    'אולם עין חרוד': { outbound: null, ret: null, manual: false },
  },
  global: { retDefault: 15 },
};

let LOGIN_OK = false;
let lastConfigPut = null;
// Per-week artificial delay (ms) for /api/manager/dashboard responses, so a
// test can make an *earlier* request resolve *later* than one fired after
// it — reproducing a real out-of-order network race. Empty by default.
const DASHBOARD_DELAY = {};

global.fetch = (url, opts) => {
  opts = opts || {};
  if (url.indexOf('/api/manager/login') !== -1) {
    return Promise.resolve(LOGIN_OK
      ? { ok: true, status: 200, json: () => Promise.resolve({ token: 'mgr-tok-1', exp: Date.now() + 3600000 }) }
      : { ok: false, status: 401, json: () => Promise.resolve({ error: 'bad_passphrase' }) });
  }
  if (url.indexOf('/api/manager/dashboard') !== -1) {
    const m = /week=([^&]+)/.exec(url);
    const wk = m ? decodeURIComponent(m[1]) : null;
    const body = DASHBOARD_BY_WEEK[wk] || { week: wk, days: [], orphans: [], stats: {}, lastPurge: null, rideStatus: {} };
    const delay = DASHBOARD_DELAY[wk] || 0;
    const resp = { ok: true, status: 200, json: () => Promise.resolve(body) };
    if (!delay) return Promise.resolve(resp);
    return new Promise((resolve) => setTimeout(() => resolve(resp), delay));
  }
  if (url.indexOf('/api/manager/config') !== -1) {
    if (opts.method === 'PUT') {
      lastConfigPut = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(CONFIG) });
  }
  if (url.indexOf('data/schedule.json') !== -1) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(SCHEDULE) });
  }
  if (url.indexOf('data/teams.json') !== -1) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(TEAMS) });
  }
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
};

require(path.join(ROOT, 'public', 'manager.js'));

(async () => {
  await domLoaded();
  await new Promise(r => setTimeout(r, 20));

  console.log('login');
  assert(byId['mgr-login'].attrs.open !== undefined, 'login dialog shows on load');
  assert(byId['mgr-app'].hidden === true, 'app hidden before login');

  LOGIN_OK = false;
  byId['mgr-login-pass'].value = 'wrong';
  byId['mgr-login-submit'].click();
  await new Promise(r => setTimeout(r, 15));
  assert(byId['mgr-login-error'].hidden === false, 'wrong passphrase shows an error');
  assert(byId['mgr-login-error'].textContent === 'סיסמה שגויה', 'error text is סיסמה שגויה');
  assert(byId['mgr-app'].hidden === true, 'still no dashboard after a wrong passphrase');

  LOGIN_OK = true;
  byId['mgr-login-pass'].value = 'right';
  byId['mgr-login-submit'].click();
  await new Promise(r => setTimeout(r, 30));
  assert(byId['mgr-app'].hidden === false, 'right passphrase shows the dashboard');
  assert(store['gilboa.manager'] && JSON.parse(store['gilboa.manager']).token === 'mgr-tok-1', 'manager token stored');

  console.log('dashboard — day header + practice row');
  assert(byId['mgr-day-header'].textContent.indexOf('סה״כ: 4 נוסעים') !== -1, 'day header shows rider total');
  assert(byId['mgr-day-header'].textContent.indexOf('7 הסעות') !== -1, 'day header shows ride total');

  const row = byId['mgr-day-body'].querySelector('.mgr-practice');
  assert(!!row, 'a practice row is rendered');
  const detail = row.querySelector('.mgr-practice-detail');
  assert(detail.hidden === true, 'practice row detail starts collapsed');
  const summary = row.querySelector('.mgr-practice-summary');
  assert(summary.textContent.indexOf('נערות א') !== -1 && summary.textContent.indexOf('אולם קציר') !== -1 &&
    summary.textContent.indexOf('17:00') !== -1 && summary.textContent.indexOf('4 נוסעים') !== -1,
    'collapsed row text matches the spec example');
  summary.click();
  assert(detail.hidden === false, 'clicking the row reveals the detail');
  assert(detail.textContent.indexOf('הלוך וחזור (3): דניאל כהן · מאיה לוי · נועה בר') !== -1, 'round-trip line with names');
  assert(detail.textContent.indexOf('הלוך בלבד (1): יונתן שמש') !== -1, 'outbound-only line with name');
  assert(detail.textContent.indexOf('חזור בלבד (0): —') !== -1, 'return-only line shows em dash when empty');

  console.log('orphans');
  assert(byId['mgr-day-body'].textContent.indexOf('בקשות ללא אימון תואם') !== -1, 'orphan group header renders');
  assert(byId['mgr-day-body'].textContent.indexOf('עידן זהבי') !== -1, 'orphan row shows the full name');

  console.log('buildDayText — pure helper');
  const day = DASHBOARD_BY_WEEK['2026-09-06'].days[0];
  const text = window.Manager.buildDayText(day);
  assert(text.indexOf('נערות א') !== -1, 'buildDayText includes the team name');
  assert(text.indexOf('הלוך וחזור (3)') !== -1 && text.indexOf('הלוך בלבד (1)') !== -1 && text.indexOf('חזור בלבד (0)') !== -1,
    'buildDayText includes the direction counts');
  assert(text.indexOf('דניאל כהן') !== -1, 'buildDayText includes rider names');

  console.log('health footer');
  assert(byId['mgr-health'].textContent.indexOf('ניקוי אחרון: 4/9') !== -1, 'health footer shows lastPurge as d/m');

  console.log('day with no practices');
  for (let i = 0; i < 7; i++) byId['mgr-day-next'].click();
  await new Promise(r => setTimeout(r, 30));
  assert(byId['mgr-day-body'].textContent.indexOf('אין בקשות הסעה ליום זה') !== -1, 'a day with zero requests shows the empty state');
  for (let i = 0; i < 7; i++) byId['mgr-day-prev'].click();
  await new Promise(r => setTimeout(r, 30));

  console.log('rapid day-stepper navigation — a stale response for an abandoned week must not clobber the current one');
  // Sept 10 -> Sept 14 crosses into week 2026-09-13 (empty); make that
  // week's response arrive late, then immediately step back to Sept 10
  // (week 2026-09-06, the one already correctly loaded) with no waiting
  // in between — reproducing a real out-of-order network race.
  DASHBOARD_DELAY['2026-09-13'] = 30;
  for (let i = 0; i < 4; i++) byId['mgr-day-next'].click();
  for (let i = 0; i < 4; i++) byId['mgr-day-prev'].click();
  await new Promise(r => setTimeout(r, 60)); // let every in-flight request land
  delete DASHBOARD_DELAY['2026-09-13'];
  assert(byId['mgr-day-header'].textContent.indexOf('סה״כ: 4 נוסעים') !== -1,
    'back on the original day, its data still shows (the abandoned week\'s late response was discarded)');
  assert(byId['mgr-day-body'].textContent.indexOf('אין בקשות הסעה ליום זה') === -1,
    'the abandoned week\'s stale response did not overwrite the correct day with an empty state');

  console.log('settings tab');
  byId['mgr-tab-settings-btn'].click();
  const rows = byId['mgr-locations'].querySelectorAll('.mgr-settings-row');
  assert(rows.length === 2, 'one זמני יציאה row per live location');
  const kazirRow = rows.find(r => r.textContent.indexOf('אולם קציר') !== -1);
  assert(!!kazirRow, 'a row is labelled with the location name');
  const outInput = kazirRow.querySelector('.mgr-settings-out');
  const retInput = kazirRow.querySelector('.mgr-settings-ret');
  assert(!!outInput && !!retInput, 'row has two number inputs (הלוך / חזור)');
  assert(outInput.attrs.type === 'number' && retInput.attrs.type === 'number', 'both inputs are type=number');

  outInput.value = '35';
  byId['mgr-settings-save'].click();
  await new Promise(r => setTimeout(r, 20));
  assert(!!lastConfigPut, 'save calls PUT /api/manager/config');
  assert(lastConfigPut.locations['אולם קציר'].outbound === 35, 'PUT body carries the changed outbound offset');
  assert(lastConfigPut.locations['אולם עין חרוד'].outbound === null, 'PUT body carries the unchanged row unchanged');

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all manager smoke checks passed'));
  process.exit(failures ? 1 : 0);
})();
