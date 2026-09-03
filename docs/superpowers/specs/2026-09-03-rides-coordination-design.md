# Design — Rides to / from practice (הסעות)

**Date:** 2026-09-03
**Status:** Approved (brainstorm) — pending stakeholder review of this document
**Approach:** Two approved slices (see Rollout). This document covers both; each
item is marked **[A]** or **[B]**.

**Areas touched:**
- `public/` static site — new `public/rides.js`, additions to `app.js`,
  `index.html`, `styles.css`.
- **New** `worker/` — a Cloudflare Worker + KV store (the rides backend).
- Docs — `decision-log.md`, `known-constraints.md`, `execution-plan.md`,
  `qa-checklist.md`, a new `RIDES.md` runbook.

**No change to:** the Python build, `schedule.json` / `teams.json` / `meta.json`
/ `changes.json` shapes, the GitHub Pages deploy flow, the schedule-refresh cron.

---

## 1. Background & problem

The club (גלבוע מעיינות) organises **shared transport** to and from training.
Vehicles run on fixed routes from a single hub, **אולם עין חרוד**, to each
practice location and back. Today the club collects ride needs informally
(WhatsApp, word of mouth) and the ride manager has no reliable per-practice
headcount: how many players need a vehicle, to which practice, in which
direction, and who they are.

The existing app already shows each family a clean weekly view of their followed
team(s). This feature adds, **for players only**, the ability to declare a ride
need on each practice, and gives the club ride manager a password-gated dashboard
that aggregates those needs by day and practice.

This is the project's first collection of **personal data about minors** (a
player's name tied to practice times). It is also the first **stateful backend**
in a project whose architecture has been "no server, no database, Git repo is the
datastore". Both facts drive the privacy, security and rollout sections below.

## 2. Goals

- A player can, in a few taps, say "I need a ride to / from / both for this
  practice" on any practice of a team they follow.
- The ride manager sees, per day and per practice: counts by direction, the
  named list of players in each shared ride, and the vehicle's departure times.
- The manager configures departure timing without data entry beyond two numbers
  per practice location.
- **[B]** A player can request a one-way end-of-week ride to a regional transport
  station; the manager manages that station list and the run's day/time.
- Zero recurring cost. Cloudflare Worker + KV free tier covers the expected
  volume (dozens of players, low hundreds of writes per week) many times over.
- The schedule half of the app is untouched and keeps working if the rides
  backend is down.

## 3. Non-goals (v1)

- **No parent carpooling / driver-supply side.** The club runs the vehicles;
  the app only captures demand. No "I can drive, N seats".
- **No manager → player feedback in the app.** Players declare; the manager
  plans and communicates off-app. No "confirmed / cancelled" ride status on the
  player's card. *(Open question 1 — may change after the manager trials Slice A.)*
- **No request cutoff / lock time.** Requests stay editable until the practice.
  *(Open question 1.)*
- **No notifications** of any kind (push, email, WhatsApp).
- **No pickup-point selection for practice rides.** Every practice ride starts
  from / ends at אולם עין חרוד. Only **[B]** station rides have a chosen endpoint.
- **No accounts, no login** beyond a single shared manager password.
- **No map, no address entry, no geocoding.**
- **No carry-over.** Each week starts with every ride unset.
- **No multi-child-per-device.** One device in player mode = one player. Siblings
  each use their own device.

## 4. Roles & identity

### 4.1 Role switch **[A]**

On "My Week", above `#follows-row`, a two-option control:

- **הורה** (parent) — **default**. The app behaves exactly as today. No car
  icons, no הסעות button, no backend calls except the anonymous open-ping (§8.5).
- **שחקן** (player) — unlocks the ride features in §5.

Stored per device: `localStorage['gilboa.role']` = `'parent'` (or absent) /
`'player'`. Wrapped in try/catch like `loadFollowed`.

### 4.2 Switching to שחקן — consent then name **[A]**

1. Show the **consent notice** (§7.1) as a modal. Buttons: *"הבנתי, המשך"* /
   *"ביטול"*. Cancel → stays הורה.
2. On accept, show a single text input: *"שם מלא"* + *"שמור"*. Empty / whitespace
   is rejected inline (*"יש להזין שם מלא"*). A name is **2+ words**; a
   one-word entry warns once (*"נא להזין שם פרטי ומשפחה"*) but is accepted on a
   second submit (some players genuinely go by one name).
