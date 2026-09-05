/* Gilboa Maayanot Team Schedule - static site logic.
   Vanilla JS, no dependencies. Loads public/data/*.json and renders
   two screens: "My Week" and "Add Team". Followed teams live in
   localStorage (per device). All times are shown as the wall-clock
   time in the source string (Asia/Jerusalem) - never re-shifted. */

'use strict';

// ---------- Constants ----------
var LS_FOLLOWED = 'gilboa.followed';
var LS_SEEN = 'gilboa.seen_generated_at';
var LS_WEEK_COLLAPSED = 'gilboa.week_collapsed';

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
var HE_WEEKDAY_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי',
  'חמישי', 'שישי', 'שבת']; // full day names for copy/share/calendar exports
var HE_MONTHS = ['בינואר', 'בפברואר',
  'במרץ', 'באפריל', 'במאי',
  'ביוני', 'ביולי', 'באוגוסט',
  'בספטמבר', 'באוקטובר',
  'בנובמבר', 'בדצמבר'];

// ---------- State ----------
var DATA = { meta: null, teams: [], teamsById: {}, sessions: [], weeks: [], changes: [] };
var followed = loadFollowed();
var viewSunday = null;        // 'YYYY-MM-DD' Sunday of the visible week
var weekCollapsed = loadWeekCollapsed();   // current week: hide already-passed days

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

    maybeApplySharedTeams();

    viewSunday = pickInitialWeek();
    wireEvents();
    document.getElementById('app').hidden = false;
    render();
    if (window.Rides && window.Rides.ping) {
      try { window.Rides.ping(); } catch (e) { /* opens ping is best-effort */ }
    }
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
function loadWeekCollapsed() {
  try { return localStorage.getItem(LS_WEEK_COLLAPSED) !== '0'; } catch (e) { return true; }
}
function saveWeekCollapsed() {
  try { localStorage.setItem(LS_WEEK_COLLAPSED, weekCollapsed ? '1' : '0'); } catch (e) {}
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
  window.viewSunday = viewSunday; // rides.js reads the current week from here
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
  // The rides hooks in the `finally` must never be able to break the schedule
  // render, so the whole schedule body runs inside try/finally (not try/catch —
  // a real schedule error still propagates exactly as before).
  try {
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
    setHidden('share-follows', true);
    setHidden('week-actions', true);
    renderChangesBanner([]);
    return;
  }
  onboarding.hidden = true;

  renderFollowChips(followsRow);
  followsRow.hidden = false;
  setHidden('share-follows', false);

  // Sessions for the visible week, for followed teams only (day -> time sorted).
  var weekSessions = weekSessionsFor(viewSunday);

  var weekHasData = DATA.weeks.indexOf(viewSunday) !== -1;

  renderChangesBanner(followed);

  if (!weekHasData) {
    content.appendChild(el('div', 'no-data',
      'אין נתונים לשבוע זה')); // אין נתונים לשבוע זה
    footer.hidden = true;
    setHidden('week-actions', true);
    return;
  }

  setHidden('week-actions', weekSessions.length === 0);

  var multi = followed.length > 1;
  var split = splitWeekByToday(weekSessions, viewSunday, todayYmd());

  if (split.isCurrentWeek && split.pastGroups.length) {
    content.appendChild(renderExpander(split.pastGroups.length));
    if (!weekCollapsed) {
      split.pastGroups.forEach(function (g) { content.appendChild(renderDayGroup(g, multi)); });
    }
  }

  if (split.upcomingGroups.length) {
    split.upcomingGroups.forEach(function (g) { content.appendChild(renderDayGroup(g, multi)); });
  } else if (split.isCurrentWeek && split.pastGroups.length) {
    content.appendChild(el('div', 'no-data', 'אין עוד אימונים השבוע'));
  }

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
  } finally {
    if (window.Rides) {
      try {
        if (window.Rides.renderRoleToggle) window.Rides.renderRoleToggle();
        if (window.Rides.renderSummaryCard) window.Rides.renderSummaryCard();
      } catch (e) {
        console.error('rides UI error (schedule unaffected):', e);
      }
    }
  }
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

  // Player-mode ride chip. Contained: a rides failure never breaks the card.
  if (window.Rides && window.Rides.isPlayerWithToken()) {
    try { window.Rides.decorateSession(card, s); }
    catch (e) { console.error('ride chip error (schedule unaffected):', e); }
  }

  return card;
}

