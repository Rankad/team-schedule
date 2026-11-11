# QA Checklist

Run before calling any phase "done". Record failures in
`docs/lessons-learned.md`.

## Build job (calendar → JSON)
- [ ] `fetch_and_build.py` against `tests/fixtures/calendar_week.json` runs with
      no exceptions.
- [ ] Fetched event count for the sample week = 215.
- [ ] `cancelled` events are skipped.
- [ ] Every non-flagged session has a start & end datetime in Asia/Jerusalem.
- [ ] Junk `"חור בגרב"` → `unknown`, flagged, not in `teams.json`.
- [ ] `"אולם … תפוס"` → `blocked_hall`, not in `teams.json`.
- [ ] Volleyball / judo / gymnastics → `other_sport` with correct `sport`, not
      in `teams.json`.
- [ ] `"נוער על-הפועל ת\"א (משחק אימון)"` → `activity_type = game`, opponent in
      notes, not treated as a coach.
- [ ] `meta.json`, `teams.json`, `schedule.json`, `changes.json` are valid JSON
      with the shapes in `docs/mvp-spec.md` §6.

## Title parser
- [ ] These pairs collapse to ONE `team_id` each:
      `ילדים ב שקד- רועי שביט` / `ילדים ב שקד-רועי שביט`;
      `נערים ט לאומית - סהר טיבי` / `נערים ט לאומית-סהר טיבי`;
      `ילדים לאומית -עמית נרדע` / `ילדים לאומית-עמית נרדע`;
      `חוגי דדו א-ב בנים-יובל בר לב` / `חוגי דדו א/ב בנים-יובל בר לב`.
- [ ] Age tokens `א-ב`, `א/ב`, `ה-ו`, `(ג-ד)` are never split as team/coach.
- [ ] Multi-coach `יואב שנקמן/ניר גוב` → 2 coaches.
- [ ] `(חצי אולם)`, `(חצי שעה ראשונה חדר כושר)` → notes, removed from team name.
- [ ] `category` correct for a sample of each type (pre_mini, mini_a/b,
      kids_a/b, youth_9, juniors, women, league, recreational, girls).

## Idempotency / history / change detection
- [ ] Re-run with unchanged input ⇒ zero changes, no `git commit`.
- [ ] `teams_registry.json` reuses ids across runs; a team absent from a later
      window keeps its `team_id`.
- [ ] Modified `calendar_week.json` produces correct `added` / `removed` /
      `time_changed` / `location_changed` / `team_changed` entries, matched by
      event `id`.
- [ ] `week_key` is the Sunday of the week; `weekday` 0=Sun…6=Sat.

## Excel fallback
- [ ] `import_excel.py` on `sample_week.xlsx` produces output equal to the
      golden `expected_sessions.json` (modulo `id` source).
- [ ] Malformed times `8:010`, `9:010`, `16:010` are repaired or flagged, never
      a crash.

## Static site
- [ ] RTL layout; no horizontal scroll at 360px width.
- [ ] Onboarding shows when no team followed.
- [ ] Team search: partial match, space-insensitive, matches team name AND
      coach name.
- [ ] Coach search returns every team that coach is attached to.
- [ ] Follow / unfollow persists across reload (same device).
- [ ] Team + coach shown together in search results and followed chips.
- [ ] Prev/next week works across the available window; outside range shows
      "אין נתונים לשבוע זה".
- [ ] Merged multi-team view sorted by day then time; each session labelled with
      its team; dots have text labels too (not color-only).
- [ ] Weekly summary (session count, total hours) always reflects the **whole**
      selected week — unchanged by the "earlier days" toggle state (DL-027).
- [ ] Changes banner appears only for followed teams and only when
      `meta.generated_at` differs from the last-seen value.

## "Earlier days" toggle — current week only (DL-027)
- [ ] On the **current** week, days before today are hidden by default; a
      `▸ הצג ימים קודמים (N)` row sits at the top of the list, `N` = number of
      hidden past days that have sessions.
- [ ] Tapping it reveals those day-groups and the label becomes
      `▾ הסתר ימים קודמים`; tapping again re-collapses.