3. On save: the app calls `POST /token` (§8.3), stores
   `localStorage['gilboa.player'] = { token, fullName }`, and re-renders in
   player mode.

### 4.3 Name display **[A]**

- **Player-facing** (everywhere in the site): **first name + last initial + "."**
  — `"דניאל כהן"` → `"דניאל כ."`. Helper `shortName(fullName)` in `rides.js`,
  pure, unit-tested. Single-word name → shown as-is.
- **Manager dashboard only:** the full `fullName` string.
- The full name is **sent to the backend** (the manager needs it) but is **never
  rendered** anywhere a non-manager can see it.

### 4.4 "No name, no rides" **[A]**

Car icons still render in player mode before a name is set (edge case: storage
partially cleared). Tapping one with no `gilboa.player.token` →
toast/inline message *"מלא/י שם מלא כדי לבחור הסעה"* and scroll+focus to the
name field. No backend call.

### 4.5 Player token **[A]**

- Minted by the Worker with a CSPRNG, ≥128-bit, URL-safe base64, opaque.
- Stored only in `localStorage['gilboa.player'].token`. **Never** placed in a
  URL, query string, or the DOM.
- It is the player's sole credential to read / edit / cancel their own requests.
- **Storage loss** (cleared, Safari 7-day cap, new device) → the player re-does
  §4.2 and gets a new token. Their previous week's requests remain under the old
  token and expire on their own (§8.4). This is the same "per-device, can be
  lost" limitation already documented for followed teams (DL-007); documented,
  not solved in v1. A share/QR transfer is a candidate for a later slice.

### 4.6 Switching back to הורה **[A]**

Prompt: *"המעבר למצב הורה ימחק את בקשות ההסעה שלך. להמשיך?"*. On confirm:
`DELETE /me?token=` (removes this player's requests + station request for the
current week), then clear `localStorage['gilboa.player']` and set role
`'parent'`. Best-effort: if the call fails, still clear locally; the weekly
purge will remove the server rows.

### 4.7 Followed teams

Player mode uses the **same** follow / search / share flow as parent mode.
Car icons appear on every session of every followed team. A player normally
follows exactly one team; more than one is supported with no special handling.

## 5. Player experience

### 5.1 Car icon on each session card **[A]**

In `renderSession`, above the `.loc` (📍) line, add a `.ride-toggle` control
when `role === 'player'`:

- **Red car** — no request for this `sessionId`.
- **Green car** — a request exists; a caption line under it shows the direction
  in words and the times: *"הלוך וחזור · יוצא מעין חרוד 16:20 · חזרה 18:45"*.
- If the manager has not set a departure time for that location:
  *"הלוך וחזור · שעות יתפרסמו"*.
- The icon is a real `<button type="button">`, min 44×44px target,
  `aria-pressed` = has-request, `aria-label` includes the team + day so it is
  unambiguous with multiple cards. Colour is **never** the only signal — the
  word "הסעה" / direction text is always present.

### 5.2 Trip-type popup **[A]**

Tapping the car opens a small popup anchored to the card (a `<dialog>` or a
positioned `div` with a backdrop; must trap focus, close on Esc / backdrop /
selection, and restore focus to the car button):

| Option | Meaning |
|---|---|
| **הלוך וחזור** | round trip — **preselected default** |
| **הלוך** | אולם עין חרוד → practice location |
| **חזור** | practice location → אולם עין חרוד |
| **ביטול הסעה** | delete the request (only shown when one exists) |

Selecting a direction → `PUT /request` (§8.3) → car turns green, caption
updates. "ביטול הסעה" → `DELETE /request` → car turns red. A pending network
call shows a spinner on the car; on failure, revert the icon and toast
*"שמירת ההסעה נכשלה, נסה שוב"*.

### 5.3 Weekly reset **[A]**

Requests are stored per **week key = the Sunday of that week** as `YYYY-MM-DD`
— the exact value the site already computes with `sundayOf(date)` and uses as
`week_key` throughout `schedule.json` and the UI. Helper `weekKey(sessionDate)`
in `rides.js` just delegates to that convention; pure, unit-tested. Every
session in one on-screen (Sun–Sat) week therefore maps to the same key, with no
ISO-week split. When the visible week changes, the car states reflect that
week's requests. A new week naturally starts all-red because no rows exist for
its key. No client-side "clear" logic needed.

