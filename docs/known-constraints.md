# Known Constraints

## Data source
- The club's "weekly diary" (`/public/diary/weeklydiary`) is a front-end over a
  **public Google Calendar**
  (`mpkua0beq2409vncahis6t8tuo@group.calendar.google.com`). The "Export as
  Excel" button is a client-side dump of that calendar.
- Primary source = Google Calendar API v3 `events.list` with **our own** free
  API key (public-calendar reads, no billing). Keyless fallback = the public
  `.ics` feed. Manual fallback = the Excel export.
- Neither the calendar schema nor the Excel schema is documented; either could
  change without notice. The build job must fail loudly (non-zero exit,
  visible in the Action log), never publish partial/garbage data.
- The event `summary` (and Excel `title`) is human-entered and dirty:
  - Trailing / duplicate spaces in `location` and the title.
  - Title mixes team name + coach(es) + free-text notes with inconsistent
    separators (`-`, ` - `, `/`, parentheses).
  - Spelling / spacing variants of the same team and same coach.
  - Junk entries seen: `"חור בגרב"`, `"אולם … תפוס"`.
  - Non-basketball activities (volleyball, judo, gymnastics) share the calendar.
  - Excel-only: malformed times `8:010`, `9:010`, `16:010` (an export artifact;
    the calendar API returns clean RFC3339 datetimes). `description` always
    empty.
- Only one week of real data analyzed so far (02–08/09/2026). Parser rules are
  provisional until several weeks have been processed.

## Do not reuse the club's API key
An API key is exposed in the club's front-end. Do not use it. Generate our own
free Google Cloud API key and store it as a GitHub Actions secret
(`GOOGLE_CALENDAR_API_KEY`), or use the keyless `.ics` feed.