- [ ] Collapsed caret points **left** (`◂`) in the RTL layout, toward the label —
      not off the screen edge.
- [ ] The choice survives a page reload and week navigation
      (`localStorage` key `gilboa.week_collapsed`, `'1'`=collapsed / `'0'`=open;
      absent or corrupt ⇒ collapsed).
- [ ] Past weeks and future weeks show **all** seven days with **no** toggle row.
- [ ] Current week whose only followed sessions are in the past ⇒ list shows
      `אין עוד אימונים השבוע`, with the toggle row above it to reveal them.
- [ ] Current week with no past sessions at all ⇒ no toggle row, no message
      (identical to the pre-toggle rendering).
- [ ] Exports (📋 📤 📅 🖼️) still emit the **full** week regardless of the toggle.
- [ ] Keyboard: activating the toggle keeps focus on it (does not jump to the top
      of the page).
- [ ] Toggle row is ≥ 44px tall and has a visible focus outline.

## Rides front end removed (DL-042, 2026-11-11)
The old "Rides — Slice A" front-end items (role toggle, consent, name step,
summary card, `#screen-rides`, privacy-screen delete, chip/sheet, manager
dashboard) were deleted with the code. Replaced by removal locks:
- [ ] `public/index.html` contains **no** rides ids (`#role-toggle-slot`,
      `#screen-rides`, `#screen-privacy`, `#rides-sheet`, rides summary card,
      consent/name dialogs) and no `מדיניות פרטיות` footer link.
- [ ] No `window.Rides`; `public/rides.js` does not exist.
- [ ] The site makes **zero** `/api/*` requests (DevTools Network, filter `api`,
      reload + navigate every screen).
- [ ] On load, legacy keys `gilboa.role`, `gilboa.player`, `gilboa.ping_ts`,
      `gilboa.manager` are removed from `localStorage`; `gilboa.followed` (and
      other kept keys) are untouched — seed the old keys by hand, reload,
      confirm (`clearLegacyRidesKeys()`).
- [ ] Onboarding card (no team followed) shows heading `בחירת קבוצה`, one
      paragraph and a `＋ בחירת קבוצה` button — **no** `הורה` / `שחקן` toggle,
      no ride wording anywhere in the app.
- [ ] `manager.html` (and `manager.js` / `manager.css`) are gone — the old URL
      no longer serves a manager page. In production a stale `/manager.html`
      returns the parent app's `index.html` with HTTP 200 (Pages SPA mode; no
      `404.html` / `_redirects` / `_headers` / `wrangler.toml`), not a 404.
- [ ] `node tests/site_smoke.js` green (113 checks at DL-042).

## Rides backend removed (DL-046, 2026-11-11)
The old "Rides backend (dormant)" and "Rides backend — security (dormant)"
items, and the 47 Functions tests, were deleted with `functions/`. Replaced by
removal locks:
- [ ] `functions/` does not exist in the repo.
- [ ] `.github/workflows/build.yml` has no "Purge past rides weeks" step (no
      `PURGE_KEY` / `RIDES_API` references).
- [ ] The `functions-tests` job (legacy name kept on purpose) runs only the
      site smoke test (`node tests/site_smoke.js`) — no Functions test step.
- [ ] Zero `/api/` requests from the site (also locked by the smoke test).
- [ ] Stakeholder manual cleanup done (`docs/RIDES.md` section 1): KV
      namespace + Cloudflare secrets deleted, GitHub `PURGE_KEY` / `RIDES_API`
      deleted, `GOOGLE_CALENDAR_API_KEY` still present and the next data run
      green.
- [ ] pytest 159 green; site smoke 256 green.

## Branding (DL-036)
- [ ] Every `--accent` / `--accent-dark` foreground/background pair checked
      ≥ 4.5:1 with a contrast tool (`#D0212C` and `#A81B24` on white/`--bg`;
      white on `#D0212C`). State is still never carried by hue alone.
- [ ] `app.js` `PALETTE` (team dot colours) unchanged — no team dot is the
      brand red.
- [ ] `theme-color` + `og:type/title/description/locale` + `twitter:card`
      present and well-formed in `index.html` (`manager.html` removed, DL-042).
