# Design — Rides to / from practice (הסעות)

**Date:** 2026-09-03 (revised 2026-09-04 after researcher + UX + architecture review)
**Status:** Approved (brainstorm) — pending stakeholder review of this revision
**Approach:** Two approved slices (see §11). This document covers both; each item
is marked **[A]** (first slice) or **[B]** (second slice).

**Areas touched:**
- `public/` static site — new `public/rides.js`, new `public/manager.html` +
  `public/manager.js` + `public/manager.css`, additions to `app.js`,
  `index.html`, `styles.css`.
- **New** `functions/` — Cloudflare Pages Functions (the rides API) + one KV
  namespace.
- **Hosting migration** — site moves from GitHub Pages to Cloudflare Pages
  (amends DL-026). Starts on a `*.pages.dev` address; custom domain deferred.
- Docs — `decision-log.md`, `known-constraints.md`, `execution-plan.md`,
  `qa-checklist.md`, `architecture.md`, a new `RIDES.md` runbook.

**No change to:** the Python build, `schedule.json` / `teams.json` / `meta.json`
/ `changes.json` shapes, the schedule-refresh cron schedule (it gains one step
that calls `/api/purge`, §8.1), or the fact that the schedule half of the app is
fully static and works with the rides API down.

**Revision note (2026-09-04).** Three specialist reviews ran against the first
draft. All endorsed the product direction, the privacy design, and the
schedule/rides isolation boundary. This revision folds in their required
changes: per-row KV keys instead of one array (silent-data-loss race);
structural-only write validation; hosting consolidated onto Cloudflare Pages;
generated manager passphrase + shorter session + Cloudflare Access before wide
launch; edge rate-limiting instead of a KV counter; client-throttled opens ping;
schema-version tag on every stored value; a visible "last purge" healthcheck;
and a reworked presentation layer (labelled chip not a red/green icon,
bottom-sheet not a card-anchored popover, top-of-week rides summary card,
separate `manager.html`, benefit-led first-run).

---

## 1. Background & problem

The club (גלבוע מעיינות) organises **shared transport** to and from training.
Vehicles run on fixed routes from a single hub — **אולם עין חרוד** — to each
practice location and back. Today the club collects ride needs informally
(WhatsApp, word of mouth); the ride manager has no reliable per-practice
headcount: how many players need a vehicle, to which practice, in which
direction, and who they are.

The existing app already shows each family a clean weekly view of their followed
team(s). This feature adds, **for players only**, the ability to declare a ride
need on each practice, and gives the club ride manager a password-gated
dashboard that aggregates those needs by day and practice.

This is the project's first collection of **personal data about minors** (a
player's name tied to practice times and, in **[B]**, a station). It is also the
first **stateful service** in a project whose architecture has been "no server,
no database, Git repo is the datastore". Both facts drive §7 and §11.

## 2. Goals

- A player can, in a few taps from their team's weekly view, say "I need a ride
  there / back / both" for each practice.
- The ride manager gets a reliable per-practice headcount: counts by direction,
  the named list of players, and the vehicle's departure times.
- The manager configures departure timing with no data entry beyond two numbers
  per practice location.
- **[B]** A player can request a one-way end-of-week ride to a regional
  transport station; the manager manages the station list and the run's day/time.
- Zero recurring cost beyond an optional future domain. Cloudflare's free tier
  (Pages, Functions, KV) covers the expected volume many times over (§8.7).
- The schedule half of the app keeps working, unchanged, if the rides API is
  down (§8.8).

## 3. Non-goals (v1)

- **No parent carpooling / driver-supply side.** The club runs the vehicles;
  the app only captures demand. No "I can drive, N seats".
- **No manager → player feedback in the app.** Players declare; the manager
  plans and communicates off-app. No "confirmed / cancelled" status on the
  player's card. *(Open question 1 — the data model leaves room, §8.3.)*
- **No request cutoff / lock time.** Requests stay editable until the practice.
  *(Open question 1.)*
- **No notifications** of any kind (push, email, WhatsApp).
- **No pickup-point selection for practice rides.** Every practice ride starts
  from / ends at אולם עין חרוד. Only **[B]** station rides have a chosen endpoint.
- **No accounts.** A single generated manager passphrase in **[A]**; Cloudflare
  Access (email one-time-PIN) before club-wide rollout (§7.4).
- **No map, no address entry, no geocoding.**
- **No carry-over.** Each week starts with every ride unset.
- **No multi-child-per-device.** One device in player mode = one player.
  Siblings each use their own device.

## 4. Roles & identity

### 4.1 Role entry **[A]**