- 2026-09-02: stakeholder created our own dedicated Google Cloud API key
  (confirmed not the club's). To be stored only as the `GOOGLE_CALENDAR_API_KEY`
  Actions secret — never committed. It briefly landed in a local-only commit
  during the Phase 1 build, was purged before any push, and history was verified
  clean; rotation optional since it never left the machine.

## Timezone
All source times are Asia/Jerusalem (`+03:00` in the sample, DST-dependent).
Always display in Israel local time; never assume the runner's timezone.

## Language / layout
Hebrew content, right-to-left UI required. Mixed Hebrew/Latin (coach names, club
abbreviations like `ת"א`) must render correctly.

## Club name
The club is **גלבוע מעיינות** (English: "Gilboa Maayanot"). It is **not** a
"מכבי" club — do not prefix "מכבי". Confirmed by the stakeholder 2026-09-02 after
a build guessed "מכבי מעיינות הגלבוע". Use the exact string "גלבוע מעיינות" in
UI. Never invent proper nouns — take them from the stakeholder or the source.

## Hosting / runtime
- **Host = Cloudflare Pages** (git integration, no build command, output dir
  `public/`), connected to `Rankad/team-schedule`, production branch `main`.
  Live at `https://gilboa-schedule.pages.dev`. Deploys automatically on every
  push to `main`. See DL-028 (amends DL-026).
- **Cloudflare account:** owned by the stakeholder. The Pages project is
  `gilboa-schedule`. Custom domain deferred (rides spec OQ-4) — the `*.pages.dev`
  URL is the canonical link for now.
- **Secrets:** `GOOGLE_CALENDAR_API_KEY` is a **GitHub Actions** secret only.
  The static site needs no Cloudflare secrets. (The dormant rides backend has
  its own Cloudflare environment secrets — see "Rides backend (dormant)" below;
  not part of hosting.)
- The Python build + commit still runs on GitHub Actions
  (`.github/workflows/build.yml`, job `build-data`), three times daily
  (`0 5,13,17 * * *` UTC ≈ 07:00/15:00/19:00 Jerusalem winter, DL-033). GitHub
  disables scheduled workflows after 60 days of repo inactivity — the periodic
  data commits plus `keepalive.yml` keep it alive.
- GitHub Pages is retired; `rankad.github.io/team-schedule/` serves a redirect
  to the Cloudflare URL (`legacy/`, one-off `deploy-legacy-redirect` job).
- No user accounts ⇒ followed-team selection is per-device (`localStorage`) and
  lost if browser storage is cleared.
- The site only knows the calendar window the job fetches (rolling
  ~today−7d … today+28d).

## Distribution (v0.3)
- WhatsApp delivery likely needs WhatsApp Business API (cost, approval, phone
  provisioning) — not committed. A free interim option: a "share to WhatsApp"
  (`wa.me`) button that opens the parent's own WhatsApp with the schedule text.
  Email / ICS feed are other light options.

## Courtesy
It is the club's own public parent calendar, so reading it for parents is
benign. The club was told about the app and approved it (OQ-6, 2026-09-02) —
the link may be shared with parents. If they make the calendar private or
switch systems, fall back to the Excel importer.

## Environment
- Development on Windows 11, PowerShell primary shell. Scripts must work there
  and in the Linux GitHub Actions runner.
- Git repo initialized 2026-09-02 (`main` branch). Remote: `origin` →
  `github.com/Rankad/team-schedule` (private). `.gitattributes` forces LF endings
  so Python scripts behave identically on Windows and the Linux runner.
- Python pinned to 3.13 locally and in CI. `zoneinfo` (stdlib) needs the
  `tzdata` package on Windows — it is pulled in transitively; keep an eye on it
  if imports fail on a clean machine.

## Parser / naming (discovered building Phase 1)
- The `.ics` feed's event `LOCATION` and `SUMMARY` still carry trailing spaces
  and dash variants exactly like the Excel — cleaning (`clean.py`) is required
  for both sources.
- Tier detection knows `לאומית` / `ארצית` / `מחוזית` (substring) and `על`
  (premier league, standalone word only — DL-013, added at the Phase 1 gate).
- `הפועל העמק` is an external club that appears as a *left-side* (team) name.
  Per DL-014 it is intentionally kept as a followable team (`T_042`), still
  flagged `team_name_has_club_token` so it can be relabelled later.
- Team identity = identical *words* only (DL-012). Word-order / filler-word
  variants (`טרום גוש חרוד` vs `טרום קט סל גוש חרוד`, `רימון` vs `רימון בנים`,
  …) are DIFFERENT teams by stakeholder ruling — not merged. If two really are
  one team, the club should make the calendar text identical.
- `data/teams_registry.json` committed is still a **seed** built from the single
  sample week; `T_NNN` numbering is only locked once Phase 2 runs against live
  data. Safe to delete and regenerate until then.

## Rides backend (dormant since DL-042, 2026-11-11)
The rides **front end is removed** (player mode, manager page, privacy screen);
the site makes zero `/api/*` calls and collects no personal data. The backend
below is still deployed and **must not be deleted casually** — whether to remove
it is an OPEN stakeholder decision (DL-042; checklist in `docs/RIDES.md`).
- **No privacy screen / consent text any more** — they only described ride data,
  and nothing is collected. Legacy player data on devices is wiped by
  `clearLegacyRidesKeys()` on load.
- **Purge still runs** (`build.yml` "Purge past rides weeks"). It is the last
  step of the `build-data` job, which runs 3×/day (cron `0 5,13,17 * * *`,
  DL-033) or on manual dispatch. `POST /api/purge` deletes every `week/<wk>/*` KV
  key whose week-Sunday is before the current week's Sunday
  (`functions/_lib/purge.js`), so a ride row lives at most about a week. It is the
  only thing that ages out ride rows left in KV.
- **KV-wipe caveat before any backend removal:** deleting the Functions, the
  `RIDES_KV` namespace or the purge step does not clear existing rows by itself.
  Either let the purge run until KV is empty (≥ 1 week after the last write —
  and no UI writes now) or wipe KV manually, **before** removing the purge
  step / secrets. Removing the purge step first would strand rows that contain
  minors' names.
- **KV namespace `RIDES_KV`** is bound to the `gilboa-schedule` Cloudflare Pages
  project (Production **and** Preview) — dashboard/`wrangler` step, not
  committed anywhere.
- **Three Cloudflare env secrets** (Production + Preview):
  `MANAGER_PASSPHRASE` (generated, gates `/api/manager/*` — **unused now, no
  manager page**), `SITE_ORIGIN`
  (CORS allow-origin + the origin Functions fetch `data/schedule.json` /
  `data/teams.json` from), `PURGE_KEY` (required `X-Purge-Key` header on
  `POST /api/purge`). None are committed or shipped to the client. See
  `docs/RIDES.md`.
- **Two GitHub Actions secrets:** `PURGE_KEY` (same value as above) and
  `RIDES_API` (= `https://gilboa-schedule.pages.dev`) — read by
  `.github/workflows/build.yml` to call the purge endpoint after each
  scheduled rebuild (three times daily). **Both must actually be set (DL-043):**
  if either is missing the purge step fails the run (`::error::` + exit 1) and
  the scheduled run goes red. Fix: set them in repo Settings → Secrets, or
  remove the purge step together with the dormant backend (OPEN decision).
- **Minors' PII / legal review — MOOT while dormant (DL-042).** Ride requests
  stored a named minor's full name + practices + direction (rides-spec §8.2,
  §8.5). With the front end gone nothing new is collected, so the legal opinion
  (PPL / Amendment 13) and the `[contact]` / `[מדיניות פרטיות]` placeholder in
  the consent text (OQ-2) are no longer needed. **They would have to be done
  for real if the feature were ever revived** — and any leftover KV rows should
  be confirmed purged first.
