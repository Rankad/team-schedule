import { json, withCors, preflight, readJson, errToResponse, HttpError } from "../_lib/http.js";
import { isSessionId, isTeamId, isDirection, isWeekKey, isNonEmptyName } from "../_lib/validate.js";
import { putRequest, deleteRequest, countRequestsForToken, reqKey } from "../_lib/rows.js";

const MAX_ROWS_PER_TOKEN_WEEK = 20;
const isToken = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(s);

export async function onRequestPut({ request, env }) {
  try {
    const b = await readJson(request);
    if (!isToken(b.token) || !isWeekKey(b.week) || !isSessionId(b.sessionId) ||
        !isTeamId(b.teamId) || !isDirection(b.direction) || !isNonEmptyName(b.fullName)) {
      throw new HttpError(400, "bad_request");
    }
    const existing = await env.RIDES_KV.get(reqKey(b.week, b.token, b.sessionId));
    if (!existing) {
      const n = await countRequestsForToken(env.RIDES_KV, b.week, b.token);
      if (n >= MAX_ROWS_PER_TOKEN_WEEK) throw new HttpError(400, "too_many");
    }
    await putRequest(env.RIDES_KV, {
      wk: b.week, token: b.token, fullName: b.fullName.trim(),
      teamId: b.teamId, sessionId: b.sessionId, direction: b.direction,
    });
    return withCors(json({ ok: true }), env);
  } catch (err) { return errToResponse(err, env); }
}

export async function onRequestDelete({ request, env }) {
  try {
    const b = await readJson(request);
    if (!isToken(b.token) || !isWeekKey(b.week) || !isSessionId(b.sessionId)) {
      throw new HttpError(400, "bad_request");
    }
    await deleteRequest(env.RIDES_KV, b.week, b.token, b.sessionId);
    return withCors(json({ ok: true }), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
