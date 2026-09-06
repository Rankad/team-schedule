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
- **Status:** Accepted. Verified on real devices (desktop + mobile,
  2026-09-02) — the Hebrew RTL canvas PNG renders correctly. Risk closed.
- **Risk:** Low. Canvas Hebrew shaping/bidi is browser-dependent but was
  confirmed working; the other three exports (text/share/ICS) do not depend on
  canvas.

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
  - **Cron `0 5,17 * * *` UTC** — twice daily, ~07:00–08:00 and ~19:00–20:00
    Asia/Jerusalem (morning refresh + an evening one catching daytime edits;
    widened from once-daily `0 5 * * *` on 2026-09-02 at stakeholder request —
    $0 impact, public-repo Actions minutes are unlimited). Plus
    `workflow_dispatch`. Resolves the Phase 3 "enable the cron" item.
    *(Widened again to three times daily — `0 5,13,17 * * *`, adds a ~15:00–16:00
    Jerusalem run — on 2026-09-05; see DL-033.)*
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
- **Status:** Superseded on the host choice by **DL-028** (site moved to
  Cloudflare Pages 2026-09-04). The cron schedule, the monthly keepalive, and the
  public-repo decision still stand; the `deploy` job and the `push` trigger
  described below were removed — see DL-028.
- **Risk:** Low. Depends on the `GOOGLE_CALENDAR_API_KEY` repo secret (set +
  verified by the stakeholder).
- **OQ-6 resolved 2026-09-02:** the club was told about the app and approved.
  The link may now be shared with parents.

## DL-027 — Current-week view collapses already-passed days (opt-out toggle)
- **Date:** 2026-09-02 (Phase 3, post-launch)
- **Context:** A parent opened the app mid-week (season start) and saw only
  Wed–Sat. Investigation confirmed the site never hid past days — the data
  genuinely had almost nothing on Sun–Tue that first week. The parent asked for
  a way to choose "what's left this week" vs "the whole week".
- **Decision:** On the **current week only**, collapse day-groups earlier than
  today behind a `הצג ימים קודמים (N)` / `הסתר ימים קודמים` toggle row at the top
  of the list. Default **collapsed** for a new visitor; the choice is persisted
  in `localStorage` (`gilboa.week_collapsed`, `'1'`/`'0'`, absent ⇒ collapsed)
  and survives week navigation. Whole days only — a session earlier today still
  shows. Past and future weeks are unaffected. The footer summary, all four
  exports, the changes banner, and the per-team "no session this week" notices
  keep operating on the **full** week regardless of the toggle. Implemented as a
  pure `splitWeekByToday()` helper + render wiring; no build / data / Python
  change. Spec: `docs/superpowers/specs/2026-09-02-week-view-toggle-design.md`.
- **Status:** Accepted.
- **Risk:** Low. Pure-function + DOM-harness tested; a real-device RTL glance at
  the toggle row is still worthwhile.

## DL-028 — Hosting moved to Cloudflare Pages (amends DL-026)
- **Date:** 2026-09-04
- **Context:** The rides feature (`docs/superpowers/specs/2026-09-03-rides-coordination-design.md`)
  needs server-side endpoints, a KV store, and edge rate-limiting. Cloudflare
  Pages Functions provide all three on the free tier, in the same project that
  serves the static site — but only if the site is hosted on Cloudflare Pages.
  DL-026 chose GitHub Pages (deployed by GitHub Actions) when there was no such
  need. Rather than run the site on one platform and the API on another, the
  site moves to Cloudflare Pages now, as a standalone step before any rides code.
- **Decision:**
  - **The data-refresh commit uses `[skip actions]`, not `[skip ci]`.**
    `scripts/fetch_and_build.py` tags its auto-commit so GitHub Actions does not
    re-trigger on it; the tag was `[skip ci]`, which Cloudflare Pages ALSO honours
    (it skips the build). Changed to `[skip actions]` — recognised by GitHub,
    ignored by Cloudflare — so every data push deploys.
  - **Host = Cloudflare Pages**, connected to the GitHub repo via git
    integration. **No build command**; build output directory `public/`;
    production branch `main`. Live at `https://gilboa-schedule.pages.dev`
    (custom domain deferred — rides spec OQ-4).
  - **The Python build is unchanged** and still runs on GitHub Actions
    (`build.yml` job `build-data`): `pytest` → fetch → rebuild
    `public/data/*.json` → commit & push to `main`. Cloudflare auto-deploys on
    that push. No second scheduler, no build step on Cloudflare.
  - **`GOOGLE_CALENDAR_API_KEY` stays a GitHub Actions secret.** Cloudflare
    needs no secrets for the static site.
  - **The GitHub Pages `deploy` job is removed** from `build.yml`. The old
    `rankad.github.io/team-schedule/` URL is kept alive with a client-side
    redirect page (`legacy/index.html`, preserves `?teams=` and `#hash`),
    published once via the manual `legacy-redirect.yml` workflow. It can stay
    indefinitely — it costs nothing — or be removed after a transition period.
  - **`keepalive.yml` stays** — the cron-inactivity guard is still needed.
  - Cron schedule, data-file shapes, and all site code are untouched.