- **No edge rate limiting for the pilot (DL-032).** Cloudflare Rate Limiting
  Rules are per-zone; this account has no zone (the site runs on the shared
  `*.pages.dev` domain, not a custom domain we control — OQ-4 deferred). The
  account-level WAF alternative is a paid Enterprise add-on. Shipped without
  it: write endpoints are still gated by opaque tokens / the manager
  passphrase, and `/api/request` already caps body size + rows-per-token
  (DL-029). Revisit when a custom domain exists, or before club-wide rollout,
  whichever comes first.
- **The KV last-write-wins race is not testable under Miniflare** — it is
  single-threaded/consistent, so concurrent-write behaviour can't be
  reproduced in `functions/**/__tests__` (Vitest). Correctness instead comes
  from the per-row key design (DL-029: each ride request is its own KV key,
  so there is nothing to race on) — verified by code review and the key
  shape, not by a concurrency test. Documented in `docs/qa-checklist.md`
  "Rides backend — security (dormant)" so this known gap isn't mistaken for an
  oversight in a future QA pass.
- **RETIRED by DL-042 (2026-11-11) — moot: player mode no longer exists.**
  *Original entry, kept as history:* **Player mode is one-way; the
  privacy-screen delete is the exit (DL-035, recovery wording reframed by
  DL-037).** There was deliberately no "switch back to parent" toggle and no
  in-app exit from player mode other than the privacy-screen
  `מחיקת נתוני ההסעות שלי` action (clear-site-data as last resort). Both the
  mode and the screen are removed; stale player keys are cleared by
  `clearLegacyRidesKeys()`.
- **RETIRED by DL-041 (2026-11-11): the ride chip was removed, so there is no
  chip left to fumble.** *Original entry, kept as history:* **Shared family
  phone in player mode — stray-tap ride fumble (DL-037, S1;
  documented, not fixed — revisit after the pilot).** A phone left in player
  mode has live ride chips on every session card. Ride writes are save-on-tap
  with `הלוך וחזור` preselected (rides-spec §4.7), so anyone holding the phone
  can, with one stray tap, add a bogus rider under the child's name — or hit
  `ביטול הסעה` and drop a real request. Either way the coordinator headcount the
  feature exists to produce is corrupted. The stakeholder chose to document
  rather than fix for now; revisit after the single-team pilot (candidate fix:
  require an explicit save for NEW requests in the bottom sheet).
- **Rides: no UI creates, shows or calls anything (DL-041 → DL-042,
  2026-11-11).** DL-041 removed the chip + trip-type sheet and left the rest of
  player mode as an OPEN question; DL-042 resolved it by removing the whole front
  end. `PUT /api/request`, the other Functions, the manager endpoints and the
  purge step are dormant-but-intact (47 Functions tests still run in CI). Do
  not delete the backend or its tests until the stakeholder decides (OPEN).
- **The dormant backend is NOT write-quiescent (QA finding, 2026-11-11).**
  `/api/token`, `/api/request`, `/api/ping` and `/api/manager/*` remain publicly
  reachable, so a stale open tab running old client code could still write a ride
  row. Before any backend removal, **re-check KV is empty with `wrangler kv key
  list` right before deleting anything**, not only at decision time
  (`docs/RIDES.md`).
- **RESOLVED by DL-043 (2026-11-11): purge failure is no longer invisible.**
  *History:* after DL-042 removed the dashboard's `lastPurge` footer, the purge
  step (`continue-on-error: true`, `|| echo` fallback, "skipping" on missing
  secrets) could fail silently. Now the "Purge past rides weeks" step — still the
  LAST step of `build-data`, so schedule data is committed and pushed first and a
  red run never loses data — fails the run on: missing `PURGE_KEY`/`RIDES_API`,
  a non-2xx or network error (`curl -fsS --max-time 30 --retry 2 --retry-delay
  5`; `--retry` also retries HTTP 5xx, so up to 3 attempts ≈ 10 s), or a response
  body without `"ok":true`. A red scheduled run emails the repo owner. **If the
  GitHub secrets are not set, the next scheduled run goes red.** Triage: open the
  failed run's "Purge past rides weeks" step; the `::error::` line says missing
  secrets vs request failed vs unexpected body. If the backend is removed, delete
  this step too or CI goes red.

