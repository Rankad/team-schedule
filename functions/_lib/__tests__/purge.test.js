import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { runPurge } from "../purge.js";

describe("runPurge", () => {
  it("deletes strictly-past weeks, keeps current + future + config", async () => {
    await env.RIDES_KV.put("week/2026-08-30/req/t/s", JSON.stringify({ v: 1 }));
    await env.RIDES_KV.put("week/2026-09-06/req/t/s", JSON.stringify({ v: 1 }));
    await env.RIDES_KV.put("week/2026-09-13/req/t/s", JSON.stringify({ v: 1 }));
    await env.RIDES_KV.put("config/global", JSON.stringify({ retDefault: 15, v: 1 }));

    const res = await runPurge(env.RIDES_KV, "2026-09-09"); // current Sunday = 2026-09-06
    expect(res.weeksDeleted).toContain("2026-08-30");
    expect(await env.RIDES_KV.get("week/2026-08-30/req/t/s")).toBeNull();
    expect(await env.RIDES_KV.get("week/2026-09-06/req/t/s")).not.toBeNull();
    expect(await env.RIDES_KV.get("week/2026-09-13/req/t/s")).not.toBeNull();

    const g = JSON.parse(await env.RIDES_KV.get("config/global"));
    expect(g.lastPurge).toBe("2026-09-09");
    expect(g.retDefault).toBe(15);
  });
});
