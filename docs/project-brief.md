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
  corrupts sessions. _(Now met by the automated calendar build: no manual step,
  and a bad fetch fails the run instead of publishing partial data.)_
- Schedule changes between weeks for a followed team are surfaced, not buried.
- Zero recurring API cost for the core engine (deterministic parsing, no LLM).

## Explicit non-goals for the MVP
- Sending WhatsApp / email / push (design for it as an output channel, do not
  build it).
- User accounts / login (selection is stored on the device).
- Editing or authoring schedules — the club's site stays the source of truth.
- Sports other than basketball as a first-class feature (detect and label them,
  but do not build flows around them).

## Current state (updated 2026-11-11)
**Built and live** at `https://gilboa-schedule.pages.dev` (since 2026-09-04, on
Cloudflare Pages; the club was told and approved). The on-screen name is
**הפועל העמק** (DL-045).

- **Data:** GitHub Actions reads the club's public Google Calendar 3x/day
  (cron `0 5,13,17 * * *` UTC), runs a deterministic Python parser, and commits
  static JSON to `public/data/`; the push auto-deploys. No database, no server,
  no login, no LLM, $0/month. (The original plan was to import a weekly Excel by
  hand; the calendar replaced it, DL-008.)
- **Parent features:** find a team by team or coach name in one search box;
  personal weekly view; merged list for several teams; changes banner;
  copy / share / calendar (`.ics`) / image exports; shareable team link; passed
  days collapsed on the current week; **remove a training from your list**
  (remembered per team + weekday, restore via the team chip) and **add a
  personal game** (date, 2h, בית/חוץ, opponent), with exports matching the
  screen (DL-044). Removals and games are per phone only.
- **Phases** (`docs/execution-plan.md`): 0 setup, 1 parser, 2 build outputs +
  change detection, 3 static site + deploy (all done 2026-09-02); hosting moved
  to Cloudflare Pages 2026-09-04 (DL-028); Phase 6 rides built 2026-09-04.
  Phase 4 (Excel fallback importer) and Phase 5 (server-side calendar feed,
  email, WhatsApp API) are not built.
- **Rides (הסעות):** a player ride-request feature plus coordinator dashboard
  was built and briefly live, then removed from the front end on 2026-11-11
  (DL-041/042); the pilot and club-wide rollout were dropped. The site now makes
  no API calls and collects no personal data. The backend (Functions, purge
  step) was removed too on 2026-11-11 (DL-046).
- **Still open:** (1) the stakeholder's manual cleanup of the old Cloudflare KV,
  Cloudflare secrets and GitHub rides secrets, after the PR merges
  (`docs/RIDES.md`); (2) logo / favicon / web manifest / `og:image`
  work, parked until the club supplies a high-resolution logo (DL-036); (3)
  Excel fallback importer, not scheduled; (4) custom domain, deferred.

Detail: `docs/product-requirements.md`, `docs/architecture.md`,
`docs/ui-ux-spec.md`, `docs/mvp-spec.md`, `docs/decision-log.md`.

## Key constraints
See `docs/known-constraints.md`. Summary: source data is dirty and
human-entered; the source is the club's public Google Calendar, whose schema is
undocumented and could change without notice (the build fails loudly rather than
publish partial data); the Excel export is only a manual fallback.
