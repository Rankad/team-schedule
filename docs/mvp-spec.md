# MVP Specification — v0.1

Build spec. Data source verified against the club's live public Google Calendar
and cross-checked with the Excel export `diary_export_1788335639564.xlsx`
(week 02–08 Sep 2026, 215 rows / 215 calendar events — identical).

## 1. Data source

**Primary:** Google Calendar API v3, calendar id
`mpkua0beq2409vncahis6t8tuo@group.calendar.google.com` (public).

Request per run:
```
GET https://www.googleapis.com/calendar/v3/calendars/{id}/events
    ?key={OUR_KEY}
    &singleEvents=true
    &orderBy=startTime
    &timeMin={today-7d, RFC3339}
    &timeMax={today+28d, RFC3339}
    &maxResults=2500
```
Follow `nextPageToken` until absent. Skip events with `status == "cancelled"`.

Event → fields used:
| Field | Use |
|-------|-----|
| `id` | stable key for change detection |
| `summary` | messy "team-coach (notes)" text — parse per §4 (same as Excel `title`) |
| `location` | venue (dirty whitespace) |
| `start.dateTime` | RFC3339 with `+03:00` — **authoritative start** |
| `end.dateTime` | RFC3339 with `+03:00` — authoritative end |
| `status` | skip `cancelled` |
| `updated`, `sequence` | change detection |

**Keyless fallback:** `https://calendar.google.com/calendar/ical/{id-url-encoded}/public/basic.ics`
(returns full history; parse with `icalendar`, filter to the window).

**Manual fallback:** Excel export, via `scripts/import_excel.py`. Excel schema
(for that script only):

| Column | Meaning | Note |
|--------|---------|------|
| `dateString` | ISO8601 start (`2026-09-08T20:30:00+03:00`) | authoritative start |
| `location` | venue | dirty whitespace |
| `endTime` `HH:MM` | end time | some malformed (`16:010`) — repair or flag |
| `endDate` `DD/MM/YYYY` | end date | equals start date in sample |
| `startTime` `HH:MM` | start time | **malformed values seen (`8:010`) — ignore, use `dateString`** |
| `startDate` `DD/MM/YYYY` | start date | reliable |
| `description` | — | always empty |
| `title` | team + coach + notes | parse per §4 |

Sample facts (both sources): dates 02–08/09/2026; per-day counts Wed 46, Thu 38,
Fri 2, Sat 5, Sun 43, Mon 46, Tue 35; `location` ~41 raw strings / ~28 real
venues (differ by trailing space); `summary`/`title` 150 distinct raw strings,
199/215 contain a hyphen.

## 2. Row cleaning (every event/row first)
1. Trim leading/trailing whitespace on every string.
2. Collapse internal whitespace runs to one space.
3. Normalize dash chars (`־ – — -`) to ASCII `-` for parsing; keep original for
   display fallback.
4. `location`: cleaned string is the venue name. No venue mapping in v0.1.

## 3. Start / end datetime
- **Calendar source:** parse `start.dateTime` / `end.dateTime` (RFC3339, offset
  included). Timezone Asia/Jerusalem. Store UTC instant + local wall time.
- **Excel fallback:** start from `dateString`; end from `endDate + " " + endTime`.
  Repair `endTime` not matching `^\d{1,2}:\d{2}$` (`16:010 → 16:10` when the
  minute becomes `0–59`); else `end = null`, `flags += "bad_end_time"`.
- If `end <= start`: `flags += "end_not_after_start"`, keep both, warn in UI.

## 4. `summary` / `title` parser

`text → { team_name, coaches[], notes[], activity_type, sport }`

### 4.1 Non-team rows
If, after cleaning, the text matches any of these, create a session with
`team_id = null` and the given type — do **not** create a team:

| Contains | activity_type | sport |
|----------|---------------|-------|
| `אולם` + `תפוס` | `blocked_hall` | `n/a` |
| `כדורעף` | `other_sport` | `volleyball` |
| `ג'ודו` / `ג׳ודו` | `other_sport` | `judo` |
| `התעמלות` | `other_sport` | `gymnastics` |
| no hyphen AND no team keyword (§4.6) | `unknown` | `unknown`, `flags += "unrecognized_title"` |

Junk example: `"חור בגרב"` → `unknown`, flagged, hidden from pickers.