### 5.4 הסעות screen **[A]** / **[B]**

New bottom button **`הסעות 🚐`** in `#week-actions`, next to the existing
`🖼️ תמונה` button. Visible only in player mode with ≥1 followed team. Opens a
screen (same pattern as the Add-Team screen: a `#screen-rides` section, `goto('rides')`):

**[A]** For the **visible week**, list every ride the player has requested,
grouped by day, each row: practice name · location · direction · departure
time(s) · an edit control (reopens the §5.2 popup) and a cancel control.
Empty state: *"לא נבחרו הסעות לשבוע זה"*.

**[B]** Below that, an **end-of-week station ride** block:
- Header: *"הסעה לסוף השבוע"* + the manager-set day & time
  (*"יום חמישי, יציאה מאולם עין חרוד 18:00"*).
- A station picker (radio list) from `config/stations`:
  אגד עפולה · רכבת עפולה · אגד בית שאן · רכבת בית שאן (seed; manager-editable).
- One-way only. Selecting a station → `PUT /station-request`. A *"בטל"* clears
  it (`DELETE /station-request`).
- Opt-in **per week** — nothing carries over.
- If `config/stations` is empty or the run day/time is unset, hide the block.

## 6. Manager experience

### 6.1 Entry **[A]**

A small **`מנהל`** button/icon in the top corner of the header (`#app-header`).
Tap → password prompt (`<dialog>`, `type="password"`, no autocomplete).
Submit → `POST /manager/login` with the password; on 200 the Worker returns a
short-lived **manager session token** stored in
`localStorage['gilboa.manager']`; the manager screens open. On 401 → *"סיסמה
שגויה"*, no lockout beyond the endpoint rate-limit. A *"יציאה"* action clears
the token.

The manager screens are a distinct view (`#screen-manager`) with two tabs:
**לוח בקרה** (dashboard) and **הגדרות** (settings).

### 6.2 Dashboard — לוח בקרה **[A]**

- A **day selector** (Sun–Sat of the current week, default = today; prev/next
  week arrows). Data from `GET /manager/dashboard?week=<key>`.
- **Day header:** *"סה״כ: 12 נוסעים · 5 הסעות"* (distinct rides = team × session
  × direction groups; round-trip counts toward both directions).
- **One block per practice** that has ≥1 request that day:

  > **נערות א · אולם קציר · 17:00–18:30**
  > יציאה מעין חרוד 16:20 · חזרה 18:45
  > הלוך וחזור (3): דניאל כהן · מאיה לוי · נועה בר
  > הלוך בלבד (1): יונתן שמש
  > חזור בלבד (0): —

  Full names shown here and nowhere else.
- Practices with zero requests are hidden behind a *"הצג אימונים ללא נוסעים"*
  toggle.
- **[B]** An **end-of-week stations** section: per station, count + named list;
  a total.
- **Usage stats** panel (§8.5): שחקנים רשומים (week / all-time) · בקשות הסעה
  השבוע (הלוך / חזור / תחנות) · הסעות מתוכננות · מיקומים פעילים · כניסות
  לאפליקציה (today / 7-day).

### 6.3 Settings — הגדרות **[A]**

**זמני יציאה** — a table with **one row per practice location present in the
published `schedule.json`** (names pulled from the data — the manager never types
them). Per row two number inputs:

- **הלוך** — minutes before the practice **start** that the vehicle leaves
  אולם עין חרוד (covers travel time to that location).
- **חזור** — minutes after the practice **end** that the vehicle leaves the
  practice location. Blank ⇒ uses the global default.

Plus:
- **`+ הוסף מיקום`** — a text field to add a location the calendar does not yet
  contain (e.g. a venue known in advance). Manually-added rows are stored in
  `config/locations` like any other.
- **delete** on any row. Deleting a manually-added row removes it. Deleting a
  calendar-derived row just clears its times (it reappears blank next load).
- **ברירת מחדל לחזרה** — one global number (default 15) used when a row's
  **חזור** is blank.

The app converts these offsets into the clock times shown to players and on the
dashboard: `departOutbound = sessionStart − הלוך`, `departReturn = sessionEnd +
(חזור or default)`, all in the session's own wall-clock time (no timezone math,
consistent with the rest of the site).

