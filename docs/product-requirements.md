# Product Requirements

_Last updated 2026-11-11. Original v1 goals are kept; changes are marked
**[changed]** / **[new]** and summarised in "Changed since v1" below._

## Product summary
A web app, live at `https://gilboa-schedule.pages.dev`, that reads the club's
public Google Calendar every few hours, normalizes it into clean per-session
records, and lets a parent follow one or more teams and see a personal weekly
schedule. Deterministic parsing, no LLM in the engine. **[changed]** The input is
the calendar, not a weekly Excel (DL-008); the on-screen name is **הפועל העמק**
(DL-045).

## Users and jobs-to-be-done
| User | Job |
|------|-----|
| Parent (knows team name) | "Show me my kid's team this week." |
| Parent (knows only the coach) | "Which team does coach X run, and when do they train?" |
| Parent with 2 kids / 2 teams | "Show me everything my family has this week, in one list." |
| Parent, week to week | "Did anything change since last week?" |
| Parent, personal plan **[new]** | "My kid skips one weekly training, and has a game that isn't in the club diary — show my real week." |
| ~~Importer (project owner, weekly)~~ | **[changed]** Obsolete: no weekly manual import; the build runs by itself (see Delivery). |

## Current feature set (live)

### Data engine (automated)
- **Fetch** the club's public Google Calendar
  (`mpkua0beq2409vncahis6t8tuo@group.calendar.google.com`) for a rolling window.
  No manual step. **[changed]** Runs **3x/day** by GitHub Actions cron
  `0 5,13,17 * * *` UTC (DL-033; was twice daily, first once daily).
- **Parsing** (exact rules in `docs/mvp-spec.md`): start/end from the calendar's
  datetimes (Asia/Jerusalem); rule-based split of the event text into team /
  coach(es) / notes; whitespace, dash and parenthesis normalization so spelling
  variants collapse to one team; `sport` and `activity_type` classification;
  stable `team_id` via a committed `teams_registry.json`.
  **[changed]** Games are not teams: `<team> נגד <opponent>` is split, the
  opponent goes to a note, and external-club fixtures never mint a followable team
  (DL-038).
- **Storage**: no database. Static JSON in `public/data/`, committed by the job;
  Git history is the version history; `snapshot.json` enables diffs.
- **Change detection**: each run diffs against the previous snapshot by event id
  (time changed, location changed, added, removed, team retagged).
- **Fail loudly**: a bad fetch/parse fails the run; partial data is never
  published.

### Parent web app (static, Hebrew RTL, mobile-first, no login)
- **Team search** — one search box matches team name **or** coach name, partial
  words in any order (DL-020). **[changed]** The separate "search by coach" tab
  was dropped; coach names are searched in the same box (DL-021).
- **Results** show team + coach together for confirmation.
- **Follow one or more teams**, remembered on the device (`localStorage`).
- **Weekly personal view**: current week by default, previous/next navigation;
  each session shows day+date, start–end, location, coach, notes.
- **Merged multi-team list**: one list sorted by day then time, each row tagged
  with its team (colour dot + name).
- **Weekly summary** in the footer (counts and total hours) and an empty state
  when nothing is scheduled.
- **Changes banner** for followed teams (clearer "לפני / אחרי" wording since
  2026-09-05, see execution-plan progress log), driven by `meta.generated_at` vs the value last seen.
- **Earlier-days collapse [new]**: on the current week, passed days fold behind
  `הצג ימים קודמים (N)` (DL-027).
- **Export actions [new]** (client-side only, DL-023..025): copy as text, share
  (native share or WhatsApp link), add to calendar (`.ics`), save as image (PNG).
- **Shareable team link [new]** (DL-022): `?teams=<ids>` restores/merges
  followed teams on another phone; no accounts. Does **not** carry hidden
  trainings or personal games.
- **Remove a training from your list [new, DL-044]**: ✕ on each training row.
  Remembered per team + weekday (and which training of that day it was), so it
  stays removed in following weeks even if the hour changes. An Undo toast
  follows; restore all of a team's removed trainings by pressing the team chip
  (it shows `N מוסתרים`). Unfollowing a team forgets its removals. Club game rows
  have no ✕.
- **Add a personal game [new, DL-044]**: `＋ הוסף משחק` — date, start time
  (before 22:00), בית/חוץ (default חוץ), optional opponent (≤40 chars); fixed 2
  hours; title built by the app. Delete has a 6-second Undo; no edit (delete and
  re-add). Kept 60 days; only inside the published window (about -7 / +13 days).
- **Exports match the screen [new, DL-044]**: list, footer summary, copy/share
  text, `.ics` and PNG all use the same visible list (removed trainings out,
  personal games in).
- Removals and personal games live **on that phone only** — no sync, no server,
  erased if browser data is cleared.
- **App name on screen: הפועל העמק** (DL-045). Technical identifiers
  (`gilboa.*` storage keys, file/URL names) intentionally keep the old spelling.