### 4.2 Notes extraction (remove from string before splitting)
- `חצי אולם` → note "חצי אולם"
- `חצי שעה ראשונה חדר כושר` → note as-is
- `משחק אימון` → note + set `activity_type = game`
- `(ג-ד)` / `ג-ד` for `טרום` groups → note "כיתות ג-ד"

### 4.3 Age-range tokens are NOT the coach separator
Protect before splitting: `א-ב`, `א/ב`, `ה-ו`, `ג-ד`, `א-ג`, `א-ד`.

### 4.4 Team / coach split
- Split on the **last** remaining ` - ` / `-` bordered by letters. Left =
  `team_name`, right = `coach_blob`. No such hyphen ⇒ `coach_blob = ""`.
- `coaches[]` = `coach_blob` split on `/`, trimmed, empties dropped.
- Opponent, not coach: if `activity_type == game`, or the right side contains a
  club token (`הפועל`, `מכבי`, `ת"א`) → put it in `notes` as `"יריב: …"`,
  `coaches[] = []`.
- Strip trailing `-` / spaces from `team_name`.

### 4.5 Team-name normalization (identity, not display)
`normalized_name` = cleaned name, whitespace collapsed, dash variants unified,
`א/ב` ≡ `א-ב`, surrounding punctuation stripped. Same `normalized_name` ⇒ same
team (name only; coach may change). Keep first-seen cleaned form as
`display_name`.

Proven same-team pairs (must collapse to one `team_id`):
- `ילדים ב שקד- רועי שביט` ≡ `ילדים ב שקד-רועי שביט`
- `נערים ט לאומית - סהר טיבי` ≡ `נערים ט לאומית-סהר טיבי`
- `ילדים לאומית -עמית נרדע` ≡ `ילדים לאומית-עמית נרדע`
- `טרום שקד/ביכורה (ג-ד)- יהלי שגב` ≡ `טרום שקד/ביכורה (ג-ד)-יהלי שגב`
- `קט סל א מרכז- טל יזרעאלי` ≡ `קט סל א מרכז-טל יזרעאלי`
- `חוגי דדו א-ב בנים-יובל בר לב` ≡ `חוגי דדו א/ב בנים-יובל בר לב`

### 4.6 Category / tier detection
First matching keyword in `team_name`:

| Keywords | category |
|----------|----------|
| `טרום קט סל`, `טרום` | `pre_mini` |
| `קט סל א` | `mini_a` |
| `קט סל ב` | `mini_b` |
| `קט סל` | `mini` |
| `ילדים א` | `kids_a` |
| `ילדים ב` | `kids_b` |
| `ילדים` | `kids` |
| `נערים ט` | `youth_9` |
| `נערים` | `youth` |
| `נערות` | `girls_youth` |
| `ילדות` | `girls_kids` |
| `נוער` | `juniors` |
| `נשים` | `women` |
| `ליגה` | `league` |
| `חוגי`, `חוג` | `recreational` |

Tier token if present → `tier`: `לאומית` / `ארצית` / `מחוזית` (substring), or
`על` (premier league — matched only as a standalone word, so it never matches
inside `מעלה גלבוע`). Added at the Phase 1 gate — see decision-log DL-013.
`sport` defaults to `basketball` for team rows.

## 5. Stable `team_id`
- `data/teams_registry.json`: `{ "T_001": { normalized_name, display_name,
  category, tier, sport, first_seen }, ... }` (committed).
- Build loads it, looks up each parsed team by `normalized_name`, reuses the id
  or mints `T_` + zero-padded next counter, writes the file back.
- Teams are never deleted. Absent from a week ⇒ simply no sessions that week.

## 6. Generated files (no database)

`data/` (build state, committed):
- `teams_registry.json` — see §5.
- `snapshot.json` — `{ generated_at, events: [ NormalizedEvent ] }` from the
  last run, used only for diffing.
- `history/<YYYY-MM-DD>.json` — optional archived snapshots.

