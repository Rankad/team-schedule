import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { onRequestPost, onRequestOptions } from "../token.js";

describe("POST /api/token", () => {
  it("mints a token and bumps players-all", async () => {
    const r = await onRequestPost({ request: new Request("http://x/api/token", { method: "POST" }), env });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(r.headers.get("access-control-allow-origin")).toBe(env.SITE_ORIGIN);
    expect(Number(await env.RIDES_KV.get("stats/players-all"))).toBeGreaterThanOrEqual(1);
  });
  it("OPTIONS is a 204 preflight", async () => {
    const r = await onRequestOptions({ env });
    expect(r.status).toBe(204);
  });
});