- [ ] Pasting the prod link into WhatsApp/Slack shows the title + description
      (no `og:image` card yet — deferred with the logo asset).
- [ ] Warning **text** (`.session-warn`) uses `--warn` `#b54708`, not the brand
      red (DL-037).
- [ ] Amber (`--banner-bg`) appears only on the changes banner (rides
      summary-card and `.ride-strip` checks dropped — removed, DL-041/042).
- [ ] Week-nav arrows: glyph is `var(--text)`, disabled arrow `#8b9096` — no
      brand red on the nav chrome (DL-037).

## Hide a training / add a game (DL-044)
Real-browser pass REQUIRED (headless Chrome over CDP) — the mock DOM missed a
NodeList bug once (LL-029).
- [ ] Tap ✕ on a training: it disappears, Undo toast appears; Undo brings it
      back. First-ever hide also shows the restore tip (`gilboa.hide_tip_seen`).
- [ ] Hide persists across reload AND on following weeks, even when that week's
      hour for the team differs.
- [ ] Team with two trainings in one day: ordinals (1st/2nd) hide the right row;
      day header vanishes only when its last training is hidden.
- [ ] Chip shows dashed `N מוסתרים` badge when hides exist; pressing the chip
      restores ALL of that team's trainings (all weeks); badge goes away.
- [ ] Unfollowing a team clears its hides (re-follow shows everything).
- [ ] A brand-new weekday for a hidden-arrangement team still shows.
- [ ] Empty states: team all hidden → `כל האימונים של <name> מוסתרים השבוע` +
      `הצג (N)`; whole week hidden → card + `החזרת כל האימונים (N)`; export row
      hidden; earlier-days expander counts visible rows only.
- [ ] Club `game` rows and personal games have no ✕.
- [ ] Exports match the screen: footer, copy text, share text, `.ics`, PNG all
      exclude hidden trainings and include games; every training keeps its team
      label; no "null"/"undefined" anywhere (e.g. game with no opponent).
- [ ] Footer wording e.g. `2 אימונים · משחק אחד · 5 שעות`.
- [ ] Game form: `＋ הוסף משחק` only when ≥1 team followed, not in onboarding;
      default venue חוץ; date min/max = published weeks −7 / +13 days; empty
      time → `בחרו שעת התחלה`; time ≥22:00 → error; opponent ≤40 chars; note
      `משך המשחק קבוע: שעתיים` shown; double-tap submit adds ONE game.
- [ ] Title: `משחק חוץ נגד X` / `משחק בית נגד X`; no opponent → `משחק חוץ/בית`.
- [ ] Delete a game: 6s Undo works; no edit control.
- [ ] `.ics` game VEVENT has SUMMARY/UID/DTSTART/DTEND and no LOCATION; check
      DST dates 2026-03-27 and 2026-10-25 land at the right local time.
- [ ] 320px width: team-chip row (badge) does not overflow; toast fits.
- [ ] XSS: opponent `<img src=x onerror=alert(1)>` renders as inert text in
      list, dialog, toast, copy text, PNG.
- [ ] Storage tampering (garbage in `gilboa.hidden` / `gilboa.games`) does not
      crash the app.
- [ ] Still zero `/api/` requests.

## App name (DL-045)
- [ ] Header `.club-name`, `<title>`, `og:title`, weekly copy-text/share header,
      PNG export header and follows-share text all say **הפועל העמק**.
- [ ] Downloaded files are named `הפועל-העמק-שבוע-<date>.ics` / `.png`.
- [ ] No `גלבוע מעיינות` anywhere in `public/` (excluding `public/data`).
- [ ] `gilboa.*` localStorage keys, ICS `PRODID`/`UID` and the pages.dev URL are
      intentionally unchanged (followed teams survive the deploy).

## Non-functional
- [ ] A full run over a ~430-event window completes in a few seconds.
- [ ] Only network call during a run is the calendar fetch.
- [ ] The job fails loudly (non-zero exit) on fetch error or schema surprise;
      never publishes partial data.
- [ ] Scripts run on both Windows PowerShell and the Linux Actions runner.
- [ ] The club's exposed API key is NOT used anywhere in the repo.
