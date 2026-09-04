/* Gilboa Maayanot — rides (player side). Vanilla ES5 idiom, no build, loaded
   AFTER app.js. All network calls are contained: a failure here never breaks
   the schedule view. Pure helpers are exposed on window.Rides for tests. */
'use strict';

(function () {
  function ltr(s) { return (typeof window.ltrIsolate === 'function') ? window.ltrIsolate(s) : s; }

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

  window.Rides = {
    shortName: shortName, weekKey: weekKey, rideCaption: rideCaption,
    computeDepartTimes: computeDepartTimes, apiBase: apiBase
  };
})();
