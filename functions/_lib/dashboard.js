import { computeDepartTimes } from "./depart.js";
import { listAllRequestsForWeek } from "./rows.js";
import { sumOpens } from "./stats.js";

const DIRS = ["round", "out", "back"];

export async function buildDashboard(kv, scheduleJson, teamsById, week) {
  const rows = await listAllRequestsForWeek(kv, week);

  let locConfig = {}, global = {};
  const lc = await kv.get("config/locations");
  if (lc) { try { locConfig = JSON.parse(lc); delete locConfig.v; } catch {} }
  const gc = await kv.get("config/global");
  if (gc) { try { global = JSON.parse(gc); } catch {} }
  const retDefault = global.retDefault != null ? global.retDefault : 15;

  const sessionsById = new Map(scheduleJson.sessions.map((s) => [s.id, s]));
  const practices = new Map(); // sessionId -> practice accumulator
  const orphans = [];

  for (const r of rows) {
    const s = sessionsById.get(r.sessionId);
    if (!s) {
      orphans.push({ sessionId: r.sessionId, teamId: r.teamId, fullName: r.fullName, direction: r.direction });
      continue;
    }
    let p = practices.get(s.id);
    if (!p) {
      p = {
        teamId: s.team_id,
        teamName: (teamsById[s.team_id] && teamsById[s.team_id].display_name) || s.team_id,
        location: s.location, start: s.start, date: s.date, weekday: s.weekday,
        sessionId: s.id,
        depart: computeDepartTimes(s, locConfig[s.location], retDefault),
        byDirection: { round: [], out: [], back: [] },
        _tokens: new Set(),
      };
      practices.set(s.id, p);
    }
    if (DIRS.includes(r.direction)) p.byDirection[r.direction].push(r.fullName);
    p._tokens.add(r.token);
  }

  // bucket practices into days
  const dayMap = new Map();
  for (const p of practices.values()) {
    p.riders = p._tokens.size;
    delete p._tokens;
    if (!dayMap.has(p.date)) dayMap.set(p.date, []);
    dayMap.get(p.date).push(p);
  }

  const ridesOf = (p) =>
    p.byDirection.round.length * 2 + p.byDirection.out.length + p.byDirection.back.length;

  const days = [...dayMap.keys()].sort().map((date) => {
    const list = dayMap.get(date).sort((a, b) => a.start.localeCompare(b.start));
    return {
      date, weekday: list[0].weekday,
      totals: {
        riders: list.reduce((n, p) => n + p.riders, 0),
        rides: list.reduce((n, p) => n + ridesOf(p), 0),
      },
      practices: list,
    };
  });

  const allTokens = new Set(rows.map((r) => r.token));
  const today = new Date().toISOString().slice(0, 10);
  let opens7d = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.parse(today) - i * 86400000).toISOString().slice(0, 10);
    opens7d += await sumOpens(kv, d);
  }

  return {
    week, days, orphans,
    stats: {
      playersWeek: allTokens.size,
      playersAll: Number((await kv.get("stats/players-all")) || "0"),
      ridesOut: days.reduce((n, d) => n + d.practices.reduce((m, p) => m + p.byDirection.round.length + p.byDirection.out.length, 0), 0),
      ridesBack: days.reduce((n, d) => n + d.practices.reduce((m, p) => m + p.byDirection.round.length + p.byDirection.back.length, 0), 0),
      activeLocations: new Set([...practices.values()].map((p) => p.location)).size,
      opensToday: await sumOpens(kv, today),
      opens7d,
    },
    lastPurge: global.lastPurge || null,
    rideStatus: {},
  };
}