- **Status:** Accepted. Supersedes the host choice in DL-026 (DL-026 otherwise
  stands: one workflow that builds data on a twice-daily winter-anchored cron,
  plus the keepalive).
- **Risk:** Low. The site uses only relative paths, so it is host-agnostic;
  behaviour was verified byte-for-byte on `*.pages.dev` before GitHub Pages was
  retired. Reversible: re-add the `deploy` job to restore GitHub Pages.
- **Follow-on:** the rides Slice A work adds `functions/`, a KV namespace, and
  Cloudflare environment secrets to this same project.

## DL-029 — Rides backend: per-row KV keys, structural-only validation, opaque client-only tokens
- **Date:** 2026-09-04 (rides Slice A)
- **Decision:**
  - **Per-row KV keys**, never a per-week array (`week/<wk>/req/<token>/<sessionId>`
    for each ride request, one key per row). Two players requesting the same
    week hit different keys, so there is no read-modify-write race on a shared
    array — the last-write-wins hazard is designed out structurally, not
    guarded against with locking/retry.
  - **Write validation is structural only**: shape, field types, token/session
    id regex, `direction` enum, a 1 KB body cap and a 20-row-per-token cap
    (`functions/_lib/validate.js`). No semantic validation against the
    schedule (e.g. "does this session exist today") — keeps the write path
    fast and dependency-free; a stale/garbage `sessionId` just shows up as an
    orphaned row in the dashboard (spec §6.2), which the manager can see and
    the weekly purge clears anyway.
  - **Player identity is an opaque token, `localStorage`-only, never in a
    URL.** `mintPlayerToken` = 24 random bytes, base64url (32 chars),
    `/^[A-Za-z0-9_-]{8,128}$/` shared by `request.js`/`me.js` (`isToken`). No
    account, no password, no PII in the token itself.
  - **Purge reuses the existing GitHub Action**, not a second scheduler:
    `POST /api/purge` is called from the twice-daily `build.yml` `build-data`
    job (Pages Functions have no native cron). Idempotent, authenticated by
    `X-Purge-Key`.
  - **Schema versioning:** every stored JSON value carries `v: 1`, so a future
    shape change can be migrated or branched on read.
- **Why:** this is identified-minor data (§8 of `docs/rides-spec.md`); the
  design goal is the smallest, simplest backend that cannot silently corrupt
  or leak a row, not maximum feature completeness. Per-row keys turn a
  concurrency problem into a non-problem instead of solving it with retries.