function renderDayGroup(group, multi) {
  var date = group[0], sessions = group[1];
  var grp = el('div', 'day-group');
  grp.appendChild(el('div', 'day-head', HE_WEEKDAY[sessions[0].weekday] + ' ' + dmLabel(date)));
  sessions.forEach(function (s) { grp.appendChild(renderSession(s, multi)); });
  return grp;
}

// Toggle row for the current week's already-passed days.
function renderExpander(pastDayCount) {
  var btn = el('button', 'week-expander');
  btn.type = 'button';
  btn.setAttribute('aria-expanded', String(!weekCollapsed));
  btn.appendChild(el('span', 'week-expander-caret', weekCollapsed ? '◂' : '▾'));
  btn.appendChild(document.createTextNode(' ' + (weekCollapsed
    ? 'הצג ימים קודמים (' + pastDayCount + ')'
    : 'הסתר ימים קודמים')));
  btn.addEventListener('click', function () {
    weekCollapsed = !weekCollapsed;
    saveWeekCollapsed();
    renderMyWeek();
    var again = document.querySelector('.week-expander');
    if (again) again.focus();
  });
  return btn;
}

function normalizeNotes(notes) {
  if (!notes) return [];
  if (Array.isArray(notes)) return notes.filter(Boolean).map(String);
  return [String(notes)];
}

