# Known Constraints

## Data source
- The club's "weekly diary" (`/public/diary/weeklydiary`) is a front-end over a
  **public Google Calendar**
  (`mpkua0beq2409vncahis6t8tuo@group.calendar.google.com`). The "Export as
  Excel" button is a client-side dump of that calendar.
- Primary source = Google Calendar API v3 `events.list` with **our own** free
  API key (public-calendar reads, no billing). Keyless fallback = the public
  `.ics` feed. Manual fallback = the Excel export.
- Neither the calendar schema nor the Excel schema is documented; either could
  change without notice. The build job must fail loudly (non-zero exit,
  visible in the Action log), never publish partial/garbage data.
- The event `summary` (and Excel `title`) is human-entered and dirty:
  - Trailing / duplicate spaces in `location` and the title.
  - Title mixes team name + coach(es) + free-text notes with inconsistent
    separators (`-`, ` - `, `/`, parentheses).
  - Spelling / spacing variants of the same team and same coach.
  - Junk entries seen: `"חור בגרב"`, `"אולם … תפוס"`.
  - Non-basketball activities (volleyball, judo, gymnastics) share the calendar.
  - Excel-only: malformed times `8:010`, `9:010`, `16:010` (an export artifact;
    the calendar API returns clean RFC3339 datetimes). `description` always
    empty.
- Only one week of real data analyzed so far (02–08/09/2026). Parser rules are
  provisional until several weeks have been processed.

## Do not reuse the club's API key
An API key is exposed in the club's front-end. Do not use it. Generate our own
free Google Cloud API key and store it as a GitHub Actions secret
(`GOOGLE_CALENDAR_API_KEY`), or use the keyless `.ics` feed.

- 2026-09-02: stakeholder created our own dedicated Google Cloud API key
  (confirmed not the club's). To be stored only as the `GOOGLE_CALENDAR_API_KEY`
  Actions secret — never committed. It briefly landed in a local-only commit
  during the Phase 1 build, was purged before any push, and history was verified
  clean; rotation optional since it never left the machine.

## Timezone
All source times are Asia/Jerusalem (`+03:00` in the sample, DST-dependent).
Always display in Israel local time; never assume the runner's timezone.

## Language / layout
Hebrew content, right-to-left UI required. Mixed Hebrew/Latin (coach names, club
abbreviations like `ת"א`) must render correctly.

## Club name
The club is **גלבוע מעיינות** (English: "Gilboa Maayanot"). It is **not** a
"מכבי" club — do not prefix "מכבי". Confirmed by the stakeholder 2026-09-02 after
a build guessed "מכבי מעיינות הגלבוע". Use the exact string "גלבוע מעיינות" in
UI. Never invent proper nouns — take them from the stakeholder or the source.

## Hosting / runtime
- Free static host (GitHub Pages or Cloudflare Pages) + GitHub Actions cron.
  No always-on server, no database, no per-user cost.
- GitHub disables scheduled workflows after 60 days of repo inactivity — the
  periodic data commits keep it alive; add a monthly keepalive job as backup.
- No user accounts ⇒ followed-team selection is per-device (`localStorage`) and
  lost if the browser storage is cleared.
- The site only knows the calendar window the job fetches (rolling
  ~today−7d … today+28d).

## Distribution (v0.3)
- WhatsApp delivery likely needs WhatsApp Business API (cost, approval, phone
  provisioning) — not committed. A free interim option: a "share to WhatsApp"
  (`wa.me`) button that opens the parent's own WhatsApp with the schedule text.
  Email / ICS feed are other light options.

## Courtesy
It is the club's own public parent calendar, so reading it for parents is
benign. The club was told about the app and approved it (OQ-6, 2026-09-02) —
the link may be shared with parents. If they make the calendar private or
switch systems, fall back to the Excel importer.

## Environment
- Development on Windows 11, PowerShell primary shell. Scripts must work there
  and in the Linux GitHub Actions runner.
- Git repo initialized 2026-09-02 (`main` branch). Remote: `origin` →
  `github.com/Rankad/team-schedule` (private). `.gitattributes` forces LF endings
  so Python scripts behave identically on Windows and the Linux runner.
- Python pinned to 3.13 locally and in CI. `zoneinfo` (stdlib) needs the
  `tzdata` package on Windows — it is pulled in transitively; keep an eye on it
  if imports fail on a clean machine.

## Parser / naming (discovered building Phase 1)
- The `.ics` feed's event `LOCATION` and `SUMMARY` still carry trailing spaces
  and dash variants exactly like the Excel — cleaning (`clean.py`) is required
  for both sources.
- Tier detection knows `לאומית` / `ארצית` / `מחוזית` (substring) and `על`
  (premier league, standalone word only — DL-013, added at the Phase 1 gate).
- `הפועל העמק` is an external club that appears as a *left-side* (team) name.
  Per DL-014 it is intentionally kept as a followable team (`T_042`), still
  flagged `team_name_has_club_token` so it can be relabelled later.
- Team identity = identical *words* only (DL-012). Word-order / filler-word
  variants (`טרום גוש חרוד` vs `טרום קט סל גוש חרוד`, `רימון` vs `רימון בנים`,
  …) are DIFFERENT teams by stakeholder ruling — not merged. If two really are
  one team, the club should make the calendar text identical.
- `data/teams_registry.json` committed is still a **seed** built from the single
  sample week; `T_NNN` numbering is only locked once Phase 2 runs against live
  data. Safe to delete and regenerate until then.
