import { describe, it, expect } from "vitest";
import { json, withCors, preflight, readJson, HttpError, errToResponse } from "../http.js";

const env = { SITE_ORIGIN: "http://localhost:8788" };

describe("http helpers", () => {
  it("json sets content-type and CORS", async () => {
    const r = withCors(json({ ok: true }), env);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    expect(r.headers.get("access-control-allow-origin")).toBe("http://localhost:8788");
    expect(await r.json()).toEqual({ ok: true });
  });
  it("preflight is 204 with CORS", () => {
    const r = preflight(env);
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-methods")).toMatch(/PUT/);
  });
  it("readJson rejects an oversized body", async () => {
    const big = JSON.stringify({ x: "y".repeat(2000) });
    const req = new Request("http://x/", { method: "PUT", body: big, headers: { "content-length": String(big.length) } });
    await expect(readJson(req)).rejects.toMatchObject({ status: 400 });
  });
  it("readJson rejects a non-object body", async () => {
    const req = new Request("http://x/", { method: "PUT", body: "42" });
    await expect(readJson(req)).rejects.toBeInstanceOf(HttpError);
  });
  it("errToResponse maps status + code", async () => {
    const r = errToResponse(new HttpError(404, "nope"), env);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "nope" });
  });
});
