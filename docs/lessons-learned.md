# Lessons Learned

## LL-001 — Analyze the real export before designing the parser
- **Date:** 2026-09-02
- **Context:** Discovery started from the idea; the concrete rules only became
  clear after loading `diary_export_1788335639564.xlsx`.
- **What we learned:** The file revealed issues the concept discussion missed —
  malformed times (`16:010`), junk rows (`"חור בגרב"`), non-basketball rows,
  hyphens inside team names (`א-ב`, `(ג-ד)`), and same-team spelling variants.
- **Apply:** Never finalize parsing logic from a description. Re-check the rules
  against each new weekly file; keep golden fixtures.

## LL-002 — `startTime`/`endTime` columns are not trustworthy; `dateString` is
- **Date:** 2026-09-02
- **What we learned:** `startTime` had malformed values in the sample.
  `dateString` is a clean ISO8601 value with offset.
- **Apply:** Derive start from `dateString`. Repair-or-flag `endTime`.

## LL-003 — Console encoding hides Hebrew on Windows
- **Date:** 2026-09-02
- **What we learned:** Printing Hebrew from a Python one-liner to the Windows
  console showed `?????`. Writing UTF-8 JSON to a file and reading that worked.
- **Apply:** For Hebrew data inspection, dump to a UTF-8 file, don't print.

## LL-004 — Always check where the "export" actually comes from
- **Date:** 2026-09-02
- **Context:** The whole plan assumed a weekly Excel download as the only
  source. Inspecting the club site's network traffic showed the diary is a
  public Google Calendar; the Excel is a client-side dump of it.
- **What we learned:** Reading the calendar API directly is free, automatic,
  cleaner, and gives stable event IDs for precise change detection. One hour of
  looking at the real site removed the app's only manual step.
- **Apply:** Before building an importer for a file, inspect the source site's
  requests (DevTools / network log) for an underlying API or feed.

## LL-005 — Naive substring replace for "protected" tokens corrupts real separators
- **Date:** 2026-09-02
- **Context:** `parse_title` protects age-range tokens (`א-ב`, `ה-ו`, …) so the
  hyphen inside them is not used as the team/coach split point. First
  implementation did `text.replace("א-ב", …)`.
- **What we learned:** `בית אלפא-בן רצין` contains the substring `א-ב`
  (end of "אלפא" + hyphen + start of "בן"), so the real separator hyphen got
  protected and the coach was swallowed into the team name.
- **Apply:** Match "standalone" tokens only — bounded by non-letters
  (`(?<![^\W\d_])א-ב(?![^\W\d_])`). Added a regression test.

## LL-006 — The keyless `.ics` feed is a faithful stand-in for the API
- **Date:** 2026-09-02
- **Context:** Needed an offline test fixture but have no API key yet.
- **What we learned:** Filtering the public `.ics` feed to the sample week gives
  exactly 215 events with per-day counts, distinct-summary count (150) and
  distinct-location count (41) identical to both the Excel export and the
  `docs/mvp-spec.md` sample facts. The `.ics` feed carries `UID`, `SEQUENCE`,
  `LAST-MODIFIED`, `STATUS` — enough to mimic the API item shape.
- **Apply:** The `.ics` fallback in `calendar_source.py` is a real fallback, not
  a downgrade. Still re-capture from the API once the key exists, to confirm the
  `id` field maps cleanly.

## LL-007 — Console still mangles Hebrew; inspect via files
- **Date:** 2026-09-02
- **Context:** Re-confirmed LL-003 while debugging the parser on Windows.
- **Apply:** All parser inspection during this phase wrote UTF-8 report files to
  the scratchpad and read them back, never printed Hebrew to the terminal.

## LL-008 — Pin the one non-deterministic value so output is byte-stable
- **Date:** 2026-09-02 (Phase 2)
- **Context:** The build must produce byte-identical JSON for identical input so
  "commit only if changed" actually works and the diff stays quiet.
- **What we learned:** Everything is naturally deterministic except
  `generated_at`. Making it a caller-supplied parameter (`--now`), sorting every
  output array on a stable key, and serialising with `sort_keys=True` +
  fixed indent + trailing newline was enough. Tests pin `--now` and compare
  whole files.
