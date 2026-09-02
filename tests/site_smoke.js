// Headless smoke test for the static site (public/app.js).
//
//   node tests/site_smoke.js
//
// Needs Node only (no npm packages). It builds a tiny fake DOM, loads the real
// public/app.js against the committed public/data/*.json, drives the main
// flows, and asserts the visible output. Visual / RTL / contrast checks still
// require a real browser on a phone.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ok   ' + msg); }
  else { console.log('  FAIL ' + msg); failures++; }
}

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
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  dispatch(t) { (this._listeners[t] || []).forEach(fn => fn.call(this, { target: this })); }
  click() { this.dispatch('click'); }
  focus() {}
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
const app = mk('div', 'app'); app.hidden = true;
const fatal = mk('div', 'fatal'); fatal.hidden = true;
root.appendChild(app); root.appendChild(fatal);
app.appendChild(mk('span', 'week-range'));
const prev = mk('button', 'prev-week'); const next = mk('button', 'next-week');
app.appendChild(prev); app.appendChild(next);
const mw = mk('section', 'screen-myweek'); const at = mk('section', 'screen-addteam'); at.hidden = true;
app.appendChild(mw); app.appendChild(at);
const onb = mk('div', 'onboarding'); onb.hidden = true;
onb.appendChild(mk('button', null, 'btn btn-primary', { 'data-goto': 'addteam' }));
mw.appendChild(onb);
mw.appendChild(mk('div', 'follows-row'));
const banner = mk('div', 'changes-banner'); banner.hidden = true;
const btoggle = mk('button', null, 'changes-toggle'); btoggle.setAttribute('aria-expanded', 'false');
btoggle.appendChild(mk('span', null, 'changes-summary'));
banner.appendChild(btoggle);
const clist = mk('ul', null, 'changes-list'); clist.hidden = true;
banner.appendChild(clist);
mw.appendChild(banner);
mw.appendChild(mk('div', 'week-content'));
const footer = mk('footer', 'week-footer'); footer.hidden = true;
footer.appendChild(mk('div', 'summary')); footer.appendChild(mk('div', 'updated'));
mw.appendChild(footer);
at.appendChild(mk('button', null, 'btn btn-back', { 'data-goto': 'myweek' }));
at.appendChild(mk('button', 'mode-team', 'toggle-btn is-active'));
at.appendChild(mk('button', 'mode-coach', 'toggle-btn'));
at.appendChild(mk('input', 'search'));
at.appendChild(mk('p', 'search-hint'));
at.appendChild(mk('div', 'results'));

let domLoaded = null;
global.document = {
  getElementById: (id) => byId[id] || null,
  createElement: (t) => new El(t),
  createTextNode: (t) => { const e = new El('#text'); e._text = String(t); return e; },
  addEventListener: (t, fn) => { if (t === 'DOMContentLoaded') domLoaded = fn; },
  querySelectorAll: (s) => root.querySelectorAll(s),
  querySelector: (s) => root.querySelector(s),
};
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.window = { scrollTo: () => {} };
const FAKE_CHANGES = {
  generated_at: null, // filled from meta below
  changes: [
    { team_id: '__T1__', week_key: null, kind: 'time_changed',
      old: { start: '2000-01-01T18:00:00+03:00', end: '2000-01-01T20:00:00+03:00' },
      new: { start: '2000-01-01T19:30:00+03:00', end: '2000-01-01T21:30:00+03:00' } },
  ],
};
global.fetch = (url) => {
  const f = url.replace(/^data\//, 'public/data/');
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(
      url.indexOf('changes') !== -1
        ? FAKE_CHANGES
        : JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
  });
};

const schedule = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/schedule.json'), 'utf8'));
const teams = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/teams.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/meta.json'), 'utf8'));
FAKE_CHANGES.generated_at = meta.generated_at;

