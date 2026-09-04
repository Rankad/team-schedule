import { json, withCors, preflight, errToResponse } from "../_lib/http.js";
import { mintPlayerToken } from "../_lib/token.js";
import { bumpPlayersAll } from "../_lib/stats.js";

export async function onRequestPost({ env }) {
  try {
    const token = mintPlayerToken();
    await bumpPlayersAll(env.RIDES_KV);
    return withCors(json({ token }), env);
  } catch (err) {
    return errToResponse(err, env);
  }
}

export function onRequestOptions({ env }) { return preflight(env); }