- **Status:** Accepted.
- **Risk:** Low. The one known gap — the per-row-key race being
  *architecturally* eliminated rather than *test-verified* eliminated (Miniflare
  is single-threaded, so the race can't be reproduced in CI) — is documented,
  not hidden; see `docs/qa-checklist.md` "Rides — privacy & security".

## DL-030 — Manager auth: generated passphrase + edge rate-limit; Cloudflare Access deferred
- **Date:** 2026-09-04 (rides Slice A)
- **Decision:**
  - **Manager passphrase is generated (4–5 random words), not user-chosen.**
    Stored only as the Cloudflare env secret `MANAGER_PASSPHRASE`, never in
    the repo, never sent to the client. Compared server-side with a
    constant-time compare (`timingSafeEqual`).
  - **Session token = HMAC(passphrase) with a 6 h TTL** (`functions/_lib/token.js`),
    not a KV-backed session store — no extra KV reads per authenticated
    request, and rotating the passphrase instantly invalidates every
    outstanding session (the intended "kick everyone out" lever — see
    `docs/RIDES.md`).
  - **Rate limiting is a Cloudflare edge Rate Limiting rule** (dashboard
    config, free-plan quota: one rule), covering `/api/token`, `/api/request`,
    `/api/ping`, `/api/manager/login` — not a KV request counter. A KV
    counter would reintroduce exactly the read-modify-write race DL-029 just
    designed away, for a feature (abuse throttling) that the edge already
    does for free before the Function even runs.
  - **Cloudflare Access (SSO in front of `manager.html`) is deferred to Slice
    B.** One club-wide manager (rides-spec §5.6) makes a shared generated
    passphrase an acceptable bar for the pilot; Access adds real value once
    there are multiple coordinators or a lower risk tolerance is warranted.
  - **The legal opinion (PPL / Amendment 13 registration, rides-spec §8.5) is
    a wide-rollout blocker only** — it does not block the single-team pilot,
    which the stakeholder is running specifically to generate the real-use
    evidence the legal review and OQ-1 both need.
- **Why:** matches the actual risk profile — one trusted coordinator, a
  single-team pilot, minors' names behind a password screen — without adding
  an SSO integration or a second data store before there is evidence it is
  needed.
- **Status:** Accepted.
- **Risk:** Low for the pilot scope. Revisit Cloudflare Access and the
  passphrase-sharing model before any club-wide rollout (already gated on the
  legal opinion per rides-spec §8.5).

## DL-032 — Edge rate limiting deferred for the pilot: no Cloudflare zone exists yet
- **Date:** 2026-09-04 (rides Slice A rollout)
- **Context:** DL-030 specified a Cloudflare **edge Rate Limiting Rule**
  (free-plan) covering `/api/token`, `/api/request`, `/api/ping`,
  `/api/manager/login`. Attempting to configure it during rollout surfaced a
  gap the spec didn't anticipate: Rate Limiting Rules are a **per-zone**
  product. This Cloudflare account has **no zone** — the site runs on the
  shared `*.pages.dev` domain, which Cloudflare itself owns as a zone, not
  us. A custom domain was already deferred (rides-spec OQ-4). The
  account-level WAF shown as an alternative is a **paid Enterprise add-on**,
  not a free-plan option.
- **Decision:** Ship the single-team pilot **without** edge rate limiting.
  Do not add a custom domain now solely to unlock it — that decision (OQ-4)
  stays deferred on its own merits, not pulled forward by this.
- **Why this is an acceptable gap for the pilot, not indefinitely:**
  - Write endpoints are already gated by a ≥128-bit opaque token
    (`/api/request`, `/api/me`) or the generated `MANAGER_PASSPHRASE` +
    6 h session (`/api/manager/*`) — DL-029/DL-030. There is no unauthenticated
    write path; rate limiting was defense-in-depth against a token/passphrase
    brute-force or a scripted flood, not the only control.
  - Single-team pilot = low, predictable traffic from a known small group.
  - `PUT /api/request` already caps body size (1 KB) and rows-per-token (20) —
    DL-029 — bounding the damage of even an unthrottled abusive client.
- **Follow-up:** Re-evaluate before club-wide rollout, alongside the already-
  planned Cloudflare Access work (DL-030) and the custom-domain decision
  (OQ-4). If a custom domain is added for any other reason first, add the
  Rate Limiting Rule at that point rather than waiting for a dedicated gate.
- **Status:** Accepted (defer). New follow-up item — not a numbered OQ, since
  it isn't a design fork, just a rollout task blocked on infrastructure that
  doesn't exist yet.
- **Risk:** Low for the pilot (see above). Medium if traffic or attacker
  interest grows before a custom domain exists — tracked in
  `docs/known-constraints.md`.

## DL-031 — Rides purge deletes weekly; anonymous weekly stats-rollup deferred to post-pilot
- **Date:** 2026-09-04 (rides Slice A, Task 4 follow-up — stakeholder question)
- **Context:** The daily `POST /api/purge` deletes every `week/<wk>/*` KV key once
  `<wk>` is before the current week's Sunday (rides-spec §8.3). The stakeholder
  asked why past weeks are deleted at all, and whether the coordinator would be
  better served by keeping ride history.
- **Why the weekly delete stays:**
  - A ride request row holds a **named minor's** full name + team + which
    practices they attend + travel direction/day — a movement pattern. The §8.1
    consent notice promises parents *"נמחק אוטומטית בסוף כל שבוע"*. Data
    minimisation on identified-minor data is the position that makes the pending
    legal review (OQ-2, PPL / Amendment 13) winnable; indefinite retention is not.
  - Rides reset weekly by design (parents re-request); stale rows would be noise
    on the coordinator's screen.
  - Housekeeping of the free-tier KV namespace over multiple seasons.
- **The valid part of the question:** individual requests (personal) are distinct
  from aggregate counts (not personal). Slice A already keeps some permanent
  stats (`stats/players-all`, `stats/opens/*` 90-day). It does **not** keep a
  per-week history of request volume / practices-needing-transport, so once a
  week is purged that trend data is gone too.
- **Decision:** Do **not** expand Slice A now. After the single-team pilot,
  evaluate adding a rollup step to `runPurge` that, before deleting a week,
  writes a nameless `stats/weekly/<wk>` summary (counts by direction / location /
  team — a few hundred bytes, kept indefinitely, no personal data) and surfaces
  it as a trend view in the manager stats tab (§5.3). Rationale for deferring:
  the plan already routes retention / usage questions through "answered from real
  use" post-pilot (rides-spec §12 step 13); until the coordinator uses the
  dashboard we would be guessing which aggregates matter.
- **Status:** Accepted (defer). New open question **OQ-7** — "keep an anonymous
  weekly rides-stats rollup? which dimensions?" — to be answered from pilot use.
- **Risk:** Low. No privacy downside to the deferral (less data kept). If adopted
  later it is an additive change to `runPurge` + the stats tab, no migration.

## DL-033 — Data build cron widened to three times daily (adds a 15:00 Israel run)
- **Date:** 2026-09-05 (stakeholder request)
- **Context:** DL-026 set the `build-data` cron to twice daily (~07:00–08:00 and
  ~19:00–20:00 Asia/Jerusalem). The stakeholder asked for a third run in the
  afternoon so schedule edits the club makes during the day show up before
  evening practices, without waiting for the 19:00/20:00 run.
- **Decision:** Cron is now **`0 5,13,17 * * *` UTC** — three runs a day. Still
  winter-anchored (DL-026): 05:00/13:00/17:00 UTC = **07:00 / 15:00 / 19:00**
  Asia/Jerusalem Nov–late March, and **08:00 / 16:00 / 20:00** during Israeli
  summer time. `workflow_dispatch` unchanged.
- **Impact:** $0 — public-repo Actions minutes are unlimited. The extra run also
  fires the `POST /api/purge` rides cleanup a third time (idempotent, non-fatal
  on failure). A run still only commits + deploys when the calendar data changed.
- **Status:** Accepted. Amends the cron line in DL-026; everything else in DL-026
  (keepalive, winter anchor, public repo) stands.
- **Risk:** Low. Same workflow, one extra cron tick.

## DL-034 — Rides role entry: a הורה/שחקן toggle, not a text link
- **Date:** 2026-09-05 (stakeholder feedback from first use)
- **Context:** rides-spec §4.1 shipped the parent→player switch as a single
  low-key text link (`רישום להסעות — מעבר למצב שחקן`) under the follows row,
  plus a one-line hook on the onboarding card. A player opening the app for the
  first time did not notice it — the thing they need to tap does not look like a
  primary action.
- **Decision:**
  - Replace the link + hook with a **segmented control** (`הורה` / `שחקן`) at
    the top of the `#onboarding` card, each half showing its selected state.
    `הורה` is selected by default (unchanged behaviour — `gilboa.role` absent =
    parent). Helper line: *`הורים — רק צפייה בלוח. שחקנים — גם רישום להסעות.`*
  - Scope: **the toggle** shows on the onboarding screen only (Option A of three
    considered — "always visible at the top of My Week" was the other extreme).
    **Amended 2026-09-05 (QA pass + stakeholder):** the old compact
    `רישום להסעות — מעבר למצב שחקן` link is *kept* for the case a parent already
    followed a team (onboarding hidden) — otherwise they'd have to unfollow every
    team to reach player mode. So effectively Option C: onboarding toggle +
    compact link for followed-team parents; still nothing in player mode (the
    rides summary card is the indicator). Rendered by the same
    `renderRoleToggle()` (`#role-toggle-slot` vs `#role-entry-slot`).
  - Tapping `שחקן` runs the existing consent → name flow; the toggle's pressed
    state only moves once `gilboa.role` actually flips, so backing out stays on
    `הורה`.
  - `#onboarding` heading made role-neutral: `בחירת קבוצה` (was
    `בחר את הקבוצה של הילד/ה`, which reads wrong for a player picking their own
    team).
  - **Name step:** add a `שם פרטי ושם משפחה` placeholder in the field and stop
    showing the `יש להזין שם מלא` error on first paint — it now appears only
    after a save attempt on an empty field. The standing red line was easy to
    tune out.
- **Status:** Accepted. Amends rides-spec §4.1 / §4.2; `renderRoleEntry()` →
  `renderRoleToggle()` in `rides.js`. Same change also adds
  `[hidden] { display: none !important; }` to `styles.css` — a pre-existing bug
  spotted on this screen where `.share-follows` / `.week-actions` (own `display`)
  ignored the `hidden` attribute and leaked onto the no-teams screen.
- **Risk:** Low. No API or storage change; `gilboa.role` semantics unchanged.
  Smoke test updated (155 assertions pass); no code sets `style.display`, so the
  `[hidden]` rule only ever hides what was already meant to be hidden. QA-reviewer
  pass on the branch: no blockers.
- **Follow-up 2026-09-05 (post-deploy stakeholder report):** the toggle looked
  dead during player-entry — `שחקן` never highlighted (pressed state was tied to
  `gilboa.role`, which only flips on save) and `הורה` did nothing on the name
  step, stranding the user. Fixed with a `pendingPlayer` flag: during the name
  step the toggle shows `שחקן` selected, the onboarding team-picker content is
  hidden (`.onboarding.is-entering`), and `הורה` calls the same
  `cancelPlayerEntry()` as the card's `→ חזרה`. See LL-025.

## DL-035 — Rides: player mode is one-way; deletion is a privacy action, not a role switch
- **Date:** 2026-09-06 (stakeholder feedback)
- **Context:** rides-spec §4.5 shipped a `מעבר למצב הורה` button on the rides
  summary card that prompted once and then `DELETE /api/me` — wiping the week's
  ride requests — and dropped the player token. Player mode is a strict superset
  of parent mode (same schedule, same followed teams, same exports, plus ride
  chips), so the "switch" had no functional purpose, but its accidental cost was
  total: the player loses their picks and the coordinator loses the headcount the
  feature exists to produce.
- **Decision:**
  - Remove the player→parent switch entirely. No button, no `exitToParent()`.
    A player stays a player. `renderRoleToggle()` renders no toggle for an
    established player even on the (unfollow-everything) onboarding screen — the
    player just re-follows a team.
  - No player→parent movement deletes ride data. Backing out of name entry
    (pre-token, `cancelPlayerEntry()`) already deletes nothing; that is the only
    "movement" left.
  - Keep an explicit deletion capability — required to keep the §8.1 consent
    promise honest — as a `מחיקת נתוני ההסעות שלי` button on `#screen-privacy`,
    shown only to a player with a token (`deleteMyRidesData()`). It calls the same
    `DELETE /api/me` (best-effort) then `clearPlayer()`. Worded as deletion the
    user chose, not a mode change; confirm dialog is
    `למחוק את כל נתוני ההסעות שלך? הפעולה אינה הפיכה.`
  - Consent + privacy copy: "immediate deletion" now points at the privacy
    screen, not at "switching back to parent".
- **Status:** Accepted, implemented on `feature/rides-one-way-player-mode`. Amends
  rides-spec §4.1/§4.5/§4.9/§8.1/§11.2. **No API or KV change** — `DELETE /api/me`
  is reused; `localStorage` semantics unchanged (`clearPlayer()` still clears both
  keys). Spec: `docs/superpowers/specs/2026-09-06-rides-remove-player-to-parent-switch-design.md`.
- **Risk:** Low. Backend untouched; the one removed network call was
  fire-and-forget. Smoke test extended (155 → 177 across this change and the
  DL-037 follow-up + polish pass); green. QA-reviewer pass:
  code ship-quality, isolation boundary holds, no stranding in the toggle states.
  The only user-visible loss is the ability to leave player mode without clearing
  site data — deliberate (see LL-026).
- **Amended by DL-037** (2026-09-06, UX review): the §4.5 confirm copy is now
  conditional on the visible week's ride-request count (no longer the single
  `הפעולה אינה הפיכה` string); the "recovery = clear-site-data" framing is
  reversed — the privacy-screen delete is the stated clean exit, clear-site-data
  the last resort.