function renderSummary(weekSessions) {
  var count = weekSessions.length;
  var hStr = hoursStr(sumMinutes(weekSessions));

  var countStr = count === 1
    ? 'אימון אחד'          // אימון אחד
    : count + ' אימונים';      // N אימונים
  var hoursLabel = hStr + ' ' + 'שעות';         // H שעות
  document.getElementById('summary').textContent = countStr + '  ·  ' + hoursLabel;

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

// "יום ג׳ 8/9" — Hebrew weekday letter + d/m, per docs/ui-ux-spec.md.
function heWeekdayDate(ymd) {
  var dow = new Date(ymdToUTC(ymd)).getUTCDay(); // 0=Sun
  return 'יום ' + HE_WEEKDAY[dow] + ' ' + dmLabel(ymd);
}

// Old → new is spelled out as "לפני: … · אחרי: …" (before / after) rather than an
// arrow: a bare ← is ambiguous in an RTL line and gets reordered by the browser's
// bidi algorithm. `time_changed` also covers a session moved to a different day
// (the spec keys it off start/end, which carry the date), so show the weekday +
// date on each side whenever the day itself moved.
function describeChange(c) {
  var t = DATA.teamsById[c.team_id];
  var name = t ? t.display_name : c.team_id;
  var label, detail = '';

  if (c.kind === 'time_changed' && c.old && c.new) {
    var oDay = String(c.old.start).slice(0, 10);
    var nDay = String(c.new.start).slice(0, 10);
    var oTime = hhmm(c.old.start) + '–' + hhmm(c.old.end);
    var nTime = hhmm(c.new.start) + '–' + hhmm(c.new.end);
    if (oDay && nDay && oDay !== nDay) {
      label = 'מועד האימון עודכן'; // the training was moved to another day
      detail = ' — לפני: ' + heWeekdayDate(oDay) + ' ' + oTime +
        ' · אחרי: ' + heWeekdayDate(nDay) + ' ' + nTime;
    } else {
      label = 'שעה עודכנה';
      detail = ' — לפני: ' + oTime + ' · אחרי: ' + nTime;
    }
  } else if (c.kind === 'location_changed' && c.old && c.new) {
    label = 'מיקום עודכן';
    detail = ' — לפני: ' + (c.old.location || '—') + ' · אחרי: ' + (c.new.location || '—');
  } else if (c.kind === 'added') {
    label = 'אימון חדש נוסף';
  } else if (c.kind === 'removed') {
    label = 'אימון בוטל';
  } else if (c.kind === 'team_changed') {
    label = 'שיוך קבוצה עודכן';
  } else {
    label = c.kind;
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

// ======================================================================
//  Export / share  — "get my schedule out of the app"
//  All client-side. Pure builders (buildTeamsLink / applyTeamsParam /
//  buildWeekText / buildICS / drawWeekImage) are exposed on window and
//  unit-tested in tests/site_smoke.js.
// ======================================================================

var nav = (typeof navigator !== 'undefined') ? navigator : null;

// ---------- Shared week helpers ----------

// Followed teams' sessions for a given week, sorted day -> start time.
// Same filter + sort the on-screen weekly list uses, so every export matches.
function weekSessionsFor(sunday) {
  var arr = DATA.sessions.filter(function (s) {
    return s.team_id && isFollowed(s.team_id) && s.week_key === sunday;
  });
  arr.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    var sa = hhmm(a.start), sb = hhmm(b.start);
    return sa < sb ? -1 : (sa > sb ? 1 : 0);
  });
  return arr;
}
// Split one week's followed sessions into past / upcoming day-groups.
// "Current week" = the viewed week contains `today`. Whole days only:
// a day is "past" iff its date string is < today.
function splitWeekByToday(weekSessions, viewSunday, today) {
  var groups = groupByDate(weekSessions);
  if (sundayOf(today) !== viewSunday) {
    return { isCurrentWeek: false, pastGroups: [], upcomingGroups: groups };
  }
  var past = [], upcoming = [];
  groups.forEach(function (g) { (g[0] < today ? past : upcoming).push(g); });
  return { isCurrentWeek: true, pastGroups: past, upcomingGroups: upcoming };
}
function sumMinutes(sessions) {
  var mins = 0;
  sessions.forEach(function (s) {
    var a = hhmm(s.start), b = hhmm(s.end);
    if (!a || !b) return;
    var d = toMin(b) - toMin(a);
    if (d > 0) mins += d;
  });
  return mins;
}
function hoursStr(mins) {
  var hours = mins / 60;
  return (Math.round(hours * 10) % 10 === 0) ? String(Math.round(hours)) : hours.toFixed(1);
}
function countTeams(sessions) {
  var seen = {};
  sessions.forEach(function (s) { if (s.team_id) seen[s.team_id] = 1; });
  return Object.keys(seen).length;
}
function weekRangeNumeric(sunday) {
  return dmLabel(sunday) + '–' + dmLabel(addDays(sunday, 6)); // 30/8–5/9
}
function timeRange(s) {
  return hhmm(s.start) + (s.end ? '–' + hhmm(s.end) : '');
}
// Wrap a numeric run (time / date range) in a Unicode LTR isolate (U+2066 /
// U+2069) so canvas fillText keeps "13:00–15:00" left-to-right in an RTL line.
function ltrIsolate(s) { return '⁦' + s + '⁩'; }
function teamName(id) {
  var t = DATA.teamsById[id];
  return t ? t.display_name : id;
}
// [ [date, [sessions...] ], ... ] in day order.
function groupByDate(sessions) {
  var byDate = {}, order = [];
  sessions.forEach(function (s) {
    if (!byDate[s.date]) { byDate[s.date] = []; order.push(s.date); }
    byDate[s.date].push(s);
  });
  return order.map(function (d) { return [d, byDate[d]]; });
}

// ---------- Toast ----------
function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  if (showToast._t) clearTimeout(showToast._t);
  showToast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

// ---------- Clipboard ----------
function copyText(text) {
  try {
    if (nav && nav.clipboard && nav.clipboard.writeText) {
      return nav.clipboard.writeText(text).then(
        function () { return true; },
        function () { return fallbackCopy(text); }
      );
    }
  } catch (e) {}
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  try {
    var host = document.body || document.documentElement;
    if (!host) return false;
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    host.appendChild(ta);
    if (ta.select) ta.select();
    var ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    if (ta.parentNode) ta.parentNode.removeChild(ta);
    return !!ok;
  } catch (e) { return false; }
}

// ---------- Downloads / tabs ----------
function downloadBlob(blob, filename) {
  try {
    var host = document.body || document.documentElement;
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    if (host) host.appendChild(a);
    a.click();
    if (a.parentNode) a.parentNode.removeChild(a);
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 1000);
  } catch (e) { console.error('download failed', e); }
}
function openTab(url) {
  try {
    var host = document.body || document.documentElement;
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    if (host) host.appendChild(a);
    a.click();
    if (a.parentNode) a.parentNode.removeChild(a);
  } catch (e) {
    try { window.open(url, '_blank', 'noopener'); } catch (_) {}
  }
}

