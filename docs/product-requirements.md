# Product Requirements

## Product summary
A web app that ingests the club's weekly Excel export, normalizes it into clean
per-session records, and lets a parent follow one or more teams and see a
personal weekly schedule. Deterministic parsing, no LLM in the engine.

## Users and jobs-to-be-done
| User | Job |
|------|-----|
| Parent (knows team name) | "Show me my kid's team this week." |
| Parent (knows only the coach) | "Which team does coach X run, and when do they train?" |
| Parent with 2 kids / 2 teams | "Show me everything my family has this week, in one list." |
| Parent, week to week | "Did anything change since last week?" |
| Importer (the project owner, weekly) | "Load this week's Excel in one step and tell me what changed." |

## MVP scope

### v0.1 — Auto-fetch engine + static web view
- **Fetch**: a scheduled job reads the club's public Google Calendar
  (`mpkua0beq2409vncahis6t8tuo@group.calendar.google.com`) for a rolling
  window. No manual step. Excel importer kept only as a fallback.
- **Parsing** (see `docs/mvp-spec.md` for exact rules):
  - Take start/end from the calendar event's RFC3339 datetimes (Asia/Jerusalem).
  - Split the event `summary` into team / coach(es) / notes with a rule-based
    parser (same messy format as the Excel `title`).
  - Normalize whitespace, dashes, and parentheses so spelling variants collapse
    to one team.
  - Classify `sport` (basketball / volleyball / judo / gymnastics / other) and
    `activity_type` (training / game / blocked-hall / other).
  - Assign a stable `team_id` (via a committed `teams_registry.json`) that
    survives future name changes.
- **Storage**: no database. The job writes static JSON to `public/data/` and
  commits it; Git history is the version history. A `snapshot.json` from the
  previous run enables diffs.
- **Web view** (static site, no server, no login):
  - Team picker with two modes: search by team, search by coach.
  - Results always show team + coach (+ notes) together for confirmation.
  - Select one or more teams; selection persisted in `localStorage`.
  - Weekly view: current week by default, prev/next week navigation.
  - Each session shows day+date, start–end, location, coach, notes.
  - Merged view when multiple teams are followed, one row per session,
    each tagged with its team, sorted by day then time.
  - Weekly summary: session count and total hours.
  - Empty state when a followed team has no sessions in the shown week.

### v0.2 — Change detection
- Each run diffs the new normalized events against the previous run's
  `snapshot.json`, matched by stable calendar event `id`: time changed,
  location changed, session added, session removed, team retagged.
- Followed-team view shows a "changes since last update" banner (keyed off
  `meta.generated_at` vs the value last seen in `localStorage`).

### v0.3 — Distribution channels (separate approval gate)
- Render the same schedule object as WhatsApp text / email / calendar feed.
  Channel mechanics (WhatsApp Business API etc.) decided later.

## Functional requirements (v0.1)
1. FR-1 The scheduled job fetches the calendar window, regenerates
   `public/data/*.json`, and commits only when data changed.
2. FR-2 Re-running with unchanged calendar data produces no diff and no commit
   (idempotent).
3. FR-3 Team search matches partial Hebrew text, ignoring extra spaces.
4. FR-4 Coach search returns all teams that coach is attached to.
5. FR-5 A parent can follow ≥1 team; following persists across visits on the
   same device.
6. FR-6 Weekly view shows only followed teams' sessions for the selected week.
7. FR-7 Merged multi-team view is sorted by day then start time and labels each
   session with its team.
8. FR-8 Non-team rows (blocked hall, non-basketball) never appear in the team
   picker.
9. FR-9 Flagged/unparseable events are kept (not dropped) and marked with
   `flags`; a maintainer can see them (e.g. a `flagged` view or log).
10. FR-10 All times display in Asia/Jerusalem local time.
11. FR-11 The Excel fallback importer produces the same normalized output as the
    calendar path (verified by a shared golden fixture).

## Non-functional requirements
- Deterministic: same calendar response ⇒ same output; the only network call is
  the calendar fetch.
- Fast: a full run over a ~430-event window completes in a few seconds.
- Free to run and host: no paid APIs, no always-on server, no per-user cost.
- Hebrew-first UI, right-to-left layout.
- Mobile-first; usable on a 360px-wide screen.

## Resolved decisions
- OQ-1 Hosting → **free static site + scheduled GitHub Action** (DL-004).
- Data source → **public Google Calendar**, Excel as fallback (DL-008).
- OQ-2 Week key → **date of that week's Sunday** (Asia/Jerusalem); `weekday`
  0=Sun…6=Sat.
- OQ-3 Recreational `חוגי` groups → **followable teams** (DL-006).
- OQ-4 Team identity → **normalized team name only** (DL-005).
- OQ-5 Host → **GitHub Pages, deployed by GitHub Actions** (DL-026). Cloudflare
  Pages remains the fallback if a custom domain or higher limits are wanted.
- OQ-6 Club courtesy note → **done 2026-09-02; the club was told and approved.**
  The app may now be shared with parents.

## Open questions
- _(none open)_
