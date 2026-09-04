import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import scheduleJson from "../../test-fixtures/schedule.sample.json";
import { buildDashboard } from "../../_lib/dashboard.js";
import { putRequest } from "../../_lib/rows.js";

const teamsById = { T_009: { display_name: "נערות א על" }, T_031: { display_name: "נוער על" } };
const WK = "2026-09-06";

describe("buildDashboard", () => {
  it("groups requests by day + practice, counts directions, resolves names", async () => {
    await putRequest(env.RIDES_KV, { wk: WK, token: "p1", fullName: "דניאל כהן", teamId: "T_009", sessionId: "evt-a", direction: "round" });
    await putRequest(env.RIDES_KV, { wk: WK, token: "p2", fullName: "מאיה לוי", teamId: "T_009", sessionId: "evt-a", direction: "out" });
    await putRequest(env.RIDES_KV, { wk: WK, token: "p3", fullName: "יונתן שמש", teamId: "T_009", sessionId: "GONE", direction: "back" });
    await env.RIDES_KV.put("config/locations", JSON.stringify({ "אולם קציר": { outbound: 40, ret: 15, manual: false }, v: 1 }));
    await env.RIDES_KV.put("config/global", JSON.stringify({ retDefault: 15, lastPurge: "2026-09-04", v: 1 }));

    const d = await buildDashboard(env.RIDES_KV, scheduleJson, teamsById, WK);

    const thu = d.days.find((x) => x.date === "2026-09-08");
    const p = thu.practices.find((x) => x.sessionId === "evt-a");
    expect(p.teamName).toBe("נערות א על");
    expect(p.depart).toEqual({ outbound: "16:20", ret: "18:45" });
    expect(p.byDirection.round).toEqual(["דניאל כהן"]);
    expect(p.byDirection.out).toEqual(["מאיה לוי"]);
    expect(p.riders).toBe(2);
    expect(thu.totals.rides).toBe(3); // round => out+back (2) + out (1)

    expect(d.orphans.map((o) => o.sessionId)).toEqual(["GONE"]);
    expect(d.lastPurge).toBe("2026-09-04");
  });

  it("a practice with zero requests is not listed", async () => {
    const d = await buildDashboard(env.RIDES_KV, scheduleJson, teamsById, WK);
    const fri = d.days.find((x) => x.date === "2026-09-10");
    expect((fri ? fri.practices : []).length).toBe(0);
  });
});