**[B] תחנות** — the station list: add (text), rename, delete. Stored in
`config/stations` as `[{ id, name }]` (`id` = CSPRNG short id, stable across
renames).

**[B] הסעת סוף שבוע** — a weekday picker + a time input for the run's departure
from אולם עין חרוד. Stored in `config/global`.

### 6.4 Manager scoping

**One club-wide manager.** The dashboard shows every team. No per-team
coordinator role in v1.

## 7. Privacy, consent, retention

### 7.1 Consent notice (Hebrew, shown at §4.2) **[A]**

Draft — to be finalised with the legal opinion (Open question 2):

> **מעבר למצב שחקן — מה חשוב לדעת**
> כדי לתאם הסעות, האפליקציה תשמור: השם המלא שהזנת, ובקשות ההסעה שלך (לאילו
> אימונים, לאיזה כיוון).
> מי רואה את זה: רכז ההסעות של המועדון בלבד, דרך מסך מוגן בסיסמה. שמך המלא אינו
> מוצג לאף הורה או שחקן אחר.
> לכמה זמן: הנתונים נמחקים אוטומטית בסוף כל שבוע.
> מחיקה מיידית: מעבר חזרה למצב הורה מוחק את הנתונים שלך עכשיו.
> שאלות או בקשת מחיקה: [contact].

A persistent **"מדיניות פרטיות"** link (footer) opens a short page with the same
content plus the contact route for a deletion request.

### 7.2 Data minimisation **[A]**

Stored per player: `fullName` + ride picks + (optional) station pick. **No**
phone, address, email, home location, age, or free text. The ride origin is
always אולם עין חרוד, so no home/pickup data exists.

### 7.3 Retention **[A]**

- `week/<key>/*` KV keys are deleted by a **daily scheduled Worker** once
  `<key>` (the week's Sunday, §5.3) is before the current week's Sunday.
- The open-ping counter keeps only **aggregate daily integers** — no IP, no
  cookie, no per-visitor record (§8.5).
- `config/*` keys persist (no personal data).

### 7.4 Security **[A]**

- **Tokens** (player + manager session): CSPRNG ≥128-bit, opaque, `localStorage`
  only, never in URLs.
- **Manager password:** a Worker **secret** (`wrangler secret put MANAGER_PW`),
  never in the repo, never shipped to the client. Verified server-side
  (constant-time compare). `POST /manager/login` and `/manager/*` are
  rate-limited per IP.
- **Public write endpoints** (`/token`, `/request`, `/station-request`, `/ping`):
  per-IP rate limit via a KV counter with TTL; JSON body size cap (e.g. 1 KB);
  `sessionId` must resolve to a real session in the current published
  `schedule.json` (the Worker fetches and caches it) or the write is `400`.
- **CORS:** `Access-Control-Allow-Origin` pinned to the Pages origin only.
- No secrets, tokens, or names in Worker `console.log` / tail logs.

### 7.5 Legal **[A]**

Stakeholder to obtain a short opinion: (a) does this database require
registration under the PPL (as amended, Amendment 13); (b) is the §7.1 consent
text sufficient for collecting an identified minor's name + schedule. **Launch
blocker for a club-wide rollout**, not for the single-team pilot.

## 8. Backend — Cloudflare Worker + KV

### 8.1 Shape

One Worker, path-routed, JSON in/out, no framework. One KV namespace
(`RIDES_KV`). A `[triggers] crontab` for the daily purge. `wrangler.toml` +
`worker/src/` + `worker/test/`. Deployed with `wrangler deploy` (separate from
GitHub Pages).

### 8.2 KV keys

| key | value |
|---|---|
| `week/<wk>/requests` | `[{ token, fullName, teamId, sessionId, direction, ts }]` |
| `week/<wk>/stationReq` | `[{ token, fullName, stationId, ts }]` |
| `config/locations` | `{ "<locationName>": { outbound: <int|null>, ret: <int|null>, manual: <bool> } }` |
| `config/global` | `{ retDefault: 15, stationDay: "Thu"|null, stationTime: "18:00"|null }` |
| `config/stations` | `[{ id, name }]` |
| `stats/players/<wk>` | set-cardinality helper (list of tokens seen that week) |
| `stats/opens/<yyyy-mm-dd>` | integer |
| `rl/<ip>/<bucket>` | integer, short TTL (rate-limit counter) |

`<wk>` = week key (Sunday `YYYY-MM-DD`, per §5.3). Writing a request rewrites the whole small array for that
week (volume is low; no need for per-row keys).

### 8.3 Endpoints

Public (player):
- `POST /token` → `{ token }`. Rate-limited.
- `GET /me?token=&week=` → `{ requests: [...], stationRequest: {...}|null }`
  (this token only).
- `PUT /request` `{ token, fullName, teamId, sessionId, direction }` → upsert
  one row (unique by `token`+`sessionId`). `direction ∈ {round, out, back}`.
- `DELETE /request` `{ token, sessionId }`.
- `PUT /station-request` `{ token, fullName, stationId }` → upsert (unique by
  `token`). **[B]**
- `DELETE /station-request` `{ token }`. **[B]**
- `DELETE /me?token=&week=` → remove this token's rows for the week (used by
  §4.6).
