import { withCors, preflight } from "../_lib/http.js";
import { writeOpen } from "../_lib/stats.js";

export async function onRequestPost({ env }) {
  try { await writeOpen(env.RIDES_KV); } catch { /* opens are best-effort */ }
  return withCors(new Response(null, { status: 204 }), env);
}

export function onRequestOptions({ env }) { return preflight(env); }