## DL-036 — Adopt the club's red-and-white visual identity (colours + share tags; logo deferred)
- **Date:** 2026-09-06
- **Context:** the app shipped unbranded — a system-font wordmark on white, a teal
  `--accent` (`#1d6a8c`) picked only for contrast, no favicon, no share preview.
  Parents are told to share the link (`known-constraints.md`), and a bare
  `*.pages.dev` URL with no title card reads as untrustworthy in WhatsApp.
- **Research (2026-09-06, gilboamaayanot.co.il):** primary red **`#D0212C`**
  (rgb 208,33,44) — their nav bar, headings, buttons, and the basketball in the
  logo. Logo is a 170×170 circular emblem (`assets/img/logo.png`): black ring with
  Hebrew club name, red basketball + monogram, white fill — too low-res for a
  512px icon or a crisp share image. Body font is the same system stack the app
  already uses. Regional-council crest on their site is a partner mark — not ours.
- **Decision (this pass):**
  - `--accent` `#1d6a8c` → **`#D0212C`** (the club's exact red — `#D0212C`-on-white
    and white-on-`#D0212C` are both ≈ **5.3:1**, clearing WCAG AA for normal text,
    so no compromise tint was needed). `--accent-dark` `#14506b` → **`#A81B24`**
    (≈ 7.4:1 on white). `--bg` left at `#f4f5f7`. `app.js` `PALETTE` (team colours)
    deliberately untouched — team identity is independent of the brand accent.
  - Added `theme-color` + text-only OG/Twitter tags (`og:type/title/description/
    locale`, `twitter:card="summary"` — not `summary_large_image`, since there is
    no `og:image` yet) to `index.html` and `manager.html`.
  - **Deferred** (needs a high-res / SVG logo from the club): the header logo
    lockup, favicon, apple-touch-icon, web manifest, and the `og:image` share
    card. Tracked in the branding spec §7 Q1.
