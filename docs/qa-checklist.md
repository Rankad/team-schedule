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

## Rides — Slice A
- [ ] A parent (no player token) sees no ride chips anywhere; the schedule
      view is byte-for-byte the same as before Phase 6.
- [ ] Role switch to player → consent dialog → name step with a live
      `יוצג כ` preview → `POST /api/token` → chips appear. One-word name
      handled; `→ חזרה` reverts to the previous step; `POST /api/token`
      failure shows an inline error and keeps the name entered.
- [ ] `shortName` never shows a full surname to a non-manager (initial + `׳`
      only, e.g. "דניאל כ׳").
- [ ] Ride chip states (unset / set-round / set-out / set-back) render
      correctly; every clock time in the caption is wrapped for `ltr`
      isolation (Hebrew RTL context, LTR time).
- [ ] Weekly reset: a new week's `week_key` has no request rows for any
      token — nothing to "clear" client-side, it's just absent server-side.
- [ ] Bottom sheet write is optimistic (chip updates immediately); a 5xx
      response reverts the chip and shows a retry toast; a 400 shows a
      non-retry toast (client error, not transient).
- [ ] `#screen-rides` empty state lists that week's practices with an
      "add ride" button each — not a dead screen.
- [ ] Switching back to parent role prompts, then on confirm deletes
      `week/<wk>/req/<token>/*` via `DELETE /api/me` (best-effort — local
      state clears even if the call fails).
- [ ] With the rides API entirely unreachable (DevTools request-block on
      `/api/*`), the schedule list, weekly summary, all four export actions,
      and the changes banner still work exactly as without Phase 6; the
      rides UI shows a contained "unavailable" state instead of erroring.
- [ ] Manager dashboard: day stepper works; rows with zero requests are
      collapsed by default; an orphaned request (session id no longer in
      `schedule.json`) appears in its own group, not silently dropped;
      `העתקת תוכנית היום` copies a correct day summary.
- [ ] `זמני יציאה` settings round-trip through `PUT /api/manager/config` —
      per-location values persist and feed `computeDepartTimes` on both the
      player chip caption and the dashboard.
- [ ] The health footer on the manager dashboard shows `config/global.lastPurge`.
- [ ] Purge (`POST /api/purge`) deletes only strictly-past weeks' keys; the
      current and future weeks are untouched; `config/*` is never deleted.

## Rides — privacy & security
- [ ] Player and manager tokens: high-entropy (CSPRNG), stored only in
      `localStorage`, never appear in a URL, query string, or the DOM as
      visible text.
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
- [ ] The §8.1 consent notice's `[contact]` / `[מדיניות פרטיות]` placeholders
      are filled with real stakeholder-provided text before the pilot ships.

## Non-functional
- [ ] A full run over a ~430-event window completes in a few seconds.
- [ ] Only network call during a run is the calendar fetch.
- [ ] The job fails loudly (non-zero exit) on fetch error or schema surprise;
      never publishes partial data.
- [ ] Scripts run on both Windows PowerShell and the Linux Actions runner.
- [ ] The club's exposed API key is NOT used anywhere in the repo.