- **Apply:** Isolate the clock/RNG at the edge; pass it in. Never sprinkle
  `datetime.now()` through the pipeline.

## LL-009 — A golden fixture is the cheap regression anchor for a second data source
- **Date:** 2026-09-02 (Phase 2)
- **Context:** Phase 4 adds an Excel importer that must produce the *same*
  normalized sessions as the calendar path.
- **What we learned:** Locking `tests/fixtures/expected_sessions.json` now (the
  full 215-session normalized output over `calendar_week.json`) means Phase 4
  just has to match it modulo the `id` field — no re-litigating parser
  behaviour.
- **Apply:** When two code paths must agree, freeze the shared output as a
  fixture from the first path before building the second.

## LL-010 — Build the front-end against the real JSON, not the spec's example
- **Date:** 2026-09-02 (Phase 3)
- **Context:** `docs/mvp-spec.md` §6 shows `"notes":null` in the `schedule.json`
  example, which reads like "string or null".
- **What we learned:** In the real generated data `notes` is **an array of
  strings** (e.g. `["משחק אימון","יריב: עמק יזרעאל"]`) or `null`, and `flags` is
  likewise an array or `null`. `coach_text` can be `null` (games). One team has
  an empty `coaches` list. Building straight from the spec example would have
  rendered `[object Array]` or crashed on `.join`.
- **Apply:** Open `public/data/*.json` and trace real records before writing any
  renderer. The site now normalizes both scalar and array forms defensively.

## LL-011 — A tiny DOM shim beats "I can't test the browser"
- **Date:** 2026-09-02 (Phase 3)
- **What we learned:** ~120 lines of a fake `document`/`localStorage`/`fetch`
  let the whole `app.js` render path run under Node against the real data files,
  catching sort/format/boundary bugs without a browser. Visual/RTL/contrast
  checks still need a real device, but logic is verifiable in CI-style.
- **Apply:** For no-build vanilla front-ends, keep a headless smoke harness.

## LL-012 — Web Share / clipboard APIs need feature detection AND a fallback path
- **Date:** 2026-09-02 (Phase 3, export/share)
- **Context:** Added "share this week" / "copy" / "share my teams link" actions.
- **What we learned:**
  - `navigator.share` exists only on mobile + a few desktop browsers, only over
    HTTPS (or `localhost`), and **throws** `AbortError` when the user dismisses
    the sheet — that must be caught and ignored, it is not an error.
  - `navigator.share({ files })` is gated separately behind
    `navigator.canShare({ files: [...] })`; check it before calling.
  - `navigator.clipboard.writeText` also needs a secure context; keep the old
    hidden-`<textarea>` + `document.execCommand('copy')` fallback.
  - Node 20+ defines a global `navigator` (no `.share`, no `.clipboard`), so
    guard on the method, not on `typeof navigator`.
- **Apply:** For any Web Share / clipboard use: feature-detect the specific
  method, wrap in try/catch, swallow `AbortError`, and always have a
  copy-link / open-`wa.me` fallback so desktop users are not stuck.

## LL-013 — RTL text on `<canvas>` is drawn, not laid out — anchor from the right
- **Date:** 2026-09-02 (Phase 3, "save as image")
- **Context:** `drawWeekImage()` renders the week to a PNG with no library.
- **What we learned:** `fillText` does not do paragraph layout or bidi
  reordering. For Hebrew you set `ctx.direction = 'rtl'` + `ctx.textAlign =
  'right'` and draw each line from a fixed right-margin x; you still position
  every element (dots, sub-lines) yourself and truncate long strings manually
  with `measureText`.
- **Correction (found in browser QA):** mixed Hebrew+digits does NOT
  "just work". A numeric range like `13:00–15:00` inside an RTL `fillText` call
  gets bidi-reordered to `15:00–13:00` (the two number groups swap around the
  dash). Fix: wrap each numeric run in a Unicode LTR isolate,
  `'⁦' + s + '⁩'` (`ltrIsolate()` in `app.js`) — canvas honours it.
  For a date range, we sidestepped it entirely by printing the spelled-out
  month form (`weekRangeLabel`, same as the app header) instead of `d/m–d/m`.
- Canvas glyph shaping still depends on the browser's font stack — verify Hebrew
  visually; it cannot be asserted in the headless harness (which stubs the 2D
  context).
