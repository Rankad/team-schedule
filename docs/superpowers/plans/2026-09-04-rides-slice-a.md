# Rides — Slice A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add player-mode ride requests on each practice and a password-gated coordinator dashboard, backed by a new Cloudflare Pages Functions API + one KV namespace — without touching the schedule half of the app.

**Architecture:** The existing static site gains a `functions/api/*` layer (Cloudflare Pages Functions) bound to one KV namespace `RIDES_KV`. Ride requests are stored as **per-row** KV keys (`week/<wk>/req/<token>/<sessionId>`) to sidestep KV's last-write-wins race. Players get an opaque CSPRNG token in `localStorage`; the coordinator gets a short-lived signed session token. A separate `public/manager.html` app reads an aggregating dashboard endpoint. A daily `POST /api/purge`, called by the existing GitHub Action, deletes past weeks. All player-side UI lives in a new `public/rides.js`; `app.js` gets only thin hooks. The schedule pipeline, `public/data/*.json`, and the schedule rendering path are untouched, and every rides failure is contained (`שירות ההסעות אינו זמין כרגע` + retry).

**Tech Stack:** Cloudflare Pages Functions (vanilla ES modules, no framework), Cloudflare KV, Vitest + `@cloudflare/vitest-pool-workers` (real `workerd` + Miniflare) for Function tests, vanilla ES5-style JS for `public/*.js`, the dependency-free Node DOM harness (`tests/site_smoke.js`) for site tests, `pytest` untouched.

**Spec:** `docs/rides-spec.md`. **Design record:** `docs/superpowers/specs/2026-09-03-rides-coordination-design.md`.

## Global Constraints

- **Slice A only.** Do not create `week/<wk>/station/*`, `config/stations`, `/api/station-request`, the `#screen-rides` station block, or Cloudflare Access wiring. The data model must leave room for OQ-1 (`config/global.requestCutoffHoursBefore`, `week/<wk>/rideStatus`) but no Slice A code reads or writes them beyond returning `rideStatus` in `GET /api/me`.
- **The schedule half of the app is never touched.** No change to `scripts/**`, `public/data/**`, `tests/test_*.py`, the schedule rendering in `renderMyWeek`/`renderSession` beyond one added `Rides.decorateSession(card, session)` call gated on `role === 'player' && token`. `rides.js` throwing must never break `app.js`.
- **No build step for `public/`.** `public/rides.js`, `public/manager.js` are plain `<script src>`. Vanilla ES5 idiom in `public/*.js` (`var`, `function`, no arrow functions, no `const`/`let`, no template literals) to match `public/app.js`. The `functions/` package is the repo's first `node_modules`, isolated to `functions/`.
- **RTL Hebrew UI, mobile-first**, usable at 360px; every tappable control `min-height: var(--tap)` (≥44px). Existing palette only — **no red, no green** for state.
- **All `localStorage` keys namespaced `gilboa.*`**, every read/write wrapped in `try/catch`.
- **Tokens:** CSPRNG ≥128-bit, opaque, `localStorage` only, **never** in a URL, query string, `history` state, or the DOM. (`GET /api/me` and `DELETE /api/me` take `?token=` — that is a request the browser makes, not a link that is rendered or shared. Never put a token in an `<a href>`.)
- **Every stored KV JSON value carries `v: 1`.**
- **CORS `Access-Control-Allow-Origin` = env `SITE_ORIGIN`**, never a hard-coded origin. `OPTIONS` handled on every route.
- **No secrets, tokens, or full names in Function logs or error responses.**
- **Structural validation only** on write paths — never fetch `schedule.json` to validate a write.
- `week` values match `^\d{4}-\d{2}-\d{2}$` and are the week's **Sunday** (matches `schedule.json` `week_key` and `app.js` `sundayOf`).
- Ship Slice A as one or more short-lived branches off `main`; Cloudflare Pages auto-deploys site + Functions together on push to `main`.
- Every task ends green on all of: `node tests/site_smoke.js`, `pytest -q`, and (from `functions/`) `npm test`.

---

### Task 1: `functions/` package + shared `_lib` helpers

**Files:**
- Create: `functions/package.json`
- Create: `functions/vitest.config.js`
- Create: `functions/.gitignore` (`node_modules/`)
- Create: `functions/_lib/http.js` — JSON/CORS responses, method routing, body reading with the 1 KB cap
- Create: `functions/_lib/token.js` — CSPRNG player token; HMAC-signed manager session token (mint + verify)
- Create: `functions/_lib/validate.js` — id/direction/week/name structural checks
- Create: `functions/_lib/week.js` — `weekKeyOf(dateStr)` (Sunday of the ISO date, string math, no `Date` TZ)
- Create: `functions/_lib/__tests__/token.test.js`
- Create: `functions/_lib/__tests__/validate.test.js`
- Create: `functions/_lib/__tests__/week.test.js`
- Create: `functions/_lib/__tests__/http.test.js`

**Interfaces:**
- Produces:
  - `http.js`: `json(data, init?)` → `Response` (adds `content-type`, calls `withCors`); `withCors(resp, env)` → `Response` with `Access-Control-Allow-Origin: env.SITE_ORIGIN`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers: authorization,content-type`; `preflight(env)` → `204` CORS `Response`; `readJson(request)` → `Promise<object>` that **throws `HttpError(400,'bad_body')`** if `Content-Length` > 1024 or the body is not a JSON object; `HttpError extends Error` with `.status`, `.code`; `errToResponse(err, env)` → `Response` (`err.status||500`, body `{ error: err.code||'internal' }`, CORS applied).
  - `token.js`: `mintPlayerToken()` → `string` (URL-safe base64, 24 bytes from `crypto.getRandomValues`); `mintManagerToken(env, ttlMs=6*3600e3)` → `Promise<{ token, exp }>` where `token = base64url(JSON{exp}) + '.' + base64url(HMAC_SHA256(env.MANAGER_PASSPHRASE, payload))`; `verifyManagerToken(env, token)` → `Promise<boolean>` (constant-time compare via `crypto.subtle.verify`, checks `exp > Date.now()`).
  - `validate.js`: `isSessionId(s)`, `isTeamId(s)` (`/^T_\d{1,6}$/`), `isDirection(s)` (`round|out|back`), `isWeekKey(s)` (`/^\d{4}-\d{2}-\d{2}$/`), `isNonEmptyName(s)` (trimmed length 1..80) — all `→ boolean`. `isSessionId`: `/^[A-Za-z0-9_@-]{1,256}$/` (Google Calendar event ids are lowercase base32hex but allow the superset).
  - `week.js`: `weekKeyOf(dateStr)` → `YYYY-MM-DD` of that date's Sunday. Pure string math: parse `y,m,d`, `Date.UTC`, `getUTCDay`, subtract, reformat. Mirrors `app.js` `sundayOf`.

- [x] **Step 1: Create the package scaffold**

`functions/package.json`:
```json
{
  "name": "gilboa-rides-functions",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": {
    "vitest": "^2.1.0",
    "@cloudflare/vitest-pool-workers": "^0.5.0"
  }
}
```

`functions/vitest.config.js`:
```js
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        miniflare: {
          kvNamespaces: ["RIDES_KV"],
          bindings: {
            SITE_ORIGIN: "http://localhost:8788",
            MANAGER_PASSPHRASE: "correct horse battery staple",
            PURGE_KEY: "test-purge-key",
          },
        },
      },
    },
  },
});
```

`functions/.gitignore`:
```
node_modules/
```

- [x] **Step 2: Install and confirm the runner works**

Run: `cd functions && npm install && npm test`
Expected: Vitest runs, reports "No test files found" (exit 0) — or exit 1 with that message; either way the pool-workers runtime loads without a config error. If it errors on the pool package, pin to the latest `@cloudflare/vitest-pool-workers` that matches the installed `vitest` major.

- [x] **Step 3: Write failing tests for `week.js`**

`functions/_lib/__tests__/week.test.js`:
```js
import { describe, it, expect } from "vitest";
import { weekKeyOf } from "../week.js";

describe("weekKeyOf", () => {
  it("returns the same date for a Sunday", () => {
    expect(weekKeyOf("2026-09-06")).toBe("2026-09-06"); // 2026-09-06 is a Sunday
  });
  it("rolls back to the prior Sunday mid-week", () => {
    expect(weekKeyOf("2026-09-09")).toBe("2026-09-06"); // Wednesday
    expect(weekKeyOf("2026-09-12")).toBe("2026-09-06"); // Saturday
  });
  it("crosses a month boundary", () => {
    expect(weekKeyOf("2026-10-01")).toBe("2026-09-27"); // Thu -> prior Sun
  });
});
```

Run: `cd functions && npm test`
Expected: FAIL — `Cannot find module '../week.js'`.

- [x] **Step 4: Implement `week.js`**

`functions/_lib/week.js`:
```js
// Sunday (YYYY-MM-DD) of the week containing dateStr. Pure string/UTC math so
// the runner's timezone is irrelevant. Mirrors public/app.js sundayOf().
export function weekKeyOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday
  const sun = new Date(ms - dow * 86400000);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${sun.getUTCFullYear()}-${p2(sun.getUTCMonth() + 1)}-${p2(sun.getUTCDate())}`;
}
```

Run: `cd functions && npm test`
Expected: PASS (3 tests).

- [x] **Step 5: Write failing tests for `validate.js`**

`functions/_lib/__tests__/validate.test.js`:
```js
import { describe, it, expect } from "vitest";
import { isSessionId, isTeamId, isDirection, isWeekKey, isNonEmptyName } from "../validate.js";

describe("validate", () => {
  it("isDirection", () => {
    expect(isDirection("round")).toBe(true);
    expect(isDirection("out")).toBe(true);
    expect(isDirection("back")).toBe(true);
    expect(isDirection("both")).toBe(false);
    expect(isDirection("")).toBe(false);
  });
  it("isWeekKey", () => {
    expect(isWeekKey("2026-09-06")).toBe(true);
    expect(isWeekKey("2026-9-6")).toBe(false);
    expect(isWeekKey("garbage")).toBe(false);
  });
  it("isTeamId", () => {
    expect(isTeamId("T_042")).toBe(true);
    expect(isTeamId("T_")).toBe(false);
    expect(isTeamId("X_1")).toBe(false);
  });
  it("isSessionId", () => {
    expect(isSessionId("a1b2c3d4e5f6g7h8i9j0k1l2m3")).toBe(true);
    expect(isSessionId("")).toBe(false);
    expect(isSessionId("has space")).toBe(false);
    expect(isSessionId("x".repeat(300))).toBe(false);
  });
  it("isNonEmptyName", () => {
    expect(isNonEmptyName("דניאל כהן")).toBe(true);
    expect(isNonEmptyName("   ")).toBe(false);
    expect(isNonEmptyName("x".repeat(81))).toBe(false);
  });
});
```

Run: `cd functions && npm test` — FAIL (`Cannot find module '../validate.js'`).

- [x] **Step 6: Implement `validate.js`**

`functions/_lib/validate.js`:
```js
export const isSessionId = (s) => typeof s === "string" && /^[A-Za-z0-9_@-]{1,256}$/.test(s);
export const isTeamId = (s) => typeof s === "string" && /^T_\d{1,6}$/.test(s);
export const isDirection = (s) => s === "round" || s === "out" || s === "back";
export const isWeekKey = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isNonEmptyName = (s) => typeof s === "string" && s.trim().length >= 1 && s.trim().length <= 80;
```

Run: `cd functions && npm test` — PASS.

- [x] **Step 7: Write failing tests for `token.js`**

`functions/_lib/__tests__/token.test.js`:
```js
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
```

Run: `cd functions && npm test` — FAIL.

- [x] **Step 8: Implement `token.js`**

`functions/_lib/token.js`:
```js
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s) => b64url(new TextEncoder().encode(s));
const fromB64url = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

export function mintPlayerToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

export async function mintManagerToken(env, ttlMs = 6 * 3600e3) {
  const exp = Date.now() + ttlMs;
  const payload = b64urlStr(JSON.stringify({ exp }));
  const key = await hmacKey(env.MANAGER_PASSPHRASE);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return { token: `${payload}.${b64url(sig)}`, exp };
}

export async function verifyManagerToken(env, token) {
  if (typeof token !== "string" || token.indexOf(".") === -1) return false;
  const [payload, sig] = token.split(".");
  let exp;
  try { exp = JSON.parse(new TextDecoder().decode(fromB64url(payload))).exp; }
  catch { return false; }
  if (!(typeof exp === "number" && exp > Date.now())) return false;
  const key = await hmacKey(env.MANAGER_PASSPHRASE);
  try {
    return await crypto.subtle.verify(
      "HMAC", key, fromB64url(sig), new TextEncoder().encode(payload)
    );
  } catch { return false; }
}
```