- **Status:** Accepted, partial implementation on
  `feature/rides-one-way-player-mode`. Spec:
  `docs/superpowers/specs/2026-09-06-club-branding-theme-design.md`.
- **Risk:** Low. Presentation only — no behaviour, data, parser, or API change.
  Recolour propagates through `var(--accent)` / `var(--accent-dark)`; `manager.css`
  had no hard-coded hex. Contrast verified with a checker (QA pass). **Courtesy:**
  the club approved the *app* (OQ-6); a heads-up that we are also adopting their
  logo + colours is still outstanding (branding spec §7 Q3).
- **Amended by DL-037** (2026-09-06, UX review): brand red is not a status
  colour — new `--warn #b54708` token for error/warning text (S3); `.ride-strip`
  de-ambered to neutral (S4); week-nav arrows neutralised to `var(--text)` (S6).

## DL-037 — Rides + branding: UX-review adjustments
- **Date:** 2026-09-06
- **Context:** A UX-review round (ui-ux-designer) over the two 2026-09-06 changes
  already on `feature/rides-one-way-player-mode` — DL-035 (one-way player mode)
  and DL-036 (club recolour). The stakeholder picked the lightest options on
  offer: **"reframe the wording, no new flows"** and **"minimal visual
  restraint"**. This entry amends DL-035 (§4.5 confirm copy; the recovery
  wording) and DL-036 (colour usage — S3/S4/S6). Code is final at commit
  `0856eb2`; this pass is documentation catch-up plus one newly-documented
  limitation.
