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

## DL-009 — `calendar_week.json` fixture captured from the `.ics` feed, not the API
- **Date:** 2026-09-02
- **Context:** The test fixture is supposed to be a real Google Calendar API
  `events.list` capture, but we have no API key yet (that is a stakeholder task
  — `docs/PHASE-0-USER-TASKS.md`).
- **Decision:** Build the fixture from the keyless public `.ics` feed and
  reshape each event to mirror the API item shape (`id`, `summary`, `location`,
  `start.dateTime`, `end.dateTime`, `status`, `updated`, `sequence`). Documented
  in `tests/fixtures/README.md`.
- **Validation:** 215 events for 02–08/09/2026; per-day counts, 150 distinct
  summaries and 41 distinct locations all match `docs/mvp-spec.md` sample facts
  exactly — so the `.ics` data is equivalent to the API data for parser work.
- **Follow-up:** re-capture from the real API once the key exists and diff.
- **Risk:** Low. Field-name mapping (`id` = iCal `UID`; `updated` =
  `LAST-MODIFIED`) is the only place the two could differ.

## DL-010 — Team identity key folds `-` and `/` to spaces
- **Date:** 2026-09-02
- **Context:** `docs/mvp-spec.md` §4.5 says the identity key collapses
  whitespace, unifies dash variants, treats `א/ב` ≡ `א-ב`, strips surrounding
  punctuation. Real data also varies a plain space vs a hyphen between the same
  name parts (e.g. `שלוחות א/ב בנים` vs `שלוחות-א/ב בנים`).
- **Decision:** In `normalize_name` (identity only — display name keeps the
  original), also replace every `-` and `/` between name parts with a space
  before collapsing. This makes all six proven §4.5 pairs collapse and folds the
  space/hyphen variants too.
- **Why:** The source text is hand-entered; separator noise is exactly the kind
  of variation the identity key must absorb. No case was found where two truly
  different teams differ only by a space vs a dash.
- **Status:** Accepted (implementation decision). Revisit if a real collision
  appears.
- **Risk:** Low.

## DL-011 — Word-order / filler-word team-name variants are NOT auto-merged (yet)
- **Date:** 2026-09-02
- **Context:** The sample week has several team names that are almost certainly
  the same team written differently, but not in the §4.5 "proven pairs" list:
  `טרום קט סל גוש חרוד` vs `טרום גוש חרוד`; `טרום קט סל בנות מזרח` vs
  `טרום בנות קט סל מזרח`; `טרום קט סל רימון` vs `טרום קט סל רימון בנים`;
  `טרום קט סל מולדת/רמת צבי` vs `טרום מולדת/רמת צבי`.
- **Decision:** Do NOT add heuristic word-order / filler-word merging now. It
  risks false merges and is outside the approved spec. Surface the list at the
  Phase 1 stakeholder gate; add explicit alias rules only with sign-off.
- **Status:** RESOLVED at the Phase 1 gate (2026-09-02) — see DL-012. The
  stakeholder ruled these are **separate teams**; no merging, no alias table.
- **Risk:** Accepted. If it turns out two of these really are one team, the
  club should fix the calendar text (make the words identical).

## DL-012 — Team identity = identical *words* only (clarifies DL-005)
- **Date:** 2026-09-02 (Phase 1 stakeholder gate)
- **Stakeholder rule (verbatim):** "a coach can train more than 1 team so if the
  team name is not identical in words (spaces can be duplicate) the coach is
  training both".
- **Decision:** Two rows are the same team **only if their team-name words are
  identical**. Differences that do NOT create a new team: duplicate/again
  whitespace, dash vs slash vs space separators, and the `א/ב` ≡ `א-ב`
  age-token spelling. A shared coach **never** merges two teams. Any difference
  in the actual words (`טרום גוש חרוד` vs `טרום קט סל גוש חרוד`,
  `רימון` vs `רימון בנים`, word order `בנות קט סל` vs `קט סל בנות`) = different
  teams.
- **Consequence:** `normalize_name` already behaved this way (DL-010 only folds
  separators/whitespace, never drops or reorders words). Added explicit
  regression tests locking the four DL-011 pairs as separate `team_id`s, plus a
  test that a shared coach does not merge teams.
