import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { onRequestPut, onRequestDelete } from "../request.js";
import { listRequestsForToken } from "../../_lib/rows.js";

const base = { token: "tok-abc123", fullName: "דניאל כהן", teamId: "T_042", week: "2026-09-06" };
const put = (body) => onRequestPut({ request: new Request("http://x/api/request", {
  method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" },
}), env });

describe("PUT /api/request", () => {
  it("writes a valid row and upserts on the same session", async () => {
    let r = await put({ ...base, sessionId: "sess1", direction: "round" });
    expect(r.status).toBe(200);
    r = await put({ ...base, sessionId: "sess1", direction: "out" });
    expect(r.status).toBe(200);
    const rows = await listRequestsForToken(env.RIDES_KV, base.week, base.token);
    expect(rows.length).toBe(1);
    expect(rows[0].direction).toBe("out");
    expect(rows[0].v).toBe(1);
  });
  it("rejects a bad direction", async () => {
    const r = await put({ ...base, sessionId: "sess2", direction: "both" });
    expect(r.status).toBe(400);
  });
  it("rejects a bad week", async () => {
    const r = await put({ ...base, sessionId: "sess3", direction: "round", week: "2026-9-6" });
    expect(r.status).toBe(400);
  });
  it("rejects an oversized name", async () => {
    const r = await put({ ...base, sessionId: "sess4", direction: "round", fullName: "x".repeat(90) });
    expect(r.status).toBe(400);
  });
  it("caps at 20 rows per token per week", async () => {
    for (let i = 0; i < 20; i++) {
      const r = await put({ ...base, token: "capper01", sessionId: "s" + i, direction: "round" });
      expect(r.status).toBe(200);
    }
    const over = await put({ ...base, token: "capper01", sessionId: "s20", direction: "round" });
    expect(over.status).toBe(400);
    expect((await over.json()).error).toBe("too_many");
  });
});

describe("DELETE /api/request", () => {
  it("removes exactly one session row", async () => {
    await put({ ...base, token: "deltok01", sessionId: "keep", direction: "round" });
    await put({ ...base, token: "deltok01", sessionId: "drop", direction: "round" });
    const r = await onRequestDelete({ request: new Request("http://x/api/request", {
      method: "DELETE", body: JSON.stringify({ token: "deltok01", sessionId: "drop", week: base.week }),
      headers: { "content-type": "application/json" },
    }), env });
    expect(r.status).toBe(200);
    const rows = await listRequestsForToken(env.RIDES_KV, base.week, "deltok01");
    expect(rows.map((x) => x.sessionId)).toEqual(["keep"]);
  });
});
