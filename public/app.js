/* Gilboa Maayanot Team Schedule - static site logic.
   Vanilla JS, no dependencies. Loads public/data/*.json and renders
   two screens: "My Week" and "Add Team". Followed teams live in
   localStorage (per device). All times are shown as the wall-clock
   time in the source string (Asia/Jerusalem) - never re-shifted. */

'use strict';

// ---------- Constants ----------
var LS_FOLLOWED = 'gilboa.followed';
var LS_SEEN = 'gilboa.seen_generated_at';

// Fixed, accessible team-dot palette. Every colour is >= 5:1 contrast on
// white, so it is also safe to use as text. Assigned by follow order.
var PALETTE = [
  '#1d6a8c', // blue
  '#b54708', // orange
  '#2f7d32', // green
  '#7b2d8e', // purple
  '#b02a5b', // rose
  '#0f766e', // teal
  '#4f46e5', // indigo
  '#8a5a00'  // gold-brown
];

var HE_WEEKDAY = ['א׳', 'ב׳', 'ג׳', 'ד׳',
  'ה׳', 'ו׳', 'שבת']; // א׳ ב׳ ג׳ ד׳ ה׳ ו׳ שבת
var HE_MONTHS = ['בינואר', 'בפברואר',
  'במרץ', 'באפריל', 'במאי',
  'ביוני', 'ביולי', 'באוגוסט',
  'בספטמבר', 'באוקטובר',
  'בנובמבר', 'בדצמבר'];

// ---------- State ----------
var DATA = { meta: null, teams: [], teamsById: {}, sessions: [], weeks: [], changes: [] };
var followed = loadFollowed();
var viewSunday = null;        // 'YYYY-MM-DD' Sunday of the visible week

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', function () {
  Promise.all([
    fetchJson('data/meta.json'),
    fetchJson('data/teams.json'),
    fetchJson('data/schedule.json'),
    fetchJson('data/changes.json')
  ]).then(function (res) {
    DATA.meta = res[0];
    DATA.teams = Array.isArray(res[1]) ? res[1] : [];
    DATA.sessions = (res[2] && res[2].sessions) || [];
    DATA.weeks = ((res[2] && res[2].weeks) || []).slice().sort();
    DATA.changes = (res[3] && res[3].changes) || [];

    DATA.teams.forEach(function (t) { DATA.teamsById[t.team_id] = t; });

    viewSunday = pickInitialWeek();
    wireEvents();
    document.getElementById('app').hidden = false;
    render();
  }).catch(function (err) {
    console.error('Failed to load schedule data:', err);
    var app = document.getElementById('app');
    if (app) app.hidden = true;
    document.getElementById('fatal').hidden = false;
  });
});

function fetchJson(url) {
  return fetch(url, { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
    return r.json();
  });
}

// ---------- localStorage ----------
function loadFollowed() {
  try {
    var raw = localStorage.getItem(LS_FOLLOWED);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (x) { return typeof x === 'string'; });
  } catch (e) {
    return [];
  }
}
function saveFollowed() {
  try { localStorage.setItem(LS_FOLLOWED, JSON.stringify(followed)); } catch (e) {}
}
function getSeen() {
  try { return localStorage.getItem(LS_SEEN) || ''; } catch (e) { return ''; }
}
function setSeen(v) {
  try { localStorage.setItem(LS_SEEN, v); } catch (e) {}
}