- **Status:** Accepted.
- **Risk:** Low. The registry stays a faithful mirror of what the club typed.

## DL-013 — `על` (premier league) added as a `tier` value (extends mvp-spec §4.6)
- **Date:** 2026-09-02 (Phase 1 stakeholder gate)
- **Context:** `docs/mvp-spec.md` §4.6 tier table listed only
  `לאומית` / `ארצית` / `מחוזית`. The sample week has `נוער על`, `נערות א על`,
  `נערות ב על` — "על" is the top competitive tier and was being dropped.
- **Decision:** Add `על` to tier detection, matched **only as a standalone
  Hebrew word** (word boundaries) so it never matches the substring inside
  `מעלה גלבוע` / `מעלה` etc. `docs/mvp-spec.md` §4.6 updated to list it.
- **Result on the sample week:** `tier="על"` for `נוער על` (T_031),
  `נערות א על` (T_009), `נערות ב על` (T_032). `מעלה גלבוע` teams stay
  `tier=null` (tested).
- **Status:** Accepted. Spec extended.
- **Risk:** Low.

## DL-014 — `הפועל העמק` kept as a followable team
- **Date:** 2026-09-02 (Phase 1 stakeholder gate)
- **Context:** `הפועל העמק` appears as a left-side (team) name in the sample
  week. It is an external club, not a Gilboa Maayanot age group; the parser
  flags it `team_name_has_club_token`.
- **Decision:** Keep it as a normal followable team (`T_042`), keep the flag.
  The stakeholder chose "keep as a team" — some sessions are shared/hosted and
  parents may want them. The flag stays so it is easy to find/relabel later.
- **Status:** Accepted.
- **Risk:** Low.

## DL-015 — The build job's `git commit` step is guarded (small deviation from mvp-spec §7)
- **Date:** 2026-09-02 (Phase 2)
- **Context:** `docs/mvp-spec.md` §7 step 7 implies `fetch_and_build.py` always
  runs `git add -A && git commit`. That would make local dev runs and the test
  suite create commits.
- **Decision:** The commit step is OFF by default and only runs with the
  `--commit` flag or `BUILD_COMMIT=1`. It still commits *only if the working
  tree changed*. The GitHub Action passes `--commit`; the workflow then does
  `git push` (a no-op when nothing was committed). Everything else in §7 is
  unchanged.
- **Why:** Keeps the pipeline safe to run anywhere. A script that commits as a
  side effect is a footgun for a non-coder maintainer running it by hand.
- **Status:** Accepted.
- **Risk:** Low.

## DL-016 — First-ever run (no prior snapshot) reports zero changes
- **Date:** 2026-09-02 (Phase 2)
- **Context:** `changes.json` is a delta against `data/snapshot.json` from the
  previous run. On the very first run that file does not exist.
- **Decision:** With no prior snapshot, `changes.json` is empty (`changes: []`),
  not "every session added". "What changed since last time" is meaningless when
  there is no last time; flooding the change banner with ~200 "added" entries on
  day one would be noise.
- **Status:** Accepted. From the second run on, diffing is normal.
- **Risk:** Low.

## DL-017 — `teams.json` lists only teams that have a session in the current window
- **Date:** 2026-09-02 (Phase 2)
- **Context:** `data/teams_registry.json` keeps every team ever seen (never
  deleted, DL-012). The rolling window is ~today−7d … today+28d.
- **Decision:** `teams.json` (which feeds the picker) contains one row per team
  that has at least one session in the served window, with coaches aggregated
  across that window and a representative `sample_note`. A team with no sessions
  in the window is absent from the picker for that period but keeps its
  `team_id` forever in the registry and reappears automatically when it next has
  a session.
- **Why:** The picker should only offer teams a parent can actually see a
  schedule for right now.
- **Status:** Accepted.
- **Risk:** Low.

## DL-018 — Team-dot colour palette (static site)
- **Date:** 2026-09-02 (Phase 3)
- **Context:** Multi-team families need each session row tagged with its team.
  The UI/UX spec asks for "a fixed accessible palette, assigned by follow order,
  stable per device" and forbids colour-only signalling.
