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
- If no team followed yet → onboarding card: heading "בחירת קבוצה", a short
  paragraph, then a `＋ בחירת קבוצה` button to screen 2. (The `הורה` / `שחקן`
  segmented control that DL-034 added above the heading was removed, DL-042.)
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
  - **Hide a training (DL-044):** each TRAINING row has an ✕ (ringed circle,
    inline-end of the hour line, ≥44px target). Tap = removed from the list;
    remembered per team + weekday + ordinal-within-the-day and applied to every
    following week even if the hour changes. Club `game` rows and personal
    games get no ✕. A day header disappears when its only training is hidden;
    the earlier-days expander counts visible rows only.
  - **Chip badge / restore:** a team chip with removed days shows a dashed
    badge `N מוסתרים` (`1 מוסתר` for one). Pressing the chip restores ALL of
    that team's trainings (all weeks). Unfollowing forgets the arrangement.
  - **Hidden empty states:** team all hidden → `כל האימונים של <name> מוסתרים
    השבוע` + `הצג (N)`; whole week hidden → card `כל האימונים של השבוע
    מוסתרים` + `החזרת כל האימונים (N)`.
  - **Game row:** dark `🏆 משחק` tag, no team label/dot, trash icon (delete,
    6s Undo). Title `משחק חוץ/בית נגד <opponent>` (no opponent → `משחק חוץ/בית`).
- **`＋ הוסף משחק`** (DL-044): button visible whenever ≥1 team is followed, not
  in onboarding. Opens a bottom-sheet `<dialog>`:
  - date — default today (or Sunday of the viewed week); min/max = published
    weeks −7 / +13 days; empty → `בחרו תאריך`
  - start time — required; empty → `בחרו שעת התחלה`; ≥22:00 → `המשחק נמשך
    שעתיים ולכן חייב להתחיל לפני 22:00`
  - **בית/חוץ** toggle, default חוץ
  - opponent team name — optional, ≤40 chars
  - note `משך המשחק קבוע: שעתיים` (game = fixed 2 hours); no edit — delete +
    re-add. Toast on save `המשחק נוסף ל<weekday date>, <time>`.
  - On the current week, days before today are collapsed by default behind a
    "הצג ימים קודמים (N)" toggle at the top of the list; the parent can expand
    them and the choice is remembered. Other weeks always show the full Sun–Sat.
- **Export action row** (DL-023): shown only when ≥1 team is followed and the
  visible week has ≥1 session, just below the weekly list. **Since DL-044 the
  row also hides when the visible list is empty (e.g. all trainings hidden),
  and every action covers exactly what is on screen: hidden trainings left
  out, the parent's own games included.** Four unobtrusive
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
- Footer: weekly summary — "2 אימונים · 3 שעות". With games (DL-044):
  `2 אימונים · משחק אחד · 5 שעות`; counts only what is on screen. A club
  `game` row counts as "משחק".
- The `?teams=` share link carries only followed teams — **not** hidden
  trainings or personal games (those are per phone).

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

## Visual identity (DL-036)
- **Brand accent:** the club's red `#D0212C` (`--accent`), `#A81B24` for pressed
  states and heavier accent text (`--accent-dark`). Replaced the earlier
  contrast-chosen teal. Surface white, background `#f4f5f7`.
- State is never carried by hue alone (the palette has no green; brand red is
  the brand colour, not a status). Warning **text** (`.session-warn`) uses a
  dedicated `--warn` token — burnt-orange `#b54708` — never the brand red
  (DL-037). (The rides-specific error classes, destructive buttons, `.ride-strip`
  and summary-card amber from DL-037 were removed with the rides UI, DL-041/042.)
- Amber (`--banner-bg`) is reserved for banner-style attention elements — the
  changes banner.
- Week-nav arrows use neutral `var(--text)` for the glyph (not the brand
  accent); the disabled arrow is `#8b9096` (DL-037).
- **Team dot palette** (`app.js` `PALETTE`) is independent of the brand accent —
  8 fixed accessible hues, assigned by follow order, none of them the brand red.
- **App name on screen is now הפועל העמק (DL-045, 2026-11-11)** — header
  `.club-name`, `<title>`/`og:title` (`הלו״ז שלי — הפועל העמק`), follows-share
  (`הקבוצות שלי — הפועל העמק`), weekly copy-text/share title, PNG export title,
  download names `הפועל-העמק-שבוע-<date>.ics/.png`. The colour/logo discussion
  here refers to the real club's identity and is unchanged.
- Header: wordmark (name per DL-045). A logo lockup + favicon/manifest/share-image are
  specced (`2026-09-06-club-branding-theme-design.md`) but deferred pending a
  high-res logo from the club.
- Share tags: `theme-color` + text OG/Twitter tags on `index.html` (the
  manager page they were also on was removed, DL-042) so a pasted link shows a title + description.

## Interaction details
- Week navigation never loads a week with no data silently — show "אין נתונים
  לשבוע זה" and a hint to import.
- Following/unfollowing is instant, no confirm dialog (reversible).
- Colors for multi-team dots: a fixed accessible palette, assigned by follow
  order, stable per device.
- Times: 24-hour, `HH:MM–HH:MM`.
- Dates: Hebrew weekday letter + `d/m`.
- **Toast with action (DL-044):** hiding a training shows `האימון הוסתר` with an
  Undo action (first-ever hide: `האימון הוסתר. להחזרה לחצו על שם הקבוצה למעלה`);
  deleting a game shows `המשחק נמחק` with Undo (6s). Bottom, must fit 320px.

## Accessibility
- (DL-044) ✕ and trash targets ≥44px with descriptive `aria-label`s; the chip
  carries `aria-label` `הצגת כל האימונים המוסתרים של <name>`. The בית/חוץ
  toggle in the add-game form is a two-button radio group (`role=radio`,
  `aria-checked`) with no arrow-key roving — both buttons are Tab stops (known
  limit).
- RTL throughout; logical tab order.
- Text contrast ≥ 4.5:1; do not rely on dot color alone — always show the team
  label too.
- Tap targets ≥ 44px.
- Works with system font scaling.

## Rides (Phase 6) — REMOVED 2026-11-11 (DL-042)
The whole rides front end — the `הורה` / `שחקן` toggle and compact player link,
consent dialog, name step, rides summary card, `#screen-rides`, privacy screen
(+ footer link), and the coordinator's `manager.html` page — was removed. The
app is a pure team-schedule viewer with no rides UI and no `/api/*` calls; no
personal data is collected. Earlier, DL-041 had removed the per-card ride chip
and trip-type sheet. Design history: `docs/rides-spec.md` (§4/§5, marked
REMOVED) and DL-034/035/037/041 in `docs/decision-log.md`. The backend is left
dormant (see `docs/RIDES.md`).

## Out of scope for MVP UI
- Family / per-child grouping (data model allows it; UI is flat team-follow for
  now — see PRD).
- Push/WhatsApp opt-in UI.
- Any schedule editing.
- Rides (any slice) — front end removed (DL-042); not planned.