## Testing — tests coupled to live production data (DL-039/040 / LL-027/028)
- `tests/site_smoke.js` has (at least) three cases whose fixture is picked
  dynamically from the **live**, thrice-daily-refreshed
  `public/data/schedule.json` rather than a frozen fixture file: the "which
  Hebrew word form appears in the last published week's summary" case
  (LL-024); the "earlier-days — expander UI" adjacent-week sanity check
  (DL-039 / LL-027); and the "pick the last week's busiest team as the
  general-purpose fixture `T1`" picker (DL-040 / LL-028, 2026-09-21). All
  three have "failed" in CI purely because real schedule content changed (bye
  weeks, holidays, singular vs. plural session counts, or — in the DL-040
  case — a published week with sessions but zero of them team-tagged) — not
  because of an app defect. The third occurrence (DL-040) was also the first
  to **crash the whole script** (uncaught `TypeError`) rather than fail one
  assertion cleanly, because the fixture-picker itself, not just a downstream
  assertion, was invalid. Current state:
  - The adjacent-week case (DL-039/LL-027) skips (logs, doesn't fail) the
    dependent assertions when its precondition doesn't hold that data cycle.
  - The `T1` fixture picker (DL-040/LL-028) now walks `schedule.weeks`
    descending to the first week with ≥1 team-attributed session, and throws
    an explicit, named `Error` immediately if no week in the dataset
    qualifies — rather than picking blindly and crashing several lines later.
  - The general pattern — any test that derives its own fixture from live
    data must either validate the pick before use (fail loudly if nothing
    qualifies) or make downstream assertions conditional, never assume the
    pick is automatically valid — is documented in LL-027 (extended by
    LL-028) and should be applied to any *new* smoke assertion that reads
    `public/data/*.json` directly.

## Known open risk (tracked, not blocking) — week-navigation helpers assume `schedule.weeks` has no gaps
- **Recorded:** 2026-09-21 (DL-040 follow-up, found by QA while reviewing the
  DL-040 fix; not fixed, not a release blocker — dormant in current data).
- Both `gotoWeekIndex()` (pre-existing) and the new `gotoLastWeek()`
  (DL-040/LL-028) in `tests/site_smoke.js` assume `schedule.weeks` is a
  gap-free run of consecutive 7-day weeks, so "index i" and "i next-clicks
  from `weeksSorted[0]`" stay interchangeable. `scripts/build_outputs.py`
  builds `weeks = sorted({s["week_key"] for s in sessions})` — a calendar
  week with **zero sessions of any kind** would silently vanish from that
  array, breaking the no-gaps assumption. QA verified 0 gaps in current
  production data, but also reproduced the failure synthetically (deleted all
  sessions for one middle week) and got two bad outcomes: `gotoLastWeek()`
  silently landing on the **wrong** week while several assertions
  coincidentally still passed (silent false confidence, not a loud failure);
  and the pre-existing `gotoWeekIndex()` crashing with the same
  uncaught-`TypeError` class as the DL-040 bug, in the "earlier-days —
  expander UI" block.
- **Recommended follow-up (not yet actioned):** make week navigation
  date-based (step by real calendar-day difference ÷ 7) instead of
  index-based in both helpers; or, cheaper, add an assertion near the top of
  `site_smoke.js` that `schedule.weeks` is consecutive, gap-free, 7-day
  Sundays, failing loudly (per this project's "fail loudly, never publish
  partial data" principle) if it ever is not. Track alongside any future
  `site_smoke.js` maintenance; revisit sooner if a fully sessionless week is
  ever observed in production data.
- **GitHub Actions log access:** this repo's Actions log **viewer** requires
  GitHub sign-in even though the repo is public, so raw step log text is not
  fetchable via an unauthenticated browser or the plain public REST API. Job
  **conclusions, timing, and the failing `head_sha`** ARE fetchable without
  auth via `api.github.com/repos/<owner>/<repo>/actions/runs...` (and
  `.../actions/runs/<id>/jobs`) — usually specific enough (e.g. a fast ~1s
  failing step name) to reproduce by checking out that exact commit into a
  worktree and re-running the suite locally, without needing the raw log text
  at all.

## Branding (DL-036)
- **Brand assets are self-hosted** in the repo, never hotlinked from
  `gilboamaayanot.co.il`. The club's public logo (`assets/img/logo.png`) is only
  **170×170** — enough for a small header mark and a favicon, not for a 512px
  icon or a crisp `og:image`. The **logo lockup, favicon, web manifest, and
  share-image are deferred** until the club supplies an SVG or ≥512px PNG
  (branding spec §7 Q1). Shipped now: the `#D0212C` accent recolour + text-only
  share tags.
- **Courtesy:** the club approved the app's use of their **logo and colours**
  on 2026-09-06 (branding spec §7 Q3; extends the OQ-6 app approval). The
  deferred logo-asset work above is unaffected — still deferred on the missing
  SVG / ≥512px source, no longer gated on a courtesy note.
