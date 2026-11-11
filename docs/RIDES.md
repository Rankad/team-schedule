# Rides — Operations Runbook

הסעות (rides): players/parents request a lift to/from practice; a club
coordinator sees a per-week dashboard. Backend = Cloudflare Pages Functions +
one KV namespace, in the **same** Cloudflare Pages project that serves the
static schedule site. Spec: `docs/rides-spec.md`. Build plan:
`docs/superpowers/plans/2026-09-04-rides-slice-a.md`. Architecture:
`docs/architecture.md` → "Rides API" component.

> **STATUS 2026-11-11 (DL-042): FRONT END AND MANAGER PAGE REMOVED — backend
> dormant.** The whole rides front end is gone (player mode, name step, summary
> card, privacy screen, `manager.html`). The site makes zero `/api/*` calls and
> collects no personal data. What is still true and deployed: the Pages
> Functions, the `RIDES_KV` namespace, the 3 Cloudflare secrets + 2 GitHub
> secrets, and the **"Purge past rides weeks" step in `build.yml`** — the last
> step of the `build-data` job, which runs 3×/day (cron `0 5,13,17 * * *`,
> DL-033) or on manual dispatch — and keeps deleting old ride rows.
> `MANAGER_PASSPHRASE` is now unused (nothing serves a manager UI; the
> `/api/manager/*` endpoints still respond if called directly). Leftover ride
> rows in KV age out: a ride row lives at most about a week (see "Purge" below).
> Earlier, DL-041 removed the per-card chip + trip sheet. The rollout/pilot
> plans referenced below are dropped.
>
> **Open risk (see "Open risks while dormant" below):** the backend is not
> write-quiescent. The earlier "purge failure is invisible" risk is closed by
> DL-043: the purge step now fails the run loudly (see "Purge step: failure
> behaviour and triage").
>
> **Whether to remove the backend too is an OPEN stakeholder decision** — see
> "If/when the stakeholder decides to remove the backend" at the bottom. Do not
> start that without approval.

## Live URLs
- Site + API base: `https://gilboa-schedule.pages.dev`
- ~~Manager dashboard: `https://gilboa-schedule.pages.dev/manager.html`~~ —
  **removed (DL-042);** that URL no longer serves a manager page. `public/` has
  no `404.html`, `_redirects` or `_headers` and the repo has no `wrangler.toml`,
  so Cloudflare Pages runs in single-page-app mode and serves `/index.html` with
  **HTTP 200** for any unmatched path. A stale `/manager.html` bookmark therefore
  loads the parent app's onboarding page (200, not 404). A stale cached page that
  still requests `/rides.js` receives HTML instead of JavaScript — a harmless
  console MIME/syntax error.
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
as the last step (DL-043: `curl -fsS --max-time 30 --retry 2 --retry-delay 5`,
and the response must contain `"ok":true`). It fails the run if either secret is
missing. **Both secrets must actually be set** — otherwise every scheduled run
goes red. See "Purge step: failure behaviour and triage".

## Rotating the manager passphrase
> **Moot while dormant (DL-042):** there is no manager UI, so the passphrase is
> unused. Kept for the case the manager page is ever restored.

Change the `MANAGER_PASSPHRASE` Cloudflare env var (Production **and**
Preview) and redeploy (or it takes effect on the next Function invocation for
Pages env var changes — verify in the dashboard). Every previously issued
manager session token stops verifying immediately, because tokens are HMAC'd
with the passphrase (`functions/_lib/token.js`) — this is the intended
revocation mechanism. There is no separate token-revoke list.

**"Forgot password" — there is no self-service reset.** The app has no user
accounts and no email/SMS system (deliberate — see the project's $0/month,
no-server constraints), so there is no independent channel to verify a
coordinator's identity and deliver a reset. If the coordinator forgets the
passphrase, **the site admin** (whoever has access to the Cloudflare
account/dashboard) looks it up or rotates it via the steps above and hands
it over out-of-band. This is a permanent design choice for Slice A, not a
gap to fill — see `docs/decision-log.md` DL-030.

## CORS
`functions/_lib/http.js` sets `access-control-allow-origin` to `SITE_ORIGIN`
on every response (and handles preflight). If the site is ever served from an
additional origin (custom domain), add it there — the Function only ever
allows the single configured origin, not a wildcard.

## Edge Rate Limiting — deferred for the pilot (DL-032)
The original plan was one Cloudflare **Rate Limiting Rule** (free plan)
covering `/api/token`, `/api/request`, `/api/ping`, `/api/manager/login`.
That product is **per-zone**, and this account has no zone — the site runs
on the shared `*.pages.dev` domain, not a custom domain we control (custom
domain is its own deferred decision, OQ-4). The account-level WAF shown as
an alternative in the dashboard is a paid Enterprise add-on.
**Shipped without it for the single-team pilot** — the write endpoints are
still gated by an opaque ≥128-bit token or the manager passphrase, and
`PUT /api/request` caps body size (1 KB) and rows-per-token (20). There is
deliberately no KV-based counter as a substitute (same last-write-wins race
as the data itself — DL-029). **Add the Rate Limiting Rule** the first time
a custom domain exists, or before any club-wide rollout — whichever comes
first.

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
`runPurge`). `config/*` itself is never deleted. The (removed) manager
dashboard's health footer used to surface `config/global.lastPurge`; that
footer is gone. The health signal is now the Action run itself (see below); you
can also run `npx wrangler kv key get "config/global"` to see `lastPurge`.

