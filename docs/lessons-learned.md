# Lessons Learned

## LL-001 — Analyze the real export before designing the parser
- **Date:** 2026-09-02
- **Context:** Discovery started from the idea; the concrete rules only became
  clear after loading `diary_export_1788335639564.xlsx`.
- **What we learned:** The file revealed issues the concept discussion missed —
  malformed times (`16:010`), junk rows (`"חור בגרב"`), non-basketball rows,
  hyphens inside team names (`א-ב`, `(ג-ד)`), and same-team spelling variants.
- **Apply:** Never finalize parsing logic from a description. Re-check the rules
  against each new weekly file; keep golden fixtures.

## LL-002 — `startTime`/`endTime` columns are not trustworthy; `dateString` is
- **Date:** 2026-09-02
- **What we learned:** `startTime` had malformed values in the sample.
  `dateString` is a clean ISO8601 value with offset.
- **Apply:** Derive start from `dateString`. Repair-or-flag `endTime`.

## LL-003 — Console encoding hides Hebrew on Windows
- **Date:** 2026-09-02
- **What we learned:** Printing Hebrew from a Python one-liner to the Windows
  console showed `?????`. Writing UTF-8 JSON to a file and reading that worked.
- **Apply:** For Hebrew data inspection, dump to a UTF-8 file, don't print.

## LL-004 — Always check where the "export" actually comes from
- **Date:** 2026-09-02
- **Context:** The whole plan assumed a weekly Excel download as the only
  source. Inspecting the club site's network traffic showed the diary is a
  public Google Calendar; the Excel is a client-side dump of it.
- **What we learned:** Reading the calendar API directly is free, automatic,
  cleaner, and gives stable event IDs for precise change detection. One hour of
  looking at the real site removed the app's only manual step.
- **Apply:** Before building an importer for a file, inspect the source site's
  requests (DevTools / network log) for an underlying API or feed.

## LL-005 — Naive substring replace for "protected" tokens corrupts real separators
- **Date:** 2026-09-02
- **Context:** `parse_title` protects age-range tokens (`א-ב`, `ה-ו`, …) so the
  hyphen inside them is not used as the team/coach split point. First
  implementation did `text.replace("א-ב", …)`.
- **What we learned:** `בית אלפא-בן רצין` contains the substring `א-ב`
  (end of "אלפא" + hyphen + start of "בן"), so the real separator hyphen got
  protected and the coach was swallowed into the team name.
- **Apply:** Match "standalone" tokens only — bounded by non-letters
  (`(?<![^\W\d_])א-ב(?![^\W\d_])`). Added a regression test.

## LL-006 — The keyless `.ics` feed is a faithful stand-in for the API
- **Date:** 2026-09-02
- **Context:** Needed an offline test fixture but have no API key yet.
- **What we learned:** Filtering the public `.ics` feed to the sample week gives
  exactly 215 events with per-day counts, distinct-summary count (150) and
  distinct-location count (41) identical to both the Excel export and the
  `docs/mvp-spec.md` sample facts. The `.ics` feed carries `UID`, `SEQUENCE`,
  `LAST-MODIFIED`, `STATUS` — enough to mimic the API item shape.
- **Apply:** The `.ics` fallback in `calendar_source.py` is a real fallback, not
  a downgrade. Still re-capture from the API once the key exists, to confirm the
  `id` field maps cleanly.

## LL-007 — Console still mangles Hebrew; inspect via files
- **Date:** 2026-09-02
- **Context:** Re-confirmed LL-003 while debugging the parser on Windows.
- **Apply:** All parser inspection during this phase wrote UTF-8 report files to
  the scratchpad and read them back, never printed Hebrew to the terminal.

<!-- Template
## LL-NNN — <title>
- **Date:**
- **Context:**
- **What we learned:**
- **Apply:**
-->
