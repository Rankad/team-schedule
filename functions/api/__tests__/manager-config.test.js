import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { onRequestGet, onRequestPut } from "../manager/config.js";
import { onRequestPost as login } from "../manager/login.js";

async function bearer() {
  const r = await login({ request: new Request("http://x", { method: "POST", body: JSON.stringify({ passphrase: env.MANAGER_PASSPHRASE }) }), env });
  return "Bearer " + (await r.json()).token;
}

describe("/api/manager/config", () => {
  it("401 without a manager token", async () => {
    const r = await onRequestGet({ request: new Request("http://x/api/manager/config"), env });
    expect(r.status).toBe(401);
  });
  it("PUT then GET round-trips a location offset", async () => {
    const auth = await bearer();
    const put = await onRequestPut({ request: new Request("http://x/api/manager/config", {
      method: "PUT", headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({ locations: { "אולם קציר": { outbound: 40, ret: 15, manual: false } }, global: { retDefault: 20 } }),
    }), env });
    expect(put.status).toBe(200);
    const stored = JSON.parse(await env.RIDES_KV.get("config/locations"));
    expect(stored["אולם קציר"].outbound).toBe(40);
    const g = JSON.parse(await env.RIDES_KV.get("config/global"));
    expect(g.retDefault).toBe(20);
  });
  it("rejects an out-of-range offset", async () => {
    const auth = await bearer();
    const r = await onRequestPut({ request: new Request("http://x/api/manager/config", {
      method: "PUT", headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({ locations: { X: { outbound: 9999, ret: null } } }),
    }), env });
    expect(r.status).toBe(400);
  });
});
