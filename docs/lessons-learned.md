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

<!-- Template
## LL-NNN — <title>
- **Date:**
- **Context:**
- **What we learned:**
- **Apply:**
-->