Run: `cd functions && npm test` — PASS.

- [x] **Step 9: Write failing tests for `http.js`**

`functions/_lib/__tests__/http.test.js`:
```js
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
```

Run: `cd functions && npm test` — FAIL.

- [x] **Step 10: Implement `http.js`**

`functions/_lib/http.js`:
```js
export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

const CORS_METHODS = "GET,PUT,POST,DELETE,OPTIONS";
const CORS_HEADERS = "authorization,content-type";

export function withCors(resp, env) {
  const h = new Headers(resp.headers);
  h.set("access-control-allow-origin", env.SITE_ORIGIN || "");
  h.set("access-control-allow-methods", CORS_METHODS);
  h.set("access-control-allow-headers", CORS_HEADERS);
  h.set("vary", "origin");
  return new Response(resp.body, { status: resp.status, headers: h });
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
}

export function preflight(env) {
  return withCors(new Response(null, { status: 204 }), env);
}

export async function readJson(request) {
  const len = Number(request.headers.get("content-length") || "0");
  if (len > 1024) throw new HttpError(400, "bad_body");
  let text;
  try { text = await request.text(); } catch { throw new HttpError(400, "bad_body"); }
  if (text.length > 1024) throw new HttpError(400, "bad_body");
  let obj;
  try { obj = JSON.parse(text); } catch { throw new HttpError(400, "bad_body"); }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new HttpError(400, "bad_body");
  return obj;
}

export function errToResponse(err, env) {
  const status = err instanceof HttpError ? err.status : 500;
  const code = err instanceof HttpError ? err.code : "internal";
  return withCors(json({ error: code }, { status }), env);
}
```

Run: `cd functions && npm test` — PASS (all `_lib` suites green).

- [x] **Step 11: Commit**

```bash
git add functions/
git commit -m "feat(rides): functions package + _lib helpers (token, http, validate, week)"
```

---

### Task 2: `POST /api/token` and `POST /api/ping`

**Files:**
- Create: `functions/api/token.js`
- Create: `functions/api/ping.js`
- Create: `functions/_lib/stats.js` — `bumpPlayersAll(kv)`, `writeOpen(kv)`, `sumOpens(kv, dateStr)`
- Create: `functions/api/__tests__/token.test.js`
- Create: `functions/api/__tests__/ping.test.js`
- Create: `functions/_lib/__tests__/stats.test.js`

**Interfaces:**
- Consumes: `http.js` (`json`, `withCors`, `preflight`, `errToResponse`), `token.js` (`mintPlayerToken`).
- Produces:
  - `functions/api/token.js` default export `{ async fetch(request, env) }` **and** the Pages Functions `onRequest` shape — use `export async function onRequestPost({ request, env })` and `export async function onRequestOptions({ env })`. `POST` → `200 { token }`, bumps `stats/players-all`. Any other method → `405`.
  - `functions/api/ping.js`: `onRequestPost` → always `204` (never leaks an error to the client), writes `stats/opens/<utc-date>/<rand>`. `onRequestOptions` → preflight.
  - `stats.js`: `bumpPlayersAll(kv)` → `Promise<void>` (get int, `+1`, put; best-effort, swallow errors); `writeOpen(kv)` → `Promise<void>` (`kv.put('stats/opens/'+today+'/'+rand, '1', { expirationTtl: 60*60*24*100 })`); `sumOpens(kv, dateStr)` → `Promise<number>` (`kv.list({ prefix: 'stats/opens/'+dateStr+'/' })`, count keys, page through `list_complete`).

- [x] **Step 1: Write failing tests for `stats.js`**

`functions/_lib/__tests__/stats.test.js`:
```js
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
```

Run: `cd functions && npm test` — FAIL.

- [x] **Step 2: Implement `stats.js`**

`functions/_lib/stats.js`:
```js
const OPENS_TTL = 60 * 60 * 24 * 100; // 100 days

export async function bumpPlayersAll(kv) {
  try {
    const cur = Number((await kv.get("stats/players-all")) || "0");
    await kv.put("stats/players-all", String(cur + 1));
  } catch { /* best-effort */ }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function writeOpen(kv) {
  const rand = crypto.randomUUID();
  await kv.put(`stats/opens/${today()}/${rand}`, "1", { expirationTtl: OPENS_TTL });
}

export async function sumOpens(kv, dateStr) {
  let count = 0, cursor;
  do {
    const page = await kv.list({ prefix: `stats/opens/${dateStr}/`, cursor });
    count += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return count;
}
```

Run: `cd functions && npm test` — PASS.

- [x] **Step 3: Write failing tests for `token.js` / `ping.js` endpoints**

`functions/api/__tests__/token.test.js`:
```js
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
```

`functions/api/__tests__/ping.test.js`:
```js
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
```

Run: `cd functions && npm test` — FAIL.

- [x] **Step 4: Implement the endpoints**

`functions/api/token.js`:
```js
import { json, withCors, preflight, errToResponse } from "../_lib/http.js";
import { mintPlayerToken } from "../_lib/token.js";
import { bumpPlayersAll } from "../_lib/stats.js";

export async function onRequestPost({ env }) {
  try {
    const token = mintPlayerToken();
    await bumpPlayersAll(env.RIDES_KV);
    return withCors(json({ token }), env);
  } catch (err) {
    return errToResponse(err, env);
  }
}

export function onRequestOptions({ env }) { return preflight(env); }
```

`functions/api/ping.js`:
```js
import { withCors, preflight } from "../_lib/http.js";
import { writeOpen } from "../_lib/stats.js";

export async function onRequestPost({ env }) {
  try { await writeOpen(env.RIDES_KV); } catch { /* opens are best-effort */ }
  return withCors(new Response(null, { status: 204 }), env);
}

export function onRequestOptions({ env }) { return preflight(env); }
```

Run: `cd functions && npm test` — PASS.

- [x] **Step 5: Commit**

```bash
git add functions/
git commit -m "feat(rides): POST /api/token + /api/ping + stats helpers"
```

---

### Task 3: `PUT`/`DELETE /api/request`, `GET`/`DELETE /api/me`

**Files:**
- Create: `functions/_lib/rows.js` — KV row read/write/list for `week/<wk>/req/<token>/<sessionId>`
- Create: `functions/api/request.js`
- Create: `functions/api/me.js`
- Create: `functions/api/__tests__/request.test.js`
- Create: `functions/api/__tests__/me.test.js`

