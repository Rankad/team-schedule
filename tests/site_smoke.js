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

const RealDate = Date;
let FAKE_NOW = null;                       // null => real time
function setToday(ymd) {
  if (ymd === null) { FAKE_NOW = null; return; }
  const p = ymd.split('-').map(Number);
  FAKE_NOW = new RealDate(p[0], p[1] - 1, p[2], 12, 0, 0).getTime();  // local noon
}
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0 && FAKE_NOW !== null) super(FAKE_NOW);
    else super(...args);
  }
  static now() { return FAKE_NOW !== null ? FAKE_NOW : RealDate.now(); }
}
global.Date = FakeDate;

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
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(v) { if (v === '') { this.children = []; this._text = ''; } }
  get innerHTML() { return ''; }
  // canvas shim: enough for drawWeekImage() to run to completion
  getContext(kind) {
    if (this.tagName !== 'CANVAS' || kind !== '2d') return null;
    if (!this._ctx) {
      const noop = () => {};
      this._ctx = {
        _fontPx: 14,
        set font(v) { const m = /(\d+)px/.exec(v || ''); this._fontPx = m ? +m[1] : 14; },
        get font() { return this._fontPx + 'px'; },
        fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
        textAlign: 'left', textBaseline: 'alphabetic', direction: 'ltr',
        scale: noop, fillRect: noop, fillText: noop, strokeRect: noop,
        beginPath: noop, arc: noop, fill: noop, stroke: noop,
        moveTo: noop, lineTo: noop, save: noop, restore: noop, setLineDash: noop,
        measureText(s) { return { width: String(s).length * this._fontPx * 0.55 }; },
      };
    }
    return this._ctx;
  }
  toBlob(cb) { cb({ __png: true, size: 1024, type: 'image/png' }); }
  removeAttribute(k) { delete this.attrs[k]; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = v; }
  getAttribute(k) { return this.attrs[k] != null ? this.attrs[k] : null; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) {
    c.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i === -1) this.children.push(c); else this.children.splice(i, 0, c);
    return c;
  }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  dispatch(t) { (this._listeners[t] || []).forEach(fn => fn.call(this, { target: this, preventDefault() {} })); }
  click() { this.dispatch('click'); }
  focus() { global.__focused = this; }
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.dispatch('close'); } }
  scrollIntoView() { global.__scrolled = this; }
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
const toast = mk('div', 'toast');
root.appendChild(app); root.appendChild(fatal); root.appendChild(toast);
app.appendChild(mk('span', 'week-range'));
const prev = mk('button', 'prev-week'); const next = mk('button', 'next-week');
app.appendChild(prev); app.appendChild(next);
const mw = mk('section', 'screen-myweek'); const at = mk('section', 'screen-addteam'); at.hidden = true;
app.appendChild(mw); app.appendChild(at);
const onb = mk('div', 'onboarding'); onb.hidden = true;
onb.appendChild(mk('button', null, 'btn btn-primary', { 'data-goto': 'addteam' }));
mw.appendChild(onb);
mw.appendChild(mk('div', 'follows-row'));
const shareFollows = mk('button', 'share-follows'); shareFollows.hidden = true;
mw.appendChild(shareFollows);
const banner = mk('div', 'changes-banner'); banner.hidden = true;
const btoggle = mk('button', null, 'changes-toggle'); btoggle.setAttribute('aria-expanded', 'false');
btoggle.appendChild(mk('span', null, 'changes-summary'));
banner.appendChild(btoggle);
const clist = mk('ul', null, 'changes-list'); clist.hidden = true;
banner.appendChild(clist);
mw.appendChild(banner);
mw.appendChild(mk('div', 'week-content'));
const addGameBtn = mk('button', 'add-game'); addGameBtn.hidden = true;
mw.appendChild(addGameBtn);
const weekActions = mk('div', 'week-actions'); weekActions.hidden = true;
['act-copy', 'act-share', 'act-ics', 'act-img'].forEach(id => weekActions.appendChild(mk('button', id)));
mw.appendChild(weekActions);
const footer = mk('footer', 'week-footer'); footer.hidden = true;
footer.appendChild(mk('div', 'summary')); footer.appendChild(mk('div', 'updated'));
mw.appendChild(footer);
at.appendChild(mk('button', null, 'btn btn-back', { 'data-goto': 'myweek' }));
at.appendChild(mk('input', 'search'));
at.appendChild(mk('p', 'search-hint'));
at.appendChild(mk('div', 'results'));

// add-game bottom sheet (mirrors the ids/classes in public/index.html)
const dlg = mk('dialog', 'game-dialog', 'sheet'); dlg.open = false;
const gform = mk('form', 'game-form');
const gDate = mk('input', 'game-date'); gDate.value = '';
const gTime = mk('input', 'game-time'); gTime.value = '';
const gOpp = mk('input', 'game-opp'); gOpp.value = '';
const gNote = mk('output', 'game-note');
const gErrDate = mk('div', 'game-err-date'); gErrDate.hidden = true;
const gErrTime = mk('div', 'game-err-time'); gErrTime.hidden = true;
const segHome = mk('button', null, 'seg-btn', { 'data-venue': 'home', 'aria-checked': 'false' });
const segAway = mk('button', null, 'seg-btn', { 'data-venue': 'away', 'aria-checked': 'true' });
[gDate, gErrDate, gTime, gErrTime, segHome, segAway, gOpp, gNote, mk('button', 'game-cancel')]
  .forEach(n => gform.appendChild(n));