// ---------- Date helpers (string based, no timezone math) ----------
function ymdToUTC(ymd) {
  var p = ymd.split('-');
  return Date.UTC(+p[0], +p[1] - 1, +p[2]);
}
function utcToYmd(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function addDays(ymd, n) { return utcToYmd(ymdToUTC(ymd) + n * 86400000); }

function sundayOf(ymd) {
  var dow = new Date(ymdToUTC(ymd)).getUTCDay(); // 0=Sun
  return addDays(ymd, -dow);
}
function todayYmd() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function pickInitialWeek() {
  if (!DATA.weeks.length) return sundayOf(todayYmd());
  var target = sundayOf(todayYmd());
  if (DATA.weeks.indexOf(target) !== -1) return target;
  // Clamp to the available range.
  if (target < DATA.weeks[0]) return DATA.weeks[0];
  if (target > DATA.weeks[DATA.weeks.length - 1]) return DATA.weeks[DATA.weeks.length - 1];
  // Between known weeks (gap) - snap to nearest earlier week.
  for (var i = DATA.weeks.length - 1; i >= 0; i--) {
    if (DATA.weeks[i] <= target) return DATA.weeks[i];
  }
  return DATA.weeks[0];
}

function weekRangeLabel(sunday) {
  var sat = addDays(sunday, 6);
  var s = new Date(ymdToUTC(sunday)), e = new Date(ymdToUTC(sat));
  var sd = s.getUTCDate(), ed = e.getUTCDate();
  var sm = HE_MONTHS[s.getUTCMonth()], em = HE_MONTHS[e.getUTCMonth()];
  if (sm === em) return sd + '–' + ed + ' ' + sm;               // 23–29 באוגוסט
  return sd + ' ' + sm + ' – ' + ed + ' ' + em;                  // 30 באוגוסט – 5 בספטמבר
}

function hhmm(iso) {
  // iso like "2026-09-08T19:00:00+03:00" - take the literal wall time.
  var m = /T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? m[1] + ':' + m[2] : '';
}
function dmLabel(ymd) {
  var p = ymd.split('-');
  return (+p[2]) + '/' + (+p[1]); // 8/9
}

// ---------- Text normalization for search ----------
// Loose form: keep single spaces, unify dashes, drop quotes, lowercase.
function normLoose(s) {
  return String(s || '')
    .replace(/["'׳״‘’“”]/g, '')
    .replace(/[־–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Partial-name match: the query is split into words, and every word must appear
// somewhere in the target. So "נערים לאומית" matches "נערים ט לאומית", and extra
// spaces don't matter. Empty query matches everything.
function matchQuery(rawQuery, target) {
  var hay = normLoose(target);
  var words = normLoose(rawQuery).split(' ').filter(Boolean);
  if (!words.length) return true;
  return words.every(function (w) { return hay.indexOf(w) !== -1; });
}

// ---------- Follow / unfollow ----------
function isFollowed(id) { return followed.indexOf(id) !== -1; }
function followTeam(id) {
  if (!isFollowed(id)) { followed.push(id); saveFollowed(); }
}
function unfollowTeam(id) {
  var i = followed.indexOf(id);
  if (i !== -1) { followed.splice(i, 1); saveFollowed(); }
}
function colorFor(id) {
  var i = followed.indexOf(id);
  return i === -1 ? '#888' : PALETTE[i % PALETTE.length];
}

// ---------- Rendering ----------
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function render() {
  renderHeader();
  renderMyWeek();
}

function renderHeader() {
  document.getElementById('week-range').textContent = weekRangeLabel(viewSunday);
  var weeks = DATA.weeks;
  var prevBtn = document.getElementById('prev-week');
  var nextBtn = document.getElementById('next-week');
  if (!weeks.length) {
    prevBtn.disabled = nextBtn.disabled = true;
    return;
  }
  // Allow stepping one week beyond each end (shows an "no data" message),
  // then stop.
  var minSun = addDays(weeks[0], -7);
  var maxSun = addDays(weeks[weeks.length - 1], 7);
  prevBtn.disabled = viewSunday <= minSun;
  nextBtn.disabled = viewSunday >= maxSun;
}

function renderMyWeek() {
  var onboarding = document.getElementById('onboarding');
  var followsRow = document.getElementById('follows-row');
  var content = document.getElementById('week-content');
  var footer = document.getElementById('week-footer');
  content.innerHTML = '';

  if (!followed.length) {
    onboarding.hidden = false;
    followsRow.hidden = true;
    followsRow.innerHTML = '';
    footer.hidden = true;
    renderChangesBanner([]);
    return;
  }
  onboarding.hidden = true;

  renderFollowChips(followsRow);
  followsRow.hidden = false;

  // Sessions for the visible week, for followed teams only.
  var weekSessions = DATA.sessions.filter(function (s) {
    return s.team_id && isFollowed(s.team_id) && s.week_key === viewSunday;
  });

  var weekHasData = DATA.weeks.indexOf(viewSunday) !== -1;

  renderChangesBanner(followed);

  if (!weekHasData) {
    content.appendChild(el('div', 'no-data',
      'אין נתונים לשבוע זה')); // אין נתונים לשבוע זה
    footer.hidden = true;
    return;
  }

  // Group by day -> time.
  weekSessions.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return hhmm(a.start) < hhmm(b.start) ? -1 : (hhmm(a.start) > hhmm(b.start) ? 1 : 0);
  });

  var byDate = {};
  var order = [];
  weekSessions.forEach(function (s) {
    if (!byDate[s.date]) { byDate[s.date] = []; order.push(s.date); }
    byDate[s.date].push(s);
  });

  var multi = followed.length > 1;
  order.forEach(function (date) {
    var grp = el('div', 'day-group');
    var wd = byDate[date][0].weekday;
    grp.appendChild(el('div', 'day-head', HE_WEEKDAY[wd] + ' ' + dmLabel(date)));
    byDate[date].forEach(function (s) { grp.appendChild(renderSession(s, multi)); });
    content.appendChild(grp);
  });

  // Followed teams with no session this week.
  followed.forEach(function (id) {
    var has = weekSessions.some(function (s) { return s.team_id === id; });
    if (!has) {
      var t = DATA.teamsById[id];
      var name = t ? t.display_name : id;
      content.appendChild(el('div', 'empty-team',
        'אין אימונים השבוע לקבוצה זו: ' + name));
      // אין אימונים השבוע לקבוצה זו: <name>
    }
  });

  // Footer summary.
  renderSummary(weekSessions);
  footer.hidden = false;
}

function renderFollowChips(row) {
  row.innerHTML = '';
  followed.forEach(function (id) {
    var t = DATA.teamsById[id];
    var chip = el('div', 'chip');

    var dot = el('span', 'chip-dot');
    dot.style.background = colorFor(id);
    chip.appendChild(dot);

    var txt = el('span', 'chip-text');
    var name = t ? t.display_name : id;
    var coaches = (t && t.coaches && t.coaches.length) ? t.coaches.join(' · ') : '';
    txt.appendChild(document.createTextNode('🏀 ' + name));
    if (coaches) {
      var c = el('span', 'chip-coach', '  ·  ' + coaches);
      txt.appendChild(c);
    }
    chip.appendChild(txt);

    var rm = el('button', 'chip-remove');
    rm.type = 'button';
    rm.setAttribute('aria-label', 'הסרת ' + name); // הסרת <name>
    rm.textContent = '✕';
    rm.addEventListener('click', function () {
      unfollowTeam(id);
      render();
    });
    chip.appendChild(rm);

    row.appendChild(chip);
  });

  var add = el('button', 'chip chip-add');
  add.type = 'button';
  add.textContent = '＋ הוסף קבוצה'; // ＋ הוסף קבוצה
  add.addEventListener('click', function () { goto('addteam'); });
  row.appendChild(add);
}

function renderSession(s, multi) {
  var card = el('div', 'session');
  if (multi) card.style.borderInlineStartColor = colorFor(s.team_id);

  var timeText = hhmm(s.start) + (s.end ? '–' + hhmm(s.end) : '');
  card.appendChild(el('span', 'session-time', timeText));

  var line = el('div', 'session-line');
  var t = DATA.teamsById[s.team_id];
  var name = t ? t.display_name : s.team_id;

  var team = el('span', 'team');
  if (multi) {
    var dot = el('span', 'session-dot');
    dot.style.background = colorFor(s.team_id);
    team.appendChild(dot);
  }
  team.appendChild(document.createTextNode('🏀 ' + name));
  line.appendChild(team);

  if (s.coach_text) line.appendChild(el('span', 'coach', '👤 ' + s.coach_text));
  if (s.location) line.appendChild(el('span', 'loc', '📍 ' + s.location));
  card.appendChild(line);

  var notes = normalizeNotes(s.notes);
  if (notes.length) {
    card.appendChild(el('div', 'session-note', 'ℹ️ ' + notes.join('  ·  ')));
  }

  var flags = Array.isArray(s.flags) ? s.flags : (s.flags ? [s.flags] : []);
  if (flags.indexOf('end_not_after_start') !== -1 || flags.indexOf('bad_end_time') !== -1) {
    card.appendChild(el('div', 'session-warn',
      '⚠️ שעת סיום לא ודאית')); // שעת סיום לא ודאית
  }

  return card;
}

function normalizeNotes(notes) {
  if (!notes) return [];
  if (Array.isArray(notes)) return notes.filter(Boolean).map(String);
  return [String(notes)];
}

function renderSummary(weekSessions) {
  var count = weekSessions.length;
  var mins = 0;
  weekSessions.forEach(function (s) {
    var a = hhmm(s.start), b = hhmm(s.end);
    if (!a || !b) return;
    var d = toMin(b) - toMin(a);
    if (d > 0) mins += d;
  });
  var hours = mins / 60;
  var hStr = (Math.round(hours * 10) % 10 === 0) ? String(Math.round(hours)) : hours.toFixed(1);

  var countStr = count === 1
    ? 'אימון אחד'          // אימון אחד
    : count + ' אימונים';      // N אימונים
  var hoursStr = hStr + ' ' + 'שעות';         // H שעות
  document.getElementById('summary').textContent = countStr + '  ·  ' + hoursStr;

  var upd = '';
  if (DATA.meta && DATA.meta.generated_at) {
    upd = 'עודכן: ' + fmtGenerated(DATA.meta.generated_at); // עודכן:
  }
  document.getElementById('updated').textContent = upd;
}
function toMin(hm) { var p = hm.split(':'); return (+p[0]) * 60 + (+p[1]); }

function fmtGenerated(iso) {
  try {
    var d = new Date(iso);
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(d);
  } catch (e) {
    return iso;
  }
}

// ---------- Changes banner ----------
function renderChangesBanner(followedIds) {
  var banner = document.getElementById('changes-banner');
  var summary = banner.querySelector('.changes-summary');
  var list = banner.querySelector('.changes-list');

  var relevant = (DATA.changes || []).filter(function (c) {
    return followedIds.indexOf(c.team_id) !== -1;
  });

  var isNew = DATA.meta && DATA.meta.generated_at &&
    DATA.meta.generated_at !== getSeen();

  if (!isNew || !relevant.length) {
    banner.hidden = true;
    return;
  }

  summary.textContent = relevant.length === 1
    ? 'שינוי אחד בלוח האימונים – לחץ לפרטים'
    : relevant.length + ' שינויים בלוח האימונים – לחץ לפרטים';
  // "שינוי אחד בלוח האימונים – לחץ לפרטים" / "N שינויים בלוח האימונים – לחץ לפרטים"

  list.innerHTML = '';
  relevant.forEach(function (c) {
    list.appendChild(el('li', null, describeChange(c)));
  });
  list.hidden = true;
  banner.hidden = false;
}

function describeChange(c) {
  var t = DATA.teamsById[c.team_id];
  var name = t ? t.display_name : c.team_id;
  var kinds = {
    added: 'אימון חדש נוסף',            // אימון חדש נוסף
    removed: 'אימון בוטל',                            // אימון בוטל
    time_changed: 'שעה עודכנה',                      // שעה עודכנה
    location_changed: 'מיקום עודכן',            // מיקום עודכן
    team_changed: 'שיוך קבוצה עודכן' // שיוך קבוצה עודכן
  };
  var label = kinds[c.kind] || c.kind;
  var detail = '';
  if (c.kind === 'time_changed' && c.old && c.new) {
    detail = ': ' + hhmm(c.old.start) + '–' + hhmm(c.old.end) +
      ' ← ' + hhmm(c.new.start) + '–' + hhmm(c.new.end);
  } else if (c.kind === 'location_changed' && c.old && c.new) {
    detail = ': ' + (c.old.location || '') + ' ← ' + (c.new.location || '');
  }
  return name + ' – ' + label + detail;
}

// ---------- Add Team screen ----------
// One search box: matches team name AND coach name. Word-subset match (see
// matchQuery). Empty box lists every team so a parent who cannot spell it can
// browse.
function renderSearch() {
  var input = document.getElementById('search');
  var hint = document.getElementById('search-hint');
  var results = document.getElementById('results');
  var q = input.value;
  var hasQ = normLoose(q).length > 0;

  results.innerHTML = '';
  hint.textContent = 'חיפוש לפי שם קבוצה או שם מאמן. אפשר להקליד רק חלק מהשם.';
  // "Search by team or coach name. You can type just part of the name."

  var teams = DATA.teams.slice().sort(function (a, b) {
    return a.display_name.localeCompare(b.display_name, 'he');
  });
  var matches = teams.filter(function (t) {
    if (!hasQ) return true;
    if (matchQuery(q, t.display_name)) return true;
    return (t.coaches || []).some(function (c) { return matchQuery(q, c); });
  });

  if (!matches.length) {
    results.appendChild(el('div', 'results-empty',
      'לא נמצאו קבוצות')); // לא נמצאו קבוצות
    return;
  }
  matches.forEach(function (t) { results.appendChild(teamResult(t)); });
}

function teamResult(t) {
  var btn = el('button', 'result');
  btn.type = 'button';
  btn.setAttribute('data-team-id', t.team_id);

  btn.appendChild(el('div', 'r-team', '🏀 ' + t.display_name));

  var coachText = (t.coaches && t.coaches.length) ? t.coaches.join('  ·  ') : '';
  if (coachText) btn.appendChild(el('div', 'r-coach', '👤 ' + coachText));

  // Search results intentionally show team + coach only - no note line.

  if (isFollowed(t.team_id)) {
    btn.appendChild(el('div', 'r-followed',
      '✓ נעקב כבר')); // ✓ נעקב כבר
  }

  btn.addEventListener('click', function () {
    followTeam(t.team_id);
    goto('myweek');
  });
  return btn;
}

// ---------- Screen navigation ----------
function goto(screen) {
  var mw = document.getElementById('screen-myweek');
  var at = document.getElementById('screen-addteam');
  if (screen === 'addteam') {
    mw.hidden = true;
    at.hidden = false;
    document.getElementById('search').value = '';
    renderSearch();
    document.getElementById('search').focus();
  } else {
    at.hidden = true;
    mw.hidden = false;
    render();
  }
  window.scrollTo(0, 0);
}

// ---------- Events ----------
function wireEvents() {
  document.getElementById('prev-week').addEventListener('click', function () {
    viewSunday = addDays(viewSunday, -7);
    render();
  });
  document.getElementById('next-week').addEventListener('click', function () {
    viewSunday = addDays(viewSunday, 7);
    render();
  });

  document.querySelectorAll('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () { goto(b.getAttribute('data-goto')); });
  });

  document.getElementById('search').addEventListener('input', renderSearch);

  var banner = document.getElementById('changes-banner');
  var toggle = banner.querySelector('.changes-toggle');
  toggle.addEventListener('click', function () {
    var list = banner.querySelector('.changes-list');
    list.hidden = !list.hidden;
    toggle.setAttribute('aria-expanded', String(!list.hidden));
    // Viewing the banner marks this update as seen.
    if (DATA.meta && DATA.meta.generated_at) setSeen(DATA.meta.generated_at);
  });
}
