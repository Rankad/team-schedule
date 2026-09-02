# Architecture

## Overview
The club's weekly diary is a **public Google Calendar**. A free scheduled job
reads it, normalizes the messy event titles into clean per-session records, and
writes static JSON files. A static website (no server, no login) shows each
parent only the teams they follow. WhatsApp / email / calendar export are later
renderers over the same data.

```
Google Calendar  (mpkua0beq2409vncahis6t8tuo@group.calendar.google.com, public)
        │
        │  Calendar API v3 events.list  (rolling window; free)
        ▼
┌─────────────────────────────────────────┐
│  Build job  (GitHub Actions, scheduled) │
│  fetch → clean → parse title →          │
│  classify → resolve stable team_id →    │
│  bucket into weeks → diff vs last run   │
└───────────────────┬─────────────────────┘
                    │  writes + commits
                    ▼
        public/data/*.json   (teams, schedule, changes, meta)
                    │
        auto-deploy to a free static host (GitHub Pages / Cloudflare Pages)
                    │
                    ▼
        Static site (RTL Hebrew HTML/CSS/JS)
        parent searches team or coach → follows teams (localStorage)
        → sees their merged weekly schedule + change banner
```

No always-on server. No database server. No user accounts. No LLM anywhere.
Cost: $0/month. The Git repository is the datastore and the version history.

## Data source

- **Calendar id:** `mpkua0beq2409vncahis6t8tuo@group.calendar.google.com`
  (discovered via the club site's `api/getDiary.php` response; the site's
  "Export as Excel" is a client-side dump of this calendar).
- **Primary access:** Google Calendar API v3
  `GET /calendar/v3/calendars/{id}/events` with our **own** free API key
  (Calendar API, public-calendar reads — no billing required). Params:
  `singleEvents=true`, `orderBy=startTime`, `timeMin` / `timeMax` (rolling
  window: today−7d … today+28d), `maxResults=2500`, follow `nextPageToken`.
- **Keyless fallback:** the public iCal feed
  `https://calendar.google.com/calendar/ical/<id>/public/basic.ics` (returns
  full history; filter after parsing).
- **Manual fallback:** the Excel export (`scripts/import_excel.py`) produces the
  same normalized records if the calendar ever goes private.
- **Do not** reuse the API key exposed in the club's front-end. Store our key as
  a GitHub Actions secret `GOOGLE_CALENDAR_API_KEY`.

### Event fields we use
`id` (stable), `summary` (= the messy "team-coach (notes)" text — same as the
Excel `title`), `location`, `start.dateTime`, `end.dateTime` (with
`+03:00` / `timeZone: Asia/Jerusalem`), `status` (skip `cancelled`),
`updated`, `sequence`, `etag`.

Verified: a one-week window returns 215 events — identical to the Excel export —
with cleaner time values (the Excel's malformed `8:010` values were an
export-side artifact).

## Components

### Build job (`scripts/fetch_and_build.py`, run by GitHub Actions)
Stateless script; its only "memory" between runs is committed files.
1. Fetch events for the rolling window from the calendar.
2. Per event: `clean` → `parse_title` (rules in `docs/mvp-spec.md` §4) →
   `classify` (sport + activity_type) → `resolve` (find-or-create stable
   `team_id` against `data/teams_registry.json`).
3. Bucket sessions into weeks (`week_key` = date of the week's Sunday,
   Asia/Jerusalem).
4. Diff the new normalized set against `data/snapshot.json` (last run) by event
   `id`; compare start/end/location and `sequence` → change list per team/week.
5. Write `public/data/{teams,schedule,changes,meta}.json`, update
   `data/teams_registry.json` and `data/snapshot.json`, optionally append
   `data/history/<date>.json`.
6. `git commit` only if something changed → triggers the host to redeploy.

Schedule: daily cron (e.g. `0 5 * * *` UTC) + `workflow_dispatch` for manual
runs. Note: GitHub disables cron workflows after 60 days with no repo activity;
the periodic data commits keep it alive, plus a monthly keepalive.

