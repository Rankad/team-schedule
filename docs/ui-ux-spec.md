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
- If no team followed yet → onboarding card: "בחר את הקבוצה של הילד/ה" → button
  to screen 2.
- Followed-teams chips row (each: 🏀 team name · coach · ✕ to unfollow) + "＋
  הוסף קבוצה".
- **Shareable link** (DL-022): directly under the chips, a text action
  "🔗 שתף את הקבוצות שלי" (hidden when nothing is followed). Copies
  `…/?teams=<team_id,…>` and offers the native share sheet. Opening such a link
  on another device **merges** the listed teams into that device's follow list
  (never replaces), shows a toast, and strips the `?teams=` query so a refresh
  does not re-apply it. Unknown ids are ignored silently.
- "changes since last update" banner if any (v0.2), tappable to expand.
- Weekly list, grouped by day:
  ```
  ג׳ 8/9
    19:00–20:30   🏀 ילדים ב מזרח   👤 יהלי שגב   📍 ניר דוד
    ℹ️ חצי שעה ראשונה חדר כושר
  ```
  - Multi-team: each row carries a colored dot + team label; sorted day → time.
  - Empty week for a team → "אין אימונים השבוע לקבוצה זו".
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

## Out of scope for MVP UI
- Family / per-child grouping (data model allows it; UI is flat team-follow for
  now — see PRD).
- Push/WhatsApp opt-in UI.
- Any schedule editing.
