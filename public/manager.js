/* Gilboa Maayanot — manager app (coordinator dashboard). Vanilla ES5 idiom,
   no build, standalone (no app.js / rides.js — its own small copies of the
   date/api helpers it needs). Pure helpers exposed on window.Manager for
   tests. */
'use strict';

(function () {
  // ---------- date helpers (own copies; standalone page) ----------
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymdToUTC(ymd) { var p = ymd.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function utcToYmd(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  function addDays(ymd, n) { return utcToYmd(ymdToUTC(ymd) + n * 86400000); }
  function sundayOf(ymd) { var dow = new Date(ymdToUTC(ymd)).getUTCDay(); return addDays(ymd, -dow); }
  function todayYmd() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function dmLabel(ymd) { var p = ymd.split('-'); return (+p[2]) + '/' + (+p[1]); }
  function weekdayOf(ymd) { return new Date(ymdToUTC(ymd)).getUTCDay(); }
  function hhmm(iso) { var m = /T(\d{2}):(\d{2})/.exec(iso || ''); return m ? m[1] + ':' + m[2] : ''; }

  var HE_WEEKDAY = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  var DIR_WORD = { round: 'הלוך וחזור', out: 'הלוך', back: 'חזור' };

  // apiBase() returns the origin only (no trailing /api) — every call site
  // below appends the full "/api/..." path itself.
  function apiBase() {
    var h = (window.location && window.location.hostname) || '';
    if (h === 'localhost' || h === '127.0.0.1') {
      if ((window.location.port || '') === '8788') return window.location.origin;
      return 'http://localhost:8788';
    }
    return (window.location.origin || '');
  }

  // ---------- pure helpers ----------
  function rideCaption(depart) {
    if (!depart || (depart.outbound == null && depart.ret == null)) return 'טרם נקבעה שעה';
    var o = depart.outbound == null ? '—' : depart.outbound;
    var r = depart.ret == null ? '—' : depart.ret;
    return 'יציאה מעין חרוד ' + o + ' · חזרה ' + r;
  }

  function dirLine(label, names) {
    return label + ' (' + names.length + '): ' + (names.length ? names.join(' · ') : '—');
  }

  function buildDayText(day) {
    if (!day || !day.practices || !day.practices.length) return 'אין בקשות הסעה ליום זה';
    var lines = ['תוכנית הסעות ליום ' + HE_WEEKDAY[day.weekday] + ' ' + dmLabel(day.date) + ':', ''];
    day.practices.forEach(function (p) {
      lines.push(p.teamName + ' · ' + (p.location || '') + ' · ' + hhmm(p.start));
      lines.push(rideCaption(p.depart));
      lines.push(dirLine('הלוך וחזור', p.byDirection.round || []));
      lines.push(dirLine('הלוך בלבד', p.byDirection.out || []));
      lines.push(dirLine('חזור בלבד', p.byDirection.back || []));
      lines.push('');
    });
    return lines.join('\n').replace(/\n+$/, '');
  }

  // ---------- DOM helper ----------
  function ce(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function closeDialog(dlg) { try { if (dlg && dlg.close) dlg.close(); } catch (e) {} }

  // ---------- auth storage ----------
  var LS_MGR = 'gilboa.manager';
  function getAuth() {
    try {
      var raw = localStorage.getItem(LS_MGR);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && o.token) ? o : null;
    } catch (e) { return null; }
  }
  function setAuth(o) { try { localStorage.setItem(LS_MGR, JSON.stringify(o)); } catch (e) {} }
  function clearAuth() { try { localStorage.removeItem(LS_MGR); } catch (e) {} }

  // ---------- state ----------
  var state = {
    selectedDate: todayYmd(),
    weekKey: null, weekData: null,
    schedule: null, teamsById: {},
    config: null,
  };
  var _locationRows = [];  // [{name, outEl, retEl, manual, row}]
  var _toDelete = [];      // manual location names removed this session
  var _toClear = [];       // calendar-derived location names cleared this session

  var els = {};
  function grabEls() {
    ['mgr-login', 'mgr-login-pass', 'mgr-login-error', 'mgr-login-submit',
      'mgr-app', 'mgr-logout',
      'mgr-tab-dashboard-btn', 'mgr-tab-settings-btn', 'mgr-tab-stats-btn',
      'tab-dashboard', 'tab-settings', 'tab-stats',
      'mgr-day-prev', 'mgr-day-next', 'mgr-day-range',
      'mgr-day-header', 'mgr-day-body', 'mgr-copy-day', 'mgr-copy-msg', 'mgr-health',
      'mgr-locations', 'mgr-new-location-name', 'mgr-add-location',
      'mgr-ret-default', 'mgr-settings-save', 'mgr-settings-msg',
      'mgr-stats-body',
    ].forEach(function (id) { els[id] = document.getElementById(id); });
  }

  // ---------- auth-aware fetch ----------
  function authFetch(path, opts) {
    opts = opts || {};
    var auth = getAuth();
    var headers = {};
    for (var k in (opts.headers || {})) headers[k] = opts.headers[k];
    if (auth) headers['Authorization'] = 'Bearer ' + auth.token;
    opts.headers = headers;
    return fetch(apiBase() + path, opts).then(function (r) {
      if (r.status === 401) { clearAuth(); showLogin(); }
      return r;
    });
  }

  // ---------- login ----------
  function showLogin() {
    if (els['mgr-app']) els['mgr-app'].hidden = true;
    if (els['mgr-login-error']) els['mgr-login-error'].hidden = true;
    if (els['mgr-login-pass']) els['mgr-login-pass'].value = '';
    var dlg = els['mgr-login'];
    if (dlg && dlg.showModal) { try { dlg.showModal(); } catch (e) { if (dlg.show) dlg.show(); } }
  }

  function showApp() {
    closeDialog(els['mgr-login']);
    if (els['mgr-app']) els['mgr-app'].hidden = false;
    selectTab('dashboard');
    loadStaticData().then(function () { loadWeek(state.selectedDate, true); });
    loadConfig();
  }

  function doLogin() {
    var pass = els['mgr-login-pass'] ? els['mgr-login-pass'].value : '';
    return fetch(apiBase() + '/api/manager/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase: pass }),
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
    }).then(function (res) {
      if (res.ok && res.body && res.body.token) {
        setAuth({ token: res.body.token, exp: res.body.exp });
        showApp();
      } else {
        loginFailed();
      }
    })['catch'](loginFailed);
  }
  function loginFailed() {
    if (els['mgr-login-error']) { els['mgr-login-error'].hidden = false; els['mgr-login-error'].textContent = 'סיסמה שגויה'; }
  }

  function logout() { clearAuth(); showLogin(); }

  // ---------- tabs ----------
  function selectTab(name) {
    ['dashboard', 'settings', 'stats'].forEach(function (t) {
      var sec = els['tab-' + t];
      if (sec) sec.hidden = (t !== name);
      var btn = els['mgr-tab-' + t + '-btn'];
      if (btn) btn.classList.toggle('is-active', t === name);
    });
    if (name === 'stats') renderStats();
  }

  // ---------- static site data (for the zero-request toggle) ----------
  function loadStaticData() {
    if (state.schedule) return Promise.resolve();
    return Promise.all([
      fetch('data/schedule.json').then(function (r) { return r.json(); }),
      fetch('data/teams.json').then(function (r) { return r.json(); }),
    ]).then(function (arr) {
      state.schedule = arr[0];
      state.teamsById = {};
      (arr[1] || []).forEach(function (t) { state.teamsById[t.team_id] = t; });
    })['catch'](function () { state.schedule = { sessions: [] }; });
  }

  // ---------- dashboard ----------
  // Guards against a stale response: if the user has navigated to a
  // different week by the time this request lands (rapid day-stepper
  // clicks can fire several overlapping requests), the response is for a
  // week the user is no longer looking at — discard it instead of letting
  // an out-of-order arrival clobber the correct, already-loaded week.
  function loadWeek(date, force) {
    var wk = sundayOf(date);
    if (!force && state.weekKey === wk && state.weekData) { renderDashboard(); return Promise.resolve(); }
    return authFetch('/api/manager/dashboard?week=' + encodeURIComponent(wk))
      .then(function (r) { if (!r.ok) throw new Error('dash ' + r.status); return r.json(); })
      .then(function (j) {
        if (wk !== sundayOf(state.selectedDate)) return;
        state.weekData = j; state.weekKey = wk; renderDashboard();
      })
      ['catch'](function () {
        if (wk !== sundayOf(state.selectedDate)) return;
        state.weekData = null; renderDashboard();
      });
  }

  function goDay(delta) {
    state.selectedDate = addDays(state.selectedDate, delta);
    renderDashboard();
    loadWeek(state.selectedDate);
  }

  function currentDay() {
    if (!state.weekData) return null;
    var found = null;
    (state.weekData.days || []).forEach(function (d) { if (d.date === state.selectedDate) found = d; });
    return found;
  }

  function renderDashboard() {
    if (els['mgr-day-range']) {
      els['mgr-day-range'].textContent = 'יום ' + HE_WEEKDAY[weekdayOf(state.selectedDate)] + ' ' + dmLabel(state.selectedDate);
    }
    if (els['mgr-day-header']) els['mgr-day-header'].textContent = '';

    var body = els['mgr-day-body'];
    if (!body) return;
    body.innerHTML = '';

    if (!state.weekData) {
      body.appendChild(ce('p', 'mgr-day-loading', 'טוען…'));
      renderHealth();
      return;
    }

    var day = currentDay();
    if (day && els['mgr-day-header']) {
      els['mgr-day-header'].textContent = 'סה״כ: ' + day.totals.riders + ' נוסעים · ' + day.totals.rides + ' הסעות';
    }

    if (!day || !day.practices.length) {
      body.appendChild(ce('p', 'mgr-day-empty', 'אין בקשות הסעה ליום זה'));
    } else {
      day.practices.forEach(function (p) { body.appendChild(renderPracticeRow(p)); });
    }

    var known = day ? day.practices.map(function (p) { return p.sessionId; }) : [];
    var daySessions = ((state.schedule && state.schedule.sessions) || []).filter(function (s) { return s.date === state.selectedDate; });
    var zero = daySessions.filter(function (s) { return known.indexOf(s.id) === -1; });
    if (zero.length) body.appendChild(renderZeroToggle(zero));

    var orphans = state.weekData.orphans || [];
    if (orphans.length) body.appendChild(renderOrphans(orphans));

    renderHealth();
  }

  function renderPracticeRow(p) {
    var wrap = ce('div', 'mgr-practice');
    var summary = ce('button', 'mgr-practice-summary',
      p.teamName + ' · ' + (p.location || '') + ' · ' + hhmm(p.start) + ' · ' + p.riders + ' נוסעים');
    summary.setAttribute('type', 'button');
    summary.setAttribute('aria-expanded', 'false');

    var detail = ce('div', 'mgr-practice-detail');
    detail.hidden = true;
    detail.appendChild(ce('p', 'mgr-practice-depart', rideCaption(p.depart)));
    detail.appendChild(ce('p', 'mgr-dir-round', dirLine('הלוך וחזור', p.byDirection.round || [])));
    detail.appendChild(ce('p', 'mgr-dir-out', dirLine('הלוך בלבד', p.byDirection.out || [])));
    detail.appendChild(ce('p', 'mgr-dir-back', dirLine('חזור בלבד', p.byDirection.back || [])));

    summary.addEventListener('click', function () {
      detail.hidden = !detail.hidden;
      summary.setAttribute('aria-expanded', String(!detail.hidden));
    });

    wrap.appendChild(summary);
    wrap.appendChild(detail);
    return wrap;
  }

  function renderZeroToggle(sessions) {
    var wrap = ce('div', 'mgr-zero');
    var label = function (open) { return (open ? 'הסתר' : 'הצג') + ' אימונים ללא נוסעים (' + sessions.length + ')'; };
    var btn = ce('button', 'mgr-zero-toggle', label(false));
    btn.setAttribute('type', 'button');
    var list = ce('div', 'mgr-zero-list');
    list.hidden = true;
    sessions.forEach(function (s) {
      var t = state.teamsById[s.team_id];
      list.appendChild(ce('p', 'mgr-zero-row', (t ? t.display_name : s.team_id) + ' · ' + (s.location || '') + ' · ' + hhmm(s.start)));
    });
    btn.addEventListener('click', function () {
      list.hidden = !list.hidden;
      btn.textContent = label(!list.hidden);
    });
    wrap.appendChild(btn);
    wrap.appendChild(list);
    return wrap;
  }

  function renderOrphans(orphans) {
    var wrap = ce('div', 'mgr-orphans');
    wrap.appendChild(ce('h3', 'mgr-orphans-head', 'בקשות ללא אימון תואם'));
    orphans.forEach(function (o) {
      wrap.appendChild(ce('p', 'mgr-orphan-row', o.fullName + ' · ' + (DIR_WORD[o.direction] || o.direction)));
    });
    return wrap;
  }

  function renderHealth() {
    if (!els['mgr-health']) return;
    var lp = state.weekData && state.weekData.lastPurge;
    els['mgr-health'].textContent = 'ניקוי אחרון: ' + (lp ? dmLabel(lp) : '—');
  }

  function wireCopyDay() {
    if (!els['mgr-copy-day']) return;
    els['mgr-copy-day'].addEventListener('click', function () {
      var text = buildDayText(currentDay());
      copyText(text);
      if (els['mgr-copy-msg']) { els['mgr-copy-msg'].hidden = false; els['mgr-copy-msg'].textContent = 'הועתק ללוח'; }
    });
  }
  function copyText(text) {
    try { if (navigator && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text); } catch (e) {}
  }

  // ---------- settings ----------
  function loadConfig() {
    return authFetch('/api/manager/config').then(function (r) { return r.json(); })
      .then(function (j) { state.config = j; renderSettings(); })
      ['catch'](function () {});
  }

  function renderSettings() {
    var container = els['mgr-locations'];
    if (!container) return;
    container.innerHTML = '';
    _locationRows = []; _toDelete = []; _toClear = [];
    var locs = (state.config && state.config.locations) || {};
    Object.keys(locs).sort().forEach(function (name) { addSettingsRow(name, locs[name]); });
    if (els['mgr-ret-default']) {
      var gv = (state.config && state.config.global && state.config.global.retDefault != null) ? state.config.global.retDefault : 15;
      els['mgr-ret-default'].value = gv;
    }
  }

  function labeledField(text, input) {
    var wrap = ce('label', 'mgr-settings-field');
    wrap.appendChild(ce('span', 'mgr-settings-field-label', text));
    wrap.appendChild(input);
    return wrap;
  }

  function addSettingsRow(name, cfg) {
    cfg = cfg || { outbound: null, ret: null, manual: false };
    var container = els['mgr-locations'];
    if (!container) return;

    var row = ce('div', 'mgr-settings-row');
    row.setAttribute('data-location', name);
    row.appendChild(ce('span', 'mgr-settings-label', name));

    var outEl = ce('input', 'mgr-settings-out');
    outEl.setAttribute('type', 'number');
    outEl.setAttribute('aria-label', 'הלוך — ' + name);
    outEl.value = cfg.outbound != null ? cfg.outbound : '';

    var retEl = ce('input', 'mgr-settings-ret');
    retEl.setAttribute('type', 'number');
    retEl.setAttribute('aria-label', 'חזור — ' + name);
    retEl.value = cfg.ret != null ? cfg.ret : '';

    row.appendChild(labeledField('הלוך', outEl));
    row.appendChild(labeledField('חזור', retEl));

    var entry = { name: name, outEl: outEl, retEl: retEl, manual: !!cfg.manual, row: row };
    var del = ce('button', 'mgr-settings-del', 'מחיקה');
    del.setAttribute('type', 'button');
    del.addEventListener('click', function () {
      if (row.parentNode) row.parentNode.removeChild(row);
      _locationRows = _locationRows.filter(function (r) { return r !== entry; });
      if (entry.manual) _toDelete.push(name); else _toClear.push(name);
    });
    row.appendChild(del);

    container.appendChild(row);
    _locationRows.push(entry);
  }

  function wireAddLocation() {
    if (!els['mgr-add-location']) return;
    els['mgr-add-location'].addEventListener('click', function () {
      var nameEl = els['mgr-new-location-name'];
      var name = nameEl ? String(nameEl.value || '').trim() : '';
      if (!name) return;
      addSettingsRow(name, { outbound: null, ret: null, manual: true });
      if (nameEl) nameEl.value = '';
    });
  }

  function wireSettingsSave() {
    if (!els['mgr-settings-save']) return;
    els['mgr-settings-save'].addEventListener('click', function () {
      var locations = {};
      _locationRows.forEach(function (r) {
        var out = r.outEl.value === '' ? null : Number(r.outEl.value);
        var ret = r.retEl.value === '' ? null : Number(r.retEl.value);
        locations[r.name] = { outbound: out, ret: ret, manual: r.manual };
      });
      _toDelete.forEach(function (name) { locations[name] = { __delete: true }; });
      _toClear.forEach(function (name) { locations[name] = { outbound: null, ret: null, manual: false }; });
      _toDelete = []; _toClear = [];

      var global = {};
      if (els['mgr-ret-default'] && els['mgr-ret-default'].value !== '') {
        global.retDefault = Number(els['mgr-ret-default'].value);
      }

      var msg = els['mgr-settings-msg'];
      if (msg) msg.hidden = true;
      authFetch('/api/manager/config', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locations: locations, global: global }),
      }).then(function (r) {
        if (msg) { msg.hidden = false; msg.textContent = r.ok ? 'נשמר' : 'השמירה נכשלה, נסו שוב'; }
        if (r.ok) loadConfig();
      })['catch'](function () {
        if (msg) { msg.hidden = false; msg.textContent = 'השמירה נכשלה, נסו שוב'; }
      });
    });
  }

  // ---------- stats ----------
  function weekRidesTotal() {
    if (!state.weekData || !state.weekData.days) return 0;
    return state.weekData.days.reduce(function (n, d) { return n + (d.totals ? d.totals.rides : 0); }, 0);
  }

  function renderStats() {
    var body = els['mgr-stats-body'];
    if (!body) return;
    body.innerHTML = '';
    var s = (state.weekData && state.weekData.stats) || {};
    var rows = [
      ['שחקנים רשומים', (s.playersWeek || 0) + ' השבוע · ' + (s.playersAll || 0) + ' סה״כ'],
      ['בקשות הסעה השבוע', 'הלוך ' + (s.ridesOut || 0) + ' · חזור ' + (s.ridesBack || 0)],
      ['הסעות מתוכננות', String(weekRidesTotal())],
      ['מיקומים פעילים', String(s.activeLocations || 0)],
      ['כניסות לאפליקציה', (s.opensToday || 0) + ' היום · ' + (s.opens7d || 0) + ' ב-7 ימים'],
    ];
    rows.forEach(function (pair) {
      var row = ce('div', 'mgr-stat-row');
      row.appendChild(ce('span', 'mgr-stat-label', pair[0]));
      row.appendChild(ce('span', 'mgr-stat-value', pair[1]));
      body.appendChild(row);
    });
  }

  // ---------- init ----------
  function init() {
    grabEls();
    if (els['mgr-login-submit']) els['mgr-login-submit'].addEventListener('click', function () { doLogin(); });
    if (els['mgr-logout']) els['mgr-logout'].addEventListener('click', logout);
    if (els['mgr-tab-dashboard-btn']) els['mgr-tab-dashboard-btn'].addEventListener('click', function () { selectTab('dashboard'); });
    if (els['mgr-tab-settings-btn']) els['mgr-tab-settings-btn'].addEventListener('click', function () { selectTab('settings'); });
    if (els['mgr-tab-stats-btn']) els['mgr-tab-stats-btn'].addEventListener('click', function () { selectTab('stats'); });
    if (els['mgr-day-prev']) els['mgr-day-prev'].addEventListener('click', function () { goDay(-1); });
    if (els['mgr-day-next']) els['mgr-day-next'].addEventListener('click', function () { goDay(1); });
    wireCopyDay();
    wireAddLocation();
    wireSettingsSave();

    if (getAuth()) showApp(); else showLogin();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.Manager = {
    buildDayText: buildDayText, rideCaption: rideCaption, apiBase: apiBase,
    dmLabel: dmLabel, weekKey: sundayOf,
  };
})();
