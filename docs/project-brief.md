# Project Brief

## Project name
Gilboa Maayanot Team Schedule (working name: "הלו"ז שלי" / "My Schedule")

## One-paragraph description
A lightweight web app that turns the Gilboa Maayanot basketball club's crowded
weekly training schedule into a clean, personal view. A parent picks their
child's team (or teams) once — by team name **or** coach name — and from then on
sees only the training sessions that matter to them: day, time, location, coach,
and notes, for the current week, with the ability to page to other weeks.

## Why it exists
The club publishes a single weekly diary covering dozens of teams (215 rows in a
typical week) at
`https://www.gilboamaayanot.co.il/public/diary/weeklydiary`, and offers a weekly
Excel export of the same data. Parents cannot easily extract one team's sessions
from this wall of rows. Team names in the source are inconsistent and often
mashed together with the coach name and free-text notes, so even searching is
hard. This project solves **presentation and filtering**, not data collection.

## Who it is for
- Primary: parents of children in the club who want their kid's weekly schedule.
- Secondary (later): the club itself, as an official parent-facing tool.

## Success criteria
- A parent who knows only *roughly* the team name or the coach name can find and
  select the right team in under 30 seconds.
- After selection, the weekly view for one team fits on one phone screen with no
  horizontal scrolling.
- A parent with a child in two teams (or two children) sees one merged weekly
  schedule.
- Importing a new weekly Excel is a single action and never silently drops or
  corrupts sessions.
- Schedule changes between weeks for a followed team are surfaced, not buried.
- Zero recurring API cost for the core engine (deterministic parsing, no LLM).

## Explicit non-goals for the MVP
- Sending WhatsApp / email / push (design for it as an output channel, do not
  build it).
- User accounts / login (selection is stored on the device).
- Editing or authoring schedules — the club's site stays the source of truth.
- Sports other than basketball as a first-class feature (detect and label them,
  but do not build flows around them).

## Current state
Discovery complete. One real weekly Excel export analyzed
(`diary_export_1788335639564.xlsx`, week of 02–08 Sep 2026). Data model, parsing
rules, and MVP scope defined in `docs/product-requirements.md`,
`docs/architecture.md`, `docs/ui-ux-spec.md`, and `docs/mvp-spec.md`. No code
written yet.

## Key constraints
See `docs/known-constraints.md`. Summary: source data is dirty and
human-entered; the only integration is "download the club's Excel"; the club
website structure and export format could change without notice.
