# Test fixtures

## `calendar_week.json`
Offline input for parser / build tests. Mirrors the **Google Calendar API v3
`events.list`** response shape (`items[]` with `id`, `summary`, `location`,
`start.dateTime`, `end.dateTime`, `status`, `updated`, `sequence`).

**Provenance:** derived on 2026-09-02 from the **keyless public `.ics` feed**
`https://calendar.google.com/calendar/ical/mpkua0beq2409vncahis6t8tuo%40group.calendar.google.com/public/basic.ics`,
NOT from a true API capture. Events were filtered to those overlapping
2026-09-02..2026-09-08 (Asia/Jerusalem). A real API capture needs our own
`GOOGLE_CALENDAR_API_KEY` (see `docs/PHASE-0-USER-TASKS.md`); when that exists,
this fixture should be re-captured from the API and diffed.

**Verified:** 215 events for the week; per-day Wed 46 / Thu 38 / Fri 2 / Sat 5 /
Sun 43 / Mon 46 / Tue 35; 150 distinct `summary` strings; 41 distinct `location`
strings — all identical to the Excel export and to `docs/mvp-spec.md` sample
facts.

Fields the `.ics` cannot give exactly as the API would: `id` here is the iCal
`UID` (stable, but the API `id` is the UID without the `@google.com` suffix in
some cases); `sequence` from `SEQUENCE`; `updated` from `LAST-MODIFIED`/`DTSTAMP`
in UTC.

## `sample_week.xlsx`
Verbatim copy of the club Excel export `diary_export_1788335639564.xlsx`
(215 rows, week 02-08 Sep 2026). Used by the Excel fallback importer and as a
parser regression input.
