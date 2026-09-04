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

  function apiBase() {
    var h = (window.location && window.location.hostname) || '';
    if (h === 'localhost' || h === '127.0.0.1') {
      // local dev: wrangler pages dev serves Functions on :8788
      if ((window.location.port || '') === '8788') return window.location.origin + '/api';
      return 'http://localhost:8788/api';
    }
    return (window.location.origin || '') + '/api';
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
      else renderRoleEntry();
    } catch (e) { console.error('rides re-render error (schedule unaffected):', e); }
  }

  function ce(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ---------- role entry link ----------
  function renderRoleEntry() {
    var slot = document.getElementById('role-entry-slot');
    if (!slot) return;
    slot.innerHTML = '';
    if (getRole() === 'player') return;

    var btn = ce('button', 'role-link', 'רישום להסעות — מעבר למצב שחקן');
    btn.setAttribute('type', 'button');
    btn.addEventListener('click', function () { enterPlayerMode(); });
    slot.appendChild(btn);

    var onb = document.getElementById('onboarding');
    if (onb && !onb.hidden && !onb._ridesHook) {
      onb._ridesHook = true;
      onb.appendChild(ce('p', 'onboarding-rides-hook',
        'השחקן/ית עצמם? עברו למצב שחקן כדי להירשם להסעות.'));
    }
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

    function refresh() {
      var w = words(input.value);
      if (w.length >= 2) { warned = false; save.textContent = 'שמור'; }
      if (!w.length) {
        preview.textContent = '';
        errp.hidden = false;
        errp.textContent = 'יש להזין שם מלא';
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
      if (!w.length) { refresh(); return; }
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

  window.Rides = {
    // pure helpers
    shortName: shortName, weekKey: weekKey, rideCaption: rideCaption,
    computeDepartTimes: computeDepartTimes, apiBase: apiBase,
    // role + flow
    getRole: getRole, getPlayer: getPlayer, isPlayerWithToken: isPlayerWithToken,
    renderRoleEntry: renderRoleEntry, enterPlayerMode: enterPlayerMode,
    exitToParent: exitToParent, renderPrivacy: renderPrivacy
  };
})();