- Club red-and-white colours in use (DL-036/037); club approved colours and logo.

### Delivery
- **Hosting [changed]**: Cloudflare Pages (git integration, output `public/`),
  deployed on every push to `main` (DL-028). GitHub Pages is retired; the old
  URL redirects. Live since 2026-09-04.

## Rides (הסעות) — built, then removed **[changed]**
Player ride requests and a coordinator dashboard were built (Phase 6, DL-029..037)
on Cloudflare Functions + KV. The front end was removed in two steps (DL-041
chip/sheet, DL-042 everything else); the pilot, club-wide rollout and "Slice B"
were dropped. The site makes **no** `/api/*` calls and collects no personal data.
The backend (Functions, KV, secrets, daily purge step) is **dormant, not
removed**. **Open:** whether to remove it too (DL-042/043; KV must be emptied
first; checklist in `docs/RIDES.md`).

## Functional requirements
Original v0.1 list, with status.
1. FR-1 The scheduled job fetches the calendar window, regenerates
   `public/data/*.json`, and commits only when data changed. — Met.
2. FR-2 Re-running with unchanged data produces no diff and no commit. — Met.
3. FR-3 Team search matches partial Hebrew text, ignoring extra spaces.
   **[changed]** Now word-subset matching (DL-020).
4. FR-4 Coach search returns all teams that coach is attached to. **[changed]**
   Same search box, no separate tab (DL-021).
5. FR-5 A parent can follow >=1 team; persists on the same device. — Met.
6. FR-6 Weekly view shows only followed teams' sessions. — Met.
7. FR-7 Merged view sorted by day then start time, labelled by team. — Met.
8. FR-8 Non-team rows (blocked hall, non-basketball) never appear in the picker.
   — Met.
9. FR-9 Flagged/unparseable events are kept and marked with `flags`. — Met in the
   data; no user-facing flagged view.
10. FR-10 All times display in Asia/Jerusalem. — Met.
11. FR-11 The Excel fallback importer matches the calendar path. — **Not built**:
    `scripts/import_excel.py` does not exist (Phase 4, "not urgent").

New requirements:
12. FR-12 The parent can remove a training from their list and restore it; the
    removal persists per team + weekday (DL-044).
13. FR-13 The parent can add a personal game; it appears in the list and in every
    export (DL-044).
14. FR-14 Copy/share/`.ics`/PNG reflect exactly what is on screen (DL-044).
15. FR-15 The app collects no personal data and makes no API calls (DL-042).

## Non-functional requirements
- Deterministic: same calendar response gives the same output; the only network
  call in the build is the calendar fetch.
- Fast: a full run over a ~430-event window completes in a few seconds.
- Free to run and host: no paid APIs, no always-on server, no per-user cost.
- Hebrew-first UI, right-to-left layout.
- Mobile-first; usable on a 360px-wide screen.

## Changed since v1
- Source is the Google Calendar, not Excel (DL-008); Excel importer not built.
- Host: GitHub Pages (DL-026) then Cloudflare Pages (DL-028), live
  2026-09-04. Build cron: daily, then twice, now 3x/day (DL-033).
- Search: one box for team and coach (DL-020/021).
- Added after launch: earlier-days collapse (DL-027), share link (DL-022),
  four exports (DL-023..025), "before/after" change wording.
- Games no longer create fake teams (DL-038).
- Added 2026-11-11: remove-a-training and add-a-game, exports match the screen
  (DL-044); app name הפועל העמק (DL-045).
- Rides built (DL-029..037), then front end removed (DL-041/042); backend dormant;
  purge step fails loudly (DL-043).
- Former v0.3 "distribution channels": client-side share/copy/`.ics`/PNG shipped
  early; a server-side `.ics` feed, email and WhatsApp-API messages are still
  **not built** and still need their own approval (Phase 5).

## Resolved decisions
- OQ-1 Hosting -> free static site + scheduled GitHub Action (DL-004).
- Data source -> public Google Calendar, Excel as fallback (DL-008).
- OQ-2 Week key -> date of that week's Sunday (Asia/Jerusalem); `weekday`
  0=Sun..6=Sat.
- OQ-3 Recreational `חוגי` groups -> followable teams (DL-006).
- OQ-4 Team identity -> normalized team name only (DL-005; clarified DL-012).
- OQ-5 Host -> GitHub Pages (DL-026), **superseded by Cloudflare Pages (DL-028)**.
- OQ-6 Club courtesy note -> done 2026-09-02; the club approved. Colours and logo
  use approved 2026-09-06.

## Open questions
- **Remove the dormant rides backend?** Open stakeholder decision (DL-042/043).
  If yes, the purge step in `build.yml` goes with it.
- **Logo / favicon / web manifest / `og:image`** — parked, waiting for a
  high-resolution or SVG logo from the club (DL-036; `known-constraints.md`).
- **Excel fallback importer (Phase 4)** — not scheduled; build only if the
  calendar ever goes private.
- **Custom domain** — deferred (`known-constraints.md`).
