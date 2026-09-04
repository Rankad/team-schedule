import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { onRequestPost } from "../purge.js";

const call = (headers) => onRequestPost({ request: new Request("http://x/api/purge", { method: "POST", headers }), env });

describe("POST /api/purge", () => {
  it("401 without the key", async () => {
    expect((await call({})).status).toBe(401);
    expect((await call({ "x-purge-key": "wrong" })).status).toBe(401);
  });
  it("200 with the key", async () => {
    const r = await call({ "x-purge-key": env.PURGE_KEY });
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });
});
