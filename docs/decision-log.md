# Decision Log

## DL-001 — Engine produces a format-agnostic "schedule object"; channels are renderers
- **Date:** 2026-09-02
- **Decision:** The core system normalizes the Excel into a clean schedule
  object (team → week → sessions). Web, WhatsApp, email, calendar are all
  renderers over that object and are never part of the parsing/logic layer.
- **Why:** Keeps the hard part (dirty data) isolated; new channels cost nothing
  in engine changes; WhatsApp mechanics can be decided much later.
- **Status:** Accepted (carried over from discovery with ChatGPT).
- **Risk:** Low.

## DL-002 — Deterministic parsing, no LLM in the engine
- **Date:** 2026-09-02
- **Decision:** `title` is parsed with rule-based code, not an LLM.
- **Why:** The file is structured enough. Gives zero API cost, speed,
  predictable output, no hallucinations, testable failures.
- **Trade-off:** Rules need maintenance when the club invents new naming
  patterns. Accepted; flagged rows make drift visible.
- **Status:** Accepted.
- **Risk:** Low–medium (naming drift).

## DL-003 — Stack: Python build script + static site, no server, no DB
- **Date:** 2026-09-02 (revised after DL-004/DL-008)
- **Decision:** Python 3.11+ script (calendar fetch + parser), run by GitHub
  Actions on a schedule, writing static JSON committed to the repo. Frontend is
  vanilla RTL HTML/CSS/JS with no build step. **No FastAPI, no SQLite** — the
  Git repo is the datastore. `pandas`/`openpyxl` only for the fallback Excel
  importer.
- **Why:** The app is read-only per user; the one write path is a weekly batch
  job. A server and DB would add cost and ops for no benefit.
- **Status:** Accepted (stakeholder approved the architecture 2026-09-02).
- **Risk:** Low.

## DL-004 — Hosting model → free static site + scheduled job
- **Date:** 2026-09-02
- **Decision (proposed):** Ship as a **static site** (HTML/CSS/JS) on a free
  CDN host (Cloudflare Pages or GitHub Pages) + a free scheduled job (GitHub
  Actions cron) that regenerates the data. No always-on server, no database
  server, no login. Cost: $0/month, scales to unlimited parents. Optional
  domain ~$10/yr, else a free `*.pages.dev` / `*.github.io` address.
- **Why:** The parent-facing app is read-only; the only write path (new
  schedule each week) is a scheduled batch job, not per-user. Static hosting
  on a CDN is free and effectively infinitely scalable.
- **Not Wix / Base44:** Wix free = ads + can't run the parser; Base44 burns AI
  credits to build, adds unwanted DB/auth, and is least reliable at exactly the
  hard part (deterministic Hebrew parsing). The static app can be *embedded* in
  a Wix page via iframe if desired.
- **Status:** Accepted (stakeholder approved 2026-09-02). Host choice (GitHub
  Pages vs Cloudflare Pages) deferred to deployment — see OQ-5. Supersedes OQ-1.
- **Risk:** Low.

## DL-008 — Primary data source is the club's public Google Calendar, not the Excel
- **Date:** 2026-09-02
- **Finding:** The club's "weekly diary" page (`/public/diary/weeklydiary`) is a
  front-end over a **public Google Calendar**
  (`mpkua0beq2409vncahis6t8tuo@group.calendar.google.com`). The "Export as
  Excel" button just dumps that calendar client-side. Verified: the Google
  Calendar API v3 `events.list` returns **215 events for the week 02–08/09/2026
  — identical to the Excel** — with `summary` (= the Excel `title`),
  `location`, clean `start`/`end` in Asia/Jerusalem, plus stable `id`,
  `updated`, `etag`, `sequence`, `status`.
- **Decision (proposed):** Read the calendar directly (Google Calendar API with
  our own free API key, or the keyless public `.ics` feed) as the primary
  source. Keep the Excel importer only as a manual fallback.
- **Consequences:**
  - Fully automatic weekly updates, free, zero manual steps, zero LLM tokens.
  - Cleaner input than the Excel (the malformed times like `8:010` were an
    Excel-export artifact; the API returns proper ISO datetimes).
  - **Change detection becomes precise** — match on the stable event `id` and
    compare `updated` / `sequence`, instead of heuristic session matching.
  - The `summary` text is still the same messy "team-coach (notes)" format, so
    the title parser in `docs/mvp-spec.md` §4 is still required, unchanged.
- **Do NOT** reuse the API key exposed in the club's site — generate our own
  free Google Cloud API key (Calendar API, public-calendar reads, no billing),
  or use the `.ics` feed which needs no key.
- **Courtesy/risk:** It's the club's own public parent calendar; reading it for
  parents is benign. Before promoting the app widely, tell the club. If they
  make the calendar private or switch systems, the Excel importer is the
  fallback.
- **Status:** Accepted (stakeholder approved 2026-09-02).
- **Risk:** Low–medium (source could change; mitigated by Excel fallback).

## DL-005 — Team identity = normalized team name only (not name + coach)
- **Date:** 2026-09-02
- **Decision:** Two rows are the same team if their normalized team names match;
  coach is tracked per week separately.
- **Why:** Coaches change; the sample already shows a team with two coach-string
  spellings. Name is the stable key.
- **Status:** Proposed (OQ-4). Low risk; revisit if two real teams ever share a
  name.

## DL-006 — Recreational "חוגי" groups are followable teams
- **Date:** 2026-09-02
- **Decision:** Include `חוגי`/`חוג` groups in the team picker rather than
  filtering them out.
- **Why:** Some parents' children are in those groups; excluding them would make
  the tool useless for that audience.
- **Status:** Proposed (OQ-3). Low risk.

## DL-007 — No user accounts in the MVP
- **Date:** 2026-09-02
- **Decision:** Followed teams are stored in the browser (`localStorage`). No
  login, no server-side user records in v0.1.
- **Why:** Removes the biggest friction point; not needed until push/WhatsApp.
- **Status:** Accepted.
- **Risk:** Low. Selection is per-device (documented limitation).