**When it runs:** the purge is the last step of the `build-data` job, which runs
3×/day (cron `0 5,13,17 * * *`, DL-033) or on manual dispatch. Each run deletes
every `week/<wk>/*` KV key whose week-Sunday is before the current week's Sunday,
so a ride row lives at most about a week.

## Open risks while dormant
1. **The backend is not write-quiescent.** `/api/token`, `/api/request`,
   `/api/ping` and `/api/manager/*` remain publicly reachable. No current client
   calls them, but a stale open browser tab running old client code could still
   write ride rows (including a minor's name). "Nothing writes now" is therefore
   true of the shipped site, not guaranteed of the endpoints.

(The former risk 2, "purge failure is invisible", is closed by DL-043 — see
below.)

## Purge step: failure behaviour and triage (DL-043, 2026-11-11)
The "Purge past rides weeks" step in `.github/workflows/build.yml` is the last
step of `build-data`, so the schedule data is already committed and pushed before
it runs: a red run never loses data. It has no `continue-on-error` and fails the
run when:
- `PURGE_KEY` or `RIDES_API` is missing — `::error::` + exit 1;
- the request fails — `curl -fsS --max-time 30 --retry 2 --retry-delay 5` exits
  non-zero on a non-2xx or a network error (`--retry` also retries HTTP 5xx, so
  up to 3 attempts ≈ 10 s);
- the response body does not contain `"ok":true`. The endpoint returns
  `{"ok":true,"weeksDeleted":[dates],"keysDeleted":N,"opensDeleted":N}` — only
  dates and counts, no names; the key is never echoed.

On success it prints `purge ok: <body>`. A red scheduled run emails the repo
owner.

**Operational caveat:** if the GitHub secrets `PURGE_KEY` and `RIDES_API` are not
actually set, the next scheduled run goes red. Fix: set them (repo Settings →
Secrets and variables → Actions), or — if the stakeholder decides to remove the
dormant backend — remove the step along with it.

**Triage:** open the failed run → "Purge past rides weeks" step → read the
`::error::` line. It says which of: missing secrets, request failed (check the
Cloudflare deployment / `PURGE_KEY` matches the Cloudflare env var → 401), or
unexpected response body.

## Rollout checklist — DROPPED (DL-042)
The pilot/rollout plan in `docs/superpowers/plans/2026-09-04-rides-slice-a.md`
("Integration & rollout") will not happen; the front end is removed. Kept only
as the record of the original one-time setup steps (KV namespace, env vars,
rate-limit rule, GitHub secrets).

## If/when the stakeholder decides to remove the backend (NOT decided)
Checklist only — **do not execute without explicit stakeholder approval**
(approval-gates: destructive / hard to reverse). Order matters:
1. **Empty KV first.** Ride rows only age out via the purge. Either leave the
   purge step running until KV is empty (no UI writes now, so ≥ 1 week after
   deploy of DL-042 is enough; verify with `npx wrangler kv key list
   --namespace-id <id>`), or wipe KV manually. Rows hold minors' names — do not
   strand them by removing the purge step first. **Re-check KV is empty with
   `wrangler kv key list` right before deleting anything, not only at decision
   time** — the endpoints are still public, so a stale open tab running old
   client code could have written a row since (see "Open risks while dormant").
2. Remove the "Purge past rides weeks" step from `.github/workflows/build.yml`
   (it fails the run loudly since DL-043 — if the backend or the secrets go and
   this step stays, every scheduled run goes red).
3. Remove the `functions-tests` CI job (or trim it to site smoke only — the site
   smoke test also runs there) and the Functions tests (47) with `functions/`.
4. Delete the Cloudflare Pages Functions (`functions/api/**`, `functions/_lib/**`).
5. Unbind and delete the `RIDES_KV` namespace (Production + Preview bindings).
6. Delete the 3 Cloudflare env secrets (`MANAGER_PASSPHRASE`, `SITE_ORIGIN`,
   `PURGE_KEY`) and the 2 GitHub secrets (`PURGE_KEY`, `RIDES_API`).
7. Update `docs/architecture.md`, `docs/known-constraints.md`, this runbook
   (delete it or mark it historical) and log a new DL entry.
