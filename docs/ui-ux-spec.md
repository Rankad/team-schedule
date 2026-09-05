# UI / UX Spec

## Target experience
A parent opens the app and immediately sees their followed teams' sessions for
this week. Setup is a one-time, low-friction "find your team" step that tolerates
not knowing the exact team name. Hebrew, right-to-left, mobile-first.

## Principles
- No login. Selection lives on the device.
- Always show team **and** coach together, so a parent can confirm identity.
- One screen of information per week; no horizontal scroll on mobile.
- The parent thinks in terms of "my kids' sessions", not "which team".

## Screens

### 1. Home — "השבוע שלי" (My Week)
- Header: club name + week range ("7–13 בספטמבר") + prev/next week arrows.
- If no team followed yet → onboarding card: a `הורה` / `שחקן` segmented
  control at the top (הורה selected by default; see Rides below), a role-neutral
  heading "בחירת קבוצה", then a button to screen 2.
- Followed-teams chips row (each: 🏀 team name · coach · ✕ to unfollow) + "＋
  הוסף קבוצה".
- **Shareable link** (DL-022): directly under the chips, a text action
  "🔗 שתף את הקבוצות שלי" (hidden when nothing is followed). Copies
  `…/?teams=<team_id,…>` and offers the native share sheet. Opening such a link
  on another device **merges** the listed teams into that device's follow list
  (never replaces), shows a toast, and strips the `?teams=` query so a refresh
  does not re-apply it. Unknown ids are ignored silently.
- "changes since last update" banner if any (v0.2), tappable to expand. Each
  change spells out the old → new value as `לפני: … · אחרי: …` (no arrow — a
  bare ← is ambiguous and bidi-reordered in the RTL line). A `time_changed`
  whose day moved is relabelled `מועד האימון עודכן` and shows the weekday +
  date on each side.
- Weekly list, grouped by day:
  ```
  ג׳ 8/9
    19:00–20:30   🏀 ילדים ב מזרח   👤 יהלי שגב   📍 ניר דוד
    ℹ️ חצי שעה ראשונה חדר כושר
  ```
  - Multi-team: each row carries a colored dot + team label; sorted day → time.
  - Empty week for a team → "אין אימונים השבוע לקבוצה זו".
  - On the current week, days before today are collapsed by default behind a
    "הצג ימים קודמים (N)" toggle at the top of the list; the parent can expand
    them and the choice is remembered. Other weeks always show the full Sun–Sat.
- **Export action row** (DL-023): shown only when ≥1 team is followed and the
  visible week has ≥1 session, just below the weekly list. Four unobtrusive
  icon+label buttons (≥44px, real `aria-label`s, `--muted` until pressed), each
  acting on the currently visible week + followed teams:
  - **📋 העתק** — copy a clean Hebrew plain-text version of the week (day
    headings, `HH:MM–HH:MM · team · coach · location`, notes on an indented
    sub-line, a "סה״כ" summary). Toast "הועתק ללוח".
  - **📤 שתף** — native share sheet (`navigator.share`) with that text; on
    desktop (no Web Share) it copies the text and opens WhatsApp's share URL.
  - **📅 יומן** — download a `.ics` file (one event per session, times as UTC,
    stable UIDs so re-import updates rather than duplicates).
  - **🖼️ תמונה** — download a PNG rendered from the week (RTL, team colour dots,
    summary); on mobile also offered through the share sheet.
- A brief toast (`role="status"`, bottom, auto-hides ~2s) confirms copy / share
  / download actions.
- Footer: weekly summary — "2 אימונים · 3 שעות".

### 2. Add team — "בחירת קבוצה"
- **One** search field, no mode toggle (DL-021). It matches team name **and**
  coach name in the same box.
- Word-subset match — every word typed must appear in the team or coach name;
  extra spaces ignored. "נערים לאומית" matches "נערים ט לאומית". (DL-020.)
- Empty box lists all teams, Hebrew-alphabetical, so a parent who cannot spell
  the team can browse.
- Results list, each item — team + coach only, no note line (DL-020):
  ```
  🏀 ילדים ב מזרח
  👤 יהלי שגב
  ```
- Tap a result → follow it → return to Home. Can repeat to add more.
- Non-team rows (blocked hall, volleyball, judo, gymnastics) are excluded here.

### 3. (No import screen)
Updates are automatic — a scheduled job reads the club calendar and republishes
the data. There is nothing for a parent or an owner to upload. `meta.json`
carries the last-updated time; show it discreetly in the footer
("עודכן: <date/time>"). Parse failures surface in the GitHub Action log, not the
UI.

## Interaction details
- Week navigation never loads a week with no data silently — show "אין נתונים
  לשבוע זה" and a hint to import.