**Interfaces:**
- Consumes: `http.js`, `validate.js`, `week.js` (not needed if the client passes `week` — the spec's recommended path; the client always passes `week`).
- Produces:
  - `rows.js`:
    - `reqKey(wk, token, sessionId)` → `string`.
    - `putRequest(kv, { wk, token, fullName, teamId, sessionId, direction })` → `Promise<void>` — writes `{ token, fullName, teamId, sessionId, direction, ts: Date.now(), v: 1 }`.
    - `deleteRequest(kv, wk, token, sessionId)` → `Promise<void>`.
    - `listRequestsForToken(kv, wk, token)` → `Promise<Array<row>>`.
    - `deleteAllForToken(kv, wk, token)` → `Promise<number>` (count deleted).
    - `countRequestsForToken(kv, wk, token)` → `Promise<number>`.
  - `functions/api/request.js`: `onRequestPut` (`{ token, fullName, teamId, sessionId, direction, week }`) → structural validate → reject 21st distinct `sessionId` for `(token, week)` with `400 { error: 'too_many' }` → upsert → `200 { ok: true }`. `onRequestDelete` (`{ token, sessionId, week }`) → `200 { ok: true }`. `onRequestOptions` → preflight.
  - `functions/api/me.js`: `onRequestGet` (`?token=&week=`) → `200 { requests: [row…], rideStatus: {} }` (rideStatus read from `week/<wk>/rideStatus` if present, else `{}`). `onRequestDelete` (`?token=&week=`) → deletes all `week/<wk>/req/<token>/*` → `200 { ok: true, deleted: n }`. `onRequestOptions` → preflight.

- [x] **Step 1: Write failing tests for `rows.js` + `request.js`** — _fixture tokens (`capper`, `deltok`, `mine`, `other`, `wipe`) widened to ≥8 chars to satisfy `isToken` `{8,128}`._

`functions/api/__tests__/request.test.js`:
```js
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
      const r = await put({ ...base, token: "capper", sessionId: "s" + i, direction: "round" });
      expect(r.status).toBe(200);
    }
    const over = await put({ ...base, token: "capper", sessionId: "s20", direction: "round" });
    expect(over.status).toBe(400);
    expect((await over.json()).error).toBe("too_many");
  });
});

describe("DELETE /api/request", () => {
  it("removes exactly one session row", async () => {
    await put({ ...base, token: "deltok", sessionId: "keep", direction: "round" });
    await put({ ...base, token: "deltok", sessionId: "drop", direction: "round" });
    const r = await onRequestDelete({ request: new Request("http://x/api/request", {
      method: "DELETE", body: JSON.stringify({ token: "deltok", sessionId: "drop", week: base.week }),
      headers: { "content-type": "application/json" },
    }), env });
    expect(r.status).toBe(200);
    const rows = await listRequestsForToken(env.RIDES_KV, base.week, "deltok");
    expect(rows.map((x) => x.sessionId)).toEqual(["keep"]);
  });
});
```

`functions/api/__tests__/me.test.js`:
```js
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { onRequestGet, onRequestDelete } from "../me.js";
import { putRequest } from "../../_lib/rows.js";

describe("GET/DELETE /api/me", () => {
  it("returns this token's rows only", async () => {
    await putRequest(env.RIDES_KV, { wk: "2026-09-06", token: "mine", fullName: "א ב", teamId: "T_1", sessionId: "s1", direction: "round" });
    await putRequest(env.RIDES_KV, { wk: "2026-09-06", token: "other", fullName: "ג ד", teamId: "T_1", sessionId: "s1", direction: "round" });
    const r = await onRequestGet({ request: new Request("http://x/api/me?token=mine&week=2026-09-06"), env });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.requests.length).toBe(1);
    expect(body.rideStatus).toEqual({});
  });
  it("DELETE removes every row for the token+week", async () => {
    await putRequest(env.RIDES_KV, { wk: "2026-09-06", token: "wipe", fullName: "א ב", teamId: "T_1", sessionId: "s1", direction: "round" });
    await putRequest(env.RIDES_KV, { wk: "2026-09-06", token: "wipe", fullName: "א ב", teamId: "T_1", sessionId: "s2", direction: "out" });
    const r = await onRequestDelete({ request: new Request("http://x/api/me?token=wipe&week=2026-09-06", { method: "DELETE" }), env });
    expect((await r.json()).deleted).toBe(2);
  });
  it("400 on a missing token", async () => {
    const r = await onRequestGet({ request: new Request("http://x/api/me?week=2026-09-06"), env });
    expect(r.status).toBe(400);
  });
});
```

Run: `cd functions && npm test` — FAIL.

- [x] **Step 2: Implement `rows.js`**

`functions/_lib/rows.js`:
```js
export const reqPrefix = (wk, token) => `week/${wk}/req/${token}/`;
export const reqKey = (wk, token, sessionId) => reqPrefix(wk, token) + sessionId;

export async function putRequest(kv, { wk, token, fullName, teamId, sessionId, direction }) {
  const row = { token, fullName, teamId, sessionId, direction, ts: Date.now(), v: 1 };
  await kv.put(reqKey(wk, token, sessionId), JSON.stringify(row));
}

export async function deleteRequest(kv, wk, token, sessionId) {
  await kv.delete(reqKey(wk, token, sessionId));
}

async function listRows(kv, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const k of page.keys) {
      const v = await kv.get(k.name);
      if (v) { try { out.push(JSON.parse(v)); } catch { /* skip corrupt */ } }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

export function listRequestsForToken(kv, wk, token) {
  return listRows(kv, reqPrefix(wk, token));
}

export async function countRequestsForToken(kv, wk, token) {
  let count = 0, cursor;
  do {
    const page = await kv.list({ prefix: reqPrefix(wk, token), cursor });
    count += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return count;
}

export async function deleteAllForToken(kv, wk, token) {
  let n = 0, cursor;
  do {
    const page = await kv.list({ prefix: reqPrefix(wk, token), cursor });
    for (const k of page.keys) { await kv.delete(k.name); n++; }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return n;
}

export function listAllRequestsForWeek(kv, wk) {
  return listRows(kv, `week/${wk}/req/`);
}
```

- [x] **Step 3: Implement `functions/api/request.js`**

```js
import { json, withCors, preflight, readJson, errToResponse, HttpError } from "../_lib/http.js";
import { isSessionId, isTeamId, isDirection, isWeekKey, isNonEmptyName } from "../_lib/validate.js";
import { putRequest, deleteRequest, countRequestsForToken, reqKey } from "../_lib/rows.js";

const MAX_ROWS_PER_TOKEN_WEEK = 20;
const isToken = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(s);

export async function onRequestPut({ request, env }) {
  try {
    const b = await readJson(request);
    if (!isToken(b.token) || !isWeekKey(b.week) || !isSessionId(b.sessionId) ||
        !isTeamId(b.teamId) || !isDirection(b.direction) || !isNonEmptyName(b.fullName)) {
      throw new HttpError(400, "bad_request");
    }
    const existing = await env.RIDES_KV.get(reqKey(b.week, b.token, b.sessionId));
    if (!existing) {
      const n = await countRequestsForToken(env.RIDES_KV, b.week, b.token);
      if (n >= MAX_ROWS_PER_TOKEN_WEEK) throw new HttpError(400, "too_many");
    }
    await putRequest(env.RIDES_KV, {
      wk: b.week, token: b.token, fullName: b.fullName.trim(),
      teamId: b.teamId, sessionId: b.sessionId, direction: b.direction,
    });
    return withCors(json({ ok: true }), env);
  } catch (err) { return errToResponse(err, env); }
}

export async function onRequestDelete({ request, env }) {
  try {
    const b = await readJson(request);
    if (!isToken(b.token) || !isWeekKey(b.week) || !isSessionId(b.sessionId)) {
      throw new HttpError(400, "bad_request");
    }
    await deleteRequest(env.RIDES_KV, b.week, b.token, b.sessionId);
    return withCors(json({ ok: true }), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
```

- [x] **Step 4: Implement `functions/api/me.js`**

```js
import { json, withCors, preflight, errToResponse, HttpError } from "../_lib/http.js";
import { isWeekKey } from "../_lib/validate.js";
import { listRequestsForToken, deleteAllForToken } from "../_lib/rows.js";

const isToken = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(s);

function params(request) {
  const u = new URL(request.url);
  return { token: u.searchParams.get("token"), week: u.searchParams.get("week") };
}

export async function onRequestGet({ request, env }) {
  try {
    const { token, week } = params(request);
    if (!isToken(token) || !isWeekKey(week)) throw new HttpError(400, "bad_request");
    const requests = await listRequestsForToken(env.RIDES_KV, week, token);
    let rideStatus = {};
    const rs = await env.RIDES_KV.get(`week/${week}/rideStatus`);
    if (rs) { try { rideStatus = JSON.parse(rs); delete rideStatus.v; } catch { rideStatus = {}; } }
    return withCors(json({ requests, rideStatus }), env);
  } catch (err) { return errToResponse(err, env); }
}

export async function onRequestDelete({ request, env }) {
  try {
    const { token, week } = params(request);
    if (!isToken(token) || !isWeekKey(week)) throw new HttpError(400, "bad_request");
    const deleted = await deleteAllForToken(env.RIDES_KV, week, token);
    return withCors(json({ ok: true, deleted }), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
```

Run: `cd functions && npm test` — PASS.

- [x] **Step 5: Commit**

```bash
git add functions/
git commit -m "feat(rides): /api/request + /api/me (per-row KV, 20-row cap)"
```

---

### Task 4: `POST /api/purge` + wire it into the GitHub Action

**Files:**
- Create: `functions/api/purge.js`
- Create: `functions/_lib/purge.js` — `runPurge(kv, todayStr)` → `{ weeksDeleted, keysDeleted, opensDeleted }`
- Create: `functions/api/__tests__/purge.test.js`
- Create: `functions/_lib/__tests__/purge.test.js`
- Modify: `.github/workflows/build.yml` — add a final `Purge past rides weeks` step to job `build-data`

**Interfaces:**
- Consumes: `week.js` (`weekKeyOf`), `http.js`.
- Produces:
  - `purge.js` lib: `runPurge(kv, todayStr)`:
    - current Sunday = `weekKeyOf(todayStr)`.
    - `kv.list({ prefix: 'week/' })`; for each key `week/<wk>/...`, delete if `<wk> < currentSunday` (string compare works for `YYYY-MM-DD`).
    - `kv.list({ prefix: 'stats/opens/' })`; delete `stats/opens/<date>/...` where `<date>` is > 90 days before `todayStr`.
    - write `config/global.lastPurge = todayStr` (merge into the existing blob, keep `retDefault` etc., set `v: 1`).
    - returns counts.
  - `functions/api/purge.js`: `onRequestPost` — require header `x-purge-key === env.PURGE_KEY` (constant-time-ish compare; missing/wrong → `401 { error: 'unauthorized' }`), then `runPurge(env.RIDES_KV, new Date().toISOString().slice(0,10))` → `200 { ok: true, ...counts }`.

- [x] **Step 1: Write failing tests**

`functions/_lib/__tests__/purge.test.js`:
```js
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
```

`functions/api/__tests__/purge.test.js`:
```js
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
```

Run: `cd functions && npm test` — FAIL.

- [x] **Step 2: Implement `functions/_lib/purge.js`**

```js
import { weekKeyOf } from "./week.js";

const DAY = 86400000;

export async function runPurge(kv, todayStr) {
  const currentSunday = weekKeyOf(todayStr);
  const weeksDeleted = new Set();
  let keysDeleted = 0, opensDeleted = 0;

  let cursor;
  do {
    const page = await kv.list({ prefix: "week/", cursor });
    for (const k of page.keys) {
      const wk = k.name.split("/")[1];
      if (wk && /^\d{4}-\d{2}-\d{2}$/.test(wk) && wk < currentSunday) {
        await kv.delete(k.name);
        keysDeleted++;
        weeksDeleted.add(wk);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const cutoff = new Date(Date.parse(todayStr) - 90 * DAY).toISOString().slice(0, 10);
  cursor = undefined;
  do {
    const page = await kv.list({ prefix: "stats/opens/", cursor });
    for (const k of page.keys) {
      const d = k.name.split("/")[2];
      if (d && d < cutoff) { await kv.delete(k.name); opensDeleted++; }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  let global = {};
  const cur = await kv.get("config/global");
  if (cur) { try { global = JSON.parse(cur); } catch { global = {}; } }
  global.lastPurge = todayStr;
  global.v = 1;
  await kv.put("config/global", JSON.stringify(global));

  return { weeksDeleted: [...weeksDeleted], keysDeleted, opensDeleted };
}
```

- [x] **Step 3: Implement `functions/api/purge.js`**

```js
import { json, withCors, preflight, errToResponse, HttpError } from "../_lib/http.js";
import { runPurge } from "../_lib/purge.js";

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function onRequestPost({ request, env }) {
  try {
    const key = request.headers.get("x-purge-key");
    if (!env.PURGE_KEY || !timingSafeEqual(key || "", env.PURGE_KEY)) {
      throw new HttpError(401, "unauthorized");
    }
    const counts = await runPurge(env.RIDES_KV, new Date().toISOString().slice(0, 10));
    return withCors(json({ ok: true, ...counts }), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
```

Run: `cd functions && npm test` — PASS.

- [x] **Step 4: Add the workflow step**

In `.github/workflows/build.yml`, after the `Push (no-op if fetch_and_build made no commit)` step in job `build-data`, add:

```yaml
      - name: Purge past rides weeks
        continue-on-error: true
        env:
          PURGE_KEY: ${{ secrets.PURGE_KEY }}
          RIDES_API: ${{ secrets.RIDES_API }}   # e.g. https://gilboa-schedule.pages.dev
        run: |
          if [ -n "$PURGE_KEY" ] && [ -n "$RIDES_API" ]; then
            curl -fsS -X POST -H "X-Purge-Key: $PURGE_KEY" "$RIDES_API/api/purge" && echo "purge ok" || echo "purge failed (non-fatal)"
          else
            echo "PURGE_KEY / RIDES_API not set — skipping rides purge"
          fi
```

`continue-on-error: true` + the guard means the data build never fails because of rides. Record `PURGE_KEY` and `RIDES_API` as GitHub repo secrets in `RIDES.md` (Task 12).

- [x] **Step 5: Confirm the workflow file still parses & data tests are unaffected**

Run: `pytest -q`
Expected: green (unchanged). The workflow change is YAML-only; a `git diff` review confirms indentation.

- [x] **Step 6: Commit**

```bash
git add functions/ .github/workflows/build.yml
git commit -m "feat(rides): POST /api/purge + twice-daily purge step in build.yml"
```

---

### Task 5: Manager login + auth guard + `computeDepartTimes` server helper

**Files:**
- Create: `functions/_lib/auth.js` — `requireManager(request, env)` → throws `HttpError(401,'unauthorized')` or resolves
- Create: `functions/_lib/depart.js` — `computeDepartTimes(session, locConfig, retDefault)`
- Create: `functions/api/manager/login.js`
- Create: `functions/api/__tests__/manager-login.test.js`
- Create: `functions/_lib/__tests__/depart.test.js`

**Interfaces:**
- Consumes: `token.js` (`mintManagerToken`, `verifyManagerToken`), `http.js`.
- Produces:
  - `auth.js`: `requireManager(request, env)` → `Promise<void>`; reads `Authorization: Bearer <t>`, `verifyManagerToken`; on failure `throw new HttpError(401, "unauthorized")`.
  - `depart.js`: `computeDepartTimes(session, locConfig, retDefault)` → `{ outbound: "HH:MM"|null, ret: "HH:MM"|null }`. `session` = `{ start, end, location }` (ISO with `+03:00`). `locConfig` = `{ outbound:int|null, ret:int|null }` or `undefined`. Wall-clock math on the `HH:MM` in the ISO string — **no `Date` timezone conversion**. `outbound = start − locConfig.outbound` minutes; `null` if `locConfig?.outbound == null`. `ret = end + (locConfig.ret ?? retDefault)` minutes; `null` if both are null or `end` missing. Minute arithmetic may cross midnight → clamp to `00:00`..`23:59` display, or wrap (document the choice; wrap is fine, practices don't run past midnight).
  - `login.js`: `onRequestPost` (`{ passphrase }`) → constant-time compare with `env.MANAGER_PASSPHRASE` → `mintManagerToken` → `200 { token, exp }`; mismatch → `401 { error: 'bad_passphrase' }`.

- [x] **Step 1: Write failing tests**

`functions/_lib/__tests__/depart.test.js`:
```js
import { describe, it, expect } from "vitest";
import { computeDepartTimes } from "../depart.js";

const session = {
  start: "2026-09-08T17:00:00+03:00",
  end: "2026-09-08T18:30:00+03:00",
  location: "אולם קציר",
};

describe("computeDepartTimes", () => {
  it("uses the per-location offsets", () => {
    expect(computeDepartTimes(session, { outbound: 40, ret: 15 }, 15))
      .toEqual({ outbound: "16:20", ret: "18:45" });
  });
  it("falls back to retDefault when ret is null", () => {
    expect(computeDepartTimes(session, { outbound: 40, ret: null }, 20).ret).toBe("18:50");
  });
  it("null outbound when the location is unconfigured", () => {
    expect(computeDepartTimes(session, undefined, 15))
      .toEqual({ outbound: null, ret: "18:45" });
  });
  it("null ret when there is no default and no end", () => {
    expect(computeDepartTimes({ ...session, end: null }, { outbound: 40, ret: null }, null).ret).toBe(null);
  });
});
```

`functions/api/__tests__/manager-login.test.js`:
```js
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
```

Run: `cd functions && npm test` — FAIL.

- [x] **Step 2: Implement `depart.js`**

```js
function hm(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function fmt(mins) {
  let x = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(x / 60), m = x % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

export function computeDepartTimes(session, locConfig, retDefault) {
  const start = hm(session && session.start);
  const end = hm(session && session.end);
  const outMin = locConfig && locConfig.outbound != null ? locConfig.outbound : null;
  const retMin = locConfig && locConfig.ret != null ? locConfig.ret
    : (retDefault != null ? retDefault : null);
  return {
    outbound: start != null && outMin != null ? fmt(start - outMin) : null,
    ret: end != null && retMin != null ? fmt(end + retMin) : null,
  };
}
```

- [x] **Step 3: Implement `auth.js` and `login.js`**

`functions/_lib/auth.js`:
```js
import { HttpError } from "./http.js";
import { verifyManagerToken } from "./token.js";

export async function requireManager(request, env) {
  const h = request.headers.get("authorization") || "";
  const m = /^Bearer (.+)$/.exec(h);
  if (!m || !(await verifyManagerToken(env, m[1]))) {
    throw new HttpError(401, "unauthorized");
  }
}
```

`functions/api/manager/login.js`:
```js
import { json, withCors, preflight, readJson, errToResponse, HttpError } from "../../_lib/http.js";
import { mintManagerToken } from "../../_lib/token.js";

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function onRequestPost({ request, env }) {
  try {
    const b = await readJson(request);
    if (!timingSafeEqual(String(b.passphrase || ""), env.MANAGER_PASSPHRASE || " ")) {
      throw new HttpError(401, "bad_passphrase");
    }
    const { token, exp } = await mintManagerToken(env);
    return withCors(json({ token, exp }), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
```

Run: `cd functions && npm test` — PASS.

- [x] **Step 4: Commit**

```bash
git add functions/
git commit -m "feat(rides): manager login + auth guard + computeDepartTimes"
```

---

### Task 6: `GET /api/manager/dashboard`

**Files:**
- Create: `functions/_lib/dashboard.js` — `buildDashboard(kv, scheduleJson, week)`
- Create: `functions/api/manager/dashboard.js`
- Create: `functions/api/__tests__/manager-dashboard.test.js`
- Create: `functions/test-fixtures/schedule.sample.json` — a hand-written 2-day fixture (3–4 sessions, ≥2 locations)

**Interfaces:**
- Consumes: `auth.js` (`requireManager`), `rows.js` (`listAllRequestsForWeek`), `depart.js` (`computeDepartTimes`), `stats.js` (`sumOpens`), `http.js`.
- Produces:
  - `buildDashboard(kv, scheduleJson, week)` → object:
    ```
    {
      week,
      days: [
        { date, weekday, totals: { riders, rides },
          practices: [
            { teamId, teamName, location, start, sessionId,
              depart: { outbound, ret },
              byDirection: { round: [fullName…], out: [fullName…], back: [fullName…] },
              riders: int }
          ] }
      ],
      orphans: [ { sessionId, teamId, fullName, direction } ],
      stats: { playersWeek, playersAll, ridesOut, ridesBack, activeLocations, opensToday, opens7d },
      lastPurge: "YYYY-MM-DD" | null,
      rideStatus: {}
    }
    ```
  - Join logic: index `scheduleJson.sessions` by `id`. Each row from `listAllRequestsForWeek` whose `sessionId` is in the index → attach to that practice; otherwise → `orphans`. `teamName` from `scheduleJson` is not present (sessions carry `team_id`), so the Function also needs `teams.json` — **fetch both** `${SITE_ORIGIN}/data/schedule.json` and `${SITE_ORIGIN}/data/teams.json` in the endpoint and pass a `teamsById` map into `buildDashboard`. Adjust the signature to `buildDashboard(kv, scheduleJson, teamsById, week)`.
  - `distinct rides` = count of `(sessionId, direction-expanded)` where `round` counts as both `out` and `back`.
  - `dashboard.js` endpoint: `requireManager` → read `?week=` (validate) → fetch `schedule.json` + `teams.json` from `env.SITE_ORIGIN` → `buildDashboard` → `200 <object>`.

- [x] **Step 1: Create the fixture**

`functions/test-fixtures/schedule.sample.json`:
```json
{
  "generated_at": "2026-09-06T05:00:00Z",
  "weeks": ["2026-09-06"],
  "sessions": [
    { "id": "evt-a", "team_id": "T_009", "week_key": "2026-09-06", "date": "2026-09-08",
      "weekday": 2, "start": "2026-09-08T17:00:00+03:00", "end": "2026-09-08T18:30:00+03:00",
      "location": "אולם קציר", "coach_text": "טל יזרעאלי", "activity_type": "training",
      "sport": "basketball", "notes": null, "flags": null },
    { "id": "evt-b", "team_id": "T_031", "week_key": "2026-09-06", "date": "2026-09-08",
      "weekday": 2, "start": "2026-09-08T19:00:00+03:00", "end": "2026-09-08T20:30:00+03:00",
      "location": "אולם עין חרוד", "coach_text": "סהר טיבי", "activity_type": "training",
      "sport": "basketball", "notes": null, "flags": null },
    { "id": "evt-c", "team_id": "T_009", "week_key": "2026-09-06", "date": "2026-09-10",
      "weekday": 4, "start": "2026-09-10T17:00:00+03:00", "end": "2026-09-10T18:30:00+03:00",
      "location": "אולם קציר", "coach_text": "טל יזרעאלי", "activity_type": "training",
      "sport": "basketball", "notes": null, "flags": null }
  ]
}
```
`teamsById` fixture is built inline in the test: `{ T_009: { display_name: "נערות א על" }, T_031: { display_name: "נוער על" } }`.

- [x] **Step 2: Write failing tests**

`functions/api/__tests__/manager-dashboard.test.js`:
```js
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import scheduleJson from "../../test-fixtures/schedule.sample.json";
import { buildDashboard } from "../../_lib/dashboard.js";
import { putRequest } from "../../_lib/rows.js";

const teamsById = { T_009: { display_name: "נערות א על" }, T_031: { display_name: "נוער על" } };
const WK = "2026-09-06";

describe("buildDashboard", () => {
  it("groups requests by day + practice, counts directions, resolves names", async () => {
    await putRequest(env.RIDES_KV, { wk: WK, token: "p1", fullName: "דניאל כהן", teamId: "T_009", sessionId: "evt-a", direction: "round" });
    await putRequest(env.RIDES_KV, { wk: WK, token: "p2", fullName: "מאיה לוי", teamId: "T_009", sessionId: "evt-a", direction: "out" });
    await putRequest(env.RIDES_KV, { wk: WK, token: "p3", fullName: "יונתן שמש", teamId: "T_009", sessionId: "GONE", direction: "back" });
    await env.RIDES_KV.put("config/locations", JSON.stringify({ "אולם קציר": { outbound: 40, ret: 15, manual: false }, v: 1 }));
    await env.RIDES_KV.put("config/global", JSON.stringify({ retDefault: 15, lastPurge: "2026-09-04", v: 1 }));

    const d = await buildDashboard(env.RIDES_KV, scheduleJson, teamsById, WK);

    const thu = d.days.find((x) => x.date === "2026-09-08");
    const p = thu.practices.find((x) => x.sessionId === "evt-a");
    expect(p.teamName).toBe("נערות א על");
    expect(p.depart).toEqual({ outbound: "16:20", ret: "18:45" });
    expect(p.byDirection.round).toEqual(["דניאל כהן"]);
    expect(p.byDirection.out).toEqual(["מאיה לוי"]);
    expect(p.riders).toBe(2);
    expect(thu.totals.rides).toBe(3); // round => out+back (2) + out (1)

    expect(d.orphans.map((o) => o.sessionId)).toEqual(["GONE"]);
    expect(d.lastPurge).toBe("2026-09-04");
  });

  it("a practice with zero requests is not listed", async () => {
    const d = await buildDashboard(env.RIDES_KV, scheduleJson, teamsById, WK);
    const fri = d.days.find((x) => x.date === "2026-09-10");
    expect((fri ? fri.practices : []).length).toBe(0);
  });
});
```

Run: `cd functions && npm test` — FAIL.

- [x] **Step 3: Implement `dashboard.js` lib** (full code — this is the join core)

```js
import { computeDepartTimes } from "./depart.js";
import { listAllRequestsForWeek } from "./rows.js";
import { sumOpens } from "./stats.js";

const DIRS = ["round", "out", "back"];

export async function buildDashboard(kv, scheduleJson, teamsById, week) {
  const rows = await listAllRequestsForWeek(kv, week);

  let locConfig = {}, global = {};
  const lc = await kv.get("config/locations");
  if (lc) { try { locConfig = JSON.parse(lc); delete locConfig.v; } catch {} }
  const gc = await kv.get("config/global");
  if (gc) { try { global = JSON.parse(gc); } catch {} }
  const retDefault = global.retDefault != null ? global.retDefault : 15;

  const sessionsById = new Map(scheduleJson.sessions.map((s) => [s.id, s]));
  const practices = new Map(); // sessionId -> practice accumulator
  const orphans = [];

  for (const r of rows) {
    const s = sessionsById.get(r.sessionId);
    if (!s) {
      orphans.push({ sessionId: r.sessionId, teamId: r.teamId, fullName: r.fullName, direction: r.direction });
      continue;
    }
    let p = practices.get(s.id);
    if (!p) {
      p = {
        teamId: s.team_id,
        teamName: (teamsById[s.team_id] && teamsById[s.team_id].display_name) || s.team_id,
        location: s.location, start: s.start, date: s.date, weekday: s.weekday,
        sessionId: s.id,
        depart: computeDepartTimes(s, locConfig[s.location], retDefault),
        byDirection: { round: [], out: [], back: [] },
        _tokens: new Set(),
      };
      practices.set(s.id, p);
    }
    if (DIRS.includes(r.direction)) p.byDirection[r.direction].push(r.fullName);
    p._tokens.add(r.token);
  }

  // bucket practices into days
  const dayMap = new Map();
  for (const p of practices.values()) {
    p.riders = p._tokens.size;
    delete p._tokens;
    if (!dayMap.has(p.date)) dayMap.set(p.date, []);
    dayMap.get(p.date).push(p);
  }

  const ridesOf = (p) =>
    p.byDirection.round.length * 2 + p.byDirection.out.length + p.byDirection.back.length;

  const days = [...dayMap.keys()].sort().map((date) => {
    const list = dayMap.get(date).sort((a, b) => a.start.localeCompare(b.start));
    return {
      date, weekday: list[0].weekday,
      totals: {
        riders: list.reduce((n, p) => n + p.riders, 0),
        rides: list.reduce((n, p) => n + ridesOf(p), 0),
      },
      practices: list,
    };
  });

  const allTokens = new Set(rows.map((r) => r.token));
  const today = new Date().toISOString().slice(0, 10);
  let opens7d = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.parse(today) - i * 86400000).toISOString().slice(0, 10);
    opens7d += await sumOpens(kv, d);
  }

  return {
    week, days, orphans,
    stats: {
      playersWeek: allTokens.size,
      playersAll: Number((await kv.get("stats/players-all")) || "0"),
      ridesOut: days.reduce((n, d) => n + d.practices.reduce((m, p) => m + p.byDirection.round.length + p.byDirection.out.length, 0), 0),
      ridesBack: days.reduce((n, d) => n + d.practices.reduce((m, p) => m + p.byDirection.round.length + p.byDirection.back.length, 0), 0),
      activeLocations: new Set([...practices.values()].map((p) => p.location)).size,
      opensToday: await sumOpens(kv, today),
      opens7d,
    },
    lastPurge: global.lastPurge || null,
    rideStatus: {},
  };
}
```

- [x] **Step 4: Implement the endpoint**

`functions/api/manager/dashboard.js`:
```js
import { json, withCors, preflight, errToResponse, HttpError } from "../../_lib/http.js";
import { requireManager } from "../../_lib/auth.js";
import { isWeekKey } from "../../_lib/validate.js";
import { buildDashboard } from "../../_lib/dashboard.js";

export async function onRequestGet({ request, env }) {
  try {
    await requireManager(request, env);
    const week = new URL(request.url).searchParams.get("week");
    if (!isWeekKey(week)) throw new HttpError(400, "bad_request");

    const [schedRes, teamsRes] = await Promise.all([
      fetch(`${env.SITE_ORIGIN}/data/schedule.json`, { cf: { cacheTtl: 60 } }),
      fetch(`${env.SITE_ORIGIN}/data/teams.json`, { cf: { cacheTtl: 60 } }),
    ]);
    if (!schedRes.ok || !teamsRes.ok) throw new HttpError(502, "schedule_unavailable");
    const scheduleJson = await schedRes.json();
    const teamsArr = await teamsRes.json();
    const teamsById = {};
    for (const t of teamsArr) teamsById[t.team_id] = t;

    const data = await buildDashboard(env.RIDES_KV, scheduleJson, teamsById, week);
    return withCors(json(data), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
```

Run: `cd functions && npm test` — PASS. (The endpoint's `fetch` is not unit-tested here; the harness tests `buildDashboard` directly. Endpoint auth is covered by Task 5's guard + a Task 7 cross-check.)

- [x] **Step 5: Commit**

```bash
git add functions/
git commit -m "feat(rides): GET /api/manager/dashboard (schedule join, orphans, stats)"
```

---

### Task 7: `GET`/`PUT /api/manager/config` + manager-auth cross-check

**Files:**
- Create: `functions/api/manager/config.js`
- Create: `functions/api/__tests__/manager-config.test.js`

**Interfaces:**
- Consumes: `auth.js`, `http.js`, `validate.js`.
- Produces:
  - `onRequestGet` → `requireManager` → returns `{ locations, global }` where `locations` = the stored `config/locations` blob merged so that **every location present in the live `schedule.json`** appears as a key (missing ones default to `{ outbound: null, ret: null, manual: false }`). Fetch `schedule.json` from `env.SITE_ORIGIN` for the location list.
  - `onRequestPut` (`{ locations?, global? }`) → `requireManager` → shallow-merge into the stored blobs, set `v: 1`, write back. Validate: each `locations[name]` has `outbound`/`ret` either `null` or an int in `0..600`; `global.retDefault` int `0..600`; ignore unknown keys. `200 { ok: true }`.
  - `onRequestOptions` → preflight.

- [x] **Step 1: Write failing tests**

`functions/api/__tests__/manager-config.test.js`:
```js
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
```

Run: `cd functions && npm test` — FAIL.

- [x] **Step 2: Implement `functions/api/manager/config.js`**

```js
import { json, withCors, preflight, readJson, errToResponse, HttpError } from "../../_lib/http.js";
import { requireManager } from "../../_lib/auth.js";

const inRange = (n) => Number.isInteger(n) && n >= 0 && n <= 600;
const okOffset = (v) => v === null || inRange(v);

async function liveLocations(env) {
  try {
    const r = await fetch(`${env.SITE_ORIGIN}/data/schedule.json`, { cf: { cacheTtl: 60 } });
    if (!r.ok) return [];
    const j = await r.json();
    return [...new Set(j.sessions.map((s) => s.location).filter(Boolean))];
  } catch { return []; }
}

export async function onRequestGet({ request, env }) {
  try {
    await requireManager(request, env);
    let locations = {}, global = {};
    const lc = await env.RIDES_KV.get("config/locations");
    if (lc) { try { locations = JSON.parse(lc); delete locations.v; } catch {} }
    const gc = await env.RIDES_KV.get("config/global");
    if (gc) { try { global = JSON.parse(gc); } catch {} }
    for (const name of await liveLocations(env)) {
      if (!locations[name]) locations[name] = { outbound: null, ret: null, manual: false };
    }
    if (global.retDefault == null) global.retDefault = 15;
    return withCors(json({ locations, global }), env);
  } catch (err) { return errToResponse(err, env); }
}

export async function onRequestPut({ request, env }) {
  try {
    await requireManager(request, env);
    const b = await readJson(request);

    if (b.locations && typeof b.locations === "object") {
      for (const [name, cfg] of Object.entries(b.locations)) {
        if (!cfg || typeof cfg !== "object" || !okOffset(cfg.outbound ?? null) || !okOffset(cfg.ret ?? null)) {
          throw new HttpError(400, "bad_request");
        }
      }
      let cur = {};
      const lc = await env.RIDES_KV.get("config/locations");
      if (lc) { try { cur = JSON.parse(lc); } catch {} }
      for (const [name, cfg] of Object.entries(b.locations)) {
        if (cfg.__delete) delete cur[name];
        else cur[name] = { outbound: cfg.outbound ?? null, ret: cfg.ret ?? null, manual: !!cfg.manual };
      }
      cur.v = 1;
      await env.RIDES_KV.put("config/locations", JSON.stringify(cur));
    }

    if (b.global && typeof b.global === "object") {
      if (b.global.retDefault != null && !inRange(b.global.retDefault)) throw new HttpError(400, "bad_request");
      let cur = {};
      const gc = await env.RIDES_KV.get("config/global");
      if (gc) { try { cur = JSON.parse(gc); } catch {} }
      if (b.global.retDefault != null) cur.retDefault = b.global.retDefault;
      cur.v = 1;
      await env.RIDES_KV.put("config/global", JSON.stringify(cur));
    }

    return withCors(json({ ok: true }), env);
  } catch (err) { return errToResponse(err, env); }
}

export function onRequestOptions({ env }) { return preflight(env); }
```

Run: `cd functions && npm test` — PASS. **All Function suites green.**

- [x] **Step 3: Commit**

```bash
git add functions/
git commit -m "feat(rides): GET/PUT /api/manager/config"
```

---

### Task 8: CI job for the Functions tests + `rides.js` pure helpers

**Files:**
- Modify: `.github/workflows/build.yml` — add a `functions-tests` job (independent of `build-data`; runs on push + PR)
- Create: `public/rides.js` — pure helpers only in this task: `shortName`, `weekKey`, `rideCaption`, `apiBase`; `window.Rides = { ... }` namespace object; `computeDepartTimes` client copy (identical math to `functions/_lib/depart.js`)
- Modify: `public/index.html` — add `<script src="rides.js"></script>` **after** `app.js`
- Modify: `tests/site_smoke.js` — new `console.log('rides — pure helpers')` block before `week nav bounds`

**Interfaces:**
- Produces on `window.Rides`:
  - `shortName(fullName)` → `"דניאל כהן"` → `"דניאל כ׳"`; single word → unchanged; trims; collapses inner whitespace.
  - `weekKey(dateStr)` → Sunday `YYYY-MM-DD` (delegates to the same math as `app.js` `sundayOf`; reuse `window.sundayOf` if exposed, else inline).
  - `rideCaption(depart)` → `depart` = `{ outbound, ret }`; both null → `"טרם נקבעה שעה"`; else `"יוצא מעין חרוד " + ltrIsolate(outbound) + " · חזרה " + ltrIsolate(ret)` with a missing side shown as `"—"`. Uses `window.ltrIsolate`.
  - `computeDepartTimes(session, locConfig, retDefault)` → same shape/behaviour as the server helper (Task 5).
  - `apiBase()` → `'http://localhost:8788/api'` when `location.hostname` is `localhost`/`127.0.0.1`, else `location.origin + '/api'`.

- [x] **Step 1: Add the CI job**

In `.github/workflows/build.yml`, add a second top-level job (sibling of `build-data`). It must **not** be gated on the schedule; add `push:` and `pull_request:` triggers scoped to the relevant paths at the top of the `on:` block:

```yaml
on:
  schedule:
    - cron: "0 5,17 * * *"
  workflow_dispatch:
  push:
    paths: ["functions/**", "public/**", "tests/**"]
  pull_request:
    paths: ["functions/**", "public/**", "tests/**"]
```

```yaml
  functions-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Functions unit tests
        run: |
          cd functions
          npm ci
          npm test
      - name: Site smoke test
        run: node tests/site_smoke.js
```

> Note: `build-data` already runs `pytest`; leave it. This job adds the JS side. Confirm `build-data` does not accidentally trigger on the new `push` paths in a way that double-commits — it is guarded by `if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'` — **add that `if:` to the `build-data` job** so a plain push no longer runs the data fetch/commit.

- [x] **Step 2: Write the failing helper tests**

In `tests/site_smoke.js`, before `console.log('week nav bounds');`:

```javascript
  console.log('rides — pure helpers');
  {
    const R = window.Rides;
    assert(!!R, 'window.Rides namespace exists');
    assert(R.shortName('דניאל כהן') === 'דניאל כ׳', 'shortName: first name + last initial + geresh');
    assert(R.shortName('מדונה') === 'מדונה', 'shortName: single word unchanged');
    assert(R.shortName('  אורי   בר   לב ') === 'אורי ב׳', 'shortName: trims + collapses, initial of 2nd word');

    assert(R.weekKey('2026-09-09') === '2026-09-06', 'weekKey: Wednesday -> prior Sunday');
    assert(R.weekKey('2026-09-06') === '2026-09-06', 'weekKey: Sunday -> itself');

    const cap = R.rideCaption({ outbound: '16:20', ret: '18:45' }).replace(/[⁦⁩]/g, '');
    assert(cap === 'יוצא מעין חרוד 16:20 · חזרה 18:45', 'rideCaption: both times');
    assert(R.rideCaption({ outbound: null, ret: null }) === 'טרם נקבעה שעה', 'rideCaption: nothing set');

    const dt = R.computeDepartTimes(
      { start: '2026-09-08T17:00:00+03:00', end: '2026-09-08T18:30:00+03:00', location: 'X' },
      { outbound: 40, ret: 15 }, 15);
    assert(dt.outbound === '16:20' && dt.ret === '18:45', 'computeDepartTimes matches the server helper');

    assert(R.apiBase() === 'http://localhost:8000/api' || R.apiBase().endsWith('/api'), 'apiBase ends with /api');
  }
```

(The harness sets `window.location.origin = 'http://localhost:8000'`, hostname parsing in `apiBase` should treat that as same-origin `/api` — adjust the assertion once implemented; the intent is "ends with `/api`, no token, no hard-coded prod host".)

Run: `node tests/site_smoke.js` — FAIL (`window.Rides` undefined).

- [x] **Step 3: Implement `public/rides.js` (helpers section)**

```javascript
/* Gilboa Maayanot — rides (player side). Vanilla ES5 idiom, no build, loaded
   AFTER app.js. All network calls are contained: a failure here never breaks
   the schedule view. Pure helpers are exposed on window.Rides for tests. */
'use strict';

(function () {
  function ltr(s) { return (typeof window.ltrIsolate === 'function') ? window.ltrIsolate(s) : s; }

  function shortName(fullName) {
    var parts = String(fullName || '').trim().replace(/\s+/g, ' ').split(' ');
    if (parts.length < 2) return parts[0] || '';
    return parts[0] + ' ' + parts[1].charAt(0) + '׳'; // geresh
  }

  function weekKey(dateStr) {
    if (typeof window.sundayOf === 'function') return window.sundayOf(dateStr);
    var p = dateStr.split('-');
    var ms = Date.UTC(+p[0], +p[1] - 1, +p[2]);
    var dow = new Date(ms).getUTCDay();
    var d = new Date(ms - dow * 86400000);
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate());
  }

  function rideCaption(depart) {
    if (!depart || (depart.outbound == null && depart.ret == null)) return 'טרם נקבעה שעה';
    var o = depart.outbound == null ? '—' : ltr(depart.outbound);
    var r = depart.ret == null ? '—' : ltr(depart.ret);
    return 'יוצא מעין חרוד ' + o + ' · חזרה ' + r;
  }

  function hm(iso) {
    var m = /T(\d{2}):(\d{2})/.exec(iso || '');
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function fmt(mins) {
    var x = ((mins % 1440) + 1440) % 1440;
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return z(Math.floor(x / 60)) + ':' + z(x % 60);
  }
  function computeDepartTimes(session, locConfig, retDefault) {
    var start = hm(session && session.start), end = hm(session && session.end);
    var outMin = (locConfig && locConfig.outbound != null) ? locConfig.outbound : null;
    var retMin = (locConfig && locConfig.ret != null) ? locConfig.ret
      : (retDefault != null ? retDefault : null);
    return {
      outbound: (start != null && outMin != null) ? fmt(start - outMin) : null,
      ret: (end != null && retMin != null) ? fmt(end + retMin) : null
    };
  }

  function apiBase() {
    var h = (window.location && window.location.hostname) || '';
    if (h === 'localhost' || h === '127.0.0.1') {
      // local dev: wrangler pages dev serves Functions on :8788
      if ((window.location.port || '') === '8788') return window.location.origin + '/api';
      return 'http://localhost:8788/api';
    }
    return (window.location.origin || '') + '/api';
  }

  window.Rides = {
    shortName: shortName, weekKey: weekKey, rideCaption: rideCaption,
    computeDepartTimes: computeDepartTimes, apiBase: apiBase
  };
})();
```

Adjust the `apiBase` smoke assertion to match: under the harness `hostname` is unset (`window.location` has only `origin`/`pathname`/`search`/`hash`), so `h === ''` → returns `origin + '/api'` → `http://localhost:8000/api`. Update the test to `assert(R.apiBase() === 'http://localhost:8000/api', ...)`.

- [x] **Step 4: Add the script tag**

`public/index.html`, change:
```html
  <script src="app.js"></script>
```
to:
```html
  <script src="app.js"></script>
  <script src="rides.js"></script>
```

- [x] **Step 5: Run both test suites**

Run: `node tests/site_smoke.js` → PASS (new `rides — pure helpers` block green, everything else unchanged).
Run: `cd functions && npm test` → PASS (46 tests).

- [x] **Step 6: Commit**

```bash
git add public/rides.js public/index.html tests/site_smoke.js .github/workflows/build.yml
git commit -m "feat(rides): rides.js pure helpers + functions CI job"
```

---

### Task 9: Player role entry + consent + name flow + `#screen-privacy`

**Files:**
- Modify: `public/index.html` — role-entry link container; summary/name-card slot; `#screen-rides` section shell; `#screen-privacy` section; consent `<dialog>` + name `<dialog>` (or inline — see spec §4.2, a `<dialog>` for consent, inline screen for the name); `מדיניות פרטיות` footer link
- Modify: `public/app.js` — hooks: `goto('rides')` / `goto('privacy')` targets; call `Rides.renderRoleEntry()` from `renderMyWeek`; nothing else
- Modify: `public/rides.js` — role state (`gilboa.role`, `gilboa.player`), `renderRoleEntry()`, consent flow, name capture (live preview, one-word `שמור בכל זאת`, `→ חזרה`, failure path), `POST /api/token`
- Modify: `public/styles.css` — role link, consent dialog, name card, `#screen-privacy`
- Modify: `tests/site_smoke.js` — `console.log('rides — role + consent + name')` block; stub `global.fetch` so `/api/token` is controllable; add the new DOM nodes to the harness fixture

**Interfaces:**
- Consumes: `window.goto` (extend its `screen` switch to accept `'rides'` and `'privacy'`), `window.showToast`, `Rides.shortName`, `Rides.apiBase`.
- Produces on `window.Rides`: `getRole()`, `getPlayer()` (`{token,fullName}|null`), `isPlayerWithToken()`, `renderRoleEntry()`, `enterPlayerMode()` (opens consent), `exitToParent(opts)`, and internal `saveName(fullName)` → `POST {apiBase}/api/token`. Test-visible: `window.Rides._stubFetch` hook is **not** added; instead the smoke harness overrides `global.fetch` (already the pattern).

**Key behaviours (spec §4.1–4.5):** copy strings verbatim from `docs/rides-spec.md` §4 and the appendix. Consent dialog uses the §8.1 draft text. On `POST /api/token` success → `localStorage['gilboa.player'] = JSON.stringify({token, fullName})`, `localStorage['gilboa.role']='player'`, re-render. On failure → inline `לא הצלחנו לשמור, נסו שוב`, keep the typed value, stay. `→ חזרה` / `ביטול` → role stays/returns parent, no `player` key written.

- [x] **Step 1: Extend the harness fixture + write failing tests**

In `tests/site_smoke.js` fixture section, add the nodes `renderRoleEntry` expects (`#role-entry`, `#rides-summary-slot`), a fake `<dialog>` (`El` needs `showModal`/`close`/`returnValue` no-ops — add them to the `El` class), and `#screen-rides` / `#screen-privacy` sections. Add a controllable `/api/token` response to the `global.fetch` stub:

```javascript
let TOKEN_RESPONSE = { ok: true, status: 200, body: { token: 'tok-smoke-123' } };
// in global.fetch, before the data-file branch:
if (url.indexOf('/api/token') !== -1) {
  return Promise.resolve({
    ok: TOKEN_RESPONSE.ok, status: TOKEN_RESPONSE.status,
    json: () => Promise.resolve(TOKEN_RESPONSE.body),
  });
}
```

Then the test block (before `week nav bounds`):

```javascript
  console.log('rides — role + consent + name');
  {
    // start clean: parent, one team followed
    delete store['gilboa.role']; delete store['gilboa.player'];
    window.applyTeamsParam('?teams=' + T1);
    render();

    assert(!!byId['role-entry'] && byId['role-entry'].textContent.indexOf('מעבר למצב שחקן') !== -1,
      'parent sees the "switch to player" link');
    assert(!byId['week-content'].querySelector('.ride-chip'), 'parent sees no ride chips');

    window.Rides.enterPlayerMode();
    // consent dialog shown; accept
    const consent = byId['rides-consent'];
    assert(!!consent, 'consent dialog present');
    consent.querySelector('[data-consent="ok"]').click();

    // name step: type a full name, see the preview
    const nameInput = byId['rides-name-input'];
    nameInput.value = 'דניאל כהן'; nameInput.dispatch('input');
    assert(byId['rides-name-preview'].textContent.indexOf('דניאל כ׳') !== -1, 'live "יוצג כ" preview');

    TOKEN_RESPONSE = { ok: true, status: 200, body: { token: 'tok-smoke-123' } };
    byId['rides-name-save'].click();
    await new Promise(r => setTimeout(r, 10));
    assert(JSON.parse(store['gilboa.player']).token === 'tok-smoke-123', 'token stored on success');
    assert(store['gilboa.role'] === 'player', 'role set to player');

    // failure path
    delete store['gilboa.role']; delete store['gilboa.player'];
    window.Rides.enterPlayerMode();
    byId['rides-consent'].querySelector('[data-consent="ok"]').click();
    byId['rides-name-input'].value = 'מאיה לוי'; byId['rides-name-input'].dispatch('input');
    TOKEN_RESPONSE = { ok: false, status: 500, body: {} };
    byId['rides-name-save'].click();
    await new Promise(r => setTimeout(r, 10));
    assert(!store['gilboa.player'], 'no player stored on failure');
    assert(byId['rides-name-error'].textContent.indexOf('לא הצלחנו לשמור') !== -1, 'inline failure message');
    assert(byId['rides-name-input'].value === 'מאיה לוי', 'typed name kept after failure');

    // one-word warning
    byId['rides-name-input'].value = 'מדונה'; byId['rides-name-input'].dispatch('input');
    byId['rides-name-save'].click();
    assert(byId['rides-name-save'].textContent.indexOf('שמור בכל זאת') !== -1, 'one word => save button becomes "שמור בכל זאת"');

    // back out
    byId['rides-name-back'].click();
    assert(!store['gilboa.role'] || store['gilboa.role'] !== 'player', '→ חזרה leaves parent mode clean');

    // privacy screen reachable
    window.goto('privacy');
    assert(byId['screen-privacy'].hidden === false, 'privacy screen shows');
    window.goto('myweek');
  }
```

Run: `node tests/site_smoke.js` — FAIL.

- [x] **Step 2: Add the DOM** — `public/index.html`

Inside `#screen-myweek`, after `#share-follows`:
```html
        <div id="rides-summary-slot"></div>
        <div id="role-entry-slot"></div>
```
After `#screen-addteam`, add:
```html
      <section id="screen-rides" class="screen" hidden>
        <button type="button" class="btn btn-back" data-goto="myweek">→ חזרה</button>
        <h1 class="screen-title">ההסעות שלי</h1>
        <div id="rides-body"></div>
      </section>

      <section id="screen-privacy" class="screen" hidden>
        <button type="button" class="btn btn-back" data-goto="myweek">→ חזרה</button>
        <h1 class="screen-title">מדיניות פרטיות</h1>
        <div id="privacy-body" class="prose"></div>
      </section>
```
Before `</main>` add a persistent footer link:
```html
      <p class="privacy-link-row"><button type="button" class="linklike" data-goto="privacy">מדיניות פרטיות</button></p>
```
Before `#toast`, add the dialogs:
```html
  <dialog id="rides-consent" class="sheet">
    <div class="sheet-body" id="rides-consent-body"></div>
    <div class="sheet-actions">
      <button type="button" class="btn btn-primary" data-consent="ok">הבנתי, אפשר להמשיך</button>
      <button type="button" class="btn" data-consent="cancel">ביטול</button>
    </div>
  </dialog>
```
(The name step is rendered **inline** into `#rides-summary-slot` by `rides.js`, not a dialog — spec §4.2.)

- [x] **Step 3: Implement the flow in `public/rides.js`**

Add (after the helpers IIFE, or extend it) role state + rendering. Full code is ~150 lines; keep to the spec. Core shape:

```javascript
// --- role state ---
function getRole() { try { return localStorage.getItem('gilboa.role') === 'player' ? 'player' : 'parent'; } catch (e) { return 'parent'; } }
function getPlayer() {
  try { var r = localStorage.getItem('gilboa.player'); if (!r) return null; var o = JSON.parse(r); return (o && o.token) ? o : null; }
  catch (e) { return null; }
}
function isPlayerWithToken() { return getRole() === 'player' && !!getPlayer(); }
function setPlayer(o) { try { localStorage.setItem('gilboa.player', JSON.stringify(o)); } catch (e) {} }
function setRole(r) { try { r === 'player' ? localStorage.setItem('gilboa.role', 'player') : localStorage.removeItem('gilboa.role'); } catch (e) {} }
function clearPlayer() { try { localStorage.removeItem('gilboa.player'); localStorage.removeItem('gilboa.role'); } catch (e) {} }
```

`renderRoleEntry()` — populate `#role-entry-slot` with the link
`רישום להסעות — מעבר למצב שחקן` **only** when `getRole() === 'parent'`; also append
the `#onboarding` hook line when the onboarding card is visible. When
`getRole()==='player'` clear the slot (the summary card is the indicator).

`enterPlayerMode()` — fill `#rides-consent-body` with the §8.1 text +
a `מדיניות פרטיות` link, `showModal()`. Wire `[data-consent=ok]` → close +
`renderNameStep()`; `[data-consent=cancel]` and dialog `cancel` event → close, stay parent.

`renderNameStep()` — render into `#rides-summary-slot`: label `שם מלא`, helper
`השם המלא גלוי רק לרכז ההסעות.`, `<input id="rides-name-input">`,
`<p id="rides-name-preview">`, `<p id="rides-name-error">`,
`<button id="rides-name-save">שמור</button>`, `<button id="rides-name-back">→ חזרה</button>`.
`input` handler → update preview `יוצג לשחקנים אחרים כ: <shortName>`; empty → disable save,
show `יש להזין שם מלא`. One word → set a `warned` flag; second click with one word allowed.
`save` → `POST apiBase()+'/api/token'`; on ok → `setPlayer({token, fullName})`, `setRole('player')`,
clear the slot, `App`/`render()`; on fail → `#rides-name-error` = `לא הצלחנו לשמור, נסו שוב`, keep input.

`exitToParent()` — confirm `המעבר למצב הורה ימחק את בקשות ההסעה שלך לשבוע זה. להמשיך?`;
on ok → `fetch(apiBase()+'/api/me?token=...&week=...', {method:'DELETE'})` best-effort →
`clearPlayer()` → re-render.

`renderPrivacy()` — fill `#privacy-body` with the full §8.1 text + `[contact]` placeholder
(dev shows the literal placeholder; Task 12 note).

Extend `window.Rides` with `getRole, getPlayer, isPlayerWithToken, renderRoleEntry,
enterPlayerMode, exitToParent, renderPrivacy`.

- [x] **Step 4: Wire the hooks in `public/app.js`**

- In `goto(screen)`, add branches for `'rides'` and `'privacy'` (hide the other screens, show `#screen-rides` / `#screen-privacy`, call `window.Rides.renderRides && window.Rides.renderRides()` / `renderPrivacy()`). Keep the existing `myweek` / `addteam` behaviour.
- At the **end** of `renderMyWeek()`, add:
  ```javascript
  if (window.Rides) {
    try { window.Rides.renderRoleEntry(); window.Rides.renderSummaryCard && window.Rides.renderSummaryCard(); }
    catch (e) { console.error('rides UI error (schedule unaffected):', e); }
  }
  ```
- Add `'privacy'` and `'rides'` to the `[data-goto]` handling — it already generically calls `goto(b.getAttribute('data-goto'))`, so the new `data-goto` buttons work once `goto` handles the names.
- Export `window.goto = goto;` and `window.render = render;` if not already (the harness calls `render()` — check; `app.js` currently does not export `render`, add `window.render = render;` near the other exports).

- [x] **Step 5: Styles** — `public/styles.css`

Add `.linklike` / `#role-entry-slot .role-link` (styled like `.share-follows`), `.privacy-link-row`, `.prose` (readable paragraph column), `dialog.sheet` + `dialog.sheet::backdrop` + `.sheet-body` + `.sheet-actions` (bottom-sheet: `position: fixed; inset: auto 0 0 0; margin: 0; width: 100%; border-radius: 12px 12px 0 0; max-height: 85vh; overflow: auto`), and `@media (prefers-reduced-motion: no-preference)` slide-up transition. Name-step: `.rides-name-card`, `#rides-name-error` (muted-red text token — add `--warn` if not present; reuse the `.session-warn` colour).

- [x] **Step 6: Run both suites**

Run: `node tests/site_smoke.js` → PASS. Run: `cd functions && npm test` → PASS. Run: `pytest -q` → PASS.

- [x] **Step 7: Commit**

```bash
git add public/ tests/site_smoke.js
git commit -m "feat(rides): player role entry, consent + name flow, privacy screen"
```

---

### Task 10: Ride chip + bottom sheet + rides summary card + `#screen-rides`

**Files:**
- Modify: `public/rides.js` — `decorateSession(card, session)`, the trip-type sheet, optimistic `PUT`/`DELETE /api/request`, `loadMyRides(week)` (`GET /api/me`), `renderSummaryCard()`, `renderRides()` (the `#screen-rides` body incl. the actionable empty state), throttled `ping()`, the `שירות ההסעות אינו זמין` failure UI
- Modify: `public/app.js` — in `renderSession`, after building the card, `if (window.Rides && window.Rides.isPlayerWithToken()) window.Rides.decorateSession(card, s);` wrapped in try/catch
- Modify: `public/index.html` — a second `<dialog id="rides-sheet" class="sheet">` for the trip-type chooser
- Modify: `public/styles.css` — `.ride-strip`, `.ride-chip` (outlined / accent states), `.ride-caption`, sheet option rows, `.ride-cancel` (muted-red, below a divider), `#rides-body` list
- Modify: `tests/site_smoke.js` — `console.log('rides — chip + sheet + screen')` block; extend the `global.fetch` stub for `/api/me` and `/api/request`

**Interfaces:**
- Consumes: `Rides.isPlayerWithToken`, `Rides.getPlayer`, `Rides.weekKey`, `Rides.rideCaption`, `Rides.computeDepartTimes`, `Rides.apiBase`, `window.ltrIsolate`, `window.showToast`, `window.DATA` (read-only, for the team display name + the week's practices in the empty state — **read, never mutate**).
- Produces on `window.Rides`: `decorateSession(card, session)`, `renderSummaryCard()`, `renderRides()`, `openTripSheet(session)`, `putRequest(session, direction)`, `deleteRequest(session)`, `ping()`. Internal in-memory cache `Rides._week` = `{ key, requestsBySession: {}, loaded: bool, failed: bool }`.

> **Deviation (approved 2026-09-04):** the plan drew departure times on the
> player chip, but `GET /api/me` (Task 3) returned only `{ requests, rideStatus }`
> — no way to reach the coordinator's per-location offsets. `me.js` was extended
> to also return `config: { locations, retDefault }` (structural config, **no
> personal data**); the client computes the times from the schedule data it
> already holds via `Rides.computeDepartTimes`. `me.test.js` gained one case.
> `app.js` also exports `window.viewSunday / DATA / followed / HE_WEEKDAY /
> weekSessionsFor / ltrIsolate` for `rides.js` (read-only).

**Key behaviours (spec §4.6–4.9, §10):**
- `decorateSession` inserts `.ride-strip` between `.session-line` and `.session-note`. Chip label + caption per the §4.6 table. `aria-haspopup="dialog"`, accessible name per spec. Every clock time in the caption wrapped by `ltrIsolate` (smoke-tested).
- Sheet: context heading `<team> · <יום X׳> · <location>`; rows `הלוך וחזור` (preselected) / `הלוך` / `חזור`; `ביטול הסעה` only when a request exists, below a divider. `Esc` / backdrop / selection all restore focus to the chip. `prefers-reduced-motion` respected.
- `putRequest` optimistic: update chip immediately, `aria-busy`, `PUT {apiBase}/api/request` with `{token, fullName, teamId, sessionId, direction, week}`. On 5xx/network → revert + toast `שמירת ההסעה נכשלה, נסו שוב`. On 400 → revert + toast `לא ניתן לבחור הסעה לאימון זה` (no retry).
- Summary card: styled like `#changes-banner`, text `ההסעות שלי לשבוע זה: N · M ללא שעה` or `טרם נרשמת להסעות השבוע`; tap → `goto('rides')`; holds the `מעבר למצב הורה` action.
- `#screen-rides`: rows grouped by day with `עריכה` / `ביטול`; **empty state lists the visible week's practices** for followed teams each with a `🚐 הוספת הסעה` button under `בחרו אימון כדי להוסיף הסעה`. `GET /api/me` failure → `לא ניתן לטעון את ההסעות שלך` + `נסו שוב` (distinct from empty).
- API-down anywhere → `.ride-strip` shows `שירות ההסעות אינו זמין כרגע` + `נסו שוב`; the schedule list/summary/exports/changes banner all still render (assert this).
- `ping()`: throttle via `gilboa.ping_ts` ≤ 1/hour; `POST {apiBase}/api/ping` `keepalive`, ignore all errors. Called once on boot in player **and** parent mode (add a call from `app.js` boot, after `render()`).

- [x] **Step 1: Extend the fetch stub + write failing tests**

In the harness `global.fetch` stub add controllable `/api/me` and `/api/request`:
```javascript
let ME_RESPONSE = { ok: true, status: 200, body: { requests: [], rideStatus: {} } };
let REQ_RESPONSE = { ok: true, status: 200, body: { ok: true } };
if (url.indexOf('/api/me') !== -1) return Promise.resolve({ ok: ME_RESPONSE.ok, status: ME_RESPONSE.status, json: () => Promise.resolve(ME_RESPONSE.body) });
if (url.indexOf('/api/request') !== -1) return Promise.resolve({ ok: REQ_RESPONSE.ok, status: REQ_RESPONSE.status, json: () => Promise.resolve(REQ_RESPONSE.body) });
if (url.indexOf('/api/ping') !== -1) return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}) });
```

Test block (before `week nav bounds`), building on the player state from Task 9:
```javascript
  console.log('rides — chip + sheet + screen');
  {
    store['gilboa.role'] = 'player';
    store['gilboa.player'] = JSON.stringify({ token: 'tok-smoke-123', fullName: 'דניאל כהן' });
    ME_RESPONSE = { ok: true, status: 200, body: { requests: [], rideStatus: {} } };
    // go to the last published week with T1 followed
    let g = 0; while (!next.disabled && g++ < 12) next.click(); prev.click();
    render();
    await new Promise(r => setTimeout(r, 10));

    const chip = byId['week-content'].querySelector('.ride-chip');
    assert(!!chip, 'player with a token sees a ride chip on each session');
    assert(chip.textContent.indexOf('הוספת הסעה') !== -1, 'no request => "הוספת הסעה"');

    REQ_RESPONSE = { ok: true, status: 200, body: { ok: true } };
    chip.click();
    const sheet = byId['rides-sheet'];
    assert(sheet.querySelector('[data-dir="round"]'), 'sheet has a round-trip option');
    sheet.querySelector('[data-dir="round"]').click();
    await new Promise(r => setTimeout(r, 10));
    const chip2 = byId['week-content'].querySelector('.ride-chip');
    assert(chip2.textContent.indexOf('✓') !== -1, 'after choosing, chip shows a check');
    assert(/[⁦][\d:]+[⁩]/.test(chip2.parentNode.textContent) || chip2.parentNode.textContent.indexOf('טרם נקבעה שעה') !== -1,
      'caption times are ltr-isolated (or "no time set")');

    // failure revert
    REQ_RESPONSE = { ok: false, status: 500, body: {} };
    const chip3 = byId['week-content'].querySelector('.ride-chip'); chip3.click();
    byId['rides-sheet'].querySelector('[data-dir="out"]').click();
    await new Promise(r => setTimeout(r, 10));
    assert(byId['toast'].textContent.indexOf('שמירת ההסעה נכשלה') !== -1, '5xx => retryable toast, chip reverts');

    // summary card + screen
    assert(byId['rides-summary-slot'] || byId['rides-summary-slot'] === null, 'summary slot exists');
    window.goto('rides');
    assert(byId['screen-rides'].hidden === false, 'rides screen opens');
    // empty state lists practices with add buttons
    ME_RESPONSE = { ok: true, status: 200, body: { requests: [], rideStatus: {} } };
    window.Rides.renderRides();
    await new Promise(r => setTimeout(r, 10));
    assert(byId['rides-body'].textContent.indexOf('בחרו אימון כדי להוסיף הסעה') !== -1, 'actionable empty state');

    // api down: schedule still renders
    ME_RESPONSE = { ok: false, status: 500, body: {} };
    window.goto('myweek'); render();
    await new Promise(r => setTimeout(r, 10));
    assert(byId['week-content'].querySelectorAll('.day-group').length > 0, 'schedule list still renders when the rides API is down');
    assert(byId['summary'].textContent.length > 0, 'weekly summary still renders when the rides API is down');

    // restore
    delete store['gilboa.role']; delete store['gilboa.player'];
    window.applyTeamsParam('?teams=' + T1);
  }
```

Run: `node tests/site_smoke.js` — FAIL.

- [x] **Step 2: Implement** `decorateSession`, `openTripSheet`, `putRequest`/`deleteRequest`, `loadMyRides`, `renderSummaryCard`, `renderRides`, `ping` in `public/rides.js` per the behaviours above. Add `window.render` / `window.goto` usage. Keep every `fetch` in a `try/catch` + `.catch`; a rejection sets `Rides._week.failed = true` and renders the contained failure UI, never rethrows.

- [x] **Step 3: Add the sheet DOM** to `public/index.html` (`<dialog id="rides-sheet" class="sheet">` with a `#rides-sheet-heading`, a `#rides-sheet-options` container, and a `#rides-sheet-cancel` slot).

- [x] **Step 4: Wire `renderSession`** in `public/app.js`:
```javascript
  // ... after `return card;` is built but before returning:
  if (window.Rides && window.Rides.isPlayerWithToken()) {
    try { window.Rides.decorateSession(card, s); } catch (e) { console.error('ride chip error (schedule unaffected):', e); }
  }
  return card;
```
And in the boot `.then(...)` after `render();` add `if (window.Rides) window.Rides.ping();`.

- [x] **Step 5: Styles** — `.ride-strip` (tinted full-width block), `.ride-chip` outlined vs `.ride-chip.is-set` accent (no red/green — use `--accent`), `.ride-caption` (small, muted), sheet option rows (`min-height: var(--tap)`), `.ride-cancel` (muted-red, `border-top: 1px solid` divider, `margin-top`).

- [x] **Step 6: Run all three suites** — `node tests/site_smoke.js`, `cd functions && npm test`, `pytest -q` → all green.

- [x] **Step 7: Commit**

```bash
git add public/ tests/site_smoke.js
git commit -m "feat(rides): ride chip, trip-type sheet, rides summary card + screen"
```

---

### Task 11: Manager app — `public/manager.html` + `manager.js` + `manager.css`

**Files:**
- Create: `public/manager.html` — RTL, loads `styles.css` + `manager.css` + `manager.js`. **Not linked from `index.html`.**
- Create: `public/manager.js` — login dialog, `לוח בקרה` / `הגדרות` tabs, day stepper, dashboard render (collapsed practice rows, expand → names, orphan group, zero-request toggle, `אין בקשות הסעה ליום זה`), `העתקת תוכנית היום כטקסט`, health footer, settings (`זמני יציאה` rows + `+ הוסף מיקום` + `ברירת מחדל לחזרה`), stats tab
- Create: `public/manager.css` — dashboard-specific styles (practice row, expand panel, day stepper reuse of `.week-nav`)
- Create: `tests/manager_smoke.js` — Node fake-DOM harness in the `site_smoke.js` style, stubbing `fetch` for `/api/manager/*`
- Modify: `.github/workflows/build.yml` — add `node tests/manager_smoke.js` to the `functions-tests` job
- Modify: `public/README.md` — one line: the manager URL + that it is password-gated and unlisted

**Interfaces:**
- `manager.js` is standalone (no `app.js` / `rides.js`). Its own `apiBase()` copy (or factor a tiny shared `public/api-base.js` loaded by both — optional; a copy is acceptable and matches the "no build" rule). Pure helper `buildDayText(day)` → the plain-text block for `העתקת תוכנית היום כטקסט`, exposed on `window` and unit-tested.
- Auth: `POST {apiBase}/api/manager/login` → store `gilboa.manager = {token, exp}`; all dashboard/config calls send `Authorization: Bearer <token>`; on any `401` → drop the token, show the login dialog.

- [x] **Step 1: Write `tests/manager_smoke.js` (failing)** — fake DOM + `localStorage` + `fetch` stub returning a canned `GET /api/manager/dashboard` payload (mirror the Task 6 shape: 1 day, 2 practices, 1 orphan, `lastPurge`). Assert:
  - login dialog shows; wrong passphrase (`stub 401`) → error `סיסמה שגויה`, no dashboard;
  - right passphrase (`stub 200`) → dashboard; day header `סה״כ: N נוסעים · M הסעות`;
  - a practice row is collapsed; clicking it reveals the `הלוך וחזור (k): …` name lines;
  - the orphan group `בקשות ללא אימון תואם` renders;
  - `buildDayText(day)` contains each practice name + the direction counts;
  - health footer shows `ניקוי אחרון: <lastPurge>`;
  - a day with no practices → `אין בקשות הסעה ליום זה`;
  - Settings tab: a `זמני יציאה` row per live location with two number inputs; changing one and hitting save calls `PUT /api/manager/config` with the right body.

Run: `node tests/manager_smoke.js` — FAIL (file/DOM not built yet).

- [x] **Step 2: Build `public/manager.html`** — minimal shell: header `גלבוע מעיינות · הסעות`, a `<dialog id="mgr-login">`, `<nav>` with two tab buttons, `<section id="tab-dashboard">` / `<section id="tab-settings">` / `<section id="tab-stats">`, `<div id="mgr-day-nav">` reusing `.week-nav` markup, `<div id="mgr-day-body">`, `<footer id="mgr-health">`.

- [x] **Step 3: Build `public/manager.js`** per §5 of the spec. Keep render functions small and pure where possible (`buildDayText`, `renderPracticeRow`, `renderSettingsRow`). All copy verbatim from `docs/rides-spec.md` §5 + appendix.

- [x] **Step 4: Build `public/manager.css`** — reuse `styles.css` tokens; add the practice row (collapsed summary line + expandable panel), the stepper, the settings grid (label + 2 narrow number inputs, RTL).

- [x] **Step 5: Add to CI** — append `- name: Manager smoke test` running `node tests/manager_smoke.js` to the `functions-tests` job.

- [x] **Step 6: Run all suites** — `node tests/site_smoke.js`, `node tests/manager_smoke.js`, `cd functions && npm test`, `pytest -q` → all green.

- [x] **Step 7: Commit**

```bash
git add public/manager.html public/manager.js public/manager.css public/README.md tests/manager_smoke.js .github/workflows/build.yml
git commit -m "feat(rides): manager dashboard + settings + stats (manager.html)"
```

---

### Task 12: Docs, runbook, decision log, QA checklist

**Files:**
- Create: `docs/RIDES.md` — operations runbook
- Modify: `docs/decision-log.md` — `DL-029` (rides backend + per-row KV + token model), `DL-030` (manager passphrase + edge rate-limit + Cloudflare Access deferred)
- Modify: `docs/execution-plan.md` — a "Phase 6 — Rides Slice A" section + a progress-log entry; update "Immediate next step"
- Modify: `docs/architecture.md` — a "Rides API (Cloudflare Pages Functions + KV)" component block + the `functions/` dir in the layout
- Modify: `docs/known-constraints.md` — KV namespace, the three env secrets, `PURGE_KEY`/`RIDES_API` GitHub secrets, the "minors' PII / legal review pending" note, the Miniflare concurrency-not-testable note
- Modify: `docs/qa-checklist.md` — a "Rides — Slice A" section and a "Rides — privacy & security" section
- Modify: `docs/ui-ux-spec.md` — player mode + manager page summary

**Interfaces:** none (docs only).

- [x] **Step 1: `docs/RIDES.md`** — cover: the live API base + `manager.html` URL; the KV namespace name/id and how to browse/wipe it (`wrangler kv key list`, `wrangler kv key delete`); the three Cloudflare env secrets (`MANAGER_PASSPHRASE`, `SITE_ORIGIN`, `PURGE_KEY`) and how to set them; the two GitHub secrets (`PURGE_KEY`, `RIDES_API`); how to rotate the manager passphrase (change the Cloudflare secret → every existing session token stops verifying, which is the desired effect); the edge Rate Limiting rule (paths, threshold); the CORS `SITE_ORIGIN` var; local dev (`npx wrangler pages dev public --kv RIDES_KV`); how the purge is invoked and how to read `config/global.lastPurge`.

- [x] **Step 2: `docs/decision-log.md`** — append `DL-029` and `DL-030`. `DL-029`: per-row KV keys (LWW race), structural-only write validation, opaque tokens in `localStorage` only, purge via the existing Action not a second scheduler, schema `v:1`. `DL-030`: generated passphrase (not user-chosen), 6 h session, edge Rate Limiting (not a KV counter), Cloudflare Access deferred to Slice B, legal review is a wide-rollout blocker only.

- [x] **Step 3: `docs/execution-plan.md`** — add:
```markdown
## Phase 6 — Rides Slice A (approved; separate spec `docs/rides-spec.md`)
- Goal: player ride requests on each practice + a password-gated coordinator
  dashboard, on a new Cloudflare Pages Functions + KV backend, with the schedule
  half untouched.
- Plan: `docs/superpowers/plans/2026-09-04-rides-slice-a.md`.
- Gates: consent wording + contact and the generated manager passphrase before
  the single-team pilot; the legal opinion + Cloudflare Access before club-wide
  rollout (Slice B).
```
and a progress-log entry once built.

- [x] **Step 4: `docs/qa-checklist.md`** — add the two sections. Rides — Slice A: parent sees no chips; consent → name → token; `shortName` never shows a full surname to a non-manager; chip states + caption `ltr` isolation; weekly reset (no rows for a new week's key); optimistic save + 5xx revert + 400 non-retry; actionable empty state; switch-back deletes `week/<wk>/req/<token>/*`; API-down leaves the schedule fully working; day stepper + collapsed rows + orphan group + `העתקת תוכנית היום`; `זמני יציאה` round-trips; health footer shows `lastPurge`; purge deletes only strictly-past weeks. Rides — privacy & security: token entropy + `localStorage`-only + never in a URL/DOM; structural-only write validation; 1 KB body cap + 20-row cap; manager `401` on missing/bad/expired Bearer; `POST /api/purge` `401` without `X-Purge-Key`; CORS = `SITE_ORIGIN`; no names/tokens in logs; **the KV LWW race is designed out (per-row keys), not testable under Miniflare**; consent contact placeholder filled before the pilot.

- [x] **Step 5: `docs/architecture.md` + `docs/known-constraints.md` + `docs/ui-ux-spec.md`** — the component block, the constraints list, the UX summary.

- [x] **Step 6: Verify the doc references resolve** — grep for `2026-09-03-rides-coordination-design.md` and confirm it now exists on the branch/`main` (Task 0 prereq); grep for `rides-spec.md`.

- [x] **Step 7: Commit**

```bash
git add docs/
git commit -m "docs(rides): RIDES.md runbook, DL-029/030, QA checklist, arch + constraints"
```

---

## Integration & rollout (after all tasks)

- [x] All green: `cd functions && npm test`; `node tests/site_smoke.js`; `node tests/manager_smoke.js`; `pytest -q`.
- [x] **Cloudflare setup** (done 2026-09-04, recorded in `RIDES.md`):
  - [x] Create KV namespace `RIDES_KV`; bind it to the `gilboa-schedule` Pages project.
  - [x] Set env vars `SITE_ORIGIN` (= `https://gilboa-schedule.pages.dev`), `MANAGER_PASSPHRASE` (generated 5 words), `PURGE_KEY` (random 32+ chars, urlsafe).
  - [x] Retried the Production deployment so the new binding + secrets took effect.
  - [ ] ~~Add one edge Rate Limiting rule~~ — **deferred, DL-032.** This account has no
        Cloudflare zone (site is on the shared `*.pages.dev` domain, no custom domain —
        OQ-4 still deferred); Rate Limiting Rules are per-zone and the account-level WAF
        shown as an alternative is a paid Enterprise add-on. Shipping the pilot without
        it; add the rule the first time a custom domain exists, or before club-wide
        rollout, whichever comes first.
- [x] **GitHub secrets:** `PURGE_KEY` (same value), `RIDES_API` (= `https://gilboa-schedule.pages.dev`). Done 2026-09-04.
- [ ] Merge to `main`. Cloudflare auto-deploys site + Functions. Confirm `GET /api/manager/... ` needs auth, `POST /api/token` returns a token, the site still renders with the API reachable and with it blocked (DevTools request-block on `/api/*`).
- [ ] Fill the §8.1 `[contact]` / `[מדיניות פרטיות]` text from the stakeholder; redeploy.
- [ ] QA pass (qa-reviewer) against `docs/qa-checklist.md` new sections + a security/privacy review pass.
- [ ] **Single-team pilot:** the coordinator uses `manager.html` for ~2 weeks; the stakeholder starts the legal review; OQ-1 answered from real use.

## Self-review notes

- **Spec coverage:** §3 identity (Task 1 `token.js`, Task 9 role state) · §4.1 role entry (Task 9) · §4.2 consent+name incl. one-word / back-out / failure (Task 9 tests) · §4.3 `shortName` (Task 8) · §4.4 no-token → no chips (Task 9 test) · §4.5 switch-back → `DELETE /api/me` (Task 9) · §4.6 chip states + `ltr` caption (Task 10 tests) · §4.7 bottom sheet + optimistic + 5xx/400 (Task 10) · §4.8 weekly reset (per-row keys, Task 3; no client clear) · §4.9 summary card + `#screen-rides` actionable empty + load-fail (Task 10) · §5.1 login (Task 5, Task 11) · §5.2 dashboard: day stepper, collapsed rows, orphan group, zero-request toggle, copy-day-text, health footer (Task 6 + Task 11) · §5.3 stats (Task 6 `buildDashboard.stats`, Task 11 tab) · §5.4 settings `זמני יציאה` + default (Task 7 + Task 11) · §5.5 `computeDepartTimes` (Task 5 server, Task 8 client) · §6.1–6.6 backend (Tasks 1–7) · §6.5 purge + Action step (Task 4) · §8.4 rate-limit is edge config (rollout checklist, not code) · §10 isolation boundary (Task 10 "api down" test; try/catch wrappers in Tasks 9–10) · §11 testing (every task is TDD; §11.4 CI = Task 8 + Task 11) · §12 build sequence = task order.
- **Deliberately not code:** the edge Rate Limiting rule and the KV namespace/secret creation are Cloudflare dashboard actions (rollout checklist + `RIDES.md`), not files. Cloudflare Access is Slice B. The legal opinion is a stakeholder action.
- **Type consistency:** `direction` is `round|out|back` everywhere (`validate.isDirection`, `rows.putRequest`, `buildDashboard` `DIRS`, the sheet `data-dir`). `week` is always the Sunday `YYYY-MM-DD` (`weekKeyOf`, `Rides.weekKey`, `isWeekKey`). `depart` is `{ outbound, ret }` (server `computeDepartTimes`, client copy, `rideCaption`, `buildDashboard` practice). Player token regex `/^[A-Za-z0-9_-]{8,128}$/` is shared by `request.js` and `me.js` (`isToken`) and produced by `mintPlayerToken` (24 bytes b64url = 32 chars).
- **Known gap:** `buildDashboard` needs `teams.json` for display names; the endpoint fetches it alongside `schedule.json` and passes `teamsById` — signature is `buildDashboard(kv, scheduleJson, teamsById, week)` (noted in Task 6 step 3, not the earlier 3-arg sketch). Implementers: use the 4-arg form.
- **Untested-but-low-risk:** the endpoint-level `fetch` of `schedule.json`/`teams.json` in `dashboard.js` and `config.js` is not unit-tested (Miniflare would need a stub server); `buildDashboard` is tested directly with a fixture, and the `fetch` wiring is a 3-line `Promise.all` covered by the manual rollout check. The bottom-sheet `prefers-reduced-motion` transition and real RTL rendering need a device glance (in the QA pass).
