import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { onRequestGet, onRequestDelete } from "../me.js";
import { putRequest } from "../../_lib/rows.js";

describe("GET/DELETE /api/me", () => {
  it("returns this token's rows only", async () => {
    await putRequest(env.RIDES_KV, { wk: "2026-09-06", token: "minetok01", fullName: "א ב", teamId: "T_1", sessionId: "s1", direction: "round" });
    await putRequest(env.RIDES_KV, { wk: "2026-09-06", token: "othertok01", fullName: "ג ד", teamId: "T_1", sessionId: "s1", direction: "round" });
    const r = await onRequestGet({ request: new Request("http://x/api/me?token=minetok01&week=2026-09-06"), env });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.requests.length).toBe(1);
    expect(body.rideStatus).toEqual({});
  });
  it("DELETE removes every row for the token+week", async () => {
    await putRequest(env.RIDES_KV, { wk: "2026-09-06", token: "wipetok01", fullName: "א ב", teamId: "T_1", sessionId: "s1", direction: "round" });
    await putRequest(env.RIDES_KV, { wk: "2026-09-06", token: "wipetok01", fullName: "א ב", teamId: "T_1", sessionId: "s2", direction: "out" });
    const r = await onRequestDelete({ request: new Request("http://x/api/me?token=wipetok01&week=2026-09-06", { method: "DELETE" }), env });
    expect((await r.json()).deleted).toBe(2);
  });
  it("400 on a missing token", async () => {
    const r = await onRequestGet({ request: new Request("http://x/api/me?week=2026-09-06"), env });
    expect(r.status).toBe(400);
  });
});