- **Apply:** Keep hand-drawn canvas layouts flat and single-pass; pre-measure
  rows for height; wrap every time/number span in `ltrIsolate`; verify Hebrew
  visually.

## LL-014 — ICS is picky: CRLF, escaping, folding, stable UIDs
- **Date:** 2026-09-02 (Phase 3, "add to calendar")
- **What we learned:** A hand-built `.ics` must use `\r\n` line endings, escape
  `\ ; , \n` in text values, fold lines longer than 75 **octets** (not chars —
  Hebrew is 2 bytes/char in UTF-8) with `\r\n ` continuations, and give each
  VEVENT a stable `UID` so a re-imported updated file replaces the event instead
  of duplicating it. Emitting `DTSTART`/`DTEND` as UTC `...Z` instants avoids
  shipping a VTIMEZONE block.
- **Apply:** Reuse the `icsEsc` / `foldLine` / `icsStamp` helpers in `app.js` if
  a server-side per-team ICS feed is built in Phase 5.

## LL-015 — A plan step added a helper that already existed → duplicate definition
- **Date:** 2026-09-02 (Phase 3, current-week earlier-days toggle)
- **Context:** The implementation plan for the earlier-days toggle told Task 1 to
  "add `groupByDate`" to `public/app.js`.
- **What we learned:** The function already existed (added with the export
  builders in a5e237f). The implementer followed the brief verbatim, producing
  two identical definitions. Caught in task review; removed in fix commit
  a5aa765.
- **Apply:** A plan/brief that introduces a helper must first `grep` the target
  file for that name. Reviewers should treat "new function with a common name"
  as a duplicate-check trigger. Applies to writing-plans and any brief that adds
  named functions to an existing file.

## LL-016 — GitHub Pages: public repo, Actions not branch-mode, one workflow
- **Date:** 2026-09-02 (Phase 3 deploy)
- **Context:** Enabling the daily cron + deploying the static site to GitHub Pages.
- **What we learned (each a wall we hit):**
  - **Free GitHub Pages needs a *public* repo.** A private repo shows only
    "Upgrade or make this repository public"; Pro (~$4/mo) would break the
    $0/month rule. Cloudflare Pages is the private-repo alternative. Stakeholder
    chose public — nothing sensitive is in the repo (API key is an Actions
    secret; no user data).
  - **Branch-mode Pages can only serve repo root or `/docs`.** The site is in
    `public/` and `/docs` holds the PM docs — so deploy via **GitHub Actions**
    (`upload-pages-artifact` on `public/` → `deploy-pages`), no file moves.
  - **`actions/configure-pages` can't create the Pages site from a private repo**
    — first run failed `Resource not accessible by integration`. Fix: go public,
    then Settings → Pages → Source = "GitHub Actions" once by hand.
  - **A `GITHUB_TOKEN` push does not trigger other workflows.** So a separate
    `on: push` deploy workflow would never fire after the build job commits data.
    Solution: **one workflow, two jobs** — `build-data` (cron/manual only) then
    `deploy` (`needs: build-data`, fresh `main` checkout).
  - **Scheduled workflows auto-disable after 60 days of repo inactivity.** Quiet
    weeks (no schedule change ⇒ no data commit) can pause the cron. Added a
    monthly keepalive commit to `.github/keepalive.log`.
- **Apply:** For any static-site-from-a-subfolder on GitHub Pages: public repo,
  Actions deploy, single workflow, keepalive. See DL-026.
- **Superseded on the host choice by DL-028** — site moved to Cloudflare Pages
  2026-09-04; GitHub Pages retired.

## LL-017 — A "site is broken" report was correct behaviour over sparse data
- **Date:** 2026-09-02 (post-launch)
- **Context:** A parent reported "I only see the remaining days of the week, not
  the full week."
- **What we learned:** The site had **no** past-day filtering — it rendered every
  day present in `public/data/schedule.json`. The current week genuinely had
  almost no sessions on Sun–Tue (season started mid-week; 3 / 3 / 0 sessions
  across *all* teams, then ~46 on Wednesday). The "bug" was the club's calendar.
  Reproducing against the committed JSON (per-day counts) showed this in a minute
  and stopped a pointless hunt through `app.js`.
