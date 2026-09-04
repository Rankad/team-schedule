import { json, withCors, preflight, errToResponse, HttpError } from "../_lib/http.js";
import { runPurge } from "../_lib/purge.js";

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function onRequestPost({ request, env }) {
  try {
    const key = request.headers.get("x-purge-key");
    if (!env.PURGE_KEY || !timingSafeEqual(key || "", env.PURGE_KEY)) {
      throw new HttpError(401, "unauthorized");
    }
    const counts = await runPurge(env.RIDES_KV, new Date().toISOString().slice(0, 10));
    return withCors(json({ ok: true, ...counts }), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