`public/data/` (served to the site, committed by the job):
```jsonc
// meta.json
{ "generated_at": "...Z", "source": "gcal-api",
  "window": { "from": "2026-08-26", "to": "2026-09-30" }, "event_count": 431 }

// teams.json
[ { "team_id":"T_042", "display_name":"ילדים ב מזרח", "category":"kids_b",
    "tier":null, "sport":"basketball",
    "coaches":["יהלי שגב"], "sample_note":null } ]

// schedule.json
{ "generated_at":"...Z", "weeks":["2026-08-30","2026-09-06"],
  "sessions":[
   { "id":"<gcal event id>", "team_id":"T_042", "week_key":"2026-09-06",
     "date":"2026-09-08", "weekday":2, "start":"2026-09-08T19:00:00+03:00",
     "end":"2026-09-08T20:30:00+03:00", "location":"ניר דוד",
     "coach_text":"יהלי שגב", "activity_type":"training", "sport":"basketball",
     "notes":null, "flags":null } ] }

// changes.json
{ "generated_at":"...Z",
  "changes":[
   { "team_id":"T_042", "week_key":"2026-09-06", "kind":"time_changed",
     "old":{ "start":"...18:00...", "end":"...19:30..." },
     "new":{ "start":"...19:00...", "end":"...20:30..." },
     "session_id":"<gcal event id>" } ] }
```
`week_key` = ISO date of that week's **Sunday** (Asia/Jerusalem).
`weekday`: 0=Sun … 6=Sat.

## 7. Build pipeline (`scripts/fetch_and_build.py`)
1. Fetch events for `[today-7d, today+28d]` (§1); drop `cancelled`.
2. Per event: clean (§2) → datetime (§3) → parse `summary` (§4).
3. Resolve teams/coaches → ids (§5); update `teams_registry.json`.
4. Assign `week_key`, `weekday`; build the normalized event list.
5. Diff vs `snapshot.json` (§8) → `changes.json`.
6. Write `public/data/{meta,teams,schedule,changes}.json`; overwrite
   `snapshot.json`; append `history/`.
7. `git add -A && git commit` only if the working tree changed.

Deterministic: same calendar response ⇒ same output. Only network call is the
calendar fetch.

## 8. Diff rules
Match new vs snapshot by event `id` (stable):
- `added` — id in new, not in snapshot.
- `removed` — id in snapshot, not in new (or became `cancelled`).
- `time_changed` — same id, `start`/`end` differs.
- `location_changed` — same id, `location` differs.
- `team_changed` — same id, resolved `team_id` differs (rename/retag).
Ignore `blocked_hall` / `other_sport` / `unknown`. `changes.json` keeps entries
whose `week_key` is within the served window.

## 9. Frontend (static, `public/`)
- `index.html` + `app.js` + `styles.css`, RTL, no build step.
- Load `meta.json`, `teams.json`, `schedule.json`, `changes.json` (plain fetch).
- **Team search:** substring match over `display_name` **and** each `coaches[]`
  entry, whitespace-insensitive. Coach-mode groups results by coach.
- **Follow:** `localStorage.followed = [team_id]`; `localStorage.seen_generated_at`.
- **My Week:** filter `sessions` by followed `team_id`s and selected `week_key`;
  sort by `date` then `start`; each row tagged with its team (label + color).
- **Week nav:** across `schedule.weeks`; outside range ⇒ "אין נתונים לשבוע זה".
- **Changes banner:** show `changes` for followed teams when
  `meta.generated_at != seen_generated_at`.
- **Summary:** session count + total hours for the visible week.

## 10. Test fixtures (required)
- `tests/fixtures/calendar_week.json` — captured API response for the sample
  week (offline test input).
- `tests/fixtures/sample_week.xlsx` — the provided Excel (fallback importer +
  parser regression).
- `tests/fixtures/expected_sessions.json` — golden normalized output; both
  sources must produce it (modulo `id` source).
- Parser unit tests for every §4 case, incl. the §4.5 pairs collapsing to one
  `team_id`.
- Idempotency: re-run with the same input ⇒ zero changes, no commit.
- Robustness: malformed Excel times `8:010/9:010/16:010` repaired or flagged,
  never crash.
- Diff: feed a modified `calendar_week.json` ⇒ correct
  added/removed/time_changed/location_changed.

## 11. Build sequence
1. Repo skeleton + `.github/workflows/build.yml` (manual trigger only at first)
   + test scaffold + fixtures.
2. `calendar_source.py` (API + `.ics` fallback) against `calendar_week.json`.
3. `clean.py`, `parse_title.py` (TDD vs §4), `classify.py`.
4. `resolve.py` + `teams_registry.json`.
5. `build_outputs.py` + `diff.py` + `fetch_and_build.py`; lock
   `expected_sessions.json`.
6. Static site: My Week + Add Team; wire to `public/data/*.json`.
7. Enable the cron schedule; deploy to the chosen host.
8. `import_excel.py` fallback + its regression test.