- **Apply:** For any user report about what the live site shows, first reproduce
  against `public/data/*.json` (and, if needed, the calendar) before reading the
  renderer. The source data is dirty and sparse by nature — assume the data
  before assuming the code. (Extends LL-010.)

## LL-018 — Headless-harness test blocks: block-scope them, and fake the clock
- **Date:** 2026-09-02 (earlier-days toggle)
- **Context:** `tests/site_smoke.js` runs the whole real `app.js` inside one
  `(async () => { … })()` with many `const` locals. New test code was added as
  bare `{ … }` blocks using `var`.
- **What we learned:**
  - `var` in a nested `{}` hoists to the function scope and **collides** with an
    existing `const` of the same name — Node throws `SyntaxError: Identifier
    'other' has already been declared` and the *entire* harness fails to parse,
    so you see neither RED nor GREEN. Use `const`/`let` inside the block (it is
    modern Node, not `app.js`); a block-scoped `const other` legally shadows an
    outer one.
  - To test "today"-dependent logic, inject a clock: `class FakeDate extends
    Date` that returns a fixed instant for `new Date()` only when an override is
    set (default = real time, so existing tests are untouched), installed as
    `global.Date` before `require('app.js')`, built from **local** noon so
    `todayYmd()`'s local getters round-trip, and reset to `null` (plus restore
    any followed-team state) before the pre-existing test sections run.
- **Apply:** Extend the smoke harness with self-contained `{ const … }` blocks;
  add the `FakeDate` seam whenever a feature branches on the current date.
  (Extends LL-011.)

## LL-019 — `[skip ci]` in an auto-commit silently disables Cloudflare Pages deploys
- **Date:** 2026-09-04 (hosting migration, caught in whole-branch review)
- **Context:** `fetch_and_build.py` tagged its twice-daily data commit
  `[skip ci]` to stop GitHub Actions re-triggering. After moving hosting to
  Cloudflare Pages (DL-028), deployment is driven by the push webhook — and
  Cloudflare Pages' git integration ALSO treats `[skip ci]` (and `[ci skip]`,
  `[no-ci]`, `[skip-ci]`, case-insensitive) as "do not build".
- **What we learned:** the migration would have shipped a live site frozen at
  merge time — no error, no signal. Fix: tag the commit `[skip actions]`
  instead (GitHub honours it, Cloudflare ignores it). When a deploy trigger
  changes platform, re-check every commit-message convention against the new
  platform's skip rules.
- **Status:** Fixed on `feature/hosting-migration-cloudflare` before merge.

## LL-020 — `@cloudflare/vitest-pool-workers` 0.5.x breaks on a repo path with a space
- **Date:** 2026-09-04 (rides Slice A, Task 1)
- **Context:** The plan pinned `vitest ^2.1` + `@cloudflare/vitest-pool-workers
  ^0.5`. On the Windows dev box the repo lives at
  `C:\Users\USER\Documents\Claude\team schedule\` — a path with a space. The
  0.5.x pool passes a `file:` module URL where workerd expects a path and the
  `%20` from the space makes workerd report `No such module ".../vitest/dist/
  file:/C:/.../team%20schedule/.../threads.js"`. No test ever runs.
- **What we learned:** Upgrading to `@cloudflare/vitest-pool-workers 0.8.19` +
  `vitest ~3.1` fixes the resolution (18 `_lib` tests green). Newer still (pool
  0.22 / vitest 4) drops the `/config` export and pulls vite 8 — not worth it.
  `vitest.config.js` also needs an explicit `miniflare.compatibilityDate` and
  `compatibilityFlags: ["nodejs_compat"]` or the pool refuses to start.
- **Apply:** Rides Functions tests use `vitest ~3.1` + `pool-workers 0.8.19`.
  Keep the config's `compatibilityDate`/`nodejs_compat`. If CI (Linux, no space
  in path) ever diverges, the space is the variable. A space-free dev checkout
  also sidesteps it.

