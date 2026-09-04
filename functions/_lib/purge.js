import { weekKeyOf } from "./week.js";

const DAY = 86400000;

export async function runPurge(kv, todayStr) {
  const currentSunday = weekKeyOf(todayStr);
  const weeksDeleted = new Set();
  let keysDeleted = 0, opensDeleted = 0;

  let cursor;
  do {
    const page = await kv.list({ prefix: "week/", cursor });
    for (const k of page.keys) {
      const wk = k.name.split("/")[1];
      if (wk && /^\d{4}-\d{2}-\d{2}$/.test(wk) && wk < currentSunday) {
        await kv.delete(k.name);
        keysDeleted++;
        weeksDeleted.add(wk);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const cutoff = new Date(Date.parse(todayStr) - 90 * DAY).toISOString().slice(0, 10);
  cursor = undefined;
  do {
    const page = await kv.list({ prefix: "stats/opens/", cursor });
    for (const k of page.keys) {
      const d = k.name.split("/")[2];
      if (d && d < cutoff) { await kv.delete(k.name); opensDeleted++; }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  let global = {};
  const cur = await kv.get("config/global");
  if (cur) { try { global = JSON.parse(cur); } catch { global = {}; } }
  global.lastPurge = todayStr;
  global.v = 1;
  await kv.put("config/global", JSON.stringify(global));

  return { weeksDeleted: [...weeksDeleted], keysDeleted, opensDeleted };
}
