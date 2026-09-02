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
  get textContent() { return this.children.length ? this.children.map(c => c.textContent).join('') : this._text; }
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

  console.log('add team (team search: partial words + extra spaces)');
  onb.children[0].click();
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
  assert(/\nסה״כ: .*קבוצ.* · .*אימונ.* · .* שעות/.test(wt), 'week text ends with a summary line');
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
    assert(!byId['week-content'].querySelector('.week-expander'),
      'no expander when the viewed week is not the current week');
    assert(dayGroups() === adjDayCount,
      'non-current week renders every day-group it has (' + adjDayCount + ')');

    // restore for the remaining checks
    setToday(null);
    delete store['gilboa.week_collapsed'];
    window.applyTeamsParam('?teams=' + T1);
  }

  console.log('week nav bounds');
  guard = 0; while (!next.disabled && guard++ < 12) next.click();
  assert(byId['week-content'].textContent.indexOf('אין נתונים לשבוע זה') !== -1, 'one past the last week shows "no data"');
  guard = 0; while (!prev.disabled && guard++ < 20) prev.click();
  assert(byId['week-content'].textContent.indexOf('אין נתונים לשבוע זה') !== -1, 'one before the first week shows "no data"');

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
