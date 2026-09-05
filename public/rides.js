/* Gilboa Maayanot — rides (player side). Vanilla ES5 idiom, no build, loaded
   AFTER app.js. All network calls are contained: a failure here never breaks
   the schedule view. Pure helpers are exposed on window.Rides for tests. */
'use strict';

(function () {
  function ltr(s) { return (typeof window.ltrIsolate === 'function') ? window.ltrIsolate(s) : s; }

  // ---------- pure helpers ----------
  function shortName(fullName) {
    var parts = String(fullName || '').trim().replace(/\s+/g, ' ').split(' ');
    if (parts.length < 2) return parts[0] || '';
    return parts[0] + ' ' + parts[1].charAt(0) + '׳'; // geresh
  }

  function weekKey(dateStr) {
    if (typeof window.sundayOf === 'function') return window.sundayOf(dateStr);
    var p = String(dateStr).split('-');
    var ms = Date.UTC(+p[0], +p[1] - 1, +p[2]);
    var dow = new Date(ms).getUTCDay();
    var d = new Date(ms - dow * 86400000);
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate());
  }

  function rideCaption(depart) {
    if (!depart || (depart.outbound == null && depart.ret == null)) return 'טרם נקבעה שעה';
    var o = depart.outbound == null ? '—' : ltr(depart.outbound);
    var r = depart.ret == null ? '—' : ltr(depart.ret);
    return 'יוצא מעין חרוד ' + o + ' · חזרה ' + r;
  }

  function hm(iso) {
    var m = /T(\d{2}):(\d{2})/.exec(iso || '');
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function fmt(mins) {
    var x = ((mins % 1440) + 1440) % 1440;
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return z(Math.floor(x / 60)) + ':' + z(x % 60);
  }
  function computeDepartTimes(session, locConfig, retDefault) {
    var start = hm(session && session.start), end = hm(session && session.end);
    var outMin = (locConfig && locConfig.outbound != null) ? locConfig.outbound : null;
    var retMin = (locConfig && locConfig.ret != null) ? locConfig.ret
      : (retDefault != null ? retDefault : null);
    return {
      outbound: (start != null && outMin != null) ? fmt(start - outMin) : null,
      ret: (end != null && retMin != null) ? fmt(end + retMin) : null
    };
  }

  // Returns the origin only (no trailing /api) — every call site appends
  // /api/... itself. Matches the manager.js apiBase() convention.
  function apiBase() {
    var h = (window.location && window.location.hostname) || '';
    if (h === 'localhost' || h === '127.0.0.1') {
      // local dev: wrangler pages dev serves Functions on :8788
      if ((window.location.port || '') === '8788') return window.location.origin;
      return 'http://localhost:8788';
    }
    return (window.location.origin || '');
  }

  // ---------- role state (localStorage, all wrapped) ----------
  var LS_ROLE = 'gilboa.role';
  var LS_PLAYER = 'gilboa.player';

  function getRole() {
    try { return localStorage.getItem(LS_ROLE) === 'player' ? 'player' : 'parent'; }
    catch (e) { return 'parent'; }
  }
  function getPlayer() {
    try {
      var raw = localStorage.getItem(LS_PLAYER);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && o.token) ? o : null;
    } catch (e) { return null; }
  }
  function isPlayerWithToken() { return getRole() === 'player' && !!getPlayer(); }
  function setPlayer(o) { try { localStorage.setItem(LS_PLAYER, JSON.stringify(o)); } catch (e) {} }
  function setRole(r) {
    try {
      if (r === 'player') localStorage.setItem(LS_ROLE, 'player');
      else localStorage.removeItem(LS_ROLE);
    } catch (e) {}
  }
  function clearPlayer() {
    try { localStorage.removeItem(LS_PLAYER); localStorage.removeItem(LS_ROLE); } catch (e) {}
  }

  function rerender() {
    try {
      if (typeof window.render === 'function') window.render();
      else renderRoleToggle();
    } catch (e) { console.error('rides re-render error (schedule unaffected):', e); }
  }

  function ce(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ---------- role toggle (הורה / שחקן) ----------
  // A segmented control at the top of #onboarding. Only visible on the
  // no-teams-followed screen (the slot lives inside #onboarding). Selecting
  // שחקן runs the consent → name flow; the pressed state only follows
  // gilboa.role, so backing out of that flow leaves it on הורה.
  function renderRoleToggle() {
    var slot = document.getElementById('role-toggle-slot');
    if (!slot) return;
    slot.innerHTML = '';

    var isPlayer = getRole() === 'player';

    var group = ce('div', 'role-toggle');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'בחירת סוג משתמש');

    var parentBtn = ce('button', 'role-toggle-btn', 'הורה');
    var playerBtn = ce('button', 'role-toggle-btn', 'שחקן');
    [parentBtn, playerBtn].forEach(function (b) { b.setAttribute('type', 'button'); });

    parentBtn.classList.toggle('is-selected', !isPlayer);
    parentBtn.setAttribute('aria-pressed', String(!isPlayer));
    playerBtn.classList.toggle('is-selected', isPlayer);
    playerBtn.setAttribute('aria-pressed', String(isPlayer));

    parentBtn.addEventListener('click', function () {
      if (getRole() === 'player') exitToParent(); // §4.5 confirm + delete
    });
    playerBtn.addEventListener('click', function () {
      if (getRole() !== 'player') enterPlayerMode();
    });

    group.appendChild(parentBtn);
    group.appendChild(playerBtn);
    slot.appendChild(group);

    slot.appendChild(ce('p', 'role-toggle-help',
      'הורים — רק צפייה בלוח. שחקנים — גם רישום להסעות.'));
  }

  // ---------- consent dialog ----------
  var CONSENT_LINES = [
    ['h2', 'רישום להסעות — מה נשמר'],
    ['p', 'כדי לתאם לך הסעה, נשמור את השם המלא שהזנת ואת בקשות ההסעה שלך (לאילו אימונים, לאיזה כיוון).'],
    ['p', 'מי רואה: רכז ההסעות של המועדון בלבד, במסך מוגן בסיסמה. השם המלא אינו מוצג לאף הורה או שחקן אחר — הם רואים "דניאל כ׳".'],
    ['p', 'לכמה זמן: נמחק אוטומטית בסוף כל שבוע.'],
    ['p', 'מחיקה מיידית: מעבר חזרה למצב הורה מוחק את הנתונים שלך עכשיו.']
  ];

  function closeDialog(dlg) { try { if (dlg && dlg.close) dlg.close(); } catch (e) {} }

  function wireConsent(dlg) {
    if (!dlg || dlg._ridesWired) return;
    dlg._ridesWired = true;
    var ok = dlg.querySelector('[data-consent="ok"]');
    var cancel = dlg.querySelector('[data-consent="cancel"]');
    if (ok) ok.addEventListener('click', function () { closeDialog(dlg); renderNameStep(); });
    if (cancel) cancel.addEventListener('click', function () { closeDialog(dlg); });
    dlg.addEventListener('cancel', function () { closeDialog(dlg); });
  }

  function enterPlayerMode() {
    var dlg = document.getElementById('rides-consent');
    var body = document.getElementById('rides-consent-body');
    if (body) {
      body.innerHTML = '';
      CONSENT_LINES.forEach(function (pair) { body.appendChild(ce(pair[0], null, pair[1])); });
      var link = ce('button', 'linklike', 'מדיניות פרטיות');
      link.setAttribute('type', 'button');
      link.addEventListener('click', function () {
        closeDialog(dlg);
        if (typeof window.goto === 'function') window.goto('privacy');
      });
      var lp = ce('p', 'consent-privacy-link');
      lp.appendChild(document.createTextNode('פרטים מלאים ובקשת מחיקה: '));
      lp.appendChild(link);
      body.appendChild(lp);
    }
    wireConsent(dlg);
    if (dlg && dlg.showModal) { try { dlg.showModal(); } catch (e) { if (dlg.show) dlg.show(); } }
  }

  // ---------- name capture (inline in the summary-card slot) ----------
  function words(v) {
    return String(v || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  }

  function saveName(fullName) {
    return fetch(apiBase() + '/api/token', { method: 'POST' })
      .then(function (r) { return (r && r.ok) ? r.json() : null; })
      .then(function (j) { return (j && j.token) ? j.token : null; })
      ['catch'](function () { return null; });
  }

  function renderNameStep() {
    var slot = document.getElementById('rides-summary-slot');
    if (!slot) return;
    slot.innerHTML = '';

    var card = ce('div', 'card rides-name-card');

    var label = ce('label', 'rides-name-label', 'שם מלא');
    label.setAttribute('for', 'rides-name-input');
    card.appendChild(label);

    card.appendChild(ce('p', 'rides-name-help', 'השם המלא גלוי רק לרכז ההסעות.'));

    var input = ce('input', 'rides-name-input');
    input.setAttribute('id', 'rides-name-input');
    input.setAttribute('type', 'text');
    input.setAttribute('autocomplete', 'name');
    input.setAttribute('placeholder', 'שם פרטי ושם משפחה');
    input.value = '';
    card.appendChild(input);

    var preview = ce('p', 'rides-name-preview');
    preview.setAttribute('id', 'rides-name-preview');
    card.appendChild(preview);

    var errp = ce('p', 'rides-name-error');
    errp.setAttribute('id', 'rides-name-error');
    errp.hidden = true;
    card.appendChild(errp);

    var actions = ce('div', 'rides-name-actions');
    var save = ce('button', 'btn btn-primary', 'שמור');
    save.setAttribute('id', 'rides-name-save');
    save.setAttribute('type', 'button');
    var back = ce('button', 'btn btn-back', '→ חזרה');
    back.setAttribute('id', 'rides-name-back');
    back.setAttribute('type', 'button');
    actions.appendChild(save);
    actions.appendChild(back);
    card.appendChild(actions);

    slot.appendChild(card);

    var warned = false;
    var emptyAttempted = false; // show the "enter a name" error only after a save press

    function refresh() {
      var w = words(input.value);
      if (w.length >= 2) { warned = false; save.textContent = 'שמור'; }
      if (w.length) { emptyAttempted = false; }
      if (!w.length) {
        preview.textContent = '';
        // The placeholder in the field carries the guidance; only surface a red
        // error once the player has actually tried to save an empty field.
        errp.hidden = !emptyAttempted;
        if (emptyAttempted) errp.textContent = 'יש להזין שם מלא';
        save.disabled = true;
        return;
      }
      save.disabled = false;
      preview.textContent = 'יוצג לשחקנים אחרים כ: ' + shortName(input.value);
      if (w.length < 2 && warned) {
        errp.hidden = false;
        errp.textContent = 'נא להזין שם פרטי ומשפחה';
      } else {
        errp.hidden = true;
      }
    }
    input.addEventListener('input', refresh);
    refresh();

    save.addEventListener('click', function () {
      var w = words(input.value);
      if (!w.length) { emptyAttempted = true; refresh(); return; }
      if (w.length < 2 && !warned) {
        warned = true;
        save.textContent = 'שמור בכל זאת';
        errp.hidden = false;
        errp.textContent = 'נא להזין שם פרטי ומשפחה';
        return;
      }
      var fullName = w.join(' ');
      save.disabled = true;
      save.setAttribute('aria-busy', 'true');
      errp.hidden = true;
      saveName(fullName).then(function (token) {
        save.setAttribute('aria-busy', 'false');
        save.disabled = false;
        if (token) {
          setPlayer({ token: token, fullName: fullName });
          setRole('player');
          slot.innerHTML = '';
          rerender();
        } else {
          errp.hidden = false;
          errp.textContent = 'לא הצלחנו לשמור, נסו שוב';
        }
      });
    });

    back.addEventListener('click', function () {
      slot.innerHTML = '';
      setRole('parent'); // never leave role=player without a token
      rerender();
    });
  }

  // ---------- switch back to parent ----------
  function exitToParent() {
    var msg = 'המעבר למצב הורה ימחק את בקשות ההסעה שלך לשבוע זה. להמשיך?';
    var ok = (typeof window.confirm === 'function') ? window.confirm(msg) : true;
    if (!ok) return;
    var p = getPlayer();
    var wk = (typeof window.viewSunday === 'string' && window.viewSunday)
      ? window.viewSunday
      : weekKey(new Date().toISOString().slice(0, 10));
    if (p && p.token) {
      try {
        fetch(apiBase() + '/api/me?token=' + encodeURIComponent(p.token) +
          '&week=' + encodeURIComponent(wk), { method: 'DELETE' })['catch'](function () {});
      } catch (e) {}
    }
    clearPlayer();
    rerender();
  }

  // ---------- privacy screen ----------
  var PRIVACY_LINES = CONSENT_LINES.concat([
    ['p', 'פרטים מלאים ובקשת מחיקה: [contact].']
  ]);

  function renderPrivacy() {
    var body = document.getElementById('privacy-body');
    if (!body) return;
    body.innerHTML = '';
    PRIVACY_LINES.forEach(function (pair) { body.appendChild(ce(pair[0], null, pair[1])); });
  }

  // ================= ride chip / sheet / summary / #screen-rides =================

  // In-memory cache of the player's requests for one week. Never persisted;
  // GET /api/me is the source of truth. `failed` (not `loaded`) drives the
  // "service unavailable" UI so the schedule half is never affected.
  var _week = { key: null, bySession: {}, config: { locations: {}, retDefault: 15 }, loaded: false, failed: false, _p: null };
  var _reRenderQueued = false;
  var _sheetChip = null;

  var DIR_WORD = { round: 'הלוך וחזור', out: 'הלוך', back: 'חזור' };
  function dirWord(d) { return DIR_WORD[d] || d; }

  function toast(m) { if (typeof window.showToast === 'function') window.showToast(m); }
  function currentWeek() {
    return (typeof window.viewSunday === 'string' && window.viewSunday)
      ? window.viewSunday
      : weekKey(new Date().toISOString().slice(0, 10));
  }
  function objVals(o) {
    var a = [];
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) a.push(o[k]); }
    return a;
  }
  function sessionById(id) {
    var ss = (window.DATA && window.DATA.sessions) || [];
    for (var i = 0; i < ss.length; i++) { if (ss[i].id === id) return ss[i]; }
    return null;
  }
  function hhmmStr(iso) {
    var m = /T(\d{2}):(\d{2})/.exec(iso || '');
    return m ? m[1] + ':' + m[2] : '';
  }
  function departFor(session) {
    var lc = _week.config && _week.config.locations ? _week.config.locations[session.location] : undefined;
    var rd = _week.config && _week.config.retDefault != null ? _week.config.retDefault : 15;
    return computeDepartTimes(session, lc, rd);
  }

  function loadMyRides(wk, force) {
    if (!wk) return Promise.resolve();
    var p = getPlayer();
    if (!p) return Promise.resolve();
    if (!force && _week.key === wk && (_week.loaded || _week.failed)) return Promise.resolve();
    if (_week._p && _week.key === wk && !force) return _week._p;

    if (_week.key !== wk) { _week.bySession = {}; _week.loaded = false; }
    _week.key = wk;
    _week.failed = false;
    var url = apiBase() + '/api/me?token=' + encodeURIComponent(p.token) + '&week=' + encodeURIComponent(wk);
    _week._p = fetch(url)
      .then(function (r) { if (!r || !r.ok) throw new Error('me ' + (r && r.status)); return r.json(); })
      .then(function (j) {
        var map = {};
        ((j && j.requests) || []).forEach(function (row) { if (row && row.sessionId) map[row.sessionId] = row; });
        _week.bySession = map;
        _week.config = (j && j.config) || { locations: {}, retDefault: 15 };
        _week.loaded = true;
        _week.failed = false;
      })
      ['catch'](function () { _week.failed = true; })
      .then(function () { _week._p = null; });
    return _week._p;
  }

  function reRenderAll() {
    try { if (typeof window.render === 'function') window.render(); } catch (e) { console.error('rides re-render (schedule unaffected):', e); }
    var sr = document.getElementById('screen-rides');
    if (sr && sr.hidden === false) { try { renderRidesBody(); } catch (e) { console.error(e); } }
  }

  // Load once per week; trigger a single re-render when the data lands.
  function ensureLoaded(wk) {
    if (_week.key === wk && (_week.loaded || _week.failed)) return;
    if (_reRenderQueued) { loadMyRides(wk); return; }
    _reRenderQueued = true;
    loadMyRides(wk).then(function () { _reRenderQueued = false; reRenderAll(); });
  }

  function insertStrip(card, strip) {
    var anchor = card.querySelector('.session-note') || card.querySelector('.session-warn');
    if (anchor && card.insertBefore) card.insertBefore(strip, anchor);
    else card.appendChild(strip);
  }

  function decorateSession(card, session) {
    if (!card || !session) return;
    var wk = weekKey(session.date);
    ensureLoaded(wk);

    var strip = ce('div', 'ride-strip');

    if (_week.key === wk && _week.failed) {
      strip.appendChild(ce('span', 'ride-unavailable', 'שירות ההסעות אינו זמין כרגע'));
      strip.appendChild(retryButton(function () { loadMyRides(wk, true).then(reRenderAll); }));
      insertStrip(card, strip);
      return;
    }

    var row = (_week.key === wk) ? _week.bySession[session.id] : null;
    var chip = ce('button', 'ride-chip');
    chip.setAttribute('type', 'button');
    chip.setAttribute('aria-haspopup', 'dialog');

    if (row) {
      chip.classList.add('is-set');
      var dw = dirWord(row.direction);
      chip.textContent = '🚐 ' + dw + ' ✓';
      var cap = rideCaption(departFor(session));
      chip.setAttribute('aria-label', 'הסעה: ' + dw + ', ' + cap + '; לעריכה');
      strip.appendChild(chip);
      strip.appendChild(ce('span', 'ride-caption', cap));
    } else {
      chip.textContent = '🚐 הוספת הסעה';
      chip.setAttribute('aria-label', 'אין הסעה לאימון זה; להוספה');
      strip.appendChild(chip);
    }
    chip.addEventListener('click', function () { openTripSheet(session, chip); });
    insertStrip(card, strip);
  }

  function retryButton(fn) {
    var b = ce('button', 'ride-retry', 'נסו שוב');
    b.setAttribute('type', 'button');
    b.addEventListener('click', fn);
    return b;
  }

  function wireSheet(dlg) {
    if (!dlg || dlg._ridesWired) return;
    dlg._ridesWired = true;
    dlg.addEventListener('close', function () { if (_sheetChip && _sheetChip.focus) _sheetChip.focus(); });
    dlg.addEventListener('cancel', function () { closeDialog(dlg); });
    var close = dlg.querySelector('[data-sheet="close"]');
    if (close) close.addEventListener('click', function () { closeDialog(dlg); });
  }

  function openTripSheet(session, chipEl) {
    var dlg = document.getElementById('rides-sheet');
    if (!dlg) return;
    wireSheet(dlg);
    _sheetChip = chipEl || null;

    var t = (window.DATA && window.DATA.teamsById && window.DATA.teamsById[session.team_id]) || null;
    var teamName = t ? t.display_name : session.team_id;
    var wd = (window.HE_WEEKDAY && window.HE_WEEKDAY[session.weekday]) || '';
    var heading = document.getElementById('rides-sheet-heading');
    if (heading) heading.textContent = teamName + ' · יום ' + wd + (session.location ? ' · ' + session.location : '');

    var row = _week.bySession[session.id] || null;

    var opts = document.getElementById('rides-sheet-options');
    if (opts) {
      opts.innerHTML = '';
      [['round', 'הלוך וחזור'], ['out', 'הלוך'], ['back', 'חזור']].forEach(function (pair) {
        var b = ce('button', 'ride-opt', pair[1]);
        b.setAttribute('type', 'button');
        b.setAttribute('data-dir', pair[0]);
        if ((row && row.direction === pair[0]) || (!row && pair[0] === 'round')) {
          b.classList.add('is-preselected');
          b.setAttribute('aria-current', 'true');
        }
        b.addEventListener('click', function () {
          closeDialog(dlg);
          putRequest(session, pair[0]);
        });
        opts.appendChild(b);
      });
    }

    var cancelSlot = document.getElementById('rides-sheet-cancel');
    if (cancelSlot) {
      cancelSlot.innerHTML = '';
      if (row) {
        var cb = ce('button', 'ride-cancel', 'ביטול הסעה');
        cb.setAttribute('type', 'button');
        cb.addEventListener('click', function () { closeDialog(dlg); deleteRequest(session); });
        cancelSlot.appendChild(cb);
      }
    }

    if (dlg.showModal) { try { dlg.showModal(); } catch (e) { if (dlg.show) dlg.show(); } }
  }

  function putRequest(session, direction) {
    var p = getPlayer();
    if (!p) return Promise.resolve();
    var wk = weekKey(session.date);
    var prev = _week.bySession[session.id];
    _week.bySession[session.id] = {
      sessionId: session.id, teamId: session.team_id, fullName: p.fullName,
      direction: direction, ts: Date.now(), v: 1
    };
    reRenderAll();

    var body = {
      token: p.token, fullName: p.fullName, teamId: session.team_id,
      sessionId: session.id, direction: direction, week: wk
    };
    return fetch(apiBase() + '/api/request', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) {
      if (r && r.ok) return;
      revertRow(session.id, prev);
      toast((r && r.status >= 400 && r.status < 500)
        ? 'לא ניתן לבחור הסעה לאימון זה'
        : 'שמירת ההסעה נכשלה, נסו שוב');
    })['catch'](function () {
      revertRow(session.id, prev);
      toast('שמירת ההסעה נכשלה, נסו שוב');
    });
  }

  function deleteRequest(session) {
    var p = getPlayer();
    if (!p) return Promise.resolve();
    var wk = weekKey(session.date);
    var prev = _week.bySession[session.id];
    delete _week.bySession[session.id];
    reRenderAll();

    return fetch(apiBase() + '/api/request', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: p.token, sessionId: session.id, week: wk })
    }).then(function (r) {
      if (r && r.ok) return;
      revertRow(session.id, prev);
      toast('שמירת ההסעה נכשלה, נסו שוב');
    })['catch'](function () {
      revertRow(session.id, prev);
      toast('שמירת ההסעה נכשלה, נסו שוב');
    });
  }

  function revertRow(sessionId, prev) {
    if (prev) _week.bySession[sessionId] = prev;
    else delete _week.bySession[sessionId];
    reRenderAll();
  }

  // ---------- rides summary card (top of My Week, player mode) ----------
  function renderSummaryCard() {
    var slot = document.getElementById('rides-summary-slot');
    if (!slot) return;
    slot.innerHTML = '';
    if (getRole() !== 'player' || !getPlayer()) return;

    var wk = currentWeek();
    ensureLoaded(wk);

    var card = ce('div', 'rides-summary-card');
    var line = ce('div', 'rides-summary-line');

    if (_week.key === wk && _week.failed) {
      line.textContent = 'שירות ההסעות אינו זמין כרגע';
      card.appendChild(line);
      card.appendChild(retryButton(function () { loadMyRides(wk, true).then(reRenderAll); }));
    } else {
      var rows = objVals(_week.key === wk ? _week.bySession : {});
      if (!rows.length) {
        line.textContent = 'טרם נרשמת להסעות השבוע';
      } else {
        var noTime = 0;
        rows.forEach(function (row) {
          var s = sessionById(row.sessionId);
          var dep = s ? departFor(s) : { outbound: null, ret: null };
          if (dep.outbound == null && dep.ret == null) noTime++;
        });
        line.textContent = 'ההסעות שלי לשבוע זה: ' + rows.length +
          (noTime ? ' · ' + noTime + ' ללא שעה' : '');
      }
      card.appendChild(line);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', function () { if (typeof window.goto === 'function') window.goto('rides'); });
    }
    slot.appendChild(card);

    var exit = ce('button', 'rides-exit-parent', 'מעבר למצב הורה');
    exit.setAttribute('type', 'button');
    exit.addEventListener('click', function () { exitToParent(); });
    slot.appendChild(exit);
  }

  // ---------- #screen-rides ----------
  function renderRides() {
    renderRidesBody();
    if (getRole() === 'player' && getPlayer()) {
      loadMyRides(currentWeek(), true).then(renderRidesBody);
    }
  }

  function renderRidesBody() {
    var body = document.getElementById('rides-body');
    if (!body) return;
    body.innerHTML = '';

    if (getRole() !== 'player' || !getPlayer()) {
      body.appendChild(ce('p', 'rides-note', 'עברו למצב שחקן כדי לנהל הסעות.'));
      return;
    }

    var wk = currentWeek();

    if (_week.key === wk && _week.failed) {
      body.appendChild(ce('p', 'rides-load-error', 'לא ניתן לטעון את ההסעות שלך'));
      body.appendChild(retryButton(function () { loadMyRides(wk, true).then(renderRidesBody); }));
      return;
    }

    var rows = objVals(_week.key === wk ? _week.bySession : {});

    if (!rows.length) {
      body.appendChild(ce('p', 'rides-empty-head', 'בחרו אימון כדי להוסיף הסעה'));
      var list = ce('div', 'rides-empty-list');
      var sessions = (typeof window.weekSessionsFor === 'function') ? window.weekSessionsFor(wk) : [];
      sessions.forEach(function (s) {
        var rowEl = ce('div', 'rides-empty-row');
        var t = window.DATA && window.DATA.teamsById[s.team_id];
        rowEl.appendChild(ce('span', 'rides-empty-label',
          hhmmStr(s.start) + ' · ' + (t ? t.display_name : s.team_id) + (s.location ? ' · ' + s.location : '')));
        var add = ce('button', 'ride-add', '🚐 הוספת הסעה');
        add.setAttribute('type', 'button');
        add.addEventListener('click', function () { openTripSheet(s, add); });
        rowEl.appendChild(add);
        list.appendChild(rowEl);
      });
      body.appendChild(list);
      return;
    }

    var byDate = {};
    rows.forEach(function (row) {
      var s = sessionById(row.sessionId);
      var d = s ? s.date : '~';
      (byDate[d] = byDate[d] || []).push({ row: row, s: s });
    });
    Object.keys(byDate).sort().forEach(function (d) {
      var grp = ce('div', 'rides-day-group');
      var first = byDate[d][0].s;
      grp.appendChild(ce('div', 'rides-day-head',
        first ? ('יום ' + ((window.HE_WEEKDAY && window.HE_WEEKDAY[first.weekday]) || '')) : 'בקשות ללא אימון תואם'));
      byDate[d].forEach(function (item) {
        var s = item.s, row = item.row;
        var t = s && window.DATA && window.DATA.teamsById[s.team_id];
        var teamName = t ? t.display_name : (s ? s.team_id : row.teamId);
        var rEl = ce('div', 'rides-row');
        rEl.appendChild(ce('span', 'rides-row-main',
          teamName + (s && s.location ? ' · ' + s.location : '') + ' · ' + dirWord(row.direction)));
        rEl.appendChild(ce('span', 'rides-row-cap', rideCaption(s ? departFor(s) : { outbound: null, ret: null })));

        var edit = ce('button', 'ride-edit', 'עריכה');
        edit.setAttribute('type', 'button');
        edit.setAttribute('aria-label', 'עריכת הסעה: ' + teamName +
          (s ? ', יום ' + ((window.HE_WEEKDAY && window.HE_WEEKDAY[s.weekday]) || '') : ''));
        if (s) edit.addEventListener('click', function () { openTripSheet(s, edit); });
        else edit.disabled = true;

        var del = ce('button', 'ride-del', 'ביטול');
        del.setAttribute('type', 'button');
        del.setAttribute('aria-label', 'ביטול הסעה: ' + teamName);
        del.addEventListener('click', function () {
          if (s) { deleteRequest(s); }
          else { delete _week.bySession[row.sessionId]; reRenderAll(); }
        });

        rEl.appendChild(edit);
        rEl.appendChild(del);
        grp.appendChild(rEl);
      });
      body.appendChild(grp);
    });
  }

  // ---------- opens ping (best-effort, throttled ≤ 1/hour/device) ----------
  function ping() {
    var KEY = 'gilboa.ping_ts';
    try {
      var last = Number(localStorage.getItem(KEY) || '0');
      if (last && (Date.now() - last) < 3600000) return;
      localStorage.setItem(KEY, String(Date.now()));
    } catch (e) { /* if storage is unavailable just skip */ return; }
    try {
      fetch(apiBase() + '/api/ping', { method: 'POST', keepalive: true })['catch'](function () {});
    } catch (e) { /* ignore */ }
  }

  window.Rides = {
    // pure helpers
    shortName: shortName, weekKey: weekKey, rideCaption: rideCaption,
    computeDepartTimes: computeDepartTimes, apiBase: apiBase,
    // role + flow
    getRole: getRole, getPlayer: getPlayer, isPlayerWithToken: isPlayerWithToken,
    renderRoleToggle: renderRoleToggle, enterPlayerMode: enterPlayerMode,
    exitToParent: exitToParent, renderPrivacy: renderPrivacy,
    // chip / sheet / summary / screen / ping
    decorateSession: decorateSession, renderSummaryCard: renderSummaryCard,
    renderRides: renderRides, openTripSheet: openTripSheet,
    putRequest: putRequest, deleteRequest: deleteRequest, ping: ping,
    _week: _week
  };
})();
