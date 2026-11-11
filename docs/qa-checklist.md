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
      no longer serves a manager page.
- [ ] `node tests/site_smoke.js` green (113 checks at DL-042).

## Rides backend (dormant, DL-042)
Nothing calls it any more; kept intact pending a stakeholder decision.
- [ ] Functions tests green (47) — incl. `PUT /api/request` (validation, upsert,
      20-row cap) even though no UI calls it. Do not delete them as "dead code"
      unless the backend is being removed on purpose.
- [ ] The "Purge past rides weeks" step in `build.yml` still runs and succeeds
      (`POST /api/purge`), so old ride rows keep aging out.
- [ ] Ride rows still in KV from earlier use are gone within a week (purge
      deletes everything older than the current week's Sunday).
- [ ] `functions-tests` CI job (Functions unit tests + site smoke) green; no
      "Manager smoke test" step remains.
- [ ] Purge (`POST /api/purge`) deletes only strictly-past weeks' keys; the
      current and future weeks are untouched; `config/*` is never deleted.

## Rides backend — security (dormant)
- [ ] Tokens (player + manager): high-entropy (CSPRNG), opaque, never in a URL
      or logs. (Backend-only now; nothing stores one client-side.)
- [ ] `PUT /api/request` write validation is structural only (shape, field
      types, `direction` enum, id regex) — confirm it rejects a malformed
      body and accepts a well-formed one, with no schedule lookup on the
      write path.
- [ ] Request body is capped at 1 KB; a token is capped at 20 rows per week
      (21st write rejected).
- [ ] Every `/api/manager/*` route returns `401` on a missing, malformed, or
      expired Bearer token.
- [ ] `POST /api/purge` returns `401` without a correct `X-Purge-Key` header.
- [ ] CORS `access-control-allow-origin` equals `SITE_ORIGIN` on every rides
      response; preflight (`OPTIONS`) is handled.
- [ ] No names, tokens, or passphrases appear in Cloudflare Function logs.
- [ ] **The KV last-write-wins race is designed out (per-row keys, DL-029),
      not testable under Miniflare** — confirm this is documented (not
      silently assumed) rather than re-litigated as a missing test.
- [ ] ~~§8.1 consent notice `[contact]` / `[מדיניות פרטיות]` placeholders filled~~
      — **moot (DL-042):** the consent text and privacy screen are gone; nothing
      is collected. Would need doing if the feature were revived.

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

## Non-functional
- [ ] A full run over a ~430-event window completes in a few seconds.
- [ ] Only network call during a run is the calendar fetch.
- [ ] The job fails loudly (non-zero exit) on fetch error or schema surprise;
      never publishes partial data.
- [ ] Scripts run on both Windows PowerShell and the Linux Actions runner.
- [ ] The club's exposed API key is NOT used anywhere in the repo.
