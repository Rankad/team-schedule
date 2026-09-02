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

## Non-functional
- [ ] A full run over a ~430-event window completes in a few seconds.
- [ ] Only network call during a run is the calendar fetch.
- [ ] The job fails loudly (non-zero exit) on fetch error or schema surprise;
      never publishes partial data.
- [ ] Scripts run on both Windows PowerShell and the Linux Actions runner.
- [ ] The club's exposed API key is NOT used anywhere in the repo.
