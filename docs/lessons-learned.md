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

## LL-008 — Pin the one non-deterministic value so output is byte-stable
- **Date:** 2026-09-02 (Phase 2)
- **Context:** The build must produce byte-identical JSON for identical input so
  "commit only if changed" actually works and the diff stays quiet.
- **What we learned:** Everything is naturally deterministic except
  `generated_at`. Making it a caller-supplied parameter (`--now`), sorting every
  output array on a stable key, and serialising with `sort_keys=True` +
  fixed indent + trailing newline was enough. Tests pin `--now` and compare
  whole files.
- **Apply:** Isolate the clock/RNG at the edge; pass it in. Never sprinkle
  `datetime.now()` through the pipeline.

## LL-009 — A golden fixture is the cheap regression anchor for a second data source
- **Date:** 2026-09-02 (Phase 2)
- **Context:** Phase 4 adds an Excel importer that must produce the *same*
  normalized sessions as the calendar path.
- **What we learned:** Locking `tests/fixtures/expected_sessions.json` now (the
  full 215-session normalized output over `calendar_week.json`) means Phase 4
  just has to match it modulo the `id` field — no re-litigating parser
  behaviour.
- **Apply:** When two code paths must agree, freeze the shared output as a
  fixture from the first path before building the second.

## LL-010 — Build the front-end against the real JSON, not the spec's example
- **Date:** 2026-09-02 (Phase 3)
- **Context:** `docs/mvp-spec.md` §6 shows `"notes":null` in the `schedule.json`
  example, which reads like "string or null".
- **What we learned:** In the real generated data `notes` is **an array of
  strings** (e.g. `["משחק אימון","יריב: עמק יזרעאל"]`) or `null`, and `flags` is
  likewise an array or `null`. `coach_text` can be `null` (games). One team has
  an empty `coaches` list. Building straight from the spec example would have
  rendered `[object Array]` or crashed on `.join`.
- **Apply:** Open `public/data/*.json` and trace real records before writing any
  renderer. The site now normalizes both scalar and array forms defensively.

## LL-011 — A tiny DOM shim beats "I can't test the browser"
- **Date:** 2026-09-02 (Phase 3)
- **What we learned:** ~120 lines of a fake `document`/`localStorage`/`fetch`
  let the whole `app.js` render path run under Node against the real data files,
  catching sort/format/boundary bugs without a browser. Visual/RTL/contrast
  checks still need a real device, but logic is verifiable in CI-style.
- **Apply:** For no-build vanilla front-ends, keep a headless smoke harness.

## LL-012 — Web Share / clipboard APIs need feature detection AND a fallback path
- **Date:** 2026-09-02 (Phase 3, export/share)
- **Context:** Added "share this week" / "copy" / "share my teams link" actions.
- **What we learned:**
  - `navigator.share` exists only on mobile + a few desktop browsers, only over
    HTTPS (or `localhost`), and **throws** `AbortError` when the user dismisses
    the sheet — that must be caught and ignored, it is not an error.
  - `navigator.share({ files })` is gated separately behind
    `navigator.canShare({ files: [...] })`; check it before calling.
  - `navigator.clipboard.writeText` also needs a secure context; keep the old
    hidden-`<textarea>` + `document.execCommand('copy')` fallback.
  - Node 20+ defines a global `navigator` (no `.share`, no `.clipboard`), so
    guard on the method, not on `typeof navigator`.
- **Apply:** For any Web Share / clipboard use: feature-detect the specific
  method, wrap in try/catch, swallow `AbortError`, and always have a
  copy-link / open-`wa.me` fallback so desktop users are not stuck.

## LL-013 — RTL text on `<canvas>` is drawn, not laid out — anchor from the right
- **Date:** 2026-09-02 (Phase 3, "save as image")
- **Context:** `drawWeekImage()` renders the week to a PNG with no library.
- **What we learned:** `fillText` does not do paragraph layout or bidi
  reordering. For Hebrew you set `ctx.direction = 'rtl'` + `ctx.textAlign =
  'right'` and draw each line from a fixed right-margin x; you still position
  every element (dots, sub-lines) yourself and truncate long strings manually
  with `measureText`.
- **Correction (found in browser QA):** mixed Hebrew+digits does NOT
  "just work". A numeric range like `13:00–15:00` inside an RTL `fillText` call
  gets bidi-reordered to `15:00–13:00` (the two number groups swap around the
  dash). Fix: wrap each numeric run in a Unicode LTR isolate,
  `'⁦' + s + '⁩'` (`ltrIsolate()` in `app.js`) — canvas honours it.
  For a date range, we sidestepped it entirely by printing the spelled-out
  month form (`weekRangeLabel`, same as the app header) instead of `d/m–d/m`.
- Canvas glyph shaping still depends on the browser's font stack — verify Hebrew
  visually; it cannot be asserted in the headless harness (which stubs the 2D
  context).
- **Apply:** Keep hand-drawn canvas layouts flat and single-pass; pre-measure
  rows for height; wrap every time/number span in `ltrIsolate`; verify Hebrew
  visually.

## LL-014 — ICS is picky: CRLF, escaping, folding, stable UIDs
- **Date:** 2026-09-02 (Phase 3, "add to calendar")
- **What we learned:** A hand-built `.ics` must use `\r\n` line endings, escape
  `\ ; , \n` in text values, fold lines longer than 75 **octets** (not chars —
  Hebrew is 2 bytes/char in UTF-8) with `\r\n ` continuations, and give each
  VEVENT a stable `UID` so a re-imported updated file replaces the event instead
  of duplicating it. Emitting `DTSTART`/`DTEND` as UTC `...Z` instants avoids
  shipping a VTIMEZONE block.
- **Apply:** Reuse the `icsEsc` / `foldLine` / `icsStamp` helpers in `app.js` if
  a server-side per-team ICS feed is built in Phase 5.

<!-- Template
## LL-NNN — <title>
- **Date:**
- **Context:**
- **What we learned:**
- **Apply:**
-->
