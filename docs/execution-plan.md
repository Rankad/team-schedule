# Execution Plan

Phased, incremental. Each phase ends with something demonstrable and a QA pass
(`docs/qa-checklist.md`). Approval gates per `.claude/rules/approval-gates.md`.

Architecture approved 2026-09-02: read the club's public Google Calendar → a
scheduled GitHub Action runs the parser → static JSON → free static site. No
server, no database, $0/month. See `docs/architecture.md` and
`docs/mvp-spec.md`.

## Phase 0 — Setup
- Goal: buildable repo wired to GitHub.
- Tasks: `git init`; skeleton per `docs/architecture.md`; Python venv + deps
  (`requests`, `icalendar`, `pytest`; `pandas`+`openpyxl` for the fallback);
  `.github/workflows/build.yml` with `workflow_dispatch` only (no cron yet);
  capture `tests/fixtures/calendar_week.json` from the live API for the sample
  week; copy the sample `.xlsx` into fixtures.
- Own Google Cloud API key created; added as secret `GOOGLE_CALENDAR_API_KEY`.
- Done when: `pytest` runs; the workflow runs manually and prints the fetched
  event count.

## Phase 1 — Parser + normalization (TDD)
- Goal: a calendar event / Excel row → clean normalized session.
- Tasks in order: `calendar_source.py` (API + `.ics` fallback, tested against
  the fixture) → `clean.py` → `parse_title.py` (every `docs/mvp-spec.md` §4
  case) → `classify.py` → `resolve.py` (+ `teams_registry.json`).
- Done when: the sample week yields the expected teams / coaches / sessions;
  the §4.5 spelling-variant pairs collapse to one `team_id`; non-team rows are
  typed and excluded from teams.
- **Gate:** review parser output against the real calendar with the stakeholder
  (naming / edge-case sign-off) before Phase 2.

## Phase 2 — Build outputs + change detection
- Goal: produce `public/data/*.json` and a correct change list.
- Tasks: `build_outputs.py` (weeks bucketed by Sunday `week_key`) →
  `diff.py` (match by event `id`, per `docs/mvp-spec.md` §8) →
  `fetch_and_build.py` orchestration + commit-only-if-changed. Lock
  `tests/fixtures/expected_sessions.json`.
- Done when: a run writes valid JSON; re-run with same input ⇒ no diff, no
  commit; a modified fixture ⇒ correct added/removed/time/location changes.

## Phase 3 — Static site (v0.1 complete)
- Goal: a parent finds a team and sees their week on a phone.
- Tasks: RTL single-page UI — My Week + Add Team (team/coach search);
  `localStorage` for followed teams + last-seen `generated_at`; week
  navigation; merged multi-team view; weekly summary; empty states; changes
  banner.
- Done when: `docs/ui-ux-spec.md` screens work against the generated JSON at
  360px; QA checklist passes.
- Enable the cron schedule; deploy to the chosen host (OQ-5).
  ✅ Done 2026-09-02 — GitHub Pages via Actions, daily cron `0 5 * * *` UTC
  (DL-026).
- **Milestone: live, self-updating MVP.** Share with a few parents; tell the
  club (OQ-6).

## Phase 4 — Excel fallback importer
- Goal: resilience if the calendar goes away.
- Tasks: `import_excel.py` → same normalized output; regression test that both
  sources match the golden fixture.

## Phase 5 — Distribution channels (v0.3) — SEPARATE APPROVAL
- Tasks: ~~`wa.me` "share to WhatsApp" button (free, no API); optionally an ICS
  feed per team~~ — **pulled into Phase 3** at stakeholder request (2026-09-02):
  the client-side share/copy/ICS/image exports and the shareable followed-teams
  link now ship with the static site (DL-022..DL-025). Email later. A *server-side*
  ICS **feed** per team (auto-refreshing subscription URL) is still Phase 5.
  Decide any paid WhatsApp mechanism only here. Wide promotion still waits on the
  club courtesy note (OQ-6).

## Progress log
- **2026-09-02 — Phase 0 done** (except the stakeholder tasks in
  `docs/PHASE-0-USER-TASKS.md`: API key, GitHub repo, secret, manual run).
  Repo skeleton, venv + deps, `build.yml` (manual trigger only), fixtures
  (`calendar_week.json` from the `.ics` feed = 215 events; `sample_week.xlsx`).
- **2026-09-02 — Phase 1 done.** `calendar_source.py`, `clean.py`,
  `parse_title.py`, `classify.py`, `resolve.py` + seed
  `data/teams_registry.json` (98 teams from the sample week).
  Non-team split: blocked_hall 3, volleyball 9, judo 1, gymnastics 1, unknown 1.
- **2026-09-02 — Phase 1 gate reviewed; decisions applied.** DL-012 (team
  identity = identical words only; four near-dup pairs locked as separate teams
  by regression tests), DL-013 (`על` added as a tier — T_009 / T_031 / T_032),
  DL-014 (`הפועל העמק` kept as a team). Registry regenerated. 101 tests green.
  **STOPPED again at the gate — Phase 2 not started.**
- **2026-09-02 — Phase 2 done (TDD).** `scripts/build_outputs.py` (weeks
  bucketed by Sunday `week_key`, the four `public/data/*.json` builders,
  canonical deterministic JSON), `scripts/diff.py` (match by event `id`;
  added / removed / time_changed / location_changed / team_changed; non-team
  rows ignored; window-filtered), `scripts/fetch_and_build.py` (orchestration;
  guarded commit — DL-015). Golden fixture `tests/fixtures/expected_sessions.json`
  (215 sessions) locked + reproduction test. `.github/workflows/build.yml`
  updated (runs the real entrypoint + `--commit` + push; still
  `workflow_dispatch` only — no cron). Decisions DL-015/016/017.
  146 tests green. 430-event run ≈ 0.03 s. No live API call — verified offline
  against `calendar_week.json`.
  **Phase 3 NOT started** (no site, no cron, no deploy).