dlg.appendChild(gform);
root.appendChild(dlg);

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
  querySelectorAll: (s) => root.querySelectorAll(s),
  querySelector: (s) => root.querySelector(s),
};
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.window = {
  scrollTo: () => {},
  devicePixelRatio: 2,
  location: { origin: 'http://localhost:8000', pathname: '/', search: '', hash: '' },
  history: { replaceState: (s, t, url) => { global.window.location.search = ''; } },
};
const FAKE_CHANGES = {
  generated_at: null, // filled from meta below
  changes: [
    { team_id: '__T1__', week_key: null, kind: 'time_changed',
      old: { start: '2000-01-01T18:00:00+03:00', end: '2000-01-01T20:00:00+03:00' },
      new: { start: '2000-01-01T19:30:00+03:00', end: '2000-01-01T21:30:00+03:00' } },
  ],
};
// The rides front end was removed (DL-042): the site must never call /api/*.
// The stub rejects any /api/ request and records it so the test can assert none
// happened. Exact pathname parsing, not substring matching.
function pathOf(url) {
  try { return new URL(url, 'http://x.invalid').pathname; } catch (e) { return String(url); }
}
const API_CALLS = [];
global.fetch = (url, opts) => {
  const p = pathOf(url);
  if (p.indexOf('/api/') !== -1) {
    API_CALLS.push(p);
    return Promise.reject(new Error('site_smoke.js fetch stub: the site must not call ' + p));
  }
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

// pick a real team that has sessions in the last published week that actually
// carries any team-attributed session (a holiday/off week can be published
// with zero team_id sessions — walk backwards until we find one that qualifies)
const weeksDesc = schedule.weeks.slice().sort().reverse();
let lastWeek = null;
let busy = {};
for (const wk of weeksDesc) {
  const b = {};
  schedule.sessions.forEach(s => { if (s.team_id && s.week_key === wk) b[s.team_id] = (b[s.team_id] || 0) + 1; });
  if (Object.keys(b).length) { lastWeek = wk; busy = b; break; }
}
if (!lastWeek) {
  // genuinely no week in the whole dataset has a team-attributed session —
  // that's a real data problem, not a coincidence to skip past.
  throw new Error('no published week has any team-attributed session — cannot pick a test team (T1)');
}
const T1 = Object.keys(busy).sort((a, b) => busy[b] - busy[a])[0];
FAKE_CHANGES.changes[0].team_id = T1;
FAKE_CHANGES.changes[0].week_key = lastWeek;
const t1name = teams.find(t => t.team_id === T1).display_name;

// Navigate the UI to `lastWeek` specifically. That's only the same as "click
// next until disabled, then back one" when the calendar's literal last
// published week happens to be the one carrying T1's sessions — which isn't
// guaranteed (see the lastWeek search above), so later checks that need to
// land on T1's week must use this instead of that older next/prev idiom.
const weeksSorted = schedule.weeks.slice().sort();
const lastWeekIdx = weeksSorted.indexOf(lastWeek);
function gotoLastWeek() {
  let g = 0;
  while (!prev.disabled && g++ < 40) prev.click();
  next.click();                                       // -> weeksSorted[0]
  for (let k = 0; k < lastWeekIdx; k++) next.click();  // -> lastWeek
}

// branding <head>: share/theme meta tags on the entry document
console.log('branding <head> meta');
{
  const idxHtml = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert(/name="theme-color"[^>]*content="#D0212C"/.test(idxHtml), 'index.html sets theme-color #D0212C');
  assert(idxHtml.indexOf('property="og:title"') !== -1, 'index.html has an og:title tag');
  assert(idxHtml.indexOf('property="og:description"') !== -1, 'index.html has an og:description tag');
  assert(idxHtml.indexOf('name="twitter:card"') !== -1, 'index.html has a twitter:card tag');
  assert(idxHtml.indexOf('content="הלו״ז שלי — גלבוע מעיינות"') !== -1,
    'index.html og:title uses the parent-app copy');

  // rides front end removal (DL-042) — lock it
  console.log('rides front end removed — files + markup');
  ['public/rides.js', 'public/manager.html', 'public/manager.js', 'public/manager.css', 'tests/manager_smoke.js']
    .forEach(f => assert(!fs.existsSync(path.join(ROOT, f)), f + ' does not exist'));
  ['rides.js', 'role-toggle-slot', 'role-entry-slot', 'rides-summary-slot', 'rides-consent', 'screen-rides', 'screen-privacy']
    .forEach(t => assert(idxHtml.indexOf(t) === -1, 'index.html contains no "' + t + '"'));
  assert(idxHtml.indexOf('id="onboarding"') !== -1, 'index.html still has the #onboarding card');
  assert(idxHtml.indexOf('בחירת קבוצה') !== -1, 'index.html still says בחירת קבוצה');
}

// Legacy rides keys a previously-registered player's device may still hold, plus
// one real followed team that must survive the startup cleanup.
store['gilboa.role'] = 'player';
store['gilboa.player'] = JSON.stringify({ token: 'x', fullName: 'y' });
store['gilboa.ping_ts'] = '1';
store['gilboa.manager'] = 'm';
store['gilboa.followed'] = JSON.stringify([T1]);

require(path.join(ROOT, 'public', 'app.js'));

(async () => {
  await domLoaded();
  await new Promise(r => setTimeout(r, 30));

  console.log('load');
  assert(app.hidden === false && fatal.hidden === true, 'app shown, no fatal error');
  assert(typeof window.Rides === 'undefined', 'no window.Rides after loading the app');
  ['gilboa.role', 'gilboa.player', 'gilboa.ping_ts', 'gilboa.manager']
    .forEach(k => assert(!(k in store), 'legacy key ' + k + ' cleared at startup'));
  assert(store['gilboa.followed'] === JSON.stringify([T1]), 'gilboa.followed untouched by the cleanup');
  assert(byId['onboarding'].hidden === true, 'onboarding hidden while a team is followed');
  assert(/[א-ת]/.test(byId['week-range'].textContent), 'week range shows Hebrew text');

  console.log('onboarding');
  {
    let og = 0, ob;
    while ((ob = byId['follows-row'].querySelectorAll('.chip-remove')).length && og++ < 12) ob[0].click();
    assert(byId['onboarding'].hidden === false, 'onboarding visible when no team followed');
    const pick = onb.querySelector('[data-goto]');
    assert(!!pick && pick.getAttribute('data-goto') === 'addteam', 'onboarding has the "＋ בחירת קבוצה" button');
  }

  console.log('add team (team search: partial words + extra spaces)');
  onb.querySelector('[data-goto]').click();
  assert(at.hidden === false && mw.hidden === true, 'switched to Add Team screen');

  // extra / weird spacing between the real words must not matter
  const spaced = t1name.split(/\s+/).join('    ');
  byId['search'].value = spaced;
  byId['search'].dispatch('input');
  let hitTexts = byId['results'].children.map(c => c.textContent);
  assert(hitTexts.some(x => x.indexOf(t1name) !== -1), 'spaced query "' + spaced + '" still finds ' + t1name);

  // a partial query (subset of the words) finds every team that contains them,
  // including longer names with words in between  (נערים לאומית -> נערים ט לאומית)
  const longName = teams.map(t => t.display_name)
    .find(n => { const w = n.split(/\s+/); return w.length >= 3; });
  if (longName) {
    const w = longName.split(/\s+/);
    const partial = w[0] + ' ' + w[w.length - 1]; // first + last word only
    byId['search'].value = partial;
    byId['search'].dispatch('input');
    hitTexts = byId['results'].children.map(c => c.textContent);
    assert(hitTexts.some(x => x.indexOf(longName) !== -1),
      'partial query "' + partial + '" finds "' + longName + '"');
  }

  // search results show team + coach only - no ℹ️ note line
  byId['search'].value = t1name;
  byId['search'].dispatch('input');
  assert(byId['results'].children.every(c => c.textContent.indexOf('ℹ️') === -1),
    'search results carry no note line');

  console.log('follow + My Week render');
  const t1Result = byId['results'].children
    .find(c => c.className.includes('result') && c.getAttribute('data-team-id') === T1);
  assert(!!t1Result, 'search for "' + t1name + '" lists that exact team');
  t1Result.click();
  assert(mw.hidden === false, 'returned to My Week after follow');
  assert(store['gilboa.followed'] && JSON.parse(store['gilboa.followed']).indexOf(T1) !== -1, 'followed persisted to localStorage');

  // navigate to lastWeek (T1's week — see gotoLastWeek above)
  let guard = 0;
  gotoLastWeek();
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
  var chgText = clist.children[0].textContent;
  assert(chgText.indexOf('לפני:') !== -1 && chgText.indexOf('אחרי:') !== -1, 'time change spells out before/after');
  assert(chgText.indexOf('18:00–20:00') !== -1 && chgText.indexOf('19:30–21:30') !== -1, 'time change shows both old and new ranges');
  assert(chgText.indexOf('←') === -1, 'no ambiguous arrow in the change text');
  assert(store['gilboa.seen_generated_at'] === meta.generated_at, 'viewing the banner sets seen_generated_at');

  // time_changed where the practice moved to a different day: relabelled and the
  // weekday + date shown on each side (2026-09-08 = Tue, 2026-09-10 = Thu).
  {
    const savedChanges = window.DATA.changes;
    window.DATA.changes = [{
      team_id: T1, week_key: lastWeek, kind: 'time_changed',
      old: { start: '2026-09-08T17:00:00+03:00', end: '2026-09-08T18:00:00+03:00' },
      new: { start: '2026-09-10T17:00:00+03:00', end: '2026-09-10T18:00:00+03:00' },
    }];
    delete store['gilboa.seen_generated_at'];
    window.render();
    if (clist.hidden) btoggle.click();
    const dm = clist.children[0].textContent.replace(/[⁦⁩]/g, '');
    assert(dm.indexOf('מועד האימון עודכן') !== -1, 'day-moved change is relabelled "מועד האימון עודכן"');
    assert(/יום .׳? ?8\/9/.test(dm) && /יום .׳? ?10\/9/.test(dm), 'day-moved change shows weekday + date on both sides');
    assert(dm.indexOf('17:00–18:00') !== -1, 'day-moved change still shows the time');
    assert(dm.indexOf('לפני:') !== -1 && dm.indexOf('אחרי:') !== -1, 'day-moved change keeps before/after framing');
    window.DATA.changes = savedChanges;
    store['gilboa.seen_generated_at'] = meta.generated_at;
    window.render();
  }

  // ---- export / share features (viewSunday is the last published week, T1 followed) ----
  console.log('action row visibility');
  assert(byId['share-follows'].hidden === false, 'share-my-teams action visible while following');
  assert(byId['week-actions'].hidden === false, 'weekly action row visible when the week has sessions');

  console.log('shareable link — buildTeamsLink / parseTeamsParam');
  assert(window.parseTeamsParam('?teams=T_001,T_002,T_001').length === 2, 'parseTeamsParam splits + dedupes ids');
  assert(window.parseTeamsParam('').length === 0, 'parseTeamsParam of empty string is []');
  assert(window.parseTeamsParam('?week=3').length === 0, 'parseTeamsParam ignores unrelated query');
  const link = window.buildTeamsLink();
  assert(/^https?:\/\/[^?]+\?teams=/.test(link), 'buildTeamsLink has origin+path+?teams= shape');
  assert(link.indexOf(T1) !== -1, 'buildTeamsLink lists the followed id');

  console.log('buildWeekText');
  // strip the U+2066/U+2069 LTR-isolate wrappers around numeric runs for matching
  const wt = window.buildWeekText(lastWeek).replace(/[\u2066\u2069]/g, '');
  assert(wt.indexOf('הלו״ז שלי — גלבוע מעיינות') === 0, 'week text starts with the club title');
  assert(/\nשבוע \d+\/\d+–\d+\/\d+/.test(wt), 'week text has a "שבוע d/m–d/m" range line');
  assert(wt.indexOf(t1name) !== -1, 'week text lists the followed team');
  assert(/\n {2}\d\d:\d\d[–\d: ]*·/.test(wt), 'sessions are indented under day headings');
  // "קבוצה אחת · אימון אחד · 2 שעות" (singular) or "3 קבוצות · 5 אימונים · 7 שעות"
  // (plural) — match the shared word prefixes so the count of sessions in the
  // picked week doesn't matter. (אימון has a final nun, אימונים a medial one.)
  assert(/\nסה״כ: .*קבוצ.* · .*אימו.* · .*שעות/.test(wt), 'week text ends with a summary line');
  {
    // day headings must be in ascending date order
    const days = wt.split('\n').filter(l => /^(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת) /.test(l));
    assert(days.length >= 1, 'week text has at least one day heading');
    const withNotes = schedule.sessions.filter(s => s.team_id === T1 && s.week_key === lastWeek && Array.isArray(s.notes) && s.notes.length);
    if (withNotes.length) {
      assert(new RegExp('\\n {4}' + withNotes[0].notes[0].slice(0, 6).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(wt),
        'a session note sits on its own 4-space-indented line');
    } else {
      console.log('  skip notes-line check (followed team has no noted session this week)');
    }
  }
  const emptyWt = window.buildWeekText('1999-01-03');
  assert(/אין אימונים בשבוע זה\s*$/.test(emptyWt) && emptyWt.indexOf('סה״כ') === -1,
    'empty week text is the minimal "no sessions" payload');

  console.log('buildICS');
  const ics = window.buildICS(lastWeek);
  const nEv = (ics.match(/BEGIN:VEVENT/g) || []).length;
  const nSes = schedule.sessions.filter(s => s.team_id === T1 && s.week_key === lastWeek).length;
  assert(nEv === nSes, 'ICS emits one VEVENT per followed-team session (' + nEv + '/' + nSes + ')');
  assert(ics.indexOf('BEGIN:VCALENDAR\r\n') === 0 && /\r\nEND:VCALENDAR\r\n$/.test(ics), 'ICS is a CRLF VCALENDAR');
  assert(/\r\nDTSTART:\d{8}T\d{6}Z\r\n/.test(ics), 'DTSTART is emitted as a UTC "Z" instant');
  assert(/\r\nDTSTAMP:\d{8}T\d{6}Z\r\n/.test(ics), 'DTSTAMP is present and UTC');
  assert(/\r\nUID:[^\r\n]+@gilboa-schedule\r\n/.test(ics), 'UID is namespaced @gilboa-schedule');
  assert(window.icsEsc('a,b;c\\d\ne') === 'a\\,b\\;c\\\\d\\ne', 'icsEsc escapes \\ ; , and newline');

  console.log('drawWeekImage');
  const canvas = window.drawWeekImage(lastWeek);
  assert(canvas && canvas.tagName === 'CANVAS', 'drawWeekImage returns a <canvas>');
  assert(canvas.width > 0 && canvas.height > 0, 'canvas has non-zero pixel size (' + canvas.width + 'x' + canvas.height + ')');
  const emptyCanvas = window.drawWeekImage('1999-01-03');
  assert(emptyCanvas.width > 0 && emptyCanvas.height > 0, 'empty-week image still has a size');

  console.log('shareable link — applyTeamsParam merge semantics');
  const other = teams.find(t => t.team_id !== T1).team_id;
  const merge = window.applyTeamsParam('?teams=' + T1 + ',' + other + ',' + other + ',NOPE_999');
  assert(merge.added.length === 1 && merge.added[0] === other, 'applyTeamsParam merges one new valid id (deduped)');
  assert(merge.already.indexOf(T1) !== -1, 'applyTeamsParam reports an already-followed id');
  assert(merge.invalid.indexOf('NOPE_999') !== -1, 'applyTeamsParam ignores an unknown id');
  assert(JSON.parse(store['gilboa.followed']).filter(x => x === other).length === 1, 'merged id stored exactly once');

  // buildWeekText note-line: follow a team that genuinely has a noted session
  {
    const noted = schedule.sessions.find(s => s.team_id && Array.isArray(s.notes) && s.notes.length);
    if (noted) {
      window.applyTeamsParam('?teams=' + noted.team_id);
      const nt = window.buildWeekText(noted.week_key);
      const esc = noted.notes[0].slice(0, 8).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert(new RegExp('\\n {4}' + esc).test(nt), 'buildWeekText puts a note on its own 4-space line');
    }
  }

  console.log('earlier-days — split helper');
  {
    const SPLIT_WK = '2026-09-06';
    const mkS = (date) => ({
      team_id: 'TX', week_key: SPLIT_WK, date: date, weekday: 0,
      start: date + 'T17:00:00+03:00', end: date + 'T18:30:00+03:00',
    });
    // sorted, multi-day week
    const sw = [mkS('2026-09-06'), mkS('2026-09-08'), mkS('2026-09-08'), mkS('2026-09-10')];

    const mid = window.splitWeekByToday(sw, SPLIT_WK, '2026-09-08');
    assert(mid.isCurrentWeek === true, 'split: today inside the viewed week => isCurrentWeek');
    assert(mid.pastGroups.length === 1 && mid.pastGroups[0][0] === '2026-09-06',
      'split: earlier day is a past group');
    assert(mid.upcomingGroups.map(g => g[0]).join(',') === '2026-09-08,2026-09-10',
      'split: today and later are upcoming groups, grouped by date');

    const outWk = window.splitWeekByToday(sw, SPLIT_WK, '2026-09-20');
    assert(outWk.isCurrentWeek === false, 'split: today outside the viewed week => not current');
    assert(outWk.pastGroups.length === 0 && outWk.upcomingGroups.length === 3,
      'split: non-current week keeps every day in upcomingGroups');

    const doneWk = window.splitWeekByToday(sw, SPLIT_WK, '2026-09-12');
    assert(doneWk.isCurrentWeek === true && doneWk.upcomingGroups.length === 0 && doneWk.pastGroups.length === 3,
      'split: today after every session => all past, no upcoming');

    const freshWk = window.splitWeekByToday(sw, SPLIT_WK, '2026-09-06');
    assert(freshWk.pastGroups.length === 0 && freshWk.upcomingGroups.length === 3,
      'split: today == first session day => nothing past');

    assert(window.groupByDate(sw).length === 3 &&
           window.groupByDate(sw)[1][1].length === 2,
      'groupByDate: one entry per date, sessions collected per day');
  }

  console.log('earlier-days — expander UI');
  {
    // pick a real (week, team) where the team trains on >= 2 distinct days
    const gmap = {};
    schedule.sessions.forEach((s) => {
      if (!s.team_id) return;
      const key = s.week_key + '|' + s.team_id;
      (gmap[key] = gmap[key] || new Set()).add(s.date);
    });
    const GK = Object.keys(gmap).sort().filter(key => gmap[key].size >= 2)[0];
    if (!GK) {
      assert(false, 'no (week, team) with >= 2 distinct training days in the committed data — expander UI block cannot run');
    } else {
    const gWk = GK.split('|')[0];
    const gTid = GK.split('|')[1];
    const gDays = Array.from(gmap[GK]).sort();
    const gPastCount = gDays.length - 1;               // today = last day => that many past days
    const weeksSorted = schedule.weeks.slice().sort();
    const gIdx = weeksSorted.indexOf(gWk);
    const gFullCount = schedule.sessions
      .filter(s => s.team_id === gTid && s.week_key === gWk).length;

    const gotoWeekIndex = (i) => {
      let g = 0;
      while (!prev.disabled && g++ < 40) prev.click();
      next.click();                                    // -> weeksSorted[0]
      for (let k = 0; k < i; k++) next.click();        // -> weeksSorted[i]
    };
    const dayGroups = () => byId['week-content'].querySelectorAll('.day-group').length;
    const summaryNum = () => {
      const mm = /\d+/.exec(byId['summary'].textContent);
      return mm ? +mm[0] : 1;                          // "אימון אחד" has no digit
    };

    // follow ONLY the target team
    let rmB;
    let rg = 0;
    while ((rmB = byId['follows-row'].querySelectorAll('.chip-remove')).length && rg++ < 20) rmB[0].click();
    window.applyTeamsParam('?teams=' + gTid);

    setToday(gDays[gDays.length - 1]);                 // last training day is "today"
    delete store['gilboa.week_collapsed'];
    gotoWeekIndex(gIdx);                               // nav triggers a re-render under the fake clock

    const exp = byId['week-content'].querySelector('.week-expander');
    assert(!!exp, 'expander row shown on the current week when earlier days have sessions');
    assert(exp.textContent.indexOf('הצג ימים קודמים (' + gPastCount + ')') !== -1,
      'collapsed label names the hidden-day count');
    assert(dayGroups() === 1, 'collapsed: only the upcoming day-group is rendered');
    assert(summaryNum() === gFullCount, 'summary counts the whole week while collapsed');

    exp.click();
    assert(store['gilboa.week_collapsed'] === '0', 'expanding persists gilboa.week_collapsed = 0');
    assert(byId['week-content'].querySelector('.week-expander').textContent.indexOf('הסתר ימים קודמים') !== -1,
      'expanded label switches to "hide"');
    assert(dayGroups() === gDays.length, 'expanded: every day-group is rendered');
    assert(summaryNum() === gFullCount, 'summary unchanged by expanding');

    // the choice survives week navigation (in-memory state, no reload)
    next.click(); prev.click();                        // leave the week and come back
    assert(dayGroups() === gDays.length, 'still expanded after navigating away and back');

    byId['week-content'].querySelector('.week-expander').click();
    assert(store['gilboa.week_collapsed'] === '1', 'collapsing again persists = 1');
    assert(dayGroups() === 1, 'collapsed again: back to upcoming only');

    // a non-current published week never shows the expander and renders all its days
    const adjIdx = gIdx + 1 < weeksSorted.length ? gIdx + 1 : gIdx - 1;
    (adjIdx > gIdx ? next : prev).click();
    const adjWk = weeksSorted[adjIdx];
    const adjDayCount = new Set(schedule.sessions
      .filter(s => s.team_id === gTid && s.week_key === adjWk)
      .map(s => s.date)).size;
    if (adjDayCount > 0) {
      assert(!byId['week-content'].querySelector('.week-expander'),
        'no expander when the viewed week is not the current week');
      assert(dayGroups() === adjDayCount,
        'non-current week renders every day-group it has (' + adjDayCount + ')');
    } else {
      console.log('  skip adjacent-week checks (test team has no sessions in the adjacent week this data cycle)');
    }

    // spec case 7: current week but nothing earlier than today => no expander at all
    setToday(gDays[0]);                     // first training day is "today"
    gotoWeekIndex(gIdx);                    // re-render the (current) week under the new clock
    assert(!byId['week-content'].querySelector('.week-expander'),
      'current week with no past sessions: no expander row');
    assert(dayGroups() === gDays.length, 'current week with no past sessions: all day-groups shown');

    // restore for the remaining checks
    setToday(null);
    delete store['gilboa.week_collapsed'];
    window.applyTeamsParam('?teams=' + T1);
    } // end GK guard
  }

  // =====================================================================
  //  hide a training + add a game  (synthetic data - never the live shape)
  // =====================================================================
  console.log('hide training + personal games (synthetic data)');
  {
    const saved = { sessions: window.DATA.sessions, weeks: window.DATA.weeks, teams: window.DATA.teams,
      byId: window.DATA.teamsById };
    const X1 = 'TX_1', X2 = 'TX_2';
    const N1 = 'קבוצת בדיקה א', N2 = 'קבוצת בדיקה ב';
    const W1 = '2026-11-08', W2 = '2026-11-15';
    let sid = 0;
    const mkSess = (team, date, wd, a, b, type) => ({
      id: 'syn' + (++sid), team_id: team, date, weekday: wd, week_key: date <= '2026-11-14' ? W1 : W2,
      activity_type: type || 'training', start: date + 'T' + a + ':00+02:00', end: date + 'T' + b + ':00+02:00',
      coach_text: null, location: null, notes: null, flags: null,
    });
    const syn = [
      mkSess(X1, '2026-11-08', 0, '17:00', '18:30'),
      mkSess(X1, '2026-11-10', 2, '19:00', '20:30'),   // evening listed first on purpose
      mkSess(X1, '2026-11-10', 2, '16:00', '17:30'),
      mkSess(X1, '2026-11-12', 4, '18:00', '19:30'),
      mkSess(X2, '2026-11-08', 0, '17:00', '18:30'),
      mkSess(X2, '2026-11-11', 3, '20:00', '21:30', 'game'),   // club game row
      mkSess(X1, '2026-11-15', 0, '18:00', '19:30'),   // same weekday, other hour
      mkSess(X1, '2026-11-16', 1, '17:00', '18:30'),   // a weekday that did not exist before
      mkSess(X1, '2026-11-17', 2, '16:00', '17:30'),
      mkSess(X1, '2026-11-17', 2, '19:30', '21:00'),
    ];
    window.DATA.sessions = syn;
    window.DATA.weeks = [W1, W2];
    window.DATA.teams = [{ team_id: X1, display_name: N1, coaches: ['מאמן'] }, { team_id: X2, display_name: N2, coaches: [] }];
    window.DATA.teamsById = {}; window.DATA.teams.forEach(t => { window.DATA.teamsById[t.team_id] = t; });
    setToday('2030-01-06');   // far from the fixtures: no "earlier days" folding

    const wcEl = byId['week-content'];
    const rowsText = () => wcEl.querySelectorAll('.session').map(r => r.textContent);
    const hideBtns = () => wcEl.querySelectorAll('.session-hide').filter(b => /^הסתרת/.test(b.getAttribute('aria-label')));
    const hideBtnFor = (needle) => hideBtns().find(b => b.getAttribute('aria-label').indexOf(needle) !== -1);
    const chips = () => byId['follows-row'].querySelectorAll('.chip');
    const goW1 = () => { let g = 0; while (!prev.disabled && g++ < 40) prev.click(); next.click(); };
    const resetFollows = () => {
      let b, g = 0;
      while ((b = byId['follows-row'].querySelectorAll('.chip-remove')).length && g++ < 20) b[0].click();
    };
    const stored = () => JSON.parse(store['gilboa.hidden'] || '{}');
    const stripBidi = (t) => t.replace(/[⁦⁩]/g, '');

    resetFollows();
    delete store['gilboa.hide_tip_seen'];
    delete store['gilboa.hidden'];
    window.applyTeamsParam('?teams=' + X1);
    window.render();
    goW1();

    console.log('  hide key / ordinal');
    const tueEve = syn[1], tueMorn = syn[2];
    assert(window.sessKey(tueMorn) === '2:1' && window.sessKey(tueEve) === '2:2', 'ordinal follows start time, not data order');
    assert(window.sessKey(syn[0]) === '0:1', 'single training of a weekday has ordinal 1');
    assert(window.sessKey(syn[5]) === null, 'a club game row has no hide key');
    assert(window.sessKey(window.gameToSession({ id: 'g_x', date: '2026-11-12', time: '19:00', venue: 'away', opponent: '' })) === null,
      'a personal game has no hide key');

    console.log('  hide button on trainings only');
    assert(rowsText().length === 4 && hideBtns().length === 4, 'one ✕ per training row (4)');
    const aria0 = hideBtnFor('יום ראשון').getAttribute('aria-label');
    assert(aria0 === 'הסתרת האימון של ' + N1 + ', יום ראשון, 17:00', 'hide ✕ aria-label has team, full weekday, hour');
    assert(hideBtnFor('יום ראשון').getAttribute('title') === 'הסתר אימון זה', 'hide ✕ title');
    assert(rowsText().every(t => t.indexOf(N1) !== -1), 'single-team rows still carry the team label');

    console.log('  hide + undo + first-hide tip');
    hideBtnFor('יום שלישי, 19:00').click();
    assert(JSON.stringify(stored()) === JSON.stringify({ [X1]: ['2:2'] }), 'hiding the evening Tuesday stores key 2:2 only');
    assert(rowsText().length === 3 && rowsText().some(t => t.indexOf('16:00') !== -1) && !rowsText().some(t => t.indexOf('19:00–20:30') !== -1),
      'evening training gone, morning training stays');
    assert(toast.classList.contains('show') && toast.classList.contains('has-action'), 'hide shows an action toast');
    assert(toast.textContent === 'האימון הוסתר. להחזרה לחצו על שם הקבוצה למעלה' + 'ביטול', 'first-ever hide shows the tip + ביטול');
    assert(store['gilboa.hide_tip_seen'] === '1', 'tip flag stored');
    assert(!!byId['follows-row'].querySelector('.chip-main'), 'chip becomes a restore button');
    assert(byId['follows-row'].querySelector('.chip-hidden').textContent === '1 מוסתר', 'badge says "1 מוסתר"');
    toast.querySelector('.toast-action').click();
    assert(Object.keys(stored()).length === 0 && rowsText().length === 4, 'Undo restores the training');
    assert(!byId['follows-row'].querySelector('.chip-main') && !byId['follows-row'].querySelector('.chip-hidden'),
      'no badge / no name button when nothing is hidden');
    assert(chips()[0].querySelector('.chip-text') !== null && chips()[0].querySelectorAll('button').length === 1,
      'plain chip: only the unfollow button is focusable');
    hideBtnFor('יום שלישי, 19:00').click();
    assert(toast.textContent === 'האימון הוסתר' + 'ביטול', 'later hides use the short message');

    console.log('  focus after hide');
    const bBefore = hideBtns().length;
    hideBtnFor('יום חמישי').click();
    assert(global.__focused && /session-hide/.test(global.__focused.className),
      'focus lands on another ✕ after hiding a row (' + bBefore + ' -> ' + hideBtns().length + ')');

    console.log('  arrangement follows team+weekday into the next week');
    // hidden now: Tue ordinal 2, Thu ordinal 1. Also hide Sunday (hour differs next week).
    hideBtnFor('יום ראשון').click();
    assert(JSON.stringify(stored()[X1].slice().sort()) === JSON.stringify(['0:1', '2:2', '4:1']), 'three keys stored');
    assert(byId['follows-row'].querySelector('.chip-hidden').textContent === '3 מוסתרים', 'badge counts stored keys (3 מוסתרים)');
    next.click();
    const w2 = rowsText();
    assert(w2.length === 2, 'next week: Sunday (other hour) and Tuesday-evening stay hidden (2 rows left)');
    assert(w2.some(t => t.indexOf('17:00–18:30') !== -1), 'next week: the weekday that did not exist before still shows');
    assert(w2.some(t => t.indexOf('16:00–17:30') !== -1), 'next week: the Tuesday morning training still shows');
    assert(!w2.some(t => t.indexOf('18:00–19:30') !== -1) && !w2.some(t => t.indexOf('19:30–21:00') !== -1),
      'next week: hidden weekdays stay hidden even though the hour changed');
    prev.click();

    console.log('  chip restore');
    byId['follows-row'].querySelector('.chip-main').click();
    assert(!stored()[X1] && rowsText().length === 4, 'tapping the chip name restores all of the team trainings');
    assert(toast.textContent === 'הוחזרו כל האימונים: ' + N1, 'restore toast names the team');
    next.click();
    assert(rowsText().length === 4, 'restore applies to the other week too');
    prev.click();

    console.log('  empty states');
    let guardH = 0;
    while (hideBtns().length && guardH++ < 10) hideBtns()[0].click();
    assert(global.__focused === wcEl, 'focus moves to #week-content when no ✕ is left');
    assert(wcEl.textContent.indexOf('כל האימונים של השבוע מוסתרים') !== -1, 'week all hidden: card text');
    assert(wcEl.textContent.indexOf('החזרת כל האימונים (4)') !== -1, 'week all hidden: restore-all label counts 4');
    assert(wcEl.querySelectorAll('.day-group').length === 0, 'no day header left when every training is hidden');
    assert(byId['week-actions'].hidden === true, 'export row hidden when the visible list is empty');
    assert(byId['add-game'].hidden === false, 'add-game stays visible with everything hidden');
    const collapsedBefore = store['gilboa.week_collapsed'];
    [...wcEl.querySelectorAll('.restore-btn')][0].click();
    assert(rowsText().length === 4 && store['gilboa.week_collapsed'] === collapsedBefore, 'restore-all brings the rows back, collapse untouched');
    assert(byId['week-actions'].hidden === false, 'export row back with visible rows');

    console.log('  two teams: team all hidden / club game row / day header');
    window.applyTeamsParam('?teams=' + X2);
    window.render();
    assert(wcEl.querySelectorAll('.day-group').length === 4, 'two teams: 4 day groups (Sun, Tue, Wed game, Thu)');
    assert(rowsText().length === 6 && hideBtns().length === 5, 'club game row has no ✕ (6 rows, 5 ✕)');
    hideBtnFor('יום חמישי').click();
    assert(wcEl.querySelectorAll('.day-group').length === 3 &&
      !wcEl.querySelectorAll('.day-head').some(h => h.textContent.indexOf('12/11') !== -1), 'day header disappears with its only training');
    let gx = 0, bx;
    while ((bx = hideBtns().find(x => x.getAttribute('aria-label').indexOf(N1) !== -1)) && gx++ < 10) bx.click();
    assert(wcEl.textContent.indexOf('כל האימונים של ' + N1 + ' מוסתרים השבוע') !== -1, 'team all hidden: per-team line');
    assert(wcEl.textContent.indexOf('כל האימונים של השבוע מוסתרים') === -1, 'team all hidden: no week-level card while others show');
    assert(wcEl.querySelector('.restore-btn').textContent === 'הצג (4)', 'per-team restore label counts hidden rows (4)');
    assert(wcEl.textContent.indexOf('אין אימונים השבוע לקבוצה זו') === -1, 'hidden team is not reported as having no trainings');
    wcEl.querySelector('.restore-btn').click();
    assert(rowsText().length === 6, 'per-team restore brings the rows back');
    next.click();   // W2: X2 has no raw session
    assert(wcEl.textContent.indexOf('אין אימונים השבוע לקבוצה זו: ' + N2) !== -1, 'team with no sessions keeps the old empty line');
    prev.click();

    console.log('  unfollow forgets the arrangement');
    hideBtnFor('יום ראשון, 17:00').click();   // first match = whichever team
    assert(Object.keys(stored()).length === 1, 'a key exists before unfollow');
    const hiddenTeam = Object.keys(stored())[0];
    byId['follows-row'].querySelectorAll('.chip-remove').find(b => b.getAttribute('data-team-id') === hiddenTeam).click();
    assert(!stored()[hiddenTeam], 'unfollowing clears that team hidden keys');
    resetFollows();
    window.applyTeamsParam('?teams=' + X1);
    window.render();
    goW1();

    console.log('  earlier days count only visible days');
    setToday('2026-11-12');   // Thursday of W1
    window.render();
    assert(wcEl.querySelector('.week-expander').textContent.indexOf('הצג ימים קודמים (2)') !== -1, 'past days: Sun + Tue = 2');
    wcEl.querySelector('.week-expander').click();   // expand to reach the past-day ✕ buttons
    hideBtnFor('יום ראשון').click();
    wcEl.querySelector('.week-expander').click();   // collapse again
    assert(wcEl.querySelector('.week-expander').textContent.indexOf('הצג ימים קודמים (1)') !== -1, 'hiding Sunday leaves 1 visible past day');
    wcEl.querySelector('.week-expander').click();
    hideBtnFor('יום שלישי, 16:00').click();
    hideBtnFor('יום שלישי, 19:00').click();
    assert(!wcEl.querySelector('.week-expander'), 'expander disappears when every past day is hidden');
    byId['follows-row'].querySelector('.chip-main').click();
    if (wcEl.querySelector('.week-expander').textContent.indexOf('הסתר') !== -1) wcEl.querySelector('.week-expander').click();   // back to collapsed
    setToday('2030-01-06');
    window.render();

    console.log('  storage failure does not crash');
    {
      const real = global.localStorage;
      global.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
      let threw = false;
      try {
        hideBtnFor('יום ראשון').click();
        assert(rowsText().length === 3, 'hide still works for this session when storage throws');
        byId['follows-row'].querySelector('.chip-main').click();
        window.render();
      } catch (e) { threw = true; console.log(e); }
      assert(!threw, 'throwing localStorage never crashes hide / restore');
      global.localStorage = real;
      window.render();
    }

    console.log('  summaryText');
    const T = (a, b) => ({ team_id: X1, activity_type: 'training', start: '2026-11-08T' + a + ':00+02:00', end: '2026-11-08T' + b + ':00+02:00' });
    const Gm = (a) => window.gameToSession({ id: 'g_' + a, date: '2026-11-08', time: a, venue: 'home', opponent: '' });
    assert(window.summaryText([T('17:00', '18:30'), T('19:00', '20:30'), Gm('18:00')]) === '2 אימונים · משחק אחד · 5 שעות', 'summary: 2 trainings + 1 game');
    assert(window.summaryText([T('17:00', '18:00'), T('19:00', '20:00'), Gm('10:00'), Gm('12:00'), Gm('14:00')]) === '2 אימונים · 3 משחקים · 8 שעות', 'summary: plural games');
    assert(window.summaryText([Gm('10:00')]) === 'משחק אחד · 2 שעות', 'summary: games only');
    assert(window.summaryText([T('17:00', '18:30')]) === 'אימון אחד · 1.5 שעות', 'summary: single training');
    assert(window.summaryText([T('17:00', '18:30'), { team_id: X2, activity_type: 'game', start: '2026-11-08T20:00:00+02:00', end: '2026-11-08T21:30:00+02:00' }]) === 'אימון אחד · משחק אחד · 3 שעות',
      'summary: a club game row counts as a game');

    console.log('  game offsets');
    const gw = window.gameToSession({ id: 'g_w', date: '2026-11-12', time: '19:00', venue: 'away', opponent: 'x' });
    assert(gw.start === '2026-11-12T19:00:00+02:00' && gw.end === '2026-11-12T21:00:00+02:00', 'winter game: +02:00, end = start + 2h');
    const gs = window.gameToSession({ id: 'g_s', date: '2026-07-15', time: '19:00', venue: 'home', opponent: '' });
    assert(gs.start === '2026-07-15T19:00:00+03:00' && gs.end === '2026-07-15T21:00:00+03:00', 'summer game: +03:00');
    assert(gs.team_id === null && gs.kind === 'game' && gs.weekday === 3 && gs.week_key === '2026-07-12', 'game session shape');
    assert(gs.label === 'משחק בית' && gw.label === 'משחק חוץ נגד x', 'composed titles (with / without opponent)');
    assert(window.gameToSession({ id: 'g_l', date: '2026-11-12', time: '21:59', venue: 'away', opponent: '' }).end === '2026-11-12T23:59:00+02:00',
      'latest allowed start ends before midnight');

    console.log('  jerusalemOffset fallback chain');
    {
      const joff = window.jerusalemOffset;
      const noLong = (ms, st) => { if (st === 'longOffset') throw new RangeError('unsupported'); return realName(ms, st); };
      const realName = (ms, st) => new Intl.DateTimeFormat('en', { timeZone: 'Asia/Jerusalem', timeZoneName: st })
        .formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName').value;
      const noIntl = () => { throw new RangeError('unsupported'); };
      const shortFmt = (fmt) => (ms, st) => { if (st === 'longOffset') throw new RangeError('x'); return fmt(ms); };
      const cases = [
        ['2026-03-27', '01:30', '+02:00'], ['2026-03-27', '03:30', '+03:00'],
        ['2026-10-25', '00:30', '+03:00'], ['2026-10-25', '03:00', '+02:00'],
        ['2026-07-15', '19:00', '+03:00'], ['2026-01-15', '19:00', '+02:00']
      ];
      for (const [d, t, want] of cases) {
        assert(joff(d, t) === want, 'primary (longOffset) ' + d + ' ' + t + ' = ' + want);
        assert(joff(d, t, noLong) === want, 'short branch ' + d + ' ' + t + ' = ' + want);
        assert(joff(d, t, noIntl) === want, 'DST-rule branch ' + d + ' ' + t + ' = ' + want);
      }
      // short formats: "GMT+3", "GMT+2", "UTC+02:00" (derive from the rule so the stub is date-correct)
      const ruleOff = (ms) => joff(new Date(ms).toISOString().slice(0, 10), '12:00', noIntl);
      assert(joff('2026-07-15', '19:00', shortFmt(() => 'GMT+3')) === '+03:00', 'short "GMT+3"');
      assert(joff('2026-01-15', '19:00', shortFmt(() => 'GMT+2')) === '+02:00', 'short "GMT+2"');
      assert(joff('2026-01-15', '19:00', shortFmt(() => 'UTC+02:00')) === '+02:00', 'short "UTC+02:00"');
      assert(joff('2026-07-15', '19:00', shortFmt(() => 'GMT+03:00')) === '+03:00', 'short "GMT+03:00"');
      assert(joff('2026-07-15', '19:00', shortFmt(() => 'IDT')) === '+03:00' && joff('2026-01-15', '19:00', shortFmt(() => 'IST')) === '+02:00',
        'unparsable short name falls through to the DST rule');
      assert(ruleOff(Date.UTC(2026, 9, 20)) === '+03:00', 'rule: 20 Oct is still summer time');
    }

    console.log('  game form: validation, defaults');
    store['gilboa.games'] = '[]';
    window.loadGames();   // (hook) normalise
    window.render();
    goW1();
    addGameBtn.click();
    assert(dlg.open === true, 'add-game opens the sheet');
    assert(gDate.value === W1, 'default date = Sunday of the visible week when it is not the current week');
    assert(gDate.attrs.min === '2026-11-01' && gDate.attrs.max === '2026-11-28', 'date min/max = first week - 7 .. last week + 13');
    assert(segAway.getAttribute('aria-checked') === 'true' && segHome.getAttribute('aria-checked') === 'false', 'venue defaults to חוץ');
    assert(gNote.textContent === 'משך המשחק קבוע: שעתיים', 'note before a time is chosen');
    dlg.close();
    setToday('2026-11-10');
    addGameBtn.click();
    assert(gDate.value === '2026-11-10', 'default date = today when viewing the current week');
    gform.dispatch('submit');
    assert(gErrTime.hidden === false && gErrTime.textContent === '⚠️ בחרו שעת התחלה' && gTime.attrs['aria-invalid'] === 'true', 'empty time: inline error + aria-invalid');
    assert(gErrDate.hidden === true && dlg.open === true && JSON.parse(store['gilboa.games']).length === 0, 'invalid form keeps the sheet open and saves nothing');
    gDate.value = ''; gTime.value = '22:00'; gform.dispatch('submit');
    assert(gErrDate.textContent === '⚠️ בחרו תאריך', 'empty date error');
    assert(gErrTime.textContent === '⚠️ המשחק נמשך שעתיים ולכן חייב להתחיל לפני 22:00', 'start >= 22:00 error');
    gDate.value = '2027-03-01'; gTime.value = '19:00'; gform.dispatch('submit');
    assert(gErrDate.textContent === '⚠️ בחרו תאריך' && gErrTime.hidden === true, 'out-of-range date error, valid time clears the time error');
    gTime.value = '19:00'; gTime.dispatch('input');
    assert(gNote.textContent === 'משך המשחק קבוע: שעתיים · מסתיים ב־21:00', 'live end-time note');
    gTime.value = '22:30'; gTime.dispatch('input');
    assert(gNote.textContent === 'משך המשחק קבוע: שעתיים', 'no end time shown for an invalid start');
    dlg.click();   // backdrop click
    assert(dlg.open === false && global.__focused === addGameBtn, 'backdrop click closes and focus returns to add-game');
    setToday('2030-01-06');

    console.log('  game: save, list, order, undo-delete, prune');
    addGameBtn.click();
    assert(gDate.value === W1 && gTime.value === '' && gOpp.value === '' && gErrTime.hidden === true, 'sheet resets on every open');
    gDate.value = '2026-11-12'; gTime.value = '19:00'; gOpp.value = '  הפועל עפולה '; gform.dispatch('submit');
    const g1 = JSON.parse(store['gilboa.games']);
    assert(g1.length === 1 && g1[0].date === '2026-11-12' && g1[0].time === '19:00' && g1[0].venue === 'away' &&
      g1[0].opponent === 'הפועל עפולה' && /^g_/.test(g1[0].id), 'game stored with the agreed shape (away default, trimmed opponent)');
    assert(dlg.open === false, 'sheet closes on save');
    gform.dispatch('submit');   // double submit (sheet already closed)
    assert(JSON.parse(store['gilboa.games']).length === 1, 'submitting twice adds exactly one game');
    assert(stripBidi(toast.textContent) === 'המשחק נוסף ליום ה׳ 12/11, 19:00', 'save toast');
    const gcard = wcEl.querySelector('.session-game');
    assert(!!gcard && gcard.textContent.indexOf('🏆 משחק') !== -1 && gcard.textContent.indexOf('19:00–21:00') !== -1, 'game card: trophy tag + time range');
    assert(gcard.querySelector('.game-label').textContent === 'משחק חוץ נגד הפועל עפולה', 'game card: composed title');
    assert(gcard.textContent.indexOf(N1) === -1 && gcard.textContent.indexOf('🏀') === -1, 'game card has no team / coach / location');
    assert(global.__scrolled === gcard, 'new game card scrolled into view');
    const rt = rowsText();
    assert(rt.length === 5 && rt[3].indexOf('18:00') !== -1 && rt[4].indexOf('🏆') !== -1, 'game sits after the Thursday training, in time order');
    assert(hideBtns().length === 4, 'the game has no hide ✕ (4 training ✕ only)');
    const delBtn = gcard.querySelector('.session-del');
    assert(delBtn.getAttribute('aria-label') === 'מחיקת משחק: משחק חוץ נגד הפועל עפולה, יום חמישי, 19:00', 'delete aria-label');
    assert(!!byId['summary'].textContent && byId['summary'].textContent.indexOf('משחק אחד') !== -1 && byId['summary'].textContent.indexOf('4 אימונים') !== -1,
      'footer summary counts trainings and the game separately: ' + byId['summary'].textContent);
    delBtn.click();
    assert(JSON.parse(store['gilboa.games']).length === 0 && !wcEl.querySelector('.session-game'), 'delete removes the game');
    assert(toast.textContent === 'המשחק נמחק' + 'ביטול', 'delete toast has Undo');
    toast.querySelector('.toast-action').click();
    const g2 = JSON.parse(store['gilboa.games']);
    assert(g2.length === 1 && g2[0].id === g1[0].id && !!wcEl.querySelector('.session-game'), 'Undo re-inserts the same game');
    store['gilboa.games'] = JSON.stringify([
      { id: 'g_old', date: '2020-01-01', time: '19:00', venue: 'home', opponent: '' },
      { id: 'g_bad', date: 'nope', time: '19:00', venue: 'home', opponent: '' },
      { id: 'g_ok', date: '2030-01-02', time: '19:00', venue: 'home', opponent: 'x' }]);
    assert(window.loadGames().map(g => g.id).join() === 'g_ok' && JSON.parse(store['gilboa.games']).length === 1, 'stale / malformed games pruned at load');
    setToday('2026-11-10');   // re-sync memory from storage (the prune cutoff depends on "today")
    store['gilboa.games'] = JSON.stringify(g2); window.loadGames();
    setToday('2030-01-06');

    console.log('  game: home toggle, other week, no-data week');
    addGameBtn.click();
    segHome.click();
    assert(segHome.getAttribute('aria-checked') === 'true' && segAway.getAttribute('aria-checked') === 'false', 'toggle selects בית');
    gDate.value = '2026-11-23'; gTime.value = '10:00'; gOpp.value = ''; gform.dispatch('submit');
    assert(byId['week-range'].textContent !== '' && wcEl.textContent.indexOf('אין נתונים לשבוע זה') !== -1, 'jumped to the (unpublished) week of the new game');
    const nd = wcEl.querySelector('.session-game');
    assert(!!nd && nd.querySelector('.game-label').textContent === 'משחק בית', 'game renders in a week with no club data; empty opponent => "משחק בית"');
    assert(byId['week-actions'].hidden === false && byId['week-footer'].hidden === false, 'no-data week with a game: export row + footer shown');
    assert(window.buildWeekText('2026-11-22').indexOf('משחק בית') !== -1, 'text export of a no-data week includes the game');
    goW1();

    console.log('  exports match the screen');
    window.applyTeamsParam('?teams=' + X1);
    // arrangement: hide Tuesday evening, keep the Thursday game
    hideBtnFor('יום שלישי, 19:00').click();
    const visTxt = stripBidi(window.buildWeekText(W1));
    assert(visTxt.indexOf('19:00–20:30') === -1, 'text export omits the hidden training');
    assert(visTxt.indexOf('16:00–17:30') !== -1, 'text export keeps the visible Tuesday morning');
    assert(visTxt.indexOf('  19:00–21:00 · משחק חוץ נגד הפועל עפולה') !== -1, 'text export has the game line');
    assert(/\nסה״כ: קבוצה אחת · 3 אימונים · משחק אחד · 6\.5 שעות$/.test(visTxt), 'text footer: ' + visTxt.split('\n').pop());
    assert(byId['summary'].textContent === '3 אימונים · משחק אחד · 6.5 שעות', 'screen footer matches the export footer');
    assert(!/null|undefined/.test(visTxt), 'text export never prints null/undefined');
    const icsX = window.buildICS(W1).replace(/\r\n /g, '');
    assert((icsX.match(/BEGIN:VEVENT/g) || []).length === 4, 'ICS: 3 trainings + 1 game');
    const gEv = icsX.split('BEGIN:VEVENT').find(b => b.indexOf('UID:' + g1[0].id + '@gilboa-schedule') !== -1);
    assert(!!gEv && /DTSTART:20261112T170000Z/.test(gEv) && /DTEND:20261112T190000Z/.test(gEv), 'ICS game: +02:00 start/end honoured (17:00Z–19:00Z)');
    assert(gEv && gEv.indexOf('LOCATION') === -1 && gEv.indexOf('SUMMARY:משחק חוץ נגד הפועל עפולה') !== -1, 'ICS game: SUMMARY is the label, no LOCATION');
    assert(icsX.indexOf('19:00') === -1 && !/null|undefined/.test(icsX) && icsX.indexOf('T170000Z') !== -1, 'ICS: no null / undefined');
    // image: record every drawn string
    const origGC = El.prototype.getContext, drawn = [];
    El.prototype.getContext = function (k) {
      const c = origGC.call(this, k);
      if (c && !c._rec) { c._rec = true; c.fillText = (t) => drawn.push(t); }
      return c;
    };
    const cv = window.drawWeekImage(W1);
    El.prototype.getContext = origGC;
    assert(cv.width > 0 && drawn.some(t => t.indexOf('משחק חוץ נגד הפועל עפולה') !== -1 && stripBidi(t).indexOf('19:00–21:00') !== -1), 'image draws the game row with its time');
    assert(drawn.every(t => !/null|undefined/.test(t)) && drawn.indexOf('3 אימונים · משחק אחד · 6.5 שעות') !== -1, 'image: no null / summary matches');
    assert(!drawn.some(t => t.indexOf('19:00–20:30') !== -1), 'image omits the hidden training');
    // games-only footer: hide everything else
    let g3 = 0;
    while (hideBtns().length && g3++ < 10) hideBtns()[0].click();
    const only = stripBidi(window.buildWeekText(W1));
    assert(/\nסה״כ: משחק אחד · 2 שעות$/.test(only), 'games-only week: no team count in the footer');
    assert(byId['week-actions'].hidden === false && wcEl.textContent.indexOf('כל האימונים של השבוע מוסתרים') === -1,
      'a visible game keeps the export row and suppresses the week-all-hidden card');

    console.log('  onboarding hides add-game');
    resetFollows();
    assert(byId['add-game'].hidden === true && byId['onboarding'].hidden === false, 'add-game hidden in onboarding');
    assert(!stored()[X1] && !stored()[X2], 'unfollowing everything leaves no hidden keys');
    assert(window.weekSessionsFor(W1).length === 0, 'personal games are not shown while no team is followed');

    // restore the live fixtures for the remaining checks
    window.DATA.sessions = saved.sessions; window.DATA.weeks = saved.weeks;
    window.DATA.teams = saved.teams; window.DATA.teamsById = saved.byId;
    store['gilboa.games'] = '[]'; window.loadGames();
    setToday(null);
    window.applyTeamsParam('?teams=' + T1);
    window.render();
    assert(byId['add-game'].hidden === false, 'add-game visible again once a team is followed');
    assert(store['gilboa.hide_tip_seen'] === '1' && API_CALLS.length === 0, 'still no /api/ requests after the new feature ran (' + API_CALLS.length + ')');
  }

  console.log('week nav bounds');
  guard = 0; while (!next.disabled && guard++ < 12) next.click();
  assert(byId['week-content'].textContent.indexOf('אין נתונים לשבוע זה') !== -1, 'one past the last week shows "no data"');
  guard = 0; while (!prev.disabled && guard++ < 20) prev.click();
  assert(byId['week-content'].textContent.indexOf('אין נתונים לשבוע זה') !== -1, 'one before the first week shows "no data"');

  assert(API_CALLS.length === 0, 'no /api/ request made during load, render and week navigation (' + API_CALLS.length + ')');

  console.log('unfollow');
  assert(byId['follows-row'].querySelectorAll('.chip-remove').length >= 1, 'followed chips have remove controls');
  let rmGuard = 0, rmBtns;
  while ((rmBtns = byId['follows-row'].querySelectorAll('.chip-remove')).length && rmGuard++ < 12) rmBtns[0].click();
  assert(byId['onboarding'].hidden === false, 'onboarding returns after unfollowing every team');
  assert(JSON.parse(store['gilboa.followed']).length === 0, 'localStorage followed is empty');
  assert(byId['share-follows'].hidden === true && byId['week-actions'].hidden === true, 'export actions hidden with no team followed');

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all site smoke checks passed'));
  process.exit(failures ? 1 : 0);
})();
