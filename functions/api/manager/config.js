import { json, withCors, preflight, readJson, errToResponse, HttpError } from "../../_lib/http.js";
import { requireManager } from "../../_lib/auth.js";

const inRange = (n) => Number.isInteger(n) && n >= 0 && n <= 600;
const okOffset = (v) => v === null || inRange(v);

async function liveLocations(env) {
  try {
    const r = await fetch(`${env.SITE_ORIGIN}/data/schedule.json`, { cf: { cacheTtl: 60 } });
    if (!r.ok) return [];
    const j = await r.json();
    return [...new Set(j.sessions.map((s) => s.location).filter(Boolean))];
  } catch { return []; }
}

export async function onRequestGet({ request, env }) {
  try {
    await requireManager(request, env);
    let locations = {}, global = {};
    const lc = await env.RIDES_KV.get("config/locations");
    if (lc) { try { locations = JSON.parse(lc); delete locations.v; } catch {} }
    const gc = await env.RIDES_KV.get("config/global");
    if (gc) { try { global = JSON.parse(gc); } catch {} }
    for (const name of await liveLocations(env)) {
      if (!locations[name]) locations[name] = { outbound: null, ret: null, manual: false };
    }
    if (global.retDefault == null) global.retDefault = 15;
    return withCors(json({ locations, global }), env);
  } catch (err) { return errToResponse(err, env); }
}

export async function onRequestPut({ request, env }) {
  try {
    await requireManager(request, env);
    const b = await readJson(request);

    if (b.locations && typeof b.locations === "object") {
      for (const [name, cfg] of Object.entries(b.locations)) {
        if (!cfg || typeof cfg !== "object" || !okOffset(cfg.outbound ?? null) || !okOffset(cfg.ret ?? null)) {
          throw new HttpError(400, "bad_request");
        }
      }
      let cur = {};
      const lc = await env.RIDES_KV.get("config/locations");
      if (lc) { try { cur = JSON.parse(lc); } catch {} }
      for (const [name, cfg] of Object.entries(b.locations)) {
        if (cfg.__delete) delete cur[name];
        else cur[name] = { outbound: cfg.outbound ?? null, ret: cfg.ret ?? null, manual: !!cfg.manual };
      }
      cur.v = 1;
      await env.RIDES_KV.put("config/locations", JSON.stringify(cur));
    }

    if (b.global && typeof b.global === "object") {
      if (b.global.retDefault != null && !inRange(b.global.retDefault)) throw new HttpError(400, "bad_request");
      let cur = {};
      const gc = await env.RIDES_KV.get("config/global");
      if (gc) { try { cur = JSON.parse(gc); } catch {} }
      if (b.global.retDefault != null) cur.retDefault = b.global.retDefault;
      cur.v = 1;
      await env.RIDES_KV.put("config/global", JSON.stringify(cur));
    }

    return withCors(json({ ok: true }), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