- `POST /ping` → increment `stats/opens/<today>`. Body ignored. Rate-limited
  per IP (1 per some minutes) so it is a rough "opens" gauge, not a precise
  counter.

Manager (all require `Authorization: Bearer <managerSessionToken>`):
- `POST /manager/login` `{ password }` → `{ token }` (session token, TTL e.g.
  12 h) or `401`.
- `GET /manager/dashboard?week=` → aggregated blocks (§6.2) + stats (§8.5).
- `GET /manager/config` → `config/locations` merged with the location list from
  the live `schedule.json`, plus `config/global` and `config/stations`.
- `PUT /manager/config` → partial update of any `config/*`.

### 8.4 Purge (scheduled)

Daily cron: list `week/` keys, delete every `week/<wk>/*` where `<wk>` (Sunday
`YYYY-MM-DD`) is before the current week's Sunday. Delete `stats/players/<wk>`
on the same rule. Keep `stats/opens/*` for a rolling 90 days then trim.
`config/*` untouched.

### 8.5 Usage stats

- **Opens:** the site calls `POST /ping` once per page load, in **both** roles,
  fire-and-forget (`keepalive`, failure ignored). Cookieless, no IP stored
  (IP used only transiently for the rate-limit counter, which itself has a short
  TTL). Dashboard shows today + 7-day sum.
- **Registered players:** cardinality of `stats/players/<wk>` (tokens are added
  when a request is written) for the week, plus an all-time distinct count
  maintained as a single integer incremented on first-ever `POST /token`.
- **Ride counts / planned rides / active locations:** computed from
  `week/<wk>/requests` at dashboard time.

### 8.6 Failure behaviour

Any rides call failing (network, 5xx) → the ride UI shows
*"שירות ההסעות אינו זמין כרגע"* in place of the car controls / הסעות screen and
the **schedule half of the app is completely unaffected**. The open-ping never
surfaces an error.

## 9. Static-site changes

- **`public/rides.js`** — new file, all rides logic, loaded after `app.js`.
  Vanilla JS, no build. Pure helpers exposed on `window` for tests:
  `shortName`, `weekKey`, `rideCaption`, `computeDepartTimes`,
  `groupDashboard` (if any aggregation is mirrored client-side).
- **`public/app.js`** — minimal hooks: render the role switch; in
  `renderSession`, call `Rides.decorateSession(card, session)` when in player
  mode; add the `הסעות` button wiring; expose a `goto('rides')` /
  `goto('manager')` target.
- **`public/index.html`** — new hidden sections `#screen-rides`,
  `#screen-manager`; the `מנהל` button in the header; the role switch container;
  the `הסעות` button in `#week-actions`; a privacy-policy link + `#screen-privacy`.
- **`public/styles.css`** — car-icon states, trip popup, role switch, הסעות
  screen, manager dashboard + settings tables, privacy page. RTL-first, reuse
  the existing palette and the quiet-button pattern.
- **Config:** the Worker base URL is a single `const RIDES_API` at the top of
  `rides.js` (different value for local dev vs production; documented in
  `RIDES.md`).

## 10. Testing

**Worker (`worker/test/`, run in CI):**
1. `POST /token` returns a well-formed unique token; rate limit trips after N.
2. `PUT /request` rejects an unknown `sessionId`; accepts a real one; upserts
   (second PUT for same token+session replaces, not duplicates).
