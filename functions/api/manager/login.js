import { json, withCors, preflight, readJson, errToResponse, HttpError } from "../../_lib/http.js";
import { mintManagerToken } from "../../_lib/token.js";

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function onRequestPost({ request, env }) {
  try {
    const b = await readJson(request);
    if (!timingSafeEqual(String(b.passphrase || ""), env.MANAGER_PASSPHRASE || " ")) {
      throw new HttpError(401, "bad_passphrase");
    }
    const { token, exp } = await mintManagerToken(env);
    return withCors(json({ token, exp }), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