- **2026-09-02 — Phase 3 static site built (NOT deployed, NO cron).**
  `public/index.html` + `public/app.js` + `public/styles.css` — vanilla RTL
  Hebrew, no build step, no framework, no CDN. Two screens: "השבוע שלי" (My Week,
  grouped by day, merged multi-team list with colour dot + team label, weekly
  summary, empty states, week nav ±1 past the published range) and "בחירת קבוצה"
  (team / coach search, substring, whitespace-insensitive). Followed teams +
  last-seen `generated_at` in `localStorage` (`gilboa.*`). Changes banner wired
  (no change entries in the current data, verified with a synthetic fixture).
  Graceful Hebrew error screen on fetch failure. Verified against the real
  `public/data/*.json` (318 sessions / 105 teams / 3 weeks) with a headless DOM
  harness: week ranges, day/time sort, summary hours, coach grouping, follow /
  unfollow, week-nav bounds, changes banner + "seen" all correct. DL-018
  (palette), DL-019 (UX calls). `.github/workflows/build.yml` action versions
  bumped (`checkout@v5`, `setup-python@v6`) — still `workflow_dispatch` only.
  **STOPPED for stakeholder review.** Still open in Phase 3: enable cron, choose
  host, deploy (separate approval gate), then tell the club (OQ-6).

- **2026-09-02 — Phase 3 export/share features added (NOT deployed, NO cron).**
  On branch `phase-3-static-site`. Client-side only, no new deps, still no build
  step / framework / CDN.
  1. **Shareable link** for the followed-teams list: "🔗 שתף את הקבוצות שלי"
     builds `…?teams=<ids>`, copies it + offers `navigator.share`. On load a
     `?teams=` link **merges** (never replaces) known ids into `localStorage`
     then `history.replaceState` strips the query; a toast confirms. (DL-022)
  2. **Weekly view action row** (shown only with ≥1 followed team and ≥1 session
     in the visible week): **📋 העתק** (Hebrew plain-text block, clipboard +
     `execCommand` fallback), **📤 שתף** (`navigator.share`, else copy + `wa.me`),
     **📅 יומן** (hand-built RFC 5545 ICS, UTC-`Z` times, CRLF, folding, stable
     `@gilboa-schedule` UIDs, `Blob` download), **🖼️ תמונה** (hand-drawn RTL
     `<canvas>` PNG — no library — `toBlob` download + `navigator.share({files})`
     on mobile). (DL-023, DL-024, DL-025)
  Pure builders `buildTeamsLink` / `parseTeamsParam` / `applyTeamsParam` /
  `buildWeekText` / `buildICS` / `icsEsc` / `drawWeekImage` exposed on `window`.
  `tests/site_smoke.js` extended (+~25 assertions, canvas + `window.location`
  shims); `node tests/site_smoke.js` green. `pytest` unchanged (1 pre-existing
  failure: `icalendar` not installed in this env — unrelated).
  **STILL: no deploy, no cron, not pushed.** Next: stakeholder review, then the
  deploy/cron approval gate, then tell the club (OQ-6).

- **2026-09-02 — Phase 3 deployed. Daily cron enabled. MVP is LIVE at
  https://rankad.github.io/team-schedule/** (verified: site loads, data JSON
  fetches OK, no console errors). Deploy gate approved by the stakeholder
  (host = GitHub Pages via Actions; fast-forward merge to `main`; keepalive
  added; **repo made public** — required for free Pages, DL-026).
  `GOOGLE_CALENDAR_API_KEY` secret confirmed set + a manual workflow run
  verified against the live API. First deploy needed a one-time manual step:
  repo → public, then Settings → Pages → Source = "GitHub Actions".
  - `.github/workflows/build.yml` reworked (DL-026): one workflow, two jobs —
    `build-data` (schedule + `workflow_dispatch` only: pytest → `fetch_and_build
    --commit` → push) then `deploy` (fresh `main` checkout → `upload-pages-
    artifact` on `public/` → `deploy-pages`). Also deploys on a plain push to
    `public/**`. Cron `0 5 * * *` UTC (~07:00–08:00 Jerusalem).
  - `.github/workflows/keepalive.yml` — monthly no-op commit so the cron is
    never auto-disabled by GitHub's 60-day inactivity rule.
  - `phase-3-static-site` fast-forward-merged to `main` and pushed (branch
    deleted). Pages serves `public/` as site root; the committed
    `public/data/*.json` (318 sessions / 105 teams) renders immediately.
  - **Phase 3 complete — milestone: live, self-updating MVP.**
  - **OQ-6 closed 2026-09-02:** the club was told and approved; the link may be
    shared with parents.
  - **DL-024 image export verified on real devices** (desktop + mobile,
    2026-09-02) — the canvas PNG renders correctly. No open Phase 3 items remain.
- **2026-09-02 — "earlier days" toggle (post-launch tweak).** On the current
  week, already-passed days collapse behind a `הצג ימים קודמים (N)` toggle
  (default collapsed, remembered per device — `gilboa.week_collapsed`). Pure
  `splitWeekByToday()` helper + `renderMyWeek` wiring; summary and exports still
  use the full week. `node tests/site_smoke.js` green. DL-027;
  spec + plan under `docs/superpowers/`.

## Immediate next step
Confirm the first live deploy is green (Actions → "Build & deploy" → `deploy`
job → the `page_url` it prints) and open the site on a phone. Then the OQ-6
courtesy note to the club before sharing the link with parents.
Phase 4 (Excel fallback importer) is the next build phase and is not urgent.