3. `DELETE /request` / `DELETE /me` remove the right rows only.
4. `GET /manager/dashboard` aggregation: counts by direction, round-trip counted
   both ways, names listed, empty practices excluded, day totals correct.
5. Departure-time math: `computeDepartTimes` with per-location and default
   fallback.
6. Manager auth: no/!bad token → 401 on every `/manager/*`; good password →
   usable session token; session token expires.
7. Purge deletes only strictly-past weeks; keeps config; keeps current week.
8. `POST /ping` increments the day counter and is rate-limited.
9. **[B]** station request upsert + dashboard station section.
10. Body-size cap and CORS header assertions.

**Site (`tests/site_smoke.js` style, DOM + localStorage harness):**
1. Role switch: default parent → no car icons, no הסעות button; switch to
   player runs the consent + name flow (stub the token call) and re-renders.
2. `shortName` / `weekKey` / `rideCaption` / `computeDepartTimes` unit cases.
3. Car icon: red with no request; tapping with no name → message + focus, no
   fetch; with a name → popup; selecting הלוך וחזור → green + caption; ביטול →
   red. Network failure reverts the icon.
4. הסעות screen lists the week's requests grouped by day; edit reopens the
   popup; cancel removes the row.
5. Switching back to הורה prompts, clears local state, calls `DELETE /me`.
6. Backend-down: car controls replaced by the unavailable message; the weekly
   schedule list, summary, exports, changes banner all still render.
7. **[B]** station block hidden when stations empty; shown and selectable when
   populated.
8. Manager button → password dialog → (stub 200) manager screens; (stub 401)
   error, no screens.

`node tests/site_smoke.js` and `pytest` must both stay green. Add a
`worker` test script to CI.

## 11. Rollout

### Slice A
1. Branch off `main`.
2. Worker: scaffold, KV namespace, endpoints §8.3 minus **[B]**, purge cron,
   tests. Deploy to Cloudflare; set `MANAGER_PW` secret; note the URL.
3. Site: role switch, consent + name, car icons + popup, הסעות screen (practice
   rides only), manager entry + dashboard + settings, privacy page, open-ping.
4. Docs: decision-log entries, `known-constraints.md` (Cloudflare account, 2nd
   secret, PPL), `RIDES.md` runbook, `execution-plan.md` phases,
   `qa-checklist.md` rides + privacy section.
5. QA pass (qa-reviewer) + security/privacy review pass.
6. **Single-team pilot** (Approach 3 fallback is folded in here): soft-launch to
   one team for ~2 weeks. Manager answers Open question 1 from real use.
7. Stakeholder starts the legal review.

### Slice B
8. Station list management, `הסעת סוף שבוע` settings, station request endpoints,
   dashboard station section, הסעות-screen station block.
9. QA + security review deltas.
10. Club-wide rollout **after** the legal review clears and the club signs off
    on the new data collection (courtesy note to parents).

Each slice is one or more short-lived branches merged to `main`; the Pages
deploy `push` trigger on `public/**` redeploys the site; the Worker deploys
independently via `wrangler`.

## 12. Open questions

1. **Manager feedback + request cutoff.** Does the manager want to mark a
   practice's ride "on / cancelled" back to players, and/or a lock time after
   which requests freeze? Stakeholder to decide with the ride manager during the
   Slice A pilot. If yes, it is a Slice B (or later) addition — the data model
   leaves room (`config` + a per-session status).
2. **Consent wording.** §7.1 is a draft; finalise with the legal opinion.
3. **Manager password rotation.** Manual on request for now; revisit if the
   password leaks or the manager changes.

## 13. Missing capabilities (flagged)

- **No backend / serverless builder profile.** Existing build agents target the
  static site + Python parser. Recommend extending builder-tech-lead's brief (or
  a dedicated profile) to cover Cloudflare Workers, KV, token design,
  rate-limiting, CORS, and `wrangler` deploy before implementation of Slice A.
- **No security / privacy review step.** Add a checklist to `qa-checklist.md`
  (token entropy, write-path abuse, retention, CORS, consent flow) and a review
  gate before each slice's rollout.
- **Legal review is outside agent scope** — stakeholder action (Open question 2 /
  §7.5).
