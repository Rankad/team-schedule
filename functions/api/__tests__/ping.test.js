import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { onRequestPost } from "../ping.js";
import { sumOpens } from "../../_lib/stats.js";

const today = new Date().toISOString().slice(0, 10);

describe("POST /api/ping", () => {
  it("always 204 and records a sharded open", async () => {
    const r = await onRequestPost({ request: new Request("http://x/api/ping", { method: "POST", body: "ignored" }), env });
    expect(r.status).toBe(204);
    expect(await sumOpens(env.RIDES_KV, today)).toBeGreaterThanOrEqual(1);
  });
});
