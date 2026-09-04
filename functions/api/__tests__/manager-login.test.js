import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { onRequestPost } from "../manager/login.js";
import { verifyManagerToken } from "../../_lib/token.js";

const post = (body) => onRequestPost({ request: new Request("http://x/api/manager/login", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
}), env });

describe("POST /api/manager/login", () => {
  it("issues a usable token on the right passphrase", async () => {
    const r = await post({ passphrase: env.MANAGER_PASSPHRASE });
    expect(r.status).toBe(200);
    const { token, exp } = await r.json();
    expect(exp).toBeGreaterThan(Date.now());
    expect(await verifyManagerToken(env, token)).toBe(true);
  });
  it("401 on the wrong passphrase", async () => {
    expect((await post({ passphrase: "nope" })).status).toBe(401);
  });
});