// pick a real team that has sessions in the last published week
const lastWeek = schedule.weeks.slice().sort().pop();
const busy = {};
schedule.sessions.forEach(s => { if (s.team_id && s.week_key === lastWeek) busy[s.team_id] = (busy[s.team_id] || 0) + 1; });
const T1 = Object.keys(busy).sort((a, b) => busy[b] - busy[a])[0];
FAKE_CHANGES.changes[0].team_id = T1;
FAKE_CHANGES.changes[0].week_key = lastWeek;
const t1name = teams.find(t => t.team_id === T1).display_name;

require(path.join(ROOT, 'public', 'app.js'));

(async () => {
  await domLoaded();
  await new Promise(r => setTimeout(r, 30));

  console.log('load');
  assert(app.hidden === false && fatal.hidden === true, 'app shown, no fatal error');
  assert(byId['onboarding'].hidden === false, 'onboarding visible when no team followed');
  assert(/[א-ת]/.test(byId['week-range'].textContent), 'week range shows Hebrew text');

  console.log('add team (team search, whitespace-insensitive)');
  onb.children[0].click();
  assert(at.hidden === false && mw.hidden === true, 'switched to Add Team screen');
  const spaced = t1name.split('').join(' '); // force weird spacing
  byId['search'].value = spaced;
  byId['search'].dispatch('input');
  const hitTexts = byId['results'].children.map(c => c.textContent);
  assert(hitTexts.some(x => x.indexOf(t1name) !== -1), 'spaced query "' + spaced + '" still finds ' + t1name);

  console.log('follow + My Week render');
  byId['results'].children.find(c => c.className.includes('result')).click();
  assert(mw.hidden === false, 'returned to My Week after follow');
  assert(store['gilboa.followed'] && JSON.parse(store['gilboa.followed']).indexOf(T1) !== -1, 'followed persisted to localStorage');

  // navigate to the last published week: next until disabled (one past), then back one
  let guard = 0;
  while (!next.disabled && guard++ < 12) next.click();
  prev.click();
  assert(byId['week-content'].textContent.indexOf('אין נתונים לשבוע זה') === -1, 'last published week has data');
  const wc = byId['week-content'];
  assert(wc.children.length > 0, 'week content has day groups');
  assert(wc.children.some(g => g.textContent.indexOf(t1name) === -1 ? false : true), 'a row is labelled with the team name');
  assert(/\d\d:\d\d–\d\d:\d\d/.test(wc.textContent), 'rows show HH:MM–HH:MM');
  assert(/\d+\s+אימונ|אימון אחד/.test(byId['summary'].textContent), 'summary shows session count');
  assert(byId['summary'].textContent.indexOf('שעות') !== -1 || byId['summary'].textContent.indexOf('שעה') !== -1, 'summary shows hours');
  assert(byId['updated'].textContent.indexOf('עודכן') === 0, 'footer shows "עודכן:" timestamp');

  console.log('changes banner');
  assert(banner.hidden === false, 'banner visible (new generated_at + change for followed team)');
  assert(banner.querySelector('.changes-summary').textContent.indexOf('לחץ לפרטים') !== -1, 'banner prompts to expand');
  btoggle.click();
  assert(clist.hidden === false && clist.children.length === 1, 'expands to exactly the followed-team change');
  assert(store['gilboa.seen_generated_at'] === meta.generated_at, 'viewing the banner sets seen_generated_at');

  console.log('week nav bounds');
  guard = 0; while (!next.disabled && guard++ < 12) next.click();
  assert(byId['week-content'].textContent.indexOf('אין נתונים לשבוע זה') !== -1, 'one past the last week shows "no data"');
  guard = 0; while (!prev.disabled && guard++ < 20) prev.click();
  assert(byId['week-content'].textContent.indexOf('אין נתונים לשבוע זה') !== -1, 'one before the first week shows "no data"');

  console.log('unfollow');
  const chip = byId['follows-row'].querySelector('.chip-remove');
  assert(!!chip, 'followed chip has a remove control');
  if (chip) chip.click();
  assert(byId['onboarding'].hidden === false, 'onboarding returns after unfollowing the last team');
  assert(JSON.parse(store['gilboa.followed']).length === 0, 'localStorage followed is empty');

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all site smoke checks passed'));
  process.exit(failures ? 1 : 0);
})();
