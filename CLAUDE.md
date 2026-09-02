# Project Context

## What this project is
A Hebrew, right-to-left web app that turns the Gilboa Maayanot basketball club's
crowded weekly training schedule (a ~215-row Excel export covering dozens of
teams) into a clean personal view. A parent follows one or more teams — found by
team name or coach name — and sees only their sessions for the week, with
location, coach, and notes.

## Why it exists
The club publishes one weekly diary for all teams. Parents cannot extract a
single team's sessions from it, and the source data is dirty (team name + coach
+ notes mashed into one field, spelling variants, non-basketball rows). This
project solves presentation and filtering, not data collection.

## Architecture (approved 2026-09-02)
The club's diary is a **public Google Calendar**
(`mpkua0beq2409vncahis6t8tuo@group.calendar.google.com`). A scheduled **GitHub
Action** runs a Python parser over the calendar, writes static JSON to
`public/data/`, and commits it. A **static site** (RTL Hebrew, no build step,
no server, no login) shows each parent their followed teams. **No database** —
the Git repo is the datastore. Hosted free on GitHub Pages / Cloudflare Pages.
$0/month, no LLM tokens. Excel importer kept only as a manual fallback.

## Success criteria
See `docs/project-brief.md`. Core: a parent who knows only roughly the team or
coach name finds the right team in < 30s; the weekly view for a team fits one
phone screen; multi-team families get one merged list; imports never silently
drop or corrupt sessions; schedule changes between weeks are surfaced; zero
recurring API cost in the engine.

## Current state
Discovery complete. Data source verified live (Google Calendar API returns 215
events for the sample week — identical to the Excel). Full PM doc set + build
spec in `docs/` (`mvp-spec.md` is the build spec). Architecture approved. No
code yet. Not a git repo yet. Next: Phase 0 + 1 of `docs/execution-plan.md`.

## Important constraints
- Source = the club's public Google Calendar (API v3 with OUR own free key, or
  keyless `.ics`); Excel is a manual fallback. Undocumented schema — the build
  job must fail loudly, never publish partial data.
- Do NOT reuse the API key exposed in the club's front-end — use our own.
- Source text is human-entered and dirty (see `docs/known-constraints.md`).
- All times Asia/Jerusalem; UI Hebrew RTL, mobile-first.
- Deterministic rule-based parsing — no LLM anywhere.
- No database, no server; Git repo is the datastore; GitHub Actions cron.
- No user accounts; followed teams stored per-device (`localStorage`).
- Dev on Windows 11 / PowerShell; scripts must also run on the Linux Actions
  runner.
- WhatsApp / other channels are a later phase behind its own approval gate.
- Courtesy: tell the club before promoting the app widely (OQ-6).

## Working style for this project
- Use the PM Agent system as the main workflow.
- Stop before major decisions and present options, risks, and recommendations.
- Ask for approval when there is more than one good path, when scope may expand, or when a change is hard to reverse.
- If no suitable sub-agent or skill exists, say so clearly and recommend creating one.
- Update lessons learned, decision logs, and known constraints whenever something important is discovered.

## How to work on this project
- Prefer small, reviewable steps.
- Research similar products when discovery is needed.
- Use the UI/UX agent for flows, screens, and interaction structure.
- Use the planner/researcher agent for market or feature discovery.
- Use the builder agent for implementation.
- Use the QA agent before calling work complete.
- Use the memory curator after failures, fixes, or major decisions.

## Project files to keep updated
- `.claude/rules/approval-gates.md`
- `.claude/rules/memory-policy.md`
- `docs/project-brief.md`
- `docs/product-requirements.md`
- `docs/architecture.md`
- `docs/ui-ux-spec.md`
- `docs/decision-log.md`
- `docs/lessons-learned.md`
- `docs/known-constraints.md`
- `docs/execution-plan.md`
- `docs/qa-checklist.md`

## Notes
[Add anything unique to this project that Claude should remember every session.]