// ---------- 1. Shareable link for followed teams ----------

// Parse a `teams=` query string into a de-duplicated list of raw ids.
function parseTeamsParam(search) {
  var s = String(search || '');
  var m = /[?&]teams=([^&#]*)/.exec(s);
  if (!m) return [];
  var raw;
  try { raw = decodeURIComponent(m[1]); } catch (e) { raw = m[1]; }
  var out = [], seen = {};
  raw.split(',').forEach(function (x) {
    var id = x.trim();
    if (id && !seen[id]) { seen[id] = 1; out.push(id); }
  });
  return out;
}

// Merge the ids from a `?teams=` link into `followed`.
// Valid = present in teams.json. Unknown ids are ignored silently.
// Returns { added:[], already:[], invalid:[] }.
function applyTeamsParam(search) {
  var res = { added: [], already: [], invalid: [] };
  parseTeamsParam(search).forEach(function (id) {
    if (!DATA.teamsById[id]) { res.invalid.push(id); return; }
    if (followed.indexOf(id) !== -1) { res.already.push(id); return; }
    followed.push(id);
    res.added.push(id);
  });
  if (res.added.length) saveFollowed();
  return res;
}

// Build a link that restores the current followed list on another device.
function buildTeamsLink() {
  var loc = (typeof window !== 'undefined' && window.location) ? window.location : {};
  var base = (loc.origin || '') + (loc.pathname || '');
  return base + '?teams=' + followed.join(',');
}

// On load: apply a `?teams=` link, then strip the query so a refresh
// does not re-apply it. Non-blocking toast confirms what happened.
function maybeApplySharedTeams() {
  var loc = (typeof window !== 'undefined' && window.location) ? window.location : null;
  if (!loc || !loc.search) return;
  var res = applyTeamsParam(loc.search);
  if (!res.added.length && !res.already.length && !res.invalid.length) return;
  try {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', (loc.pathname || '') + (loc.hash || ''));
    }
  } catch (e) {}
  if (res.added.length) {
    showToast(res.added.length === 1
      ? 'נוספה קבוצה אחת למעקב'
      : 'נוספו ' + res.added.length + ' קבוצות למעקב');
  } else if (res.already.length) {
    showToast('כבר עוקב אחרי הקבוצות בקישור');
  }
}

function shareFollowsLink() {
  if (!followed.length) return;
  var url = buildTeamsLink();
  copyText(url).then(function (ok) {
    if (ok) showToast('הקישור למעקב הועתק');
  });
  if (nav && nav.share) {
    try {
      var p = nav.share({
        title: 'הקבוצות שלי — גלבוע מעיינות',
        text: 'הקבוצות שאני עוקב אחריהן בלו״ז גלבוע מעיינות',
        url: url
      });
      if (p && p['catch']) p['catch'](function () {}); // swallow AbortError
    } catch (e) {}
  }
}

// ---------- 2a. Copy as text ----------
function buildWeekText(sunday) {
  var L = [];
  L.push('הלו״ז שלי — גלבוע מעיינות');
  L.push('שבוע ' + ltrIsolate(weekRangeNumeric(sunday)));

  var ses = weekSessionsFor(sunday);
  if (!ses.length) {
    L.push('');
    L.push('אין אימונים בשבוע זה');
    return L.join('\n');
  }

  groupByDate(ses).forEach(function (pair) {
    var day = pair[1];
    L.push('');
    L.push(HE_WEEKDAY_FULL[day[0].weekday] + ' ' + ltrIsolate(dmLabel(pair[0])));
    day.forEach(function (s) {
      var parts = [ltrIsolate(timeRange(s)), teamName(s.team_id)];
      if (s.coach_text) parts.push(s.coach_text);
      if (s.location) parts.push(s.location);
      L.push('  ' + parts.join(' · '));
      var notes = normalizeNotes(s.notes);
      if (notes.length) L.push('    ' + notes.join(' · '));
    });
  });

  var n = ses.length;
  var teamCount = countTeams(ses);
  L.push('');
  L.push('סה״כ: ' +
    (teamCount === 1 ? 'קבוצה אחת' : teamCount + ' קבוצות') + ' · ' +
    (n === 1 ? 'אימון אחד' : n + ' אימונים') + ' · ' +
    hoursStr(sumMinutes(ses)) + ' שעות');
  return L.join('\n');
}

// ---------- 2b. Share ----------
function shareWeek() {
  var text = buildWeekText(viewSunday);
  var title = 'הלו״ז שלי — גלבוע מעיינות';
  if (nav && nav.share) {
    try {
      var p = nav.share({ title: title, text: text });
      if (p && p['catch']) p['catch'](function () {}); // user-cancel => AbortError
    } catch (e) {}
    return;
  }
  // No Web Share (typical desktop): copy the text and open WhatsApp's share URL.
  copyText(text).then(function (ok) { if (ok) showToast('הטקסט הועתק'); });
  openTab('https://wa.me/?text=' + encodeURIComponent(text));
}

// ---------- 2c. Add to calendar (.ics) ----------
function icsEsc(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}
function utf8Len(cp) { return cp < 0x80 ? 1 : (cp < 0x800 ? 2 : 3); }
// Fold to <=75 octets per RFC 5545 (continuation = CRLF + single space).
function foldLine(line) {
  var out = '', run = 0, i, ch, b;
  for (i = 0; i < line.length; i++) {
    ch = line.charAt(i);
    b = utf8Len(line.charCodeAt(i));
    if (run + b > 75) { out += '\r\n '; run = 1; }
    out += ch;
    run += b;
  }
  return out;
}
function icsStamp(d) {
  return d.getUTCFullYear() +
    pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' +
    pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
}
function buildICS(sunday) {
  var ses = weekSessionsFor(sunday);
  var stamp = icsStamp(new Date());
  var out = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//gilboa-maayanot//team-schedule//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];
  ses.forEach(function (s) {
    var desc = [];
    if (s.coach_text) desc.push('מאמן: ' + s.coach_text);
    normalizeNotes(s.notes).forEach(function (nt) { desc.push(nt); });

    out.push('BEGIN:VEVENT');
    out.push('UID:' + s.id + '@gilboa-schedule');
    out.push('DTSTAMP:' + stamp);
    // start/end carry +03:00 -> emit as unambiguous UTC "Z" instants.
    out.push('DTSTART:' + icsStamp(new Date(s.start)));
    if (s.end) out.push('DTEND:' + icsStamp(new Date(s.end)));
    out.push(foldLine('SUMMARY:' + icsEsc(teamName(s.team_id))));
    if (s.location) out.push(foldLine('LOCATION:' + icsEsc(s.location)));
    if (desc.length) out.push(foldLine('DESCRIPTION:' + icsEsc(desc.join('\n'))));
    out.push('END:VEVENT');
  });
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}
function downloadICS() {
  var name = 'gilboa-שבוע-' + viewSunday + '.ics';
  try {
    downloadBlob(new Blob([buildICS(viewSunday)], { type: 'text/calendar;charset=utf-8' }), name);
    showToast('קובץ היומן ירד');
  } catch (e) {
    console.error(e);
    showToast('יצירת קובץ היומן נכשלה');
  }
}

// ---------- 2d. Save as image (hand-drawn canvas, no library) ----------
function drawWeekImage(sunday) {
  var W = 480, PAD = 20;
  var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
  var FONT = '-apple-system, "Segoe UI", Roboto, Arial, "Noto Sans Hebrew", sans-serif';
  var ses = weekSessionsFor(sunday);

  // 1. Build a flat list of rows to draw, each with a fixed height.
  var rows = [];
  rows.push({ k: 'title', t: 'הלו״ז שלי — גלבוע מעיינות', h: 30 });
  rows.push({ k: 'range', t: 'שבוע ' + weekRangeLabel(sunday), h: 26 }); // spelled-out month, matches the app header
  if (!ses.length) {
    rows.push({ k: 'plain', t: 'אין אימונים בשבוע זה', h: 30 });
  } else {
    groupByDate(ses).forEach(function (pair) {
      rows.push({ k: 'day', t: HE_WEEKDAY_FULL[pair[1][0].weekday] + ' ' + ltrIsolate(dmLabel(pair[0])), h: 34 });
      pair[1].forEach(function (s) {
        var sub = [];
        if (s.coach_text) sub.push(s.coach_text);
        if (s.location) sub.push(s.location);
        rows.push({
          k: 'session',
          t: ltrIsolate(timeRange(s)) + '  ' + teamName(s.team_id),
          sub: sub.join('  ·  '),
          color: colorFor(s.team_id),
          h: sub.length ? 44 : 26
        });
        var notes = normalizeNotes(s.notes);
        if (notes.length) rows.push({ k: 'note', t: 'ℹ ' + notes.join('  ·  '), h: 20 });
      });
    });
    rows.push({
      k: 'summary',
      t: (ses.length === 1 ? 'אימון אחד' : ses.length + ' אימונים') +
        '  ·  ' + hoursStr(sumMinutes(ses)) + ' שעות',
      h: 38
    });
  }

  // 2. Size the canvas (height grows with content), DPR-scaled for crispness.
  var H = PAD;
  rows.forEach(function (r) { r.y = H; H += r.h; });
  H += PAD;

  var canvas = document.createElement('canvas');
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'top';
  if ('direction' in ctx) ctx.direction = 'rtl';
  ctx.textAlign = 'right';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  var right = W - PAD;
  var textMax = W - PAD * 2;

  rows.forEach(function (r) {
    if (r.k === 'title') {
      ctx.fillStyle = '#1a1d21'; ctx.font = '700 18px ' + FONT;
      ctx.fillText(fitText(ctx, r.t, textMax), right, r.y);
    } else if (r.k === 'range') {
      ctx.fillStyle = '#4b5563'; ctx.font = '600 14px ' + FONT;
      ctx.fillText(fitText(ctx, r.t, textMax), right, r.y + 4);
    } else if (r.k === 'day') {
      ctx.fillStyle = '#4b5563'; ctx.font = '700 14px ' + FONT;
      ctx.fillText(r.t, right, r.y + 10);
      hline(ctx, PAD, W - PAD, r.y + 30, '#e2e4e8');
    } else if (r.k === 'session') {
      ctx.fillStyle = r.color || '#888888';
      dot(ctx, right - 4, r.y + 8, 4);
      ctx.fillStyle = '#1a1d21'; ctx.font = '600 14px ' + FONT;
      ctx.fillText(fitText(ctx, r.t, textMax - 16), right - 16, r.y);
      if (r.sub) {
        ctx.fillStyle = '#4b5563'; ctx.font = '400 13px ' + FONT;
        ctx.fillText(fitText(ctx, r.sub, textMax - 16), right - 16, r.y + 21);
      }
    } else if (r.k === 'note') {
      ctx.fillStyle = '#6b7280'; ctx.font = '400 12px ' + FONT;
      ctx.fillText(fitText(ctx, r.t, textMax - 16), right - 16, r.y);
    } else if (r.k === 'summary') {
      hline(ctx, PAD, W - PAD, r.y, '#e2e4e8');
      ctx.fillStyle = '#1a1d21'; ctx.font = '700 14px ' + FONT;
      ctx.fillText(fitText(ctx, r.t, textMax), right, r.y + 12);
    } else {
      ctx.fillStyle = '#4b5563'; ctx.font = '400 14px ' + FONT;
      ctx.fillText(r.t, right, r.y);
    }
  });

  return canvas;
}
function fitText(ctx, text, maxWidth) {
  if (!ctx.measureText || ctx.measureText(text).width <= maxWidth) return text;
  var t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}
function hline(ctx, x1, x2, y, color) {
  if (!ctx.beginPath) return;
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
}
function dot(ctx, x, y, r) {
  if (!ctx.beginPath) return;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function saveWeekImage() {
  var name = 'gilboa-שבוע-' + viewSunday + '.png';
  var title = 'הלו״ז שלי — גלבוע מעיינות';
  var canvas;
  try { canvas = drawWeekImage(viewSunday); } catch (e) { console.error(e); }
  if (!canvas || !canvas.toBlob) { showToast('שמירת תמונה לא נתמכת'); return; }
  canvas.toBlob(function (blob) {
    if (!blob) { showToast('יצירת התמונה נכשלה'); return; }
    downloadBlob(blob, name);
    var file = null;
    try { file = new File([blob], name, { type: 'image/png' }); } catch (e) {}
    if (file && nav && nav.canShare && nav.canShare({ files: [file] })) {
      try {
        var p = nav.share({ files: [file], title: title });
        if (p && p['catch']) p['catch'](function () {});
      } catch (e) {}
    }
    showToast('התמונה נשמרה');
  }, 'image/png');
}

// Expose the pure builders for tests / power users.
window.buildTeamsLink = buildTeamsLink;
window.applyTeamsParam = applyTeamsParam;
window.parseTeamsParam = parseTeamsParam;
window.buildWeekText = buildWeekText;
window.buildICS = buildICS;
window.icsEsc = icsEsc;
window.drawWeekImage = drawWeekImage;
window.groupByDate = groupByDate;
window.splitWeekByToday = splitWeekByToday;
// Rides (public/rides.js) drives screen navigation + re-renders through these,
// and reads (never mutates) the schedule state.
window.goto = goto;
window.render = render;
window.showToast = showToast;
window.ltrIsolate = ltrIsolate;
window.DATA = DATA;
window.followed = followed;
window.HE_WEEKDAY = HE_WEEKDAY;
window.weekSessionsFor = weekSessionsFor;

// ---------- Screen navigation ----------
var SCREEN_IDS = {
  myweek: 'screen-myweek', addteam: 'screen-addteam',
  rides: 'screen-rides', privacy: 'screen-privacy'
};

function goto(screen) {
  var target = SCREEN_IDS[screen] || 'screen-myweek';
  Object.keys(SCREEN_IDS).forEach(function (k) {
    var n = document.getElementById(SCREEN_IDS[k]);
    if (n) n.hidden = (SCREEN_IDS[k] !== target);
  });
  if (screen === 'addteam') {
    document.getElementById('search').value = '';
    renderSearch();
    document.getElementById('search').focus();
  } else if (screen === 'rides') {
    if (window.Rides && window.Rides.renderRides) {
      try { window.Rides.renderRides(); } catch (e) { console.error('rides screen error (schedule unaffected):', e); }
    }
  } else if (screen === 'privacy') {
    if (window.Rides && window.Rides.renderPrivacy) {
      try { window.Rides.renderPrivacy(); } catch (e) { console.error('privacy screen error:', e); }
    }
  } else {
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

  // Export / share actions.
  on('share-follows', 'click', shareFollowsLink);
  on('act-copy', 'click', function () {
    copyText(buildWeekText(viewSunday)).then(function (ok) {
      showToast(ok ? 'הועתק ללוח' : 'לא ניתן להעתיק');
    });
  });
  on('act-share', 'click', shareWeek);
  on('act-ics', 'click', downloadICS);
  on('act-img', 'click', saveWeekImage);
}

function on(id, evt, fn) {
  var n = document.getElementById(id);
  if (n) n.addEventListener(evt, fn);
}
function setHidden(id, v) {
  var n = document.getElementById(id);
  if (n) n.hidden = !!v;
}
