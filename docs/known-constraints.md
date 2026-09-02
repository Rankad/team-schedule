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

## Timezone
All source times are Asia/Jerusalem (`+03:00` in the sample, DST-dependent).
Always display in Israel local time; never assume the runner's timezone.

## Language / layout
Hebrew content, right-to-left UI required. Mixed Hebrew/Latin (coach names, club
abbreviations like `ת"א`) must render correctly.

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
benign — but tell the club before promoting the app widely (OQ-6). If they make
the calendar private or switch systems, fall back to the Excel importer.

## Environment
- Development on Windows 11, PowerShell primary shell. Scripts must work there
  and in the Linux GitHub Actions runner.
- Not a git repository yet — initialize before real code lands (a repo is also
  required for the Action + Pages).
