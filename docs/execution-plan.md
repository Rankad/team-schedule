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
- **Milestone: live, self-updating MVP.** Share with a few parents; tell the
  club (OQ-6).

## Phase 4 — Excel fallback importer
- Goal: resilience if the calendar goes away.
- Tasks: `import_excel.py` → same normalized output; regression test that both
  sources match the golden fixture.

## Phase 5 — Distribution channels (v0.3) — SEPARATE APPROVAL
- Tasks: `wa.me` "share to WhatsApp" button (free, no API); optionally an ICS
  feed per team; email later. Decide any paid WhatsApp mechanism only here.

## Immediate next step
Start Phase 0 + Phase 1.
