# Rides — Operations Runbook

הסעות (rides): players/parents request a lift to/from practice; a club
coordinator sees a per-week dashboard. Backend = Cloudflare Pages Functions +
one KV namespace, in the **same** Cloudflare Pages project that serves the
static schedule site. Spec: `docs/rides-spec.md`. Build plan:
`docs/superpowers/plans/2026-09-04-rides-slice-a.md`. Architecture:
`docs/architecture.md` → "Rides API" component.

## Live URLs
- Site + API base: `https://gilboa-schedule.pages.dev`
- Manager dashboard: `https://gilboa-schedule.pages.dev/manager.html`
- API routes live under `/api/*` (`functions/api/**`), deployed automatically
  with the site — no separate API deploy step.

## KV namespace
- Name: **`RIDES_KV`**, bound to the `gilboa-schedule` Pages project
  (Production **and** Preview environments) as the `RIDES_KV` binding.
- Created once via the Cloudflare dashboard (Workers & Pages → KV) or:
  ```bash
  npx wrangler kv namespace create RIDES_KV
  ```
  then bind the returned id to the Pages project in
  Settings → Functions → KV namespace bindings (Production + Preview).
- **Browse:**
  ```bash
  npx wrangler kv key list --namespace-id <id>
  npx wrangler kv key get "config/global" --namespace-id <id>
  ```
- **Wipe a key** (e.g. to force-clear a stuck row):
  ```bash
  npx wrangler kv key delete "week/<wk>/req/<token>/<sessionId>" --namespace-id <id>
  ```
- **Key shapes:** `week/<wk>/req/<token>/<sessionId>` (one ride request),
  `week/<wk>/rideStatus` (reserved), `config/locations`, `config/global`
  (`{ retDefault, lastPurge, v:1 }`), `stats/players-all`,
  `stats/opens/<day>/<rand>`. `<wk>` is always the Sunday `YYYY-MM-DD` of that
  week. Every stored JSON value carries `v: 1`.

## Environment secrets (Cloudflare Pages → Settings → Environment variables)
Set for **both** Production and Preview:
| Var | Purpose |
|---|---|
| `MANAGER_PASSPHRASE` | Generated 4–5 word passphrase gating `/api/manager/*`. **Not** user-chosen. |
| `SITE_ORIGIN` | `https://gilboa-schedule.pages.dev` — CORS allow-origin + the origin the Functions fetch `data/schedule.json`/`data/teams.json` from. |
| `PURGE_KEY` | Random 32+ char secret required (`X-Purge-Key` header) to call `POST /api/purge`. |

None of these are ever committed to the repo or shipped to the client.

## GitHub secrets (repo → Settings → Secrets and variables → Actions)
| Secret | Purpose |
|---|---|
| `PURGE_KEY` | Same value as the Cloudflare env var above. |
| `RIDES_API` | `https://gilboa-schedule.pages.dev` — base URL the Action calls to purge. |

Both are read by `.github/workflows/build.yml` (job `build-data`), which — after
the normal schedule rebuild — does:
```bash
curl -fsS -X POST -H "X-Purge-Key: $PURGE_KEY" "$RIDES_API/api/purge"
```
non-fatally (missing secrets just skip the purge with a log line, they never
fail the schedule build).

## Rotating the manager passphrase
Change the `MANAGER_PASSPHRASE` Cloudflare env var (Production **and**
Preview) and redeploy (or it takes effect on the next Function invocation for
Pages env var changes — verify in the dashboard). Every previously issued
manager session token stops verifying immediately, because tokens are HMAC'd
with the passphrase (`functions/_lib/token.js`) — this is the intended
revocation mechanism. There is no separate token-revoke list.

## CORS
`functions/_lib/http.js` sets `access-control-allow-origin` to `SITE_ORIGIN`
on every response (and handles preflight). If the site is ever served from an
additional origin (custom domain), add it there — the Function only ever
allows the single configured origin, not a wildcard.

## Edge Rate Limiting (Cloudflare dashboard, one-time)
Security → WAF → Rate limiting rules → one rule covering
`/api/token`, `/api/request`, `/api/ping`, `/api/manager/login` — e.g. 60
requests / 10 min / IP. This runs **before** the Function, so it costs nothing
in KV reads/writes and needs no code. (Free plan includes one rule.) This
protects the write endpoints; there is deliberately no KV-based counter (same
last-write-wins race as the data itself — see `docs/decision-log.md` DL-029).

## Local dev
```bash
npx wrangler pages dev public --kv RIDES_KV
```
This serves the static site **and** the `functions/api/**` routes together
against a local (in-memory, non-persistent) KV. Set the three env vars in
`.dev.vars` (git-ignored) or pass `--binding`/`--var` flags — see
`npx wrangler pages dev --help`. Function unit tests
(`cd functions && npm test`) run against Miniflare and need no live
Cloudflare account.

## Purge
`POST /api/purge` (called by the GitHub Action above, or manually with
`curl -X POST -H "X-Purge-Key: <key>" https://gilboa-schedule.pages.dev/api/purge`)
deletes every `week/<wk>/*` key where `<wk>` is strictly before the current
week's Sunday, and writes `config/global.lastPurge = <today>` (`functions/_lib/purge.js`,
`runPurge`). `config/*` itself is never deleted. The manager dashboard's health
footer reads `config/global.lastPurge` — if it is stale (not today, after the
Action has run), that is the signal something in the purge chain broke; check
the Action log for the `curl` line first.

## Rollout checklist
See `docs/superpowers/plans/2026-09-04-rides-slice-a.md` → "Integration &
rollout (after all tasks)" for the one-time setup steps (KV namespace, env
vars, rate-limit rule, GitHub secrets, `[contact]`/`[מדיניות פרטיות]` text) and
the single-team pilot plan.