- **Decision:** Eight fixed colours, cycled by the team's position in the
  `gilboa.followed` array (so they are stable per device and only change if the
  parent re-adds teams in a different order):
  `#1d6a8c` (blue), `#b54708` (orange), `#2f7d32` (green), `#7b2d8e` (purple),
  `#b02a5b` (rose), `#0f766e` (teal), `#4f46e5` (indigo), `#8a5a00` (gold-brown).
  Every colour is ≥ 5.1:1 contrast on white, so it is legible as a dot and would
  also pass as text. The dot is **always** accompanied by the team name in
  normal dark text (16.9:1) — colour is never the only cue. Dots are shown only
  when 2+ teams are followed (a single-team parent sees a calmer, dot-free list).
- **Status:** Accepted.
- **Risk:** Low.

## DL-019 — Static-site UX interpretation calls
- **Date:** 2026-09-02 (Phase 3)
- **Decisions (all low risk, reversible in CSS/JS):**
  1. **Week navigation** lets the parent step **one week past** the first/last
     published week; that week shows "אין נתונים לשבוע זה" and the arrow then
     stops. Satisfies the spec's "outside range" message without inventing empty
     weeks in the middle.
  2. **Changes banner** is not filtered by the visible week — if a followed team
     has any change since the last visit, the banner shows on every week until
     viewed. Missing a change is worse than showing it on the "wrong" week.
  3. **Add Team search with an empty box** lists *all* teams (or all coaches),
     sorted Hebrew-alphabetically, so a parent who cannot spell the team can
     browse. Typing narrows it.
  4. **Notes** arrive as a JSON array (see data-shape note); they are joined with
     "  ·  " on one ℹ️ line.
  5. **`sample_note`** from `teams.json` is shown as the ℹ️ line in search
     results (the spec's "note if any"). — **Superseded by DL-020.**
- **Status:** Accepted (except point 5).
- **Risk:** Low.

## DL-020 — Search matching + no note line in results (stakeholder testing, Phase 3)
- **Date:** 2026-09-02
- **Trigger:** Stakeholder tested the local build. Two issues:
  1. Searching "נערים לאומית" returned only the exact team, not the intended
     "נערים ט לאומית". The old matcher removed *all* spaces and required the
     query to be one contiguous substring, so a word *between* the query words
     (the "ט") broke the match.
  2. Search results showed a third line — for "נערים לאומית" it read
     "משחק אימון" (a game note), which is confusing and not identifying info.
- **Decisions:**
  1. **Search is now word-subset matching.** The query is split into words; a
     team matches if *every* query word appears somewhere in the team name (or a
     coach name). Extra spaces are ignored (they only separate words). So
     "נערים לאומית" now matches both "נערים לאומית" and "נערים ט לאומית". A
     query with no spaces at all ("נעריםלאומית") no longer matches across a gap —
     acceptable; word-subset is the realistic parent behaviour. Also removes an
     earlier quirk where a query could match across a space between two unrelated
     words. Hint text changed to "אפשר להקליד רק חלק מהשם".
  2. **Search results show team + coach only — no ℹ️ note line** (overrides
     `docs/ui-ux-spec.md` §2 and DL-019 point 5). `sample_note` stays in
     `teams.json` (unused by the UI for now); revisit if same-name teams ever
     need disambiguation in the picker.
- **Also:** `data-team-id` added to each result button (testability).
- **Status:** Accepted.
- **Risk:** Low. Covered by `tests/site_smoke.js`.

## DL-021 — Drop the "חיפוש מאמן" (search-by-coach) tab (stakeholder testing, Phase 3)
- **Date:** 2026-09-02
- **Trigger:** After DL-020, the single team search already matches coach names.
  Stakeholder asked why a separate coach tab is still needed.
- **Decision:** Remove the 🔎/👤 mode toggle from screen 2. **One** search box
  matches team name and coach name together; results are a flat
  Hebrew-alphabetical list of teams (each already shows its coach). The old coach
  mode's only extra was grouping teams under a coach heading — marginal value
  for a club where most coaches have 1–3 teams, and one less thing for a parent
  to understand.
- **Overrides:** `docs/ui-ux-spec.md` §2 (the toggle), the original build spec's
  "Coach-mode groups results by coach".
- **Removed:** `searchMode` state, `#mode-team`/`#mode-coach` buttons,
  `.toggle*` and `.coach-group-head` CSS.
- **Status:** Accepted.
- **Risk:** Low. Reversible. Covered by `tests/site_smoke.js`.

## DL-022 — Shareable link (not named profiles) for restoring followed teams
- **Date:** 2026-09-02 (Phase 3, export/share scope pulled forward)
- **Context:** Followed teams live only in `localStorage` per device (DL-007). A
  parent who opens the app on a second phone, or a second parent in the same
  family, has to re-find every team. The stakeholder approved a **link-only**
  mechanism — no named/saved profiles, no accounts, no server.
- **Decision:**
  - **Write:** a "🔗 שתף את הקבוצות שלי" action under the followed-teams chips
    builds `location.origin + location.pathname + '?teams=' + followed.join(',')`,
    copies it, and additionally calls `navigator.share` when available. Hidden
    when nothing is followed.
  - **Read (on load):** if `?teams=` is present, each id that exists in
    `teams.json` is **merged** into the existing followed list (union, de-duped —
    never replaces). Unknown ids are ignored silently. Then
    `history.replaceState` strips the query string so a refresh does not re-apply
    it. A non-blocking toast reports what happened
    ("נוספו N קבוצות למעקב" / "כבר עוקב אחרי הקבוצות בקישור").
  - Pure functions `buildTeamsLink()`, `parseTeamsParam()`, `applyTeamsParam()`
    are exposed on `window` and unit-tested.
- **Why merge, not replace:** a link is additive sharing ("also follow my
  teams"), and replacing would silently destroy the recipient's own selection.
- **Status:** Accepted.
- **Risk:** Low. Link contains only opaque team ids, no personal data.

## DL-023 — Four "get my schedule out" actions on the weekly view
- **Date:** 2026-09-02 (Phase 3)
- **Context:** Parents want the week outside the app — in a WhatsApp message, in
  their phone calendar, as a screenshot. Approved scope: Copy as text, Share,
  Add to calendar (.ics), Save as image. All client-side, $0, no API.
- **Decision:** A compact action row (📋 העתק · 📤 שתף · 📅 יומן · 🖼️ תמונה)
  shows on "My Week" only when ≥1 team is followed **and** the visible week has
  ≥1 session. Each acts on the currently visible week + followed teams, reusing
  the same filter/sort as the on-screen list (`weekSessionsFor`).
  - **Empty week:** the row is hidden (no "export nothing" button). The pure
    builders still return a minimal payload if called directly
    (`buildWeekText` → "אין אימונים בשבוע זה"; `buildICS` → an event-less
    VCALENDAR) so behaviour is defined, just not surfaced.
  - **Copy:** `navigator.clipboard.writeText` with a `<textarea>` +
    `execCommand('copy')` fallback.
  - **Share:** `navigator.share({title,text})` when present (AbortError from
    user-cancel is swallowed); otherwise copy the text **and** open
    `https://wa.me/?text=…` in a new `rel="noopener"` tab.
  - **Image share:** download always; additionally `navigator.share({files})`
    when `navigator.canShare({files:[…]})` is true (mobile).
  - Builders `buildWeekText(sunday)`, `buildICS(sunday)`, `drawWeekImage(sunday)`
    exposed on `window` and unit-tested.
- **Status:** Accepted. (Phase 5's "share to WhatsApp" + optional ICS items,
  pulled into Phase 3 at stakeholder request — see execution-plan.)
- **Risk:** Low.

## DL-024 — "Save as image" is hand-drawn on `<canvas>` — no html2canvas / no library
- **Date:** 2026-09-02 (Phase 3)
- **Context:** The site has a hard "no build step, no framework, no external
  libraries/CDNs" constraint. `html2canvas` / `dom-to-image` would violate it and
  add ~40–200 KB.
- **Decision:** `drawWeekImage(sunday)` builds the PNG directly with the Canvas
  2D API — a fixed 480 px-wide layout, `devicePixelRatio` scaling, `ctx.direction
  = 'rtl'` + `ctx.textAlign = 'right'`, height grows with content, long lines are
  ellipsised via `measureText`. ~100 lines, one function. If Hebrew canvas text
  or layout had ballooned past ~150 lines it would have been shipped as a partial
  — it did not.
- **Status:** Accepted.
- **Risk:** Low–medium. Canvas Hebrew shaping/bidi is browser-dependent; needs a
  real-device visual check (see lessons-learned). The other three exports
  (text/share/ICS) do not depend on canvas.

## DL-025 — ICS emits DTSTART/DTEND as UTC "Z" instants (no VTIMEZONE)
- **Date:** 2026-09-02 (Phase 3)
- **Context:** Session `start`/`end` carry a `+03:00` offset. An ICS event can
  express local time either as `TZID=Asia/Jerusalem` + a full VTIMEZONE block, or
  as a converted UTC `...Z` instant.
- **Decision:** Convert to UTC `Z` (`new Date(start)` → UTC components). It is
  unambiguous, needs no (error-prone, DST-rule-bearing) VTIMEZONE block, and
  every calendar client renders it in the user's local zone correctly. `UID` is
  `<gcal event id>@gilboa-schedule` so re-importing an updated file replaces
  rather than duplicates. CRLF line endings, RFC 5545 escaping (`\ ; , \n`), and
  75-octet line folding are implemented.
- **Status:** Accepted.
- **Risk:** Low.

## DL-026 — Host: GitHub Pages, deployed by GitHub Actions; daily cron enabled
- **Date:** 2026-09-02 (Phase 3 deploy gate)
- **Context:** OQ-5 left the host open (GitHub Pages vs Cloudflare Pages). The
  site lives in `public/`; `docs/` is taken by the PM docs. GitHub Pages
  "deploy from a branch" can only serve the repo root or `/docs`, not an
  arbitrary folder.
- **Decision:**
  - **Host = GitHub Pages**, published by **GitHub Actions** (not branch mode):
    `actions/upload-pages-artifact` on `public/` → `actions/deploy-pages`. No
    file moves, `public/` stays the site root. `actions/configure-pages` with
    `enablement: true` turns Pages on automatically where repo policy allows;
    otherwise Settings → Pages → Source = "GitHub Actions" once by hand.
  - **One workflow, two jobs** (`.github/workflows/build.yml`): `build-data`
    (schedule / manual only — fetch, rebuild `public/data/*.json`, commit, push)
    then `deploy` (fresh `main` checkout → Pages). Same-run dependency avoids the
    `GITHUB_TOKEN`-push-doesn't-trigger-workflows problem. `deploy` also runs on
    a plain push touching `public/**` for hand edits to the site.
  - **Daily cron `0 5 * * *` UTC** (~07:00–08:00 Asia/Jerusalem), plus
    `workflow_dispatch`. Resolves the Phase 3 "enable the cron" item.
  - **Monthly keepalive** (`.github/workflows/keepalive.yml`) — a no-op commit to
    `.github/keepalive.log` on the 1st of each month so GitHub's 60-day
    inactivity rule never pauses the scheduled build. It touches only
    `.github/**`, so it does not trigger a redeploy.
  - **Repo made public.** GitHub Pages needs a public repo on the free plan
    (Pro ~$4/mo would break the $0/month constraint; Cloudflare Pages was the
    private-repo alternative). Stakeholder chose public (2026-09-02). Nothing
    sensitive is exposed: the API key is a GitHub Actions secret, not in the
    repo; there is no user/parent data anywhere (all client-side
    `localStorage`); the schedule data is the club's already-public calendar.
    The first `configure-pages` run failed while private ("Resource not
    accessible by integration") — expected; resolved by going public + setting
    Pages Source = "GitHub Actions".
- **Cloudflare Pages** stays the documented fallback (private repo, custom
  domain, higher limits): connect repo, build command none, output dir `public`.
- **Status:** Accepted.
- **Risk:** Low. Depends on the `GOOGLE_CALENDAR_API_KEY` repo secret (set +
  verified by the stakeholder).
- **OQ-6 resolved 2026-09-02:** the club was told about the app and approved.
  The link may now be shared with parents.
