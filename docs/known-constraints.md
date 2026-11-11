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
**Update 2026-11-11 (DL-045):** the *name shown on screen* is now **הפועל העמק**
(stakeholder instruction). The rule above still applies to references to the
real club/organisation; the app's own title/header/share/export strings use the
new name.

## Hosting / runtime
- **Host = Cloudflare Pages** (git integration, no build command, output dir
  `public/`), connected to `Rankad/team-schedule`, production branch `main`.
  Live at `https://gilboa-schedule.pages.dev`. Deploys automatically on every
  push to `main`. See DL-028 (amends DL-026).
- **Cloudflare account:** owned by the stakeholder. The Pages project is
  `gilboa-schedule`. Custom domain deferred (rides spec OQ-4) — the `*.pages.dev`
  URL is the canonical link for now.
- **Secrets:** `GOOGLE_CALENDAR_API_KEY` is a **GitHub Actions** secret only.
  The static site needs no Cloudflare secrets. (The old rides backend secrets
  were deleted by hand 2026-11-11 — see "Rides backend removed (DL-046)" below.
  `GOOGLE_CALENDAR_API_KEY` is the only secret left; do not delete it.)
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

## Rides backend removed (DL-046, 2026-11-11)
The rides front end (DL-042) and backend (DL-046: `functions/`, the purge step,
the Functions tests) are both gone from the repo. The site makes zero `/api/*`
calls. History: git (PRs #2, #5, #6), `docs/rides-spec.md`, DL-029 to DL-043.
- **Manual cleanup complete (2026-11-11; PR #9, `948b8a9`).** The stakeholder
  removed the Cloudflare KV binding `RIDES_KV`, deleted the secrets
  `MANAGER_PASSPHRASE`, `SITE_ORIGIN`, `PURGE_KEY` and the `RIDES_KV` namespace,
  and deleted the GitHub secrets `PURGE_KEY`, `RIDES_API`. Verified: prod HTTP
  200, `POST /api/token` returns 405, data build run #193 SUCCESS. Archive:
  `docs/RIDES.md` section 1.
- **No personal data is stored anywhere.** The privacy/legal
  items (OQ-2 contact placeholder, PPL / Amendment 13 opinion) are permanently
  moot unless the feature is rebuilt.
- **The only secret left is `GOOGLE_CALENDAR_API_KEY`** (GitHub Actions). Do not
  delete it along with the two rides secrets — the data build needs it.
- `clearLegacyRidesKeys()` in `public/app.js` stays to clean old devices. After
  Cloudflare redeploys, `/api/*` returns the SPA fallback (HTML 200); a stale
  open tab just gets HTML.
- The `functions-tests` CI job keeps its old name on purpose (required-status
  checks) and runs only the site smoke test. `build.yml` path filters still list
  `"functions/**"` (harmless).
- **Resolved, no longer risks:** "backend not write-quiescent" and "purge failure
  invisible" (DL-042/043) — nothing is left to write to or purge. The Miniflare
  KV-race note and the retired player-mode entries (DL-035/037, DL-041) went
  with the feature; see DL-029 to DL-043 for the history.
- No Cloudflare edge rate-limit rule was ever set up (DL-032); none to remove.

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

## Hide a training / add a game (DL-044)
- **(a) Hiding is by position within the day.** Team trains 17:00 + 19:00 on a
  Tuesday; parent hides the 17:00. In a week where only the 19:00 exists, it
  becomes "#1" and is hidden. The chip badge / tap restores all. Only 2 teams in
  current data train twice in a day.
- **(b) Per phone.** Hides and games are in localStorage (`gilboa.hidden`,
  `gilboa.games`): not carried by the `?teams=` share link, erased by clearing
  browser data; games older than 60 days are pruned.
- **(c) Games window.** Games can be added only for published weeks −7 … +13
  days.
- **(d) Old browsers, `.ics` only.** Without Intl `longOffset`/`short` offsets
  the exact Israeli DST rule is used; a game starting 00:00–02:00 on a
  DST-change night could be an hour off in the `.ics` (not on screen).
- **(e) Keyboard.** The ✕ toggle radio group has no arrow-key roving — Tab stops
  only.
- **(f) Colour.** The hidden-count badge uses accent red: informational, not a
  status colour (consistent with DL-037).
- **(g) Summary wording.** A club `activity_type:'game'` row now counts as
  "משחק" (not "אימון") in the footer summary.
- **Testing:** the smoke test's fake DOM returns arrays, not NodeLists — new DOM
  code needs a real-browser pass (LL-029).

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
- **Identifiers keep the `gilboa` spelling on purpose (DL-045)** — invisible to
  users, do not rename casually: localStorage keys `gilboa.*` (renaming wipes
  every user's followed teams), ICS `PRODID:-//gilboa-maayanot//…` and
  `UID …@gilboa-schedule`, the `gilboa-schedule.pages.dev` URL, code comment
  headers. Data-derived names (`מעלה גלבוע`, `הרי הגלבוע`) are real
  team/location names, not branding.
