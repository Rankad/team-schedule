import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { bumpPlayersAll, writeOpen, sumOpens } from "../stats.js";

const today = new Date().toISOString().slice(0, 10);

describe("stats", () => {
  it("bumpPlayersAll increments an integer", async () => {
    await bumpPlayersAll(env.RIDES_KV);
    await bumpPlayersAll(env.RIDES_KV);
    expect(Number(await env.RIDES_KV.get("stats/players-all"))).toBe(2);
  });
  it("writeOpen shards and sumOpens counts", async () => {
    await writeOpen(env.RIDES_KV);
    await writeOpen(env.RIDES_KV);
    await writeOpen(env.RIDES_KV);
    expect(await sumOpens(env.RIDES_KV, today)).toBe(3);
  });
});