- Following/unfollowing is instant, no confirm dialog (reversible).
- Colors for multi-team dots: a fixed accessible palette, assigned by follow
  order, stable per device.
- Times: 24-hour, `HH:MM–HH:MM`.
- Dates: Hebrew weekday letter + `d/m`.

## Accessibility
- RTL throughout; logical tab order.
- Text contrast ≥ 4.5:1; do not rely on dot color alone — always show the team
  label too.
- Tap targets ≥ 44px.
- Works with system font scaling.

## Rides (Phase 6) — player mode + manager page
Full spec: `docs/rides-spec.md`. Summary only; that document is authoritative.

### Player mode (inside the existing app, `index.html`/`app.js`/`rides.js`)
- **Entry:** a `הורה` / `שחקן` segmented control at the top of the onboarding
  card (only on the no-teams-followed screen); `הורה` selected by default, each
  half shows its pressed state. A helper line reads
  `הורים — רק צפייה בלוח. שחקנים — גם רישום להסעות.` Tapping `שחקן` shows a
  consent dialog, then an inline "שם מלא" step — placeholder
  `שם פרטי ושם משפחה` in the field, a live `יוצג כ: <shortName>` preview, and
  the empty-field error only after a save attempt. Backing out leaves the
  toggle on `הורה`.
- **Persistent player-mode signal:** a rides summary card at the top of My
  Week (`ההסעות שלי לשבוע זה: 2 · 1 ללא שעה`, or `טרם נרשמת להסעות השבוע`).
  Tap → `#screen-rides`. This card is also home to `מעבר למצב הורה`, which
  prompts before deleting the week's requests.
- **Ride chip:** a full-width tinted strip on each session card, between the
  time/location line and the notes line — outlined `🚐 הוספת הסעה` (no
  request) or filled/accent `🚐 <direction> ✓` with a departure-time caption
  (or `טרם נקבעה שעה`). State is never carried by color alone (no red/green
  in this palette).
- **Trip-type bottom sheet:** tapping the chip opens a `<dialog>` bottom
  sheet — `הלוך וחזור` (preselected) / `הלוך` / `חזור`, plus `ביטול הסעה`
  when a request exists. Optimistic save with toast-on-failure.
- **`#screen-rides`:** the week's requests grouped by day, with an actionable
  empty state (every practice for the week, each with an add-ride button) —
  never a dead screen. A load failure is a distinct state from "loaded,
  empty".
- **Isolation:** if the rides API is unreachable, the ride UI shows a
  contained "unavailable, retry" state; the schedule list, weekly summary,
  exports, and changes banner are completely unaffected.

### Manager page — `public/manager.html` (separate page, not a view in the parent app)
No link from `index.html`; the coordinator bookmarks the URL directly
(`docs/RIDES.md`). Password-gated (`POST /api/manager/login`), 6 h session.
Two tabs:
- **`לוח בקרה` (dashboard):** a day stepper (not 7 chips — overflows mobile);
  a day header with total riders/rides; one collapsed row per practice with
  ≥1 request, expanding to the departure times and the named rider list per
  direction (full names shown **only here**, never to another player);
  practices with zero requests collapsed behind a toggle; an
  **orphaned-requests** group for any request whose session no longer
  matches the published schedule (never silently dropped); a
  "copy today's plan as text" action for pasting into a drivers' WhatsApp
  group; a health footer showing the last purge date (a stale date is the
  fail-loud signal something broke).
- **`הגדרות` (settings):** one row per practice location from the published
  schedule with `הלוך` (minutes before start) / `חזור` (minutes after end,
  blank = global default) number inputs, a "+ add a manual location" field,
  per-row delete, and one global `ברירת מחדל לחזרה` default.
- A third **usage stats** view (own tab or bottom of the dashboard) shows
  approximate counts: registered players (week / all-time), this week's
  requests by direction, distinct planned rides, active locations, app opens
  (today / 7-day).

### Accessibility & interaction notes specific to rides
- Ride chips are real `<button>`s, ≥44×44, `aria-haspopup="dialog"`, with an
  accessible name describing the current state (e.g.
  `הסעה: הלוך וחזור, יוצא 16:20; לעריכה`).
- The bottom sheet traps focus, respects `Esc`/backdrop/`prefers-reduced-motion`,
  and restores focus to the triggering chip on close; a selection fires an
  `aria-live` announcement of the new state.
- Every clock time inside a rides caption is wrapped the same way session
  times already are (`ltrIsolate`), so digits read correctly under RTL bidi.

## Out of scope for MVP UI
- Family / per-child grouping (data model allows it; UI is flat team-follow for
  now — see PRD).
- Push/WhatsApp opt-in UI.
- Any schedule editing.
- Rides Slice B (end-of-week station pickups, per-team coordinators,
  Cloudflare Access login) — separate spec after the Slice A pilot.
