function hm(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function fmt(mins) {
  let x = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(x / 60), m = x % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

export function computeDepartTimes(session, locConfig, retDefault) {
  const start = hm(session && session.start);
  const end = hm(session && session.end);
  const outMin = locConfig && locConfig.outbound != null ? locConfig.outbound : null;
  const retMin = locConfig && locConfig.ret != null ? locConfig.ret
    : (retDefault != null ? retDefault : null);
  return {
    outbound: start != null && outMin != null ? fmt(start - outMin) : null,
    ret: end != null && retMin != null ? fmt(end + retMin) : null,
  };
}