- **Decisions:**
  1. **`deleteMyRidesData()` confirm copy is now conditional** on the known
     ride-request count for the visible week. `renderPrivacy()` fires a
     best-effort `loadMyRides(currentWeek())` when it appends the button so the
     accurate text is usually ready:
     - count ≥ 1: `פעולה זו תמחק את בקשות ההסעה שלך לשבוע זה ותחזיר את המכשיר למצב הורה. אי אפשר לשחזר.`
     - count 0: `לצאת ממצב שחקן? לא נרשמו בקשות הסעה למחיקה.`
     - count unknown (rides data not loaded): `לצאת ממצב שחקן ולמחוק את בקשות ההסעה שלך לשבוע זה?`
     Replaces the single `למחוק את כל נתוני ההסעות שלך? הפעולה אינה הפיכה.` string
     from DL-035 / rides-spec §4.5.
  2. **Recovery wording reframed.** The privacy-screen `מחיקת נתוני ההסעות שלי`
     IS a working, clean exit from player mode (clears token + role, re-renders
     as a parent). Docs that read "recovery for a device wrongly in player mode
     is clear-site-data" now lead with the privacy-screen delete and treat
     clear-site-data as the last resort only. No code change — the button already
     behaved this way; the docs undersold it.
  3. **S3 — brand red is not a status colour.** New `:root` token
     `--warn: #b54708` (burnt-orange). Error/warning **text**
     (`.rides-load-error`, `.rides-name-error`, `.session-warn`) uses `--warn`.
     Destructive action **buttons** (`.ride-del`, `.ride-cancel`,
     `.privacy-delete`) deliberately keep `--accent-dark` — a reddish delete
     control is conventional and matches the original rides-spec §4.7 "muted-red
     text" intent.
  4. **S4 — `.ride-strip` de-ambered.** The per-session ride strip is now
     `var(--bg)` / `var(--border)` (neutral), not the attention amber. Amber
     (`--banner-bg`) is reserved for banner-style attention elements — the
     changes banner and the deliberately banner-styled rides summary card —
     never the strip.
  5. **S6 — week-nav arrows neutralised.** `.week-arrow` glyph is `var(--text)`
     (was `--accent`); the disabled state darkened `#b8bcc2` → `#8b9096` for
     visibility. Brand red is no longer spent on chrome the user is not meant to
     focus on.
  6. **S1 — new known limitation (stakeholder chose "document, no code
     change").** On a shared family phone left in player mode, anyone holding the
     phone can fumble a ride chip: save-on-tap with `הלוך וחזור` preselected
     (rides-spec §4.7) means one stray tap adds a bogus rider under the child's
     name, or `ביטול הסעה` kills a real request — corrupting the coordinator
     headcount the feature exists to produce. Recorded in
     `docs/known-constraints.md`; revisit after the single-team pilot (candidate
     fix: require an explicit save for NEW requests in the bottom sheet).
- **Status:** Accepted, implemented on `feature/rides-one-way-player-mode` (code
  final at `0856eb2`). **No API, KV, parser, or data change** — CSS token +
  client copy only. Amended specs:
  `docs/superpowers/specs/2026-09-06-rides-remove-player-to-parent-switch-design.md`
  (items 1–2) and
  `docs/superpowers/specs/2026-09-06-club-branding-theme-design.md` (items 3–5),
  each with an "Amended after UX review" section.
- **Risk:** Low. Presentation + wording. The S1 shared-phone limitation is the
  one open item and is deliberately deferred, not unresolved by accident.

## DL-038 — Games are not teams: matchup split, external-club guard, and side-swap
- **Date:** 2026-09-06 (branch `fix/games-are-not-teams`)
- **Context:** Practice-game ("משחק אימון") rows in the club calendar name the
  opposing club in the same field the parser uses for team/coach. Three shapes
  occur, and the first cut of this fix only handled two of them:
  1. `<Gilboa team> נגד/מול <opponent>` — the standalone `נגד`/`מול` split
     already peels the opponent off (commit `d00a145`).
  2. `<opponent club>-<opponent club>` with neither side a Gilboa group — must
     never mint a followable "team"; `resolve._is_external_club_fixture` is the
     backstop (commit `7c59012`).
  3. **`<opponent club>-<real Gilboa group>`** (opponent written *first*), e.g.
     `הפועל ת"א-נערים לאומית(משחק אימון)`, `הפועל עפולה-ילדים לאומית(משחק אימון מתחיל 19:30)`.
     Verified against the live public calendar: **the Gilboa team is on the
     RIGHT of the hyphen**, the opponent on the left. The earlier fix dropped
     these to `team_id = None` (external-club guard), which killed the "fake
     team" symptom but also lost the game for the real team's parents.
- **Decision (Option B — attach the game to the real Gilboa team):** add a
  **side-swap heuristic** in `parse_title`, after the team/coach hyphen split
  and before the `נגד`/`מול` handling. Swap the two sides when **both**:
  - the left (team) side carries a club token (`הפועל` / `מכבי` / `ת"א`), **and**
  - the right side names a real Gilboa group — a category keyword
    (`_CATEGORY_RULES`) or a tier token (`_TIER_TOKENS` / standalone `על`).
  On a swap: real `team_name` = the right side; the left side becomes an
  `יריב: <opponent>` note (deduped); `activity_type = "game"`; `coaches = []`;
  new observability flag `matchup_sides_swapped` (the `team_name_has_club_token`
  flag is *not* set — the real name has no club token). **No swap** when the
  left side has no club token (normal `Gilboa-team - coach` / `- opponent`
  rows) or when the right side is only coach name(s) with no category/tier —
  `הפועל העמק-שרון אברהמי/גולן יבלונבסקי` (DL-014) stays a training row with
  real coaches.
- **Also fixed:** `_extract_notes` used to discard any text after `משחק אימון`
  inside a parenthetical — `(משחק אימון מתחיל 19:30)` now keeps `מתחיל 19:30`
  as its own plain note.
- **`resolve._is_external_club_fixture` stays** as the backstop for shape (2):
  a game row where neither side is a Gilboa team still resolves to
  `team_id = None` and never lands in `teams.json`.
- **Registry entries `T_106` / `T_107` / `T_108`** (minted by the pre-fix bug
  from `הפועל העמק נגד מכבי ר"ג` / `הפועל ת"א` / `הפועל עפולה`) are **kept as
  inert registry rows**, not deleted. After the fix nothing resolves to their
  normalized names, so they mint no sessions and never reach `teams.json`. They
  stay because `resolve._next_id` takes the max existing `T_NNN` as its
  high-water mark: dropping the top ids would let the next new team re-issue an
  id that is still live in `public/data/teams.json`, silently moving a parent
  who follows it onto a different team. The "teams are never deleted" invariant
  (`resolve.py` docstring, `mvp-spec.md` §5) therefore still holds without
  exception. Regression guard: `test_resolve.py::
  test_next_id_never_reissues_a_removed_or_absent_top_id`.
- **Verified:** `python -m pytest -q` → 159 passed (158 + the `_next_id`
  monotonicity guard). `node tests/site_smoke.js` and
  `node tests/manager_smoke.js` unaffected. The six live reference titles,
  run through `parse_title → classify → resolve_team` against
  `data/teams_registry.json`:

  | live title | team_name | activity | flags | resolves to | new `T_`? |
  |---|---|---|---|---|---|
  | `הפועל ת"א-נערים לאומית(משחק אימון)` | `נערים לאומית` | game | `matchup_sides_swapped` | **T_039** | no |
  | `הפועל עפולה-ילדים לאומית(משחק אימון מתחיל 19:30)` | `ילדים לאומית` | game | `matchup_sides_swapped` | **T_005** | no |
  | `הפועל העמק משחק אימון נגד מכבי ר"ג-מתחיל 18:30` | `הפועל העמק` | game | `team_name_has_club_token` | **T_042** | no |
  | `נערים לאומית-הפועל ת"א(משחק אימון)` | `נערים לאומית` | game | — | T_039 | no |
  | `נוער על- משחק אימון בתל אביב נגד הפועל ת"א(מתחיל 20:30)` | `נוער על` | game | — | T_031 | no |
  | `הפועל העמק-שרון אברהמי/גולן יבלונבסקי` | `הפועל העמק` | training | `team_name_has_club_token` | T_042 | no |

  `build_teams()` over rows 1–3 puts the games under `נערים לאומית` / `ילדים
  לאומית` / `הפועל העמק` and mints **no** `הפועל ת"א` / `הפועל עפולה` / `מכבי`
  team; registry unchanged.
- **Status:** Accepted; implemented on `fix/games-are-not-teams`.
- **Known rough edge (not blocking):** when `נגד`/`מול` sits on the *coach*
  side of the hyphen (row 5 above) the opponent note reads
  `יריב: בתל אביב נגד הפועל ת"א` — the team still resolves correctly; only the
  note text is untidy. Left for a later pass.
- **Known rough edge (not blocking):** an **opponent-first matchup-token**
  title — `<outside club> נגד/מול <Gilboa group>` with no hyphen and the club
  written first — is not caught by the side-swap (which only runs on the
  team/coach hyphen split). Such a title would keep the outside club as the
  team side and drop the game to `team_id = null`. **Verified: 0 occurrences
  across the full public-calendar history (13,477 events) as of 2026-09-06.**
  Documented, not fixed; the build-log "team-less game rows" counter
  (`fetch_and_build.py`) would surface it if the club ever starts writing them.
- **Risk:** Low–moderate. The swap is deliberately narrow (needs a club token
  *and* a Gilboa category/tier on the other side); no title in the committed
  sample-week fixture triggers it. The one real-data risk: a genuine
  `הפועל העמק` (T_042) home game titled `הפועל העמק-<Gilboa group>` would swap
  the game onto the Gilboa group and away from T_042 — accepted per Option B,
  and T_042 is itself an external-club edge case (DL-014).
