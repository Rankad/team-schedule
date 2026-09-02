# Design — "Earlier days" toggle on the current week

**Date:** 2026-09-02
**Status:** Approved (brainstorm)
**Area:** static site only (`public/index.html`, `public/app.js`, `public/styles.css`, `tests/site_smoke.js`)
**No change to:** the Python build, the data format, `public/data/*.json`, the GitHub Actions workflows.

## Background

A parent reported "I only see the remaining days of the week, not the full week."
Investigation: the site already renders **every** day of the selected week that
exists in the data — there is no past-day filtering. The partial week they saw is
a real property of the data: 2026-09-02 is the season's first week, and the club's
calendar has almost nothing on Sun–Tue (3 / 3 / 0 sessions across all teams) then
jumps to ~46 on Wednesday. Next week already has a full Sun–Sat.

Separately, the parent asked for a way to choose between "only what's left this
week" and "the whole week". That is worth doing on its own merits: mid-week, a
parent mostly cares about upcoming sessions, and a past day still consumes screen
space on a phone.

## Goal

On the **current week only**, collapse days that have already passed behind a
small expander, so the default view is "today onward". The choice (collapsed /
expanded) is remembered per device.

## Non-goals

- No effect on past weeks or future weeks — they always show all seven days.
- No per-session "already ended today" hiding — whole days only.
- No change to the weekly summary, the export actions, the changes banner, or the
  "no session this week for team X" notices — all keep using the full week.
- No new data, no build changes, no Python changes.

## Definitions

- **Today** — `todayYmd()`, the existing local (Asia/Jerusalem-ish, device clock)
  `YYYY-MM-DD` helper.
- **Current week** — the visible week (`viewSunday`) whose Sunday ≤ today ≤ the
  following Saturday. Equivalent check: `viewSunday === sundayOf(todayYmd())` **and**
  `viewSunday` is present in `DATA.weeks`. If today's Sunday is not in `DATA.weeks`
  (data window doesn't cover today), there is no current week and the toggle never
  appears.
- **Past day** — a date `d` in the current week with `d < todayYmd()`.
- **Hidden past day** — a past day that has ≥ 1 followed session.

## Behavior

1. The toggle logic runs only when the visible week is the current week. On any
   other week, render exactly as today (all day-groups, no expander row).
2. On the current week:
   - Split the week's followed sessions (from the existing `weekSessionsFor(viewSunday)`)
     into **past** (`date < today`) and **upcoming** (`date >= today`) day-groups,
     each already day-then-time sorted.
   - **Collapsed** (default): render only the upcoming day-groups. If there is ≥ 1
     hidden past day, render the expander row above them.
   - **Expanded**: render the past day-groups first, then the upcoming day-groups,
     then the expander row collapses back. Past day-groups look identical to normal
     day-groups.
   - If there are **no** hidden past days, no expander row appears — identical to
     today's output.
3. Default for a visitor who has never set the toggle: **collapsed**.
4. The collapsed/expanded state persists across reloads and across week navigation
   (navigating to another week and back to the current week keeps the last state).

## UI

- **Expander row**, rendered by JS as the first child of `#week-content`, before
  the first day-group:
  - Collapsed: `▸ הצג ימים קודמים (N)` where `N` = number of hidden past days.
  - Expanded: `▾ הסתר ימים קודמים`.
  - A single `<button type="button">`, full width, min height 44px, quiet styling
    consistent with `#share-follows` / `.wact` (muted accent, no heavy fill).
  - `aria-expanded` reflects state. The triangle is decorative (`aria-hidden`).
- **Render order inside `#week-content`** (current week): expander row (when there
  is ≥ 1 hidden past day) → past day-groups (only when expanded) → upcoming
  day-groups, or the empty-upcoming message in their place.
- **Empty-upcoming case** (e.g. it is Saturday, or the followed team only trained
  earlier this week): the upcoming list is empty. In place of the upcoming
  day-groups, show a one-line message `אין עוד אימונים השבוע`. The expander row
  still sits above it; expanding inserts the past day-groups between the row and
  the message. If there are also **no** past sessions at all this week, render
  neither the expander nor the message — fall through to the existing
  "no session this week for team X" / empty rendering unchanged.

## Summary, exports, other sections

Unchanged. `renderSummary`, the four export builders (`buildWeekText`, `buildICS`,
`drawWeekImage`, and the share text), `renderChangesBanner`, and the
"empty-team" notices all keep calling `weekSessionsFor(viewSunday)` and operate on
the full week regardless of the toggle.

## Code structure

- **New pure helper** in `app.js`:
  ```
  splitWeekByToday(weekSessions, viewSunday, todayYmd)
    -> { isCurrentWeek: bool,
         pastGroups:     [ [date, [session,...]], ... ],
         upcomingGroups: [ [date, [session,...]], ... ] }
  ```
  When `viewSunday` is not the current week, returns
  `{ isCurrentWeek:false, pastGroups:[], upcomingGroups: <all groups> }` so the
  caller has one code path.
  Pure and side-effect free — no DOM, no `localStorage`, no `Date.now()` beyond the
  `todayYmd` argument. Unit-testable directly.
- **`renderMyWeek`** uses `splitWeekByToday`, then:
  - if `!isCurrentWeek` → render `upcomingGroups` as now (no expander).
  - else → render the expander row (when `pastGroups.length > 0`), then
    `pastGroups` if expanded, then `upcomingGroups` (or the empty message).
- **New state + persistence:**
  - `LS_WEEK_COLLAPSED = 'gilboa.week_collapsed'` — stored `'1'` (collapsed) or
    `'0'` (expanded). Absent ⇒ treated as `'1'`.
  - Module variable `weekCollapsed` loaded at startup with the other state, wrapped
    in try/catch like `loadFollowed`.
  - The expander button's click handler flips `weekCollapsed`, writes
    `localStorage`, and calls `renderMyWeek()` (or just `render()`).
- **`index.html`**: no structural change required — the expander row is created in
  JS. (If the plan prefers a static element it may add one hidden `<button>`; not
  required.)
- **`styles.css`**: one new rule block for the expander row, mirroring the existing
  quiet-button pattern.

## Testing (`tests/site_smoke.js`)

The harness already stubs the DOM and `localStorage` and drives `renderMyWeek`.
Add assertions, injecting a fixed "today":

1. **Split** — with `today` mid-week, `splitWeekByToday` puts earlier dates in
   `pastGroups`, today + later in `upcomingGroups`, both sorted.
2. **Non-current week** — `viewSunday` a past or future week ⇒ `isCurrentWeek:false`,
   all groups in `upcomingGroups`, no expander row in the DOM.
3. **Collapsed default** — fresh `localStorage` ⇒ past day-groups absent from the
   DOM, expander row present with the correct `(N)`.
4. **Expand** — clicking the expander adds the past day-groups, updates the label
   to `הסתר ימים קודמים`, and writes `gilboa.week_collapsed = '0'`.
5. **Persistence** — with `gilboa.week_collapsed = '0'` preset, past day-groups
   render on first paint.
6. **Empty upcoming** — `today` = Saturday ⇒ `אין עוד אימונים השבוע` message shown,
   expander present, expanding reveals the past groups.
7. **No past sessions** — current week but all followed sessions are today/later ⇒
   no expander row, no message, output identical to pre-change.
8. **Summary unaffected** — footer count + hours equal the full-week totals in both
   collapsed and expanded states.

`node tests/site_smoke.js` must stay green. `pytest` is untouched.

## Rollout

Single commit on a short-lived branch off `main`, merged fast-forward. The deploy
workflow's `push` trigger on `public/**` redeploys automatically. No data
regeneration needed.
