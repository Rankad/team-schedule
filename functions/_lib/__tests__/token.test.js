import { describe, it, expect } from "vitest";
import { mintPlayerToken, mintManagerToken, verifyManagerToken } from "../token.js";

const env = { MANAGER_PASSPHRASE: "correct horse battery staple" };

describe("player token", () => {
  it("is opaque, url-safe, and unique", () => {
    const a = mintPlayerToken();
    const b = mintPlayerToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });
});

describe("manager token", () => {
  it("verifies a fresh token", async () => {
    const { token, exp } = await mintManagerToken(env, 3600e3);
    expect(exp).toBeGreaterThan(Date.now());
    expect(await verifyManagerToken(env, token)).toBe(true);
  });
  it("rejects a tampered token", async () => {
    const { token } = await mintManagerToken(env, 3600e3);
    expect(await verifyManagerToken(env, token + "x")).toBe(false);
  });
  it("rejects an expired token", async () => {
    const { token } = await mintManagerToken(env, -1000);
    expect(await verifyManagerToken(env, token)).toBe(false);
  });
  it("rejects under a different passphrase", async () => {
    const { token } = await mintManagerToken(env, 3600e3);
    expect(await verifyManagerToken({ MANAGER_PASSPHRASE: "other" }, token)).toBe(false);
  });
});