**Not** a persistent segmented toggle next to the follow chips (parents would
thumb-miss into the minors'-data consent modal, and it clutters the "one calm
screen per week" the app is built around).

Instead:
- A single low-key text action, styled like the existing `.share-follows` link,
  set off from `#follows-row` by whitespace/divider:
  **"רישום להסעות — מעבר למצב שחקן"**. The outcome-led label is what a kid
  scans for.
- A one-line hook on the empty `#onboarding` card:
  *"השחקן/ית עצמם? עברו למצב שחקן כדי להירשם להסעות."*
- Once in player mode, the **rides summary card** (§5.4) sits at the top of My
  Week and *is* the persistent "you are in player mode" signal; the
  switch-back action lives there. "Which mode am I in" is never ambiguous.

Stored per device: `localStorage['gilboa.role']` = `'player'` (absent / anything
else = parent). Wrapped in try/catch like `loadFollowed`.

### 4.2 Switching to שחקן — consent, then name **[A]**

1. **Consent notice** (§7.1) as a native `<dialog>`. Benefit-led first line;
   legal detail behind the persistent "מדיניות פרטיות" link. Buttons
   *"הבנתי, אפשר להמשיך"* / *"ביטול"*. `Esc` = cancel = stays parent.
2. On accept: a single screen (not a second modal) with the name field:
   - Label *"שם מלא"*, helper line *"השם המלא גלוי רק לרכז ההסעות."*
   - **Live preview** under the field as they type: *"יוצג לשחקנים אחרים כ: דניאל כ׳"*.
   - Empty / whitespace → inline *"יש להזין שם מלא"*, no submit.
   - One word → warn once (*"נא להזין שם פרטי ומשפחה"*) and the button changes
     to **"שמור בכל זאת"**, so a second press is an explicit confirm, not a
     dead click.
   - A **"→ חזרה"** action reverts `gilboa.role` to parent cleanly (no
     stranded role=player / no-token state).
3. On save: `POST /api/token` (§8.3). On success, store
   `localStorage['gilboa.player'] = { token, fullName }` and re-render in player
   mode. **On failure:** inline *"לא הצלחנו לשמור, נסו שוב"* + retry; keep the
   typed name; stay on the step. Never silently fall back to parent mode.

### 4.3 Name display **[A]**

- **Player-facing, everywhere in the site:** first name + last initial + `׳`
  — `"דניאל כהן"` → `"דניאל כ׳"`. Helper `shortName(fullName)` in `rides.js`,
  pure, unit-tested. Single-word name → shown as-is.
- **Manager dashboard only:** the full string.
- The full name is sent to the API (the manager needs it) but is **never
  rendered anywhere a non-manager can see it**.

### 4.4 "No name → no rides" **[A]**

In player mode with no `gilboa.player.token`:
- **Ride chips are not rendered at all** on the session cards. One clear call to
  action beats N disabled controls scattered through the list.
- A persistent inline card sits at the top of My Week (same slot as the rides
  summary card): *"כדי להירשם להסעות, הזינו שם מלא"* + the name field + `שמור`,
  inline (not a toast pointing at an off-screen field). Same save / failure
  behaviour as §4.2 step 3.

### 4.5 Player token **[A]**

- Minted by the API with a CSPRNG, ≥128-bit, URL-safe base64, opaque.
- Stored only in `localStorage['gilboa.player'].token`. **Never** in a URL,
  query string, or the DOM.
- It is the player's sole credential to read / edit / cancel their own requests.
- **Storage loss** (cleared, Safari ~7-day script-storage cap, new device) →
  the player re-does §4.2 and gets a new token. The previous week's rows stay
  under the old token and expire on their own (§8.4). Same "per-device, can be
  lost" limitation already documented for followed teams (DL-007) — documented,
  not solved in v1. A QR / claim-code transfer is a candidate for a later slice.

### 4.6 Switching back to הורה **[A]**

From the rides summary card. Prompt:
*"המעבר למצב הורה ימחק את בקשות ההסעה שלך לשבוע זה. להמשיך?"*. On confirm:
`DELETE /api/me?token=…` (removes this token's ride rows + station row for the
current week), then clear `localStorage['gilboa.player']` and set role parent.
Best-effort: on call failure still clear locally; the weekly purge removes the
server rows.

### 4.7 Followed teams

Player mode uses the **same** follow / search / share flow as parent mode. Ride
chips appear on every session of every followed team. A player normally follows
exactly one team; more is supported with no special handling.

## 5. Player experience

### 5.1 Ride chip on each session card **[A]**

**Not** a red/green car icon — the site palette has no red and no green, red
reads as "something is broken" on every undecided practice, and hue-only state
fails a colour-blind glance.

In `renderSession`, when in player mode **with a token**, add a dedicated
full-width block between `.session-line` and `.session-note` (a lightly tinted
strip — scan order: time → who/where → **ride action** → notes). Inside it, one
chip in the existing `.wact` / `.chip` house style:

| state | chip |
|---|---|
| no request | outlined — **`🚐 הוספת הסעה`** |
| has request | filled/accent — **`🚐 הלוך וחזור ✓`** (direction in words), with a caption line below: *"יוצא מעין חרוד 16:20 · חזרה 18:45"* |
| has request, no time set yet | **`🚐 הלוך וחזור ✓`** + caption *"טרם נקבעה שעה"* |

State is carried by fill + label + check + icon — never hue alone. The chip is a
real `<button type="button">`, ≥44×44, `aria-haspopup="dialog"`, accessible name
includes the team + day and the current state
(*"הסעה: הלוך וחזור, יוצא 16:20; לעריכה"* / *"אין הסעה לאימון זה; להוספה"*).
`aria-pressed` is **not** used (the chip opens a chooser, it is not a toggle).

Every time token in the caption is wrapped with the existing `ltrIsolate()`
helper (as `.session-time` already is) or the digits and `·` separators reorder
under RTL bidi. Covered by a smoke test.

### 5.2 Trip-type bottom sheet **[A]**

Tapping the chip opens a **bottom-sheet `<dialog>`** (not a popover anchored to
the card — anchor math breaks on small viewports, edge cards, keyboard, and
RTL). Native `<dialog>` gives the focus trap, `Esc`, `::backdrop`, and
`returnValue` for free; it matches the manager password dialog (§6.1).

- **Context heading** replaces the spatial anchor:
  *"נערות א · יום ג׳ · אולם קציר"*.
- Option rows, stacked, each ≥44px:

  | option | meaning |
  |---|---|
  | **הלוך וחזור** | round trip — **preselected default** |
  | **הלוך** | אולם עין חרוד → practice location |
  | **חזור** | practice location → אולם עין חרוד |

- **`ביטול הסעה`** — only rendered when a request exists, **separated by a
  divider, muted-red text**, never flush against `חזור` (a mis-tap must not
  delete a ride).
- Open → focus the sheet heading or the preselected row. Any close route →
  restore focus to the chip. After a selection, update the chip's accessible
  name and fire an `aria-live` announcement of the new state + times.
- Transition respects `prefers-reduced-motion`.
- Selecting a direction → `PUT /api/request` (§8.3), optimistic: chip updates
  immediately; spinner sets `aria-busy` and preserves the accessible name; on
  failure revert and toast (*"שמירת ההסעה נכשלה, נסו שוב"* for 5xx/network;
  *"לא ניתן לבחור הסעה לאימון זה"* for a 400 — not retryable, no retry loop).
- `ביטול הסעה` → `DELETE /api/request` → chip back to `🚐 הוספת הסעה`.

Inline card expansion is an acceptable fallback if `<dialog>` proves
problematic, but it causes list reflow / scroll jump; the sheet is preferred.

### 5.3 Weekly reset **[A]**

Requests are stored per **week key = the week's Sunday as `YYYY-MM-DD`** — the
exact value the site computes with `sundayOf(date)` and uses as `week_key`
throughout `schedule.json` and the UI. Helper `weekKey(sessionDate)` in
`rides.js` delegates to that convention; pure, unit-tested. Every session in one
on-screen (Sun–Sat) week maps to the same key. A new week starts with every
chip unset because no rows exist for its key — no client-side "clear" logic.

### 5.4 Rides summary card + הסעות screen **[A]** / **[B]**

**Entry is a summary card**, not a button in `#week-actions` (that row is the
deliberately quiet "get my data out" row per DL-023, and it is hidden when the
week has no sessions — wrong condition for a week-level feature, and it breaks
the **[B]** station entry on practice-free weeks).

- **Rides summary card** — top of My Week in player mode, directly under the
  follows row / share link, styled like `#changes-banner` (a tappable summary):
  *"ההסעות שלי לשבוע זה: 2 · 1 ללא שעה"* (or *"טרם נרשמת להסעות השבוע"*). Tap →
  `#screen-rides`. This is also the player-mode indicator and the home of the
  "מעבר למצב הורה" action. Parent mode: not shown.
- **`#screen-rides`** (same pattern as the Add-Team screen, `goto('rides')`):

  **[A]** For the **visible week**, every ride the player has requested, grouped
  by day: practice name · location · direction · departure time(s) · edit
  (reopens §5.2) · cancel. Per-row controls carry an `aria-label` with practice
  + day.

  **Empty state is actionable** (with no carry-over, *every* player sees it at
  the start of *every* week): list the week's practices for the followed team(s)
  right there, each with a `🚐 הוספת הסעה` button, under a line
  *"בחרו אימון כדי להוסיף הסעה"*. Not a dead screen.

  **[B]** Below that, an **end-of-week station ride** block:
  - Header *"הסעה לסוף השבוע"* + the manager-set day & time
    (*"יום חמישי · יציאה מאולם עין חרוד 18:00"*).
  - A radio list of stations from `config/stations` (seed: אגד עפולה ·
    רכבת עפולה · אגד בית שאן · רכבת בית שאן; manager-editable).
  - One-way only. Select → `PUT /api/station-request`; *"ביטול"* →
    `DELETE /api/station-request`.
  - Opt-in **per week**, nothing carries over.
  - If `config/stations` is empty or the day/time is unset: show a muted
    *"הסעת סוף השבוע תפורסם בהמשך"* placeholder (not a broken picker, not a
    silent gap).
- **Load failure of `GET /api/me`** for a player who had rides → show
  *"לא ניתן לטעון את ההסעות שלך"* with a **"נסו שוב"** action (the schedule
  itself loaded from static JSON — a full reload is the wrong ask). Distinct
  from the "loaded, empty" state.

## 6. Manager experience

### 6.1 Separate page **[A]**

The manager UI is **`public/manager.html`** + `manager.js` + `manager.css`
(sharing `styles.css`), **not** a view inside the parents' app. This keeps
manager code off every parent's phone, keeps a `מנהל` button out of the shared
header, and keeps `goto()` simple. Static-host-compatible. The URL is recorded
in `RIDES.md`; the manager bookmarks it. **No `מנהל` button in `index.html`.**

Entry: `manager.html` → password `<dialog>` (`type="password"`,
`autocomplete="off"`) → `POST /api/manager/login` → on 200 a short-lived
**manager session token** (TTL **4–6 h**, §7.4) in
`localStorage['gilboa.manager']` → the dashboard. On 401 → *"סיסמה שגויה"*
(no lockout beyond the edge rate-limit). A *"יציאה"* action clears the token.

Two tabs: **לוח בקרה** (dashboard) and **הגדרות** (settings).

### 6.2 Dashboard — לוח בקרה **[A]**

- **Day stepper** `‹ יום ה׳ 11/9 ›` reusing the existing `.week-nav` pattern
  (not 7 chips — overflows a 360px screen). Default = today; week arrows to move
  across weeks. Data from `GET /api/manager/dashboard?week=<key>`.
- **Day header:** *"סה״כ: 12 נוסעים · 5 הסעות"* (distinct rides = team × session
  × direction; round-trip counts toward both directions).
- **One row per practice with ≥1 request**, collapsed by default:
  *"נערות א · אולם קציר · 17:00 · 4 נוסעים"*. Tap to expand:

  > יציאה מעין חרוד 16:20 · חזרה 18:45  *(or "טרם נקבעה שעה")*
  > הלוך וחזור (3): דניאל כהן · מאיה לוי · נועה בר
  > הלוך בלבד (1): יונתן שמש
  > חזור בלבד (0): —

  Full names appear here and nowhere else. Names are not all rendered at once —
  only in an expanded row.
- **Orphaned requests** (a request whose `sessionId` no longer matches any
  session in the current `schedule.json` — the club deleted+recreated the
  calendar event) are shown in a distinct *"בקשות ללא אימון תואם"* group, never
  silently dropped.
- Practices with zero requests are behind a *"הצג אימונים ללא נוסעים"* toggle.
- A day with **no requests at all**: *"אין בקשות הסעה ליום זה"* (not an empty
  screen with a lone toggle).
- **`העתקת תוכנית היום כטקסט`** action (mirrors DL-023) — the manager's real
  workflow is almost certainly pasting the day's plan into a drivers' WhatsApp
  group. Plain-text, client-built.
- **[B]** end-of-week **stations** section: per station, count + named list, a
  total.
- A one-line **health footer:** *"ניקוי אחרון: 4/9"* from the purge healthcheck
  (§8.4) — a silently-dead cleanup job means minors' data piling up, so it must
  be visible.

### 6.3 Usage stats tab **[A]**

Its own tab (or the bottom of the dashboard) — not mixed into the actionable
content:
- שחקנים רשומים — this week / all-time *(approximate — see §8.5)*
- בקשות הסעה השבוע — הלוך / חזור / תחנות
- הסעות מתוכננות (distinct rides)
- מיקומים פעילים
- כניסות לאפליקציה — today / 7-day *(approximate — see §8.5)*

### 6.4 Settings — הגדרות **[A]**

**זמני יציאה** — one row per practice location present in the published
`schedule.json` (names pulled from the data; the manager never types them). Per
row, two number inputs:
- **הלוך** — minutes before practice **start** the vehicle leaves אולם עין חרוד.
- **חזור** — minutes after practice **end** the vehicle leaves the practice
  location. Blank ⇒ the global default.

Plus:
- **`+ הוסף מיקום`** — a text field for a location the calendar does not yet
  contain. Stored in `config/locations` with `manual: true`.
- **delete** per row — a manual row is removed; a calendar-derived row just has
  its times cleared (reappears blank next load).
- **ברירת מחדל לחזרה** — one global number (default 15).

The app turns offsets into clock times, in the session's own wall-clock time
(no timezone math): `departOutbound = sessionStart − הלוך`,
`departReturn = sessionEnd + (חזור or default)`. Helper `computeDepartTimes`,
pure, unit-tested. The player chip caption and the dashboard show the **same**
"טרם נקבעה שעה" when unset.

**[B] תחנות** — the station list: add (text) / rename / delete. Stored in
`config/stations` as `[{ id, name }]` (`id` = short CSPRNG id, stable across
renames).

**[B] הסעת סוף שבוע** — weekday picker + time input for the run's departure
from אולם עין חרוד. Stored in `config/global`.

### 6.5 Manager scoping

**One club-wide manager.** The dashboard shows every team. No per-team
coordinator role in v1. The `Authorization: Bearer` model extends to multiple
managers / Cloudflare Access later with no data change.

## 7. Privacy, consent, retention, security

### 7.1 Consent notice (Hebrew, shown at §4.2) **[A]**

Draft — final wording with the legal opinion (Open question 2). Benefit first,
detail behind the link:

> **רישום להסעות — מה נשמר**
> כדי לתאם לך הסעה, נשמור את השם המלא שהזנת ואת בקשות ההסעה שלך (לאילו אימונים,
> לאיזה כיוון).
> **מי רואה:** רכז ההסעות של המועדון בלבד, במסך מוגן בסיסמה. השם המלא אינו מוצג
> לאף הורה או שחקן אחר — הם רואים "דניאל כ׳".
> **לכמה זמן:** נמחק אוטומטית בסוף כל שבוע.
> **מחיקה מיידית:** מעבר חזרה למצב הורה מוחק את הנתונים שלך עכשיו.
> פרטים מלאים ובקשת מחיקה: [מדיניות פרטיות].

The persistent **"מדיניות פרטיות"** footer link → `#screen-privacy` (in
`index.html`) with the full text + the deletion-request contact.
**`[contact]` / `[מדיניות פרטיות]` placeholders are filled from the stakeholder
before Slice A ships** (Open question 2).

### 7.2 Data minimisation **[A]**

Stored per player: `fullName` + ride picks + (optional, **[B]**) one station id.
**No** phone, address, email, home location, age, or free text. Practice-ride
origin is always אולם עין חרוד, so no home/pickup data exists anywhere.

### 7.3 Retention **[A]**

- Every `week/<key>/*` KV key is deleted by the daily purge (§8.4) once `<key>`
  (the week's Sunday) is before the current week's Sunday.
- The opens counter keeps only aggregate daily integers — no IP, no cookie, no
  per-visitor record.
- `config/*` persists (no personal data).
- The purge runs fail-loud with a visible healthcheck (§8.4, §6.2).

### 7.4 Security **[A]**

- **Tokens** (player + manager session): CSPRNG ≥128-bit, opaque, `localStorage`
  only, never in URLs. Every stored JSON value carries `v: 1` (schema version).
- **Manager passphrase:** **generated for the manager** — a 4–5 random-word
  passphrase, not user-chosen (a non-coder will not pick a strong one, and edge
  rate-limiting only suffices against brute force if the secret has real
  entropy). Stored as a Cloudflare **environment secret**
  (`MANAGER_PASSPHRASE`), never in the repo, never shipped to the client;
  verified server-side with a constant-time compare. Session token TTL 4–6 h.
- **Before Slice B / club-wide rollout:** put `manager.html` and every
  `/api/manager/*` route behind **Cloudflare Access** (Zero Trust, free ≤50
  users, email one-time-PIN). Real per-person audit + instant revoke, no auth
  code in the app, and it turns "password rotation" (Open question 3) into
  "remove an email from the policy". Recommended posture for auditable access to
  minors' data.
- **Rate limiting:** Cloudflare **edge Rate Limiting Rules** (free plan
  includes one rule), enforced before the Function runs, covering `/api/token`,
  `/api/request`, `/api/station-request`, `/api/ping`, `/api/manager/login`.
  **No KV counter** (it has the same read-modify-write race as the data and
  throttles itself during exactly the burst it should stop). Plus structural
  caps: ≤~20 request rows per token per week; reject a write when the week's row
  count exceeds a sane ceiling (fail loud); 1 KB body cap. Turnstile on
  `/api/token` kept in reserve if abuse ever appears.
- **Write validation is structural only:** id format/regex, `direction ∈
  {round,out,back}`, non-empty name, body < 1 KB. The API does **not** fetch
  `schedule.json` on the write path (couples two deploys, has a stale window,
  and a bogus row is harmless — it never renders and the purge removes it).
  `schedule.json` is consumed only on the dashboard read path (§8.3), where it
  is needed anyway and staleness only affects a view the manager refreshes.
- **CORS:** `Access-Control-Allow-Origin` = the site origin, from an env var
  (`SITE_ORIGIN`), documented in `RIDES.md` — not a hard-coded string in a
  second place to forget.
- No secrets, tokens, or names in Function logs.

### 7.5 Legal **[A]**

Stakeholder to obtain a short opinion: (a) does this database need registration
under the PPL as amended (Amendment 13); (b) is the §7.1 consent sufficient for
collecting an identified minor's name + schedule (+ station in **[B]**).
**Blocker for club-wide rollout**, not for the single-team pilot.

## 8. Backend — Cloudflare Pages Functions + KV

### 8.1 Shape

The site and the API live in **one Cloudflare Pages project**, one git-connected
deploy, one secrets store. API routes are Pages Functions under `functions/api/`
(e.g. `functions/api/request.js`), bound to one KV namespace (`RIDES_KV`) and
the env vars `MANAGER_PASSPHRASE`, `SITE_ORIGIN`. No framework.

The **daily purge** cannot be a Pages Functions cron (not supported), so it is
**one authenticated `POST /api/purge`** called by the **existing twice-daily
GitHub Action** (the schedule-refresh workflow) — no second scheduler, no second
platform. The call carries an internal secret (`PURGE_KEY` env var + GitHub
secret). If Pages Functions cron support lands later, migrate to it.

### 8.2 KV keys — per-row, not per-week-array

The first draft stored each week's requests as one array rewritten on every
write. KV is last-write-wins with no CAS; two players saving inside the
propagation window both read the old array and the second write silently drops
the first player's row — while their optimistic UI shows success. Usage is
bursty (a Sunday-night WhatsApp reminder → 20–30 families open at once), so
collisions cluster. **Per-row keys instead:**

| key | value (all carry `v:1`) |
|---|---|
| `week/<wk>/req/<token>/<sessionId>` | `{ token, fullName, teamId, sessionId, direction, ts, v }` |
| `week/<wk>/station/<token>` | `{ token, fullName, stationId, ts, v }` **[B]** |
| `config/locations` | `{ "<name>": { outbound:int\|null, ret:int\|null, manual:bool }, v }` |
| `config/global` | `{ retDefault:15, stationDay:null, stationTime:null, requestCutoffHoursBefore:null, v }` |
| `config/stations` | `{ list:[{id,name}], v }` **[B]** |
| `week/<wk>/rideStatus` | `{ "<teamId>|<sessionId>|<direction>": "on"\|"cancelled", v }` — reserved for Open question 1; absent until written; single-writer (manager), LWW fine |
| `stats/opens/<yyyy-mm-dd>/<rand>` | `1` — per-row shards; sum on read (see §8.5) |
| `stats/players-all` | integer — best-effort all-time distinct (see §8.5) |

`<wk>` = week key (Sunday `YYYY-MM-DD`, §5.3). `config/*` is single-writer (the
manager) so its blob form is fine. Every write is now independent — no race.
`list({ prefix })` is still eventually consistent, but that is a self-healing
visibility delay, not data loss. Migration target if aggregation contention ever
grows: Cloudflare **D1** (noted, not adopted).

### 8.3 Endpoints (`/api/*`)

Public (player):
- `POST /api/token` → `{ token }`. Edge-rate-limited. Increments
  `stats/players-all` best-effort.
- `GET /api/me?token=&week=` → `{ requests:[…], stationRequest:{…}|null,
  rideStatus:{…} }` for this token (list by prefix `week/<wk>/req/<token>/`).
- `PUT /api/request` `{ token, fullName, teamId, sessionId, direction }` →
  write `week/<wk>/req/<token>/<sessionId>`. Upsert (same key = replace).
  Structural validation only (§7.4). `direction ∈ {round,out,back}`.
- `DELETE /api/request` `{ token, sessionId }`.
- `PUT /api/station-request` `{ token, fullName, stationId }` → write
  `week/<wk>/station/<token>`. **[B]**
- `DELETE /api/station-request` `{ token }`. **[B]**
- `DELETE /api/me?token=&week=` → delete all `week/<wk>/req/<token>/*` +
  `week/<wk>/station/<token>` (used by §4.6).
- `POST /api/ping` → write `stats/opens/<today>/<rand>` = 1. Body ignored.
  Client throttles to ≤ 1/hour/device (§8.5). Edge-rate-limited.

Manager (`Authorization: Bearer <managerSessionToken>` on all):
- `POST /api/manager/login` `{ passphrase }` → `{ token }` (TTL 4–6 h) or 401.
- `GET /api/manager/dashboard?week=` → fetches the current `schedule.json`,
  joins it with `list('week/<wk>/req/')`, returns the §6.2 blocks (incl.
  orphaned-request group) + `rideStatus` + the §6.3 stats + `lastPurge`.
- `GET /api/manager/config` → `config/locations` merged with the location list
  from the live `schedule.json`, plus `config/global` and `config/stations`.
- `PUT /api/manager/config` → partial update of any `config/*` (blob rewrite,
  single-writer).

Internal:
- `POST /api/purge` (`X-Purge-Key: <PURGE_KEY>`) → §8.4.

### 8.4 Purge

Called by the existing GitHub Action (§8.1). `list()` all `week/` keys; delete
every `week/<wk>/*` where `<wk>` (Sunday `YYYY-MM-DD`) is before the current
week's Sunday. Trim `stats/opens/*` older than 90 days. `config/*` untouched.
On success write `config/global.lastPurge = <today>`; the dashboard shows it
(§6.2). A stale `lastPurge` is the fail-loud signal that the job stopped.

### 8.5 Usage stats — explicitly approximate

- **Opens:** `POST /api/ping` writes a sharded key `stats/opens/<date>/<rand>`
  (a fresh random suffix per call) so concurrent writes never collide; the
  dashboard sums the prefix. The **client throttles to ≤ 1/hour/device** via a
  `localStorage` timestamp — without this, a WhatsApp blast (~2k loads) would
  dominate the free-tier **1k KV writes/day** budget and start failing *ride*
  writes. Fired in both roles, `keepalive`, failure ignored.
- **Registered players (week):** count of distinct `<token>` prefixes under
  `week/<wk>/req/` at dashboard time. A player who set up a name but requested
  no ride is not counted — acceptable.
- **Registered players (all-time):** `stats/players-all`, incremented
  best-effort on `POST /api/token`. Last-write-wins means it can undercount
  under concurrency — **labelled "≈" in the UI**.
- Ride counts / planned rides / active locations: computed from the `week/<wk>`
  rows at dashboard time (exact).

### 8.6 Data-model room for the open questions

No migration needed to answer Open question 1 later:
- **Request cutoff:** `config/global.requestCutoffHoursBefore` (already in the
  blob, defaults null). Enforcement needs the session start on the write path —
  at that point either the client passes `sessionStart` or the Function joins
  `schedule.json` there; decide then.
- **Manager marks a ride on/cancelled:** `week/<wk>/rideStatus` (already
  reserved, §8.2). `GET /api/me` already returns `rideStatus`; the player chip
  would gain a third visual state (e.g. `✓ מאושר` / `✗ בוטל`).

### 8.7 Cost / free-tier

Workers/Functions free: 100k req/day. KV free: 100k reads, **1k writes**, 1k
deletes/day, 1 GB, ~1 write/s/key.
- Ride writes: ~30–60/day — far under 1k.
- Reads: `GET /api/me` per player load + dashboard `list`+multiget — low
  thousands/day, fine.
- Deletes: one week's keys per day at rollover — under 1k; the purge spreads
  them.
- **The one cliff was the opens ping** — resolved by the 1/hour client throttle
  + sharded keys (§8.5). Everything else has 2–10× headroom at 10× growth.

### 8.8 Failure behaviour

Any `/api/*` call failing (network, 5xx) → the rides UI shows
*"שירות ההסעות אינו זמין כרגע"* + a **"נסו שוב"** action (not "reload" — the
schedule loaded from static JSON). The rides summary card shows the same on tap.
The **schedule half of the app is completely unaffected** — this boundary is
absolute and enforced in code review: `rides.js` failures never touch
`renderMyWeek`'s schedule path. `GET /api/me` "loaded empty" and "failed to
load" are distinct states (§5.4). The opens ping never surfaces an error.

## 9. Static-site changes

- **`public/rides.js`** — new, all player-side rides logic, loaded after
  `app.js`. Vanilla JS, no build. Pure helpers on `window` for tests:
  `shortName`, `weekKey`, `rideCaption`, `computeDepartTimes`.
- **`public/app.js`** — minimal hooks: render the role-entry link and (player
  mode) the rides summary card / inline name card; in `renderSession` call
  `Rides.decorateSession(card, session)` in player mode with a token; a
  `goto('rides')` target. **No manager code here.**
- **`public/index.html`** — the role-entry link container; the rides summary /
  name card slot; `#screen-rides`; the "מדיניות פרטיות" footer link +
  `#screen-privacy`. **No `מנהל` button.**
- **`public/manager.html` + `manager.js` + `manager.css`** — the manager app
  (§6). Shares `styles.css`.
- **`public/styles.css`** — the ride chip block + states, bottom sheet, role
  link, rides summary card, `#screen-rides`, `#screen-privacy`, consent/name
  dialogs. RTL-first, existing palette, quiet-button pattern. Bottom-sheet
  transition under `prefers-reduced-motion`.
- **API base URL** — derived at runtime from `location.hostname`
  (`localhost` / `127.0.0.1` → local dev URL, else same-origin `/api`). No
  hard-coded const to edit before deploy (DL-015 footgun). Documented in
  `RIDES.md`.

## 10. Testing

**Functions (`functions/**/__tests__` or `worker/test/`, Vitest +
`@cloudflare/vitest-pool-workers`, real `workerd` + Miniflare KV):**
1. `POST /api/token` — well-formed unique token; `stats/players-all` bumped.
2. `PUT /api/request` — rejects a malformed `sessionId` / bad `direction` /
   oversized body; accepts a valid one; **same key upserts** (no dup).
3. `DELETE /api/request` / `DELETE /api/me` — remove only the right prefix.
4. `GET /api/manager/dashboard` — join with a fixture `schedule.json`: counts by
   direction, round-trip both ways, names, empty practices excluded, day totals,
   **orphaned-request group** for a request whose session is gone.
5. `computeDepartTimes` — per-location + default fallback + unset → "טרם נקבעה שעה".
6. Manager auth — missing/!bad Bearer → 401 on every `/api/manager/*`; good
   passphrase → usable token; token past TTL → 401.
7. `POST /api/purge` — wrong/absent `X-Purge-Key` → 401; deletes only
   strictly-past weeks; keeps config; writes `lastPurge`.
8. `POST /api/ping` — sharded key written; prefix sum correct.
9. **[B]** station upsert + dashboard station section.
10. CORS header = `SITE_ORIGIN`; preflight handled.

> **Known limitation:** Miniflare is single-threaded/consistent, so the KV
> last-write-wins race **cannot be reproduced in tests**. Concurrency
> correctness is designed out via per-row keys (§8.2), not tested out — stated
> in `qa-checklist.md`.

**Site (`tests/site_smoke.js` style — DOM + `localStorage` harness):**
1. Parent default → no role card content beyond the link, no ride chips.
2. Switch to player → consent dialog → name step with live "יוצג כ" preview →
   (stub `POST /api/token`) → re-render, chips appear. `POST /api/token`
   failure → inline error, name kept, still player-step. "→ חזרה" reverts.
3. `shortName` / `weekKey` / `rideCaption` / `computeDepartTimes` unit cases,
   incl. `ltrIsolate` wrapping every time token in the caption.
4. No token → chips **not rendered**; inline name card shown; saving reveals chips.
5. Ride chip: `הוספת הסעה` → sheet (round-trip preselected) → chip becomes
   `הלוך וחזור ✓` + caption; `ביטול הסעה` → back to `הוספת הסעה`; 5xx reverts +
   toast; 400 → non-retry toast.
6. `#screen-rides` — grouped by day; edit reopens the sheet; cancel removes the
   row; **empty state lists practices with add-buttons**; `GET /api/me` failure
   → "לא ניתן לטעון" + retry (distinct from empty).
7. Switch back to הורה → prompt → local clear → `DELETE /api/me`.
8. API down → chips/summary show unavailable + "נסו שוב"; the weekly list,
   summary, exports, changes banner all still render.
9. **[B]** station block: placeholder when unconfigured; selectable when configured.

**Manager (`manager.html` harness):**
10. Password dialog → (stub 200) dashboard; (stub 401) error, no dashboard.
11. Day stepper moves the day; practice rows collapsed → expand shows names;
    all-empty day → "אין בקשות"; orphaned group renders; "העתקת תוכנית היום"
    builds the expected text; health footer shows `lastPurge`.

`node tests/site_smoke.js` and `pytest` stay green. A third CI job runs the
Functions tests (`npm ci && npm test` in the functions package) — the repo's
first `node_modules`, isolated to that package; the Functions code itself stays
dependency-free.

## 11. Rollout

### Hosting migration (precedes Slice A) — amends DL-026

1. Create a Cloudflare Pages project connected to the repo, build output
   `public/`, no build command. Serves at `*.pages.dev` for now (custom domain
   deferred — Open question 4).
2. Move `GOOGLE_CALENDAR_API_KEY` handling: the Python build still runs on
   GitHub Actions and commits `public/data/*.json`; Cloudflare Pages
   auto-deploys on push to `main`. The GitHub Pages workflow is retired; the
   keepalive job stays (repo activity).
3. Verify the live site on `pages.dev` is byte-identical in behaviour; keep the
   old GitHub Pages URL alive with a redirect notice for one transition period.
4. `architecture.md` + DL-026 amendment + `known-constraints.md` (Cloudflare
   account, env secrets, `pages.dev` URL).

### Slice A
5. Branch off `main`. KV namespace; `functions/api/*` for the non-**[B]**
   endpoints + `/api/purge`; env secrets `MANAGER_PASSPHRASE` (generated),
   `SITE_ORIGIN`, `PURGE_KEY`; the edge rate-limit rule; the GitHub Action step
   that calls `/api/purge`.
6. Site: role-entry link, consent + name (with preview / "שמור בכל זאת" /
   back-out / failure paths), ride chips + bottom sheet, rides summary card +
   `#screen-rides` (actionable empty state), `#screen-privacy`, throttled ping.
7. `manager.html` + `manager.js`: login, dashboard (collapsed rows, day stepper,
   orphan group, copy-day-as-text, health footer), settings (זמני יציאה),
   stats tab.
8. Docs: decision-log entries (backend, rides model), `RIDES.md` runbook
   (API URL, how to read/wipe KV, rotate the passphrase, the CORS env var),
   `execution-plan.md` phases, `qa-checklist.md` rides + privacy + the
   concurrency-not-testable note.
9. Fill the §7.1 `[contact]` placeholders from the stakeholder.
10. QA pass (qa-reviewer) + a security/privacy review pass (new checklist).
11. **Single-team pilot** — soft-launch to one team ~2 weeks. The manager
    answers Open question 1 from real use.
12. Stakeholder starts the legal review.

### Slice B
13. Put `manager.html` + `/api/manager/*` behind Cloudflare Access.
14. Station list management, `הסעת סוף שבוע` settings, `/api/station-request`,
    dashboard station section, `#screen-rides` station block.
15. QA + security review deltas.
16. Club-wide rollout **after** the legal review clears and the club signs off
    on the new data collection (courtesy note to parents — the app link was
    approved for sharing under OQ-6, but ride-data collection is new).

Each slice = one or more short-lived branches merged to `main`; Cloudflare Pages
auto-deploys site + Functions together on push.

## 12. Open questions

1. **Manager feedback + request cutoff.** Mark a ride on/cancelled back to
   players? A lock time after which requests freeze? Stakeholder + ride manager
   decide during the Slice A pilot. Data model already leaves room (§8.6) — a
   later slice, no migration.
2. **Consent wording + contact.** §7.1 is a draft with `[contact]` placeholders;
   finalise with the legal opinion before Slice A ships.
3. **Manager password rotation.** Generated passphrase, manual rotation on
   request in Slice A; Cloudflare Access removes the question in Slice B.
4. **Custom domain.** Starting on `*.pages.dev`. A ~$10/yr domain would make the
   parent link permanent across any future hosting change — revisit before
   club-wide rollout.

## 13. Missing capabilities (flagged)

- **No backend / serverless builder profile.** Existing build agents target the
  static site + Python parser. Extend builder-tech-lead's brief (or add a
  profile) covering Cloudflare Pages Functions, KV, token design, edge
  rate-limiting, Cloudflare Access, and Vitest pool-workers — before Slice A
  implementation.
- **No security / privacy review step.** New `qa-checklist.md` section (token
  entropy, write-path abuse, retention + purge healthcheck, CORS, consent flow,
  the concurrency-not-testable note) and a review gate before each slice ships.
- **Legal review is outside agent scope** — stakeholder action (§7.5 / OQ-2).
