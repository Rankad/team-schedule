import { json, withCors, preflight, errToResponse, HttpError } from "../../_lib/http.js";
import { requireManager } from "../../_lib/auth.js";
import { isWeekKey } from "../../_lib/validate.js";
import { buildDashboard } from "../../_lib/dashboard.js";

export async function onRequestGet({ request, env }) {
  try {
    await requireManager(request, env);
    const week = new URL(request.url).searchParams.get("week");
    if (!isWeekKey(week)) throw new HttpError(400, "bad_request");

    const [schedRes, teamsRes] = await Promise.all([
      fetch(`${env.SITE_ORIGIN}/data/schedule.json`, { cf: { cacheTtl: 60 } }),
      fetch(`${env.SITE_ORIGIN}/data/teams.json`, { cf: { cacheTtl: 60 } }),
    ]);
    if (!schedRes.ok || !teamsRes.ok) throw new HttpError(502, "schedule_unavailable");
    const scheduleJson = await schedRes.json();
    const teamsArr = await teamsRes.json();
    const teamsById = {};
    for (const t of teamsArr) teamsById[t.team_id] = t;

    const data = await buildDashboard(env.RIDES_KV, scheduleJson, teamsById, week);
    return withCors(json(data), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