## LL-021 — A plan's verbatim tests and verbatim implementation can contradict each other
- **Date:** 2026-09-04 (rides Slice A, Task 3)
- **Context:** `docs/superpowers/plans/2026-09-04-rides-slice-a.md` Task 3 supplies
  both the test files and the endpoint code as copy-paste blocks. The test
  fixtures use player tokens as short as 4 chars (`mine`, `wipe`, `capper`,
  `deltok`, `other`); the supplied `request.js` / `me.js` define
  `isToken = /^[A-Za-z0-9_-]{8,128}$/`. Four tests failed on first run — the
  validator rejected the plan's own fixtures.
- **Root cause:** The plan author hand-wrote illustrative fixture strings without
  running them against the validator in the same task. Real tokens from
  `mintPlayerToken()` are always 32 url-safe chars (Task 2 tests already assert
  `{32,}`), so the `{8,128}` lower bound is sound for real traffic — only the
  fixtures were wrong.
- **Failed path:** Pasting both blocks verbatim and expecting green.
- **Working path:** Kept the stricter validator (better input hygiene, matches
  real 32-char tokens), widened the five fixture tokens to ≥8 chars
  (`minetok01`, `wipetok01`, …). Recorded inline in the plan and in the commit
  message; confirmed with a user approval gate before deviating.
- **Rule for future work:** When executing a plan that ships tests *and*
  implementation as verbatim blocks, sanity-check the fixture values against the
  validators/regexes in the same task before running — treat a mismatch as a
  plan bug to raise, not a repo bug to hunt. When deviating from a verbatim
  plan, get approval and leave a trail in the plan + commit. (Extends LL-015.)
- **Scope:** reusable (applies to superpowers:executing-plans /
  subagent-driven-development on any project).

## LL-022 — Doubled `/api/api/...` prefix shipped to production; the test stub's `indexOf` masked it
- **Date:** 2026-09-04 (rides Slice A, live QA after merge)
- **Context:** First live test of player mode on `gilboa-schedule.pages.dev`
  after merging Rides Slice A: entering a name and saving failed with
  "לא הצלחנו לשמור, נסו שוב". Network inspection showed the request went to
  `POST /api/api/token` (405), not `/api/token`.
- **Root cause:** `rides.js`'s `apiBase()` returned `origin + '/api'`, but
  every call site in `rides.js` already did `apiBase() + '/api/token'` /
  `'/api/me'` / `'/api/request'` / `'/api/ping'` — doubling the prefix.
  `manager.js` has the *correct* convention (its `apiBase()` returns the
  origin only, with a comment saying so) and every call site there appends
  `/api/...` itself — `rides.js` simply diverged from it.
- **Why 47+all-suites-green missed it:** `tests/site_smoke.js`'s `fetch`
  stub matched requests with `url.indexOf('/api/token') !== -1` —
  substring matching that is *also true* for `/api/api/token`. Worse, one
  assertion (`R.apiBase() === 'http://localhost:8000/api'`) directly
  encoded the buggy value as the expected one, so the test suite actively
  certified the wrong behaviour. Cloudflare Functions tests, `pytest`, and
  `manager_smoke.js` never exercise `rides.js` against a real router, so
  none of them could have caught it either.
- **Found by:** manually walking the live site end-to-end (role switch →
  consent → name → save) right after merge, per this project's "test the
  golden path in a browser before calling it done" habit — not by any
  automated suite.
- **Fix:** `apiBase()` in `rides.js` now returns the origin only, matching
  `manager.js`. The `site_smoke.js` stub now resolves the exact `pathname`
  (via `new URL(url, ...).pathname`) instead of substring-matching, and
  rejects any unhandled `/api/*` path instead of silently returning `200` —
  so a wrong path fails loudly instead of coincidentally passing.
- **Apply:**
  - A fetch/HTTP mock keyed by `indexOf`/`includes` on a URL string will
    match a doubled or extra path segment. Match on the parsed `pathname`,
    with `===`, not a substring test.
  - When two files each implement the same helper (`apiBase()` in both
    `rides.js` and `manager.js`), diff them against each other, not just
    read each in isolation — the correct one existed in the same PR.
  - A green test suite is not a substitute for opening the actual deployed
    app and clicking through the real flow at least once before calling a
    feature done — this is already this project's stated practice for UI
    changes; this bug is the concrete case that justifies it.

<!-- Template
## LL-NNN — <title>
- **Date:**
- **Context:**
- **What we learned:**
- **Apply:**
-->