### Static output files (`public/data/`)
| File | Shape |
|------|-------|
| `teams.json` | `[{ team_id, display_name, category, tier, sport, coaches:[..], sample_note }]` — feeds the picker |
| `schedule.json` | `{ generated_at, weeks:[week_key], sessions:[ Session ] }` for the rolling window |
| `changes.json` | `{ generated_at, changes:[ { team_id, week_key, kind, old, new } ] }` |
| `meta.json` | `{ generated_at, source, window:{from,to}, event_count }` |

`Session` = `{ id, team_id, week_key, date, weekday, start, end, location,
coach_text, activity_type, sport, notes, flags }`.
This is the **schedule object** — every renderer (web now; WhatsApp / email /
ICS later) consumes only this.

### Static site (`public/`)
- `index.html`, `app.js`, `styles.css` — RTL Hebrew, mobile-first, **no build
  step**.
- On load: fetch `teams.json` + `schedule.json` (+ `changes.json`).
- `localStorage`: followed `team_id`s, last-seen `generated_at`.
- All search / filtering / multi-team merge happens client-side.
- Screens per `docs/ui-ux-spec.md`: My Week, Add Team (team/coach search).
  (No import screen in this architecture — updates are automatic.)

### Manual Excel importer (`scripts/import_excel.py`) — fallback only
Reads the club `.xlsx`, runs the same clean/parse/classify/resolve code, and
writes the same normalized records. Not part of the weekly flow; kept for
resilience and for parser regression tests.

## Technology choices
| Concern | Choice | Why |
|---------|--------|-----|
| Build script | Python 3.11+ | Best text/date tooling; owner can read it |
| Calendar client | `requests` (API) / `icalendar` (fallback) | Tiny deps |
| Excel fallback | pandas + openpyxl | Only for `import_excel.py` |
| Scheduler | GitHub Actions cron | Free, no infra |
| Datastore | Git repo (committed JSON) | Free, versioned, no DB server |
| Frontend | Vanilla HTML/CSS/JS, RTL | Small UI, no build step |
| Host | GitHub Pages or Cloudflare Pages | Free CDN, no ads, free TLS |
| Domain | optional `*.pages.dev` / custom (~$10/yr) | Not required |

SQLite is **not needed** for this model. If a future phase needs server-side
state (accounts for push notifications), revisit then.

## Directory layout
```
team schedule/
  scripts/
    fetch_and_build.py      # Action entrypoint (calendar → JSON)
    calendar_source.py      # Calendar API client + .ics fallback
    clean.py                # whitespace / dash / paren normalization
    parse_title.py          # summary/title → team, coaches, notes
    classify.py             # sport + activity_type
    resolve.py              # stable team_id via teams_registry.json
    build_outputs.py        # normalized sessions → public/data/*.json
    diff.py                 # snapshot vs new → changes
    import_excel.py         # manual fallback importer
  data/
    teams_registry.json     # persistent team_id ↔ normalized_name (committed)
    snapshot.json           # last run's normalized events (committed, for diff)
    history/                # optional dated snapshots
  public/                   # deployed as-is
    index.html
    app.js
    styles.css
    data/                   # generated JSON (committed by the job)
  .github/workflows/
    build.yml               # cron + workflow_dispatch + on push to scripts/
  tests/
    fixtures/
      calendar_week.json    # captured API response, for offline tests
      sample_week.xlsx      # for the fallback importer + parser tests
      expected_sessions.json
  docs/
```

## Deployment
1. Push repo to GitHub.
2. Add secret `GOOGLE_CALENDAR_API_KEY`.
3. Enable Pages (source: `public/` on the default branch) — or connect the repo
   to Cloudflare Pages (build command: none, output dir: `public`).
4. The Action runs on schedule; commits to `public/data/` trigger redeploy.
