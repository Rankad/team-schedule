import { json, withCors, preflight, errToResponse, HttpError } from "../_lib/http.js";
import { isWeekKey } from "../_lib/validate.js";
import { listRequestsForToken, deleteAllForToken } from "../_lib/rows.js";

const isToken = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(s);

function params(request) {
  const u = new URL(request.url);
  return { token: u.searchParams.get("token"), week: u.searchParams.get("week") };
}

export async function onRequestGet({ request, env }) {
  try {
    const { token, week } = params(request);
    if (!isToken(token) || !isWeekKey(week)) throw new HttpError(400, "bad_request");
    const requests = await listRequestsForToken(env.RIDES_KV, week, token);
    let rideStatus = {};
    const rs = await env.RIDES_KV.get(`week/${week}/rideStatus`);
    if (rs) { try { rideStatus = JSON.parse(rs); delete rideStatus.v; } catch { rideStatus = {}; } }
    return withCors(json({ requests, rideStatus }), env);
  } catch (err) { return errToResponse(err, env); }
}

export async function onRequestDelete({ request, env }) {
  try {
    const { token, week } = params(request);
    if (!isToken(token) || !isWeekKey(week)) throw new HttpError(400, "bad_request");
    const deleted = await deleteAllForToken(env.RIDES_KV, week, token);
    return withCors(json({ ok: true, deleted }), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
