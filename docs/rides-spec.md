# Rides Specification — Slice A

Build spec for the **rides-to-practice** feature. Peer of `docs/mvp-spec.md`.
Distilled from the design record
`docs/superpowers/specs/2026-09-03-rides-coordination-design.md` (currently on
branch `feature/rides-coordination-spec`) — that document holds the rationale and
the rejected alternatives; **this** document is what gets built.

**Status:** ready to build once the prerequisites in §2 are cleared.
**Scope:** Slice A only. Slice B (end-of-week station rides) is out of scope here
and gets its own spec after the Slice A pilot — see §13. Items the data model
must leave room for are called out, nothing more.

---

## 1. What this adds (plain language)

The club runs shared vehicles to and from training, all from one hub —
**אולם עין חרוד**. Today the ride coordinator collects who-needs-a-ride over
WhatsApp and has no reliable headcount.

Slice A adds two things to the existing app:

1. **For players** (not parents): a "player mode" where, from their team's normal
   weekly view, they tap a chip on each practice to say *"I need a ride — there /
   back / both."* Requests reset every week.
2. **For the coordinator**: a separate, password-gated page
   (`/manager.html`) that aggregates those requests by day and practice —
   headcount per direction, the named list of players, and the vehicle's
   departure times (computed from two numbers the coordinator sets per location).

This is the project's first stored personal data (a minor's name tied to practice
times) and its first server-side state. That drives §11 and the prerequisites in
§2. The **schedule half of the app is unchanged** and keeps working with the
rides API down (§10.4, §12).

---

## 2. Prerequisites & gates

### Already done
- **Hosting migration to Cloudflare Pages** (DL-028) — merged to `main`
  2026-09-04. The site is served by Cloudflare Pages git integration; the
  scheduled GitHub Action still builds `public/data/*.json` and pushes to
  `main`, which auto-deploys. This spec builds on that.

### Before writing code
- **Merge the design record to `main`.** `docs/superpowers/specs/2026-09-03-rides-coordination-design.md`
  and this file are referenced by DL-028 and `execution-plan.md` but live on a
  branch. Bring both onto `main` so the references resolve.
- **Extend the builder agent brief** (design doc §13): the current build agents
  target the static site + Python parser. Add Cloudflare Pages Functions, KV,
  token design, edge rate-limiting, and Vitest `pool-workers` to
  `builder-tech-lead`'s brief before implementation.

### Before the single-team pilot ships (not before coding)
- **Consent wording + contact** (§11.1, OQ-2): the §11.1 notice is a draft with
  `[מדיניות פרטיות]` / `[contact]` placeholders. The stakeholder fills the real
  deletion-request contact and confirms the wording. Code ships with the
  placeholders visible only in dev.
- **`MANAGER_PASSPHRASE` generated** and set as a Cloudflare environment secret
  (§11.4). Handed to the coordinator out-of-band.

### Before club-wide rollout (Slice B territory, listed for context)
- **Legal opinion** (design doc §7.5, OQ-2): does this database need registration
  under the PPL (Amendment 13); is the §11.1 consent sufficient for an identified
  minor's name + schedule. **Stakeholder action, blocks wide rollout only.**
- `manager.html` + `/api/manager/*` behind **Cloudflare Access** (email OTP).

---

## 3. Identity & storage

### 3.1 `localStorage` keys (all reads wrapped in try/catch, like `loadFollowed`)

| Key | Value | Meaning |
|---|---|---|
| `gilboa.role` | `'player'` \| absent | absent / any other value = parent |
| `gilboa.player` | `{ token, fullName }` (JSON) | the player's credential + name |
| `gilboa.manager` | `{ token, exp }` (JSON) | manager session (in `manager.html` only) |
| `gilboa.ping_ts` | epoch ms (string) | last `/api/ping`; throttle to ≤ 1/hour |

Existing keys (`gilboa.followed`, `gilboa.seen_generated_at`,
`gilboa.week_collapsed`) are untouched.

### 3.2 Player token (§4.5 of the design doc)
- Minted by `POST /api/token`. CSPRNG, ≥128-bit, URL-safe base64, opaque.
- Lives **only** in `localStorage['gilboa.player'].token`. Never in a URL, query
  string, `history` state, or the DOM.
- Sole credential to read / edit / cancel that player's own requests.
- **Loss** (cleared storage, Safari's ~7-day script-storage cap, new device) →
  the player re-enters their name and gets a new token. Old rows expire on their
  own via the weekly purge. Documented limitation, same class as DL-007. A
  QR/claim-code transfer is a candidate for a later slice — **not in Slice A**.

### 3.3 Manager session token
- Minted by `POST /api/manager/login` on a correct passphrase.
- TTL **6 hours** (`exp` = epoch ms). Sent as `Authorization: Bearer <token>` on
  every `/api/manager/*` call. Server verifies signature + `exp`.
- Stored in `localStorage['gilboa.manager']`. `יציאה` clears it.

---

## 4. Player experience

### 4.1 Role entry — `index.html` + `app.js`

`renderRoleToggle()` in `rides.js` renders the parent/player choice in **two
presentations**, picking one per render from `#onboarding`'s visibility and
`gilboa.role`:

**a) Segmented control** (`הורה` / `שחקן`) at the **top of the `#onboarding`
card**, in `#role-toggle-slot` — shown only on the first-run / no-teams-followed
screen.

- One pill split in two. Selected half filled (`--accent`, white text);
  unselected half transparent with `--accent` text. `--tap` min height, RTL
  order (`הורה` leads). `role="group"`, `aria-label="בחירת סוג משתמש"`; each
  half a `<button aria-pressed>`.
- Helper line under it, muted / small:
  *`הורים — רק צפייה בלוח. שחקנים — גם רישום להסעות.`*
- **Default `הורה`** — matches the implicit default (`gilboa.role` absent =
  parent). Tapping `הורה` while already parent is a no-op.
- Tapping `שחקן` from parent → the §4.2 consent flow. The toggle's pressed
  state does **not** move until `gilboa.role` actually flips, so backing out of
  consent / the name step leaves it on `הורה`.

**b) Compact link** `רישום להסעות — מעבר למצב שחקן` (styled `.role-link`, like
`#share-follows`) in `#role-entry-slot` below the share button — shown when the
`#onboarding` card is **hidden** (teams already followed) **and** role is parent.
So a parent who set up their teams first can still reach player mode without
unfollowing everything. Tapping it → the §4.2 consent flow.

In **player mode**, neither is shown — the **rides summary card** (§4.7) is the
persistent "you are in player mode" signal and holds the §4.5 switch-back. There
is no separate mode badge.

The `#onboarding` heading is role-neutral (`בחירת קבוצה`, not
`בחר את הקבוצה של הילד/ה`) since a player picks their own team.

History: originally just the compact link (players missed it) → DL-034 made it
the onboarding toggle → the compact link was kept for the followed-team parent
case at stakeholder request (2026-09-05).

### 4.2 Switch to player — consent, then name

1. **Consent dialog** — native `<dialog>`, the §11.1 text. Buttons
   `הבנתי, אפשר להמשיך` / `ביטול`. `Esc` = cancel = stay parent.
2. On accept, a **single inline screen** (not a second modal) with the name
   field:
   - Label `שם מלא`, helper `השם המלא גלוי רק לרכז ההסעות.`
   - **Placeholder inside the field:** `שם פרטי ושם משפחה` — the guidance the
     player needs is in the box, not a red line they can tune out. It also
     signals both names are expected (the one-word case below).
   - **Live preview** under the field as they type:
     `יוצג לשחקנים אחרים כ: דניאל כ׳` (uses `shortName`, §4.3).
   - Empty / whitespace → submit disabled. The `יש להזין שם מלא` error text
     shows only **after** a save attempt on an empty field, not on first paint.
   - One word only → warn once `נא להזין שם פרטי ומשפחה`; the button label
     becomes `שמור בכל זאת` so a second press is an explicit confirm.
   - A `→ חזרה` action reverts `gilboa.role` to parent cleanly (no
     `role=player` + no-token limbo).
3. On save: `POST /api/token`. On `200` store
   `gilboa.player = { token, fullName }`, set `gilboa.role = 'player'`, re-render.
   On failure: inline `לא הצלחנו לשמור, נסו שוב` + retry, keep the typed name,
   stay on the step. **Never** silently fall back to parent mode.

### 4.3 Name display — `shortName(fullName)` in `rides.js`, pure, unit-tested

- **Everywhere a non-manager can see it:** first name + space + last-name initial
  + `׳` — `"דניאל כהן"` → `"דניאל כ׳"`. Single-word name → shown as-is.
- **Manager dashboard only:** the full string.
- The full name is sent to the API (the manager needs it) and **never rendered
  anywhere a non-manager can see it**. Enforced in code review.

### 4.4 "No name → no rides"

In player mode with no `gilboa.player.token`:
- **Ride chips are not rendered at all** on session cards.
- A persistent inline card in the summary-card slot:
  `כדי להירשם להסעות, הזינו שם מלא` + the name field + `שמור`, inline. Same
  save / failure behaviour as §4.2 step 3.

### 4.5 Switch back to parent — from the rides summary card

Prompt: `המעבר למצב הורה ימחק את בקשות ההסעה שלך לשבוע זה. להמשיך?`
On confirm: `DELETE /api/me?token=…&week=<wk>`, then clear `gilboa.player`, set
role parent, re-render. Best-effort: on call failure still clear locally (the
weekly purge removes the server rows).

### 4.6 Ride chip on each session card — `Rides.decorateSession(card, session)`

Rendered in player mode **with a token**, as a full-width block inserted between
`.session-line` and `.session-note` — a lightly tinted strip. Scan order:
time → who/where → **ride action** → notes.

One chip in the existing `.wact` / `.chip` house style. **No red, no green** (the
palette has neither; state is carried by fill + label + check + icon, never hue):

| state | chip label | caption line below |
|---|---|---|
| no request | outlined `🚐 הוספת הסעה` | — |
| has request | filled/accent `🚐 <direction> ✓` | `יוצא מעין חרוד 16:20 · חזרה 18:45` |
| has request, time not set | filled/accent `🚐 <direction> ✓` | `טרם נקבעה שעה` |

`<direction>` in words: `הלוך וחזור` / `הלוך` / `חזור`.

- Real `<button type="button">`, ≥44×44, `aria-haspopup="dialog"`.
  Accessible name includes team + day + current state, e.g.
  `הסעה: הלוך וחזור, יוצא 16:20; לעריכה` or `אין הסעה לאימון זה; להוספה`.
- `aria-pressed` is **not** used (opens a chooser, not a toggle).
- Every clock time in the caption is wrapped with the existing `ltrIsolate()`
  helper (like `.session-time`) or digits + `·` reorder under RTL bidi.
  Covered by a smoke test.

### 4.7 Trip-type bottom sheet — `<dialog>`

Tapping the chip opens a **bottom-sheet `<dialog>`** (not a card-anchored popover
— anchor math breaks on small viewports / edge cards / keyboard / RTL). Native
`<dialog>` gives the focus trap, `Esc`, `::backdrop`, `returnValue` for free.

- **Context heading** (replaces the spatial anchor):
  `נערות א · יום ג׳ · אולם קציר`.
- Option rows, stacked, each ≥44px:

  | option | meaning |
  |---|---|
  | `הלוך וחזור` | round trip — **preselected default** |
  | `הלוך` | אולם עין חרוד → practice location |
  | `חזור` | practice location → אולם עין חרוד |

- `ביטול הסעה` — rendered **only when a request exists**, below a divider,
  muted-red text, never flush against `חזור`.
- Open → focus the heading or the preselected row. Any close → restore focus to
  the chip. After a selection, update the chip's accessible name and fire an
  `aria-live` announcement of the new state + times.
- Transition respects `prefers-reduced-motion`.
- Selecting a direction → `PUT /api/request`, **optimistic**: chip updates
  immediately; spinner sets `aria-busy` and preserves the accessible name; on
  failure revert + toast — `שמירת ההסעה נכשלה, נסו שוב` for 5xx/network,
  `לא ניתן לבחור הסעה לאימון זה` for a 400 (not retryable, no retry loop).
- `ביטול הסעה` → `DELETE /api/request` → chip back to `🚐 הוספת הסעה`.

### 4.8 Weekly reset — `weekKey(sessionDate)` in `rides.js`, pure, unit-tested

Requests are keyed by **week key = that week's Sunday as `YYYY-MM-DD`** — the
exact value `sundayOf()` already computes and `schedule.json` uses as `week_key`.
`weekKey()` delegates to that convention. A new week starts with every chip unset
because no rows exist for its key — **no client-side "clear" logic**. No
carry-over.

### 4.9 Rides summary card + `#screen-rides`

**Entry is a summary card**, not a button in `#week-actions` (that row is the
deliberately quiet "get my data out" row, DL-023, and is hidden on session-free
weeks — wrong condition for a week-level feature).

- **Rides summary card** — top of My Week in player mode, directly under the
  follows row / share link, styled like `#changes-banner` (a tappable summary):
  `ההסעות שלי לשבוע זה: 2 · 1 ללא שעה` — or `טרם נרשמת להסעות השבוע`. Tap →
  `goto('rides')`. Also the player-mode indicator and the home of
  `מעבר למצב הורה`. Parent mode: not shown.
- **`#screen-rides`** (same pattern as `#screen-addteam`, `goto('rides')`):
  - For the **visible week**, every ride the player requested, grouped by day:
    practice name · location · direction · departure time(s) · `עריכה` (reopens
    the sheet, §4.7) · `ביטול`. Per-row controls carry an `aria-label` with
    practice + day.
  - **Empty state is actionable** (every player sees it at the start of every
    week — no carry-over): list the visible week's practices for the followed
    team(s), each with a `🚐 הוספת הסעה` button, under
    `בחרו אימון כדי להוסיף הסעה`. Not a dead screen.
  - **`GET /api/me` load failure** for a player who had rides → `לא ניתן לטעון
    את ההסעות שלך` + a `נסו שוב` action. Distinct from "loaded, empty".

---

## 5. Manager experience — `public/manager.html` + `manager.js` + `manager.css`

A **separate page**, not a view inside the parents' app. Shares `styles.css`.
Keeps manager code off every parent's phone, keeps a `מנהל` button out of the
shared header, keeps `goto()` simple. **No `מנהל` button in `index.html`.** URL
recorded in `RIDES.md`; the coordinator bookmarks it.

### 5.1 Login
`manager.html` → password `<dialog>` (`type="password"`, `autocomplete="off"`) →
`POST /api/manager/login` → on `200` store `gilboa.manager = { token, exp }` →
dashboard. On `401` → `סיסמה שגויה` (no lockout beyond the edge rate-limit).
`יציאה` clears the token.

Two tabs: **`לוח בקרה`** (dashboard) and **`הגדרות`** (settings).

### 5.2 Dashboard — `לוח בקרה`

Data from `GET /api/manager/dashboard?week=<key>`.

- **Day stepper** `‹ יום ה׳ 11/9 ›` reusing the `.week-nav` pattern (not 7 chips
  — overflows 360px). Default = today; arrows move day-by-day across weeks.
- **Day header:** `סה״כ: 12 נוסעים · 5 הסעות` (distinct rides = team × session ×
  direction; round-trip counts toward both directions).
- **One collapsed row per practice with ≥1 request:**
  `נערות א · אולם קציר · 17:00 · 4 נוסעים`. Tap to expand:

  > יציאה מעין חרוד 16:20 · חזרה 18:45  *(or `טרם נקבעה שעה`)*
  > הלוך וחזור (3): דניאל כהן · מאיה לוי · נועה בר
  > הלוך בלבד (1): יונתן שמש
  > חזור בלבד (0): —

  Full names appear **only here**, only in an expanded row.
- **Orphaned requests** — a request whose `sessionId` no longer matches any
  session in the current `schedule.json` — shown in a distinct
  `בקשות ללא אימון תואם` group. Never silently dropped.
- Practices with zero requests are behind a `הצג אימונים ללא נוסעים` toggle.
- A day with no requests at all: `אין בקשות הסעה ליום זה`.
- **`העתקת תוכנית היום כטקסט`** action (mirrors DL-023) — plain text, client-built,
  for pasting into the drivers' WhatsApp group.
- **Health footer:** `ניקוי אחרון: 4/9` from `config/global.lastPurge` (§10.3).
  A stale date is the fail-loud signal that the purge job stopped.

### 5.3 Usage stats — its own tab (or the bottom of the dashboard)

Explicitly approximate where noted (§10.5):
- `שחקנים רשומים` — this week / all-time *(≈ all-time)*
- `בקשות הסעה השבוע` — הלוך / חזור
- `הסעות מתוכננות` (distinct rides)
- `מיקומים פעילים`
- `כניסות לאפליקציה` — today / 7-day *(≈)*

### 5.4 Settings — `הגדרות`

**`זמני יציאה`** — one row per practice location present in the published
`schedule.json` (names pulled from the data; the manager never types them). Per
row, two number inputs:
- **`הלוך`** — minutes before practice **start** the vehicle leaves
  אולם עין חרוד.
- **`חזור`** — minutes after practice **end** the vehicle leaves the practice
  location. Blank ⇒ the global default.

Plus:
- **`+ הוסף מיקום`** — a text field for a location the calendar does not yet
  contain. Stored with `manual: true`.
- **delete** per row — a manual row is removed; a calendar-derived row just has
  its times cleared (reappears blank next load).
- **`ברירת מחדל לחזרה`** — one global number, default **15**.

Writes go to `PUT /api/manager/config`.

### 5.5 Departure-time computation — `computeDepartTimes`, pure, unit-tested

Wall-clock only, no timezone math (start/end already carry `+03:00`):
```
departOutbound = sessionStart − הלוך(location)
departReturn   = sessionEnd   + (חזור(location) or global default)
```
Any offset unset for that location ⇒ that direction shows `טרם נקבעה שעה`, in
**both** the player chip caption and the dashboard. Same helper feeds both.

### 5.6 Scoping
**One club-wide manager.** The dashboard shows every team. No per-team
coordinator role in Slice A. The `Authorization: Bearer` model extends to
multiple managers / Cloudflare Access later with no data change.

---

## 6. Backend — Cloudflare Pages Functions + KV

### 6.1 Shape
Site + API in **one Cloudflare Pages project**, one git-connected deploy, one
secrets store. API routes are Pages Functions under `functions/api/` (e.g.
`functions/api/request.js`). One KV namespace **`RIDES_KV`**. Env vars:
`MANAGER_PASSPHRASE`, `SITE_ORIGIN`, `PURGE_KEY`. No framework.

The **purge** cannot be a Pages Functions cron (unsupported). It is one
authenticated `POST /api/purge` called by the **existing scheduled GitHub
Action** (`build.yml`, job `build-data`, which runs three times a day) — no
second scheduler. It is idempotent. The call carries
`X-Purge-Key: <PURGE_KEY>` (also a GitHub secret).

### 6.2 KV keys — per-row, never a per-week array

Per-row keys avoid KV's last-write-wins data-loss race under bursty use (a
Sunday-night WhatsApp reminder → 20–30 families open at once). Every stored value
carries `v: 1` (schema version).

| key | value |
|---|---|
| `week/<wk>/req/<token>/<sessionId>` | `{ token, fullName, teamId, sessionId, direction, ts, v }` |
| `config/locations` | `{ "<name>": { outbound:int\|null, ret:int\|null, manual:bool }, v }` |
| `config/global` | `{ retDefault:15, requestCutoffHoursBefore:null, lastPurge:"YYYY-MM-DD"\|null, v }` |
| `week/<wk>/rideStatus` | `{ "<teamId>|<sessionId>|<direction>": "on"\|"cancelled", v }` — **reserved** for OQ-1, absent until written, single-writer (manager), LWW fine |
| `stats/opens/<yyyy-mm-dd>/<rand>` | `1` — sharded, sum on read |
| `stats/players-all` | integer — best-effort all-time distinct |

`<wk>` = week key (Sunday `YYYY-MM-DD`). `direction ∈ {round, out, back}`.
`config/*` is single-writer (the manager) so its blob form is fine. Every data
write is independent — no race. `list({ prefix })` is eventually consistent —
a self-healing visibility delay, not data loss.

Slice B keys (`week/<wk>/station/<token>`, `config/stations`) are **not created**
in Slice A.

### 6.3 Endpoints (`/api/*`)

**Public (player)** — edge-rate-limited (§11.4), structural validation only
(§6.4), 1 KB body cap:

| method + path | body / query | response |
|---|---|---|
| `POST /api/token` | — | `{ token }`. Bumps `stats/players-all` best-effort |
| `GET /api/me` | `?token=&week=<wk>` | `{ requests: [row…], rideStatus: {…} }` for this token (list prefix `week/<wk>/req/<token>/`) |
| `PUT /api/request` | `{ token, fullName, teamId, sessionId, direction }` | writes `week/<wk>/req/<token>/<sessionId>`. Upsert (same key replaces). `200 { ok:true }` |
| `DELETE /api/request` | `{ token, sessionId, week }` | deletes that one key. `200 { ok:true }` |
| `DELETE /api/me` | `?token=&week=<wk>` | deletes all `week/<wk>/req/<token>/*`. Used by §4.5 |
| `POST /api/ping` | — (body ignored) | writes `stats/opens/<today>/<rand>=1`. Client throttles ≤ 1/hour/device. Always `204` |

`<wk>` for a write is derived server-side from the session date the client sends,
**or** passed explicitly as `week`; pick one in implementation and document it in
`RIDES.md`. (Recommended: client passes `week` — the Function does not fetch
`schedule.json` on the write path, §6.4.)

**Manager** — `Authorization: Bearer <managerSessionToken>` on all; missing/bad/
expired → `401`:

| method + path | body / query | response |
|---|---|---|
| `POST /api/manager/login` | `{ passphrase }` | `{ token, exp }` or `401`. Edge-rate-limited. Constant-time compare |
| `GET /api/manager/dashboard` | `?week=<wk>` | fetches current `schedule.json`, joins with `list('week/<wk>/req/')`, returns the §5.2 blocks + orphan group + `rideStatus` + §5.3 stats + `lastPurge` |
| `GET /api/manager/config` | — | `config/locations` merged with the live `schedule.json` location list, plus `config/global` |
| `PUT /api/manager/config` | partial `config/*` object | blob rewrite (single-writer). `200 { ok:true }` |

**Internal:**

| method + path | auth | response |
|---|---|---|
| `POST /api/purge` | `X-Purge-Key: <PURGE_KEY>` | §6.5. Wrong/absent key → `401` |

**CORS:** `Access-Control-Allow-Origin` = `SITE_ORIGIN` (env var, **not** a
hard-coded string). Preflight (`OPTIONS`) handled for every route. No secrets,
tokens, or names in Function logs.

### 6.4 Write validation — structural only

id format/regex, `direction ∈ {round, out, back}`, non-empty `fullName`, body
< 1 KB, `week` matches `^\d{4}-\d{2}-\d{2}$`. The write path does **not** fetch
`schedule.json` (couples two deploys, has a stale window, and a bogus row is
harmless — it never renders and the purge removes it). `schedule.json` is
consumed only on `GET /api/manager/dashboard`, where staleness only affects a
view the manager refreshes.

Structural caps: reject a write when this token already has > 20 request rows for
the week (fail loud, `400`); reject when the week's total row count exceeds a
sane ceiling.

### 6.5 Purge — `POST /api/purge`

`list()` all `week/` keys; delete every `week/<wk>/*` where `<wk>` (the week's
Sunday) is **strictly before** the current week's Sunday. Trim `stats/opens/*`
older than 90 days. `config/*` untouched. On success write
`config/global.lastPurge = <today, YYYY-MM-DD>`. The dashboard surfaces it
(§5.2). A stale `lastPurge` = the job stopped.

Added to `build.yml` job `build-data` as a final step (after the push), e.g.
`curl -fsS -X POST -H "X-Purge-Key: $PURGE_KEY" "$RIDES_API/api/purge"` with
`PURGE_KEY` and `RIDES_API` as GitHub secrets. Failure is logged but does **not**
fail the data build.

### 6.6 Cost — free tier headroom

Workers free: 100k req/day. KV free: 100k reads, **1k writes**, 1k deletes/day,
1 GB. Ride writes ~30–60/day. The one cliff — the opens ping — is handled by the
1/hour client throttle + sharded keys. 2–10× headroom at 10× growth.

---

## 7. Static-site changes

| file | change |
|---|---|
| `public/rides.js` | **new** — all player-side rides logic, loaded after `app.js`. Vanilla, no build. Pure helpers on `window`: `shortName`, `weekKey`, `rideCaption`, `computeDepartTimes` |
| `public/app.js` | minimal hooks: call `Rides.renderRoleToggle()`; in player mode render the rides summary card / inline name card; in `renderSession`, when player mode + token, call `Rides.decorateSession(card, session)`; add a `goto('rides')` target. **No manager code** |
| `public/index.html` | `#role-toggle-slot` inside `#onboarding` + role-neutral heading; summary / name card slot; `#screen-rides`; the `מדיניות פרטיות` footer link + `#screen-privacy`. **No `מנהל` button** |
| `public/manager.html` + `manager.js` + `manager.css` | the manager app (§5). Shares `styles.css` |
| `public/styles.css` | ride chip block + states, bottom sheet, `.role-toggle` segmented control, rides summary card, `#screen-rides`, `#screen-privacy`, consent/name dialogs. RTL-first, existing palette, quiet-button pattern, bottom-sheet transition under `prefers-reduced-motion` |

**API base URL** — derived at runtime from `location.hostname`
(`localhost` / `127.0.0.1` → a local dev URL, else same-origin `/api`). No
hard-coded const to edit before deploy (the DL-015 footgun). Documented in
`RIDES.md`.

---

## 8. Privacy, consent, retention, security

### 8.1 Consent notice (Hebrew, shown at §4.2) — **draft**, finalise with OQ-2

> **רישום להסעות — מה נשמר**
> כדי לתאם לך הסעה, נשמור את השם המלא שהזנת ואת בקשות ההסעה שלך (לאילו אימונים,
> לאיזה כיוון).
> **מי רואה:** רכז ההסעות של המועדון בלבד, במסך מוגן בסיסמה. השם המלא אינו מוצג
> לאף הורה או שחקן אחר — הם רואים "דניאל כ׳".
> **לכמה זמן:** נמחק אוטומטית בסוף כל שבוע.
> **מחיקה מיידית:** מעבר חזרה למצב הורה מוחק את הנתונים שלך עכשיו.
> פרטים מלאים ובקשת מחיקה: [מדיניות פרטיות].

The persistent `מדיניות פרטיות` footer link → `#screen-privacy` with the full
text + the deletion-request contact. `[מדיניות פרטיות]` / `[contact]`
placeholders are filled from the stakeholder before the pilot ships.

### 8.2 Data minimisation
Stored per player: `fullName` + ride picks. **No** phone, address, email, home
location, age, or free text. Practice-ride origin is always אולם עין חרוד, so no
home/pickup data exists anywhere.

### 8.3 Retention
- Every `week/<key>/*` KV key is deleted by the daily purge once `<key>` is
  before the current week's Sunday.
- The opens counter keeps only aggregate daily integers — no IP, no cookie, no
  per-visitor record.
- `config/*` persists (no personal data).
- The purge is fail-loud with a visible healthcheck (§5.2, §6.5).

### 8.4 Security
- **Tokens** (player + manager): CSPRNG ≥128-bit, opaque, `localStorage` only,
  never in URLs. Every stored JSON value carries `v: 1`.
- **Manager passphrase:** **generated** — a 4–5 random-word passphrase, not
  user-chosen. Cloudflare environment secret `MANAGER_PASSPHRASE`, never in the
  repo, never shipped to the client, constant-time compare server-side. Session
  TTL 6 h.
- **Rate limiting:** Cloudflare **edge Rate Limiting Rules** (free plan includes
  one), enforced before the Function runs, covering `/api/token`,
  `/api/request`, `/api/ping`, `/api/manager/login`. **No KV counter** (same
  read-modify-write race as the data). Turnstile on `/api/token` kept in reserve.
- **Write validation:** structural only (§6.4).
- No secrets, tokens, or names in Function logs.

### 8.5 Legal (design doc §7.5 / OQ-2)
Stakeholder to obtain a short opinion: (a) PPL / Amendment 13 registration; (b)
is the §8.1 consent sufficient for an identified minor's name + schedule.
**Blocks club-wide rollout, not the single-team pilot.**

---

## 9. Data-model room for the open questions (no Slice A code)

- **Request cutoff / lock time (OQ-1):** `config/global.requestCutoffHoursBefore`
  is already in the blob (defaults `null`). Enforcement needs the session start
  on the write path — decide client-passes vs Function-joins then.
- **Manager marks a ride on/cancelled (OQ-1):** `week/<wk>/rideStatus` is already
  reserved (§6.2). `GET /api/me` already returns `rideStatus`; the player chip
  would gain a third visual state (e.g. `✓ מאושר` / `✗ בוטל`).

Both are later slices, **no migration**.

- **Anonymous weekly stats-rollup (OQ-7):** the daily purge deletes each
  `week/<wk>/*` key once the week is past (§8.3), which also loses per-week
  request-volume history. Post-pilot, decide whether `runPurge` should first
  write a nameless `stats/weekly/<wk>` summary (counts by direction / location /
  team) for a manager trend view. Additive to `runPurge` + §5.3, no migration.
  See DL-031.

---

## 10. Failure behaviour (the isolation boundary)

- Any `/api/*` call failing (network, 5xx) → the rides UI shows
  `שירות ההסעות אינו זמין כרגע` + a `נסו שוב` action (**not** "reload" — the
  schedule loaded from static JSON). The summary card shows the same on tap.
- The **schedule half of the app is completely unaffected** — this boundary is
  absolute and enforced in code review: `rides.js` failures never touch
  `renderMyWeek`'s schedule path.
- `GET /api/me` "loaded empty" and "failed to load" are distinct states (§4.9).
- The opens ping never surfaces an error.

---

## 11. Testing

### 11.1 Functions — `functions/**/__tests__`, Vitest + `@cloudflare/vitest-pool-workers` (real `workerd` + Miniflare KV)

1. `POST /api/token` — well-formed unique token; `stats/players-all` bumped.
2. `PUT /api/request` — rejects malformed `sessionId` / bad `direction` /
   oversized body / bad `week`; accepts a valid one; **same key upserts** (no
   dup); rejects the 21st row for a token in one week.
3. `DELETE /api/request` / `DELETE /api/me` — remove only the right prefix.
4. `GET /api/manager/dashboard` — join with a fixture `schedule.json`: counts by
   direction, round-trip both ways, names, empty practices excluded, day totals,
   **orphaned-request group** for a request whose session is gone.
5. `computeDepartTimes` — per-location + default fallback + unset →
   `טרם נקבעה שעה`.
6. Manager auth — missing / bad Bearer → `401` on every `/api/manager/*`; good
   passphrase → usable token; token past `exp` → `401`.
7. `POST /api/purge` — wrong / absent `X-Purge-Key` → `401`; deletes only
   strictly-past weeks; keeps `config/*`; writes `lastPurge`.
8. `POST /api/ping` — sharded key written; prefix sum correct.
9. CORS header = `SITE_ORIGIN`; preflight handled.

> **Known limitation:** Miniflare is single-threaded/consistent — the KV
> last-write-wins race **cannot be reproduced in tests**. Concurrency
> correctness is *designed* out via per-row keys (§6.2), not tested out. Stated
> in `qa-checklist.md`.

### 11.2 Site — `tests/site_smoke.js` style (Node-only fake DOM + `localStorage`)

1. Parent default → no role card content beyond the link, no ride chips.
2. Switch to player → consent dialog → name step with live `יוצג כ` preview →
   (stub `POST /api/token`) → re-render, chips appear. `POST /api/token` failure
   → inline error, name kept, still on the player step. `→ חזרה` reverts.
3. `shortName` / `weekKey` / `rideCaption` / `computeDepartTimes` unit cases,
   incl. `ltrIsolate` wrapping every clock time in the caption.
4. No token → chips **not rendered**; inline name card shown; saving reveals
   chips.
5. Ride chip: `הוספת הסעה` → sheet (round-trip preselected) → chip becomes
   `הלוך וחזור ✓` + caption; `ביטול הסעה` → back to `הוספת הסעה`; 5xx reverts +
   toast; 400 → non-retry toast.
6. `#screen-rides` — grouped by day; `עריכה` reopens the sheet; `ביטול` removes
   the row; **empty state lists practices with add-buttons**; `GET /api/me`
   failure → `לא ניתן לטעון` + retry (distinct from empty).
7. Switch back to parent → prompt → local clear → `DELETE /api/me`.
8. API down → chips / summary show unavailable + `נסו שוב`; the weekly list,
   summary, exports, changes banner all still render.

### 11.3 Manager — `manager.html` harness

9. Password dialog → (stub 200) dashboard; (stub 401) error, no dashboard.
10. Day stepper moves the day; practice rows collapsed → expand shows names;
    all-empty day → `אין בקשות`; orphaned group renders; `העתקת תוכנית היום`
    builds the expected text; health footer shows `lastPurge`.

### 11.4 CI
`node tests/site_smoke.js` and `pytest` stay green. A **third CI job** runs the
Functions tests (`npm ci && npm test` in the functions package) — the repo's
first `node_modules`, isolated to that package. The Functions runtime code itself
stays dependency-free.

---

## 12. Build sequence (Slice A)

Mirrors `docs/mvp-spec.md` §11. Detailed task breakdown in
`docs/superpowers/plans/2026-09-04-rides-slice-a.md`.

1. **Prereqs** (§2): merge the design record + this spec to `main`; extend the
   builder brief. Generate `MANAGER_PASSPHRASE`.
2. **Cloudflare wiring** — create the `RIDES_KV` namespace and bind it to the
   `gilboa-schedule` Pages project; set env vars `MANAGER_PASSPHRASE`,
   `SITE_ORIGIN`, `PURGE_KEY`; add the one edge Rate Limiting rule. Recorded in
   `RIDES.md`.
3. **Functions package + shared helpers** (TDD) — `functions/` package.json +
   Vitest pool-workers config; `_lib/` (token mint/verify, JSON responses, CORS,
   validation, `weekKey`).
4. **Public endpoints** (TDD) — `token`, `me`, `request`, `purge`, `ping`.
5. **Manager endpoints** (TDD) — `manager/login`, `manager/dashboard`,
   `manager/config`; `computeDepartTimes` server helper; fixture `schedule.json`.
6. **`rides.js` pure helpers** (TDD in `site_smoke.js`) — `shortName`,
   `weekKey`, `rideCaption`, `computeDepartTimes`, API-base resolver.
7. **Player UI** — role toggle; consent + name flow (preview /
   `שמור בכל זאת` / back-out / failure); ride chip + bottom sheet; rides summary
   card + `#screen-rides` (actionable empty state); `#screen-privacy`; throttled
   ping. Wire into `app.js`. Extend `site_smoke.js`.
8. **Manager UI** — `manager.html` + `manager.js` + `manager.css`: login,
   dashboard (collapsed rows, day stepper, orphan group, copy-day-as-text, health
   footer), settings (`זמני יציאה`), stats tab. Manager harness test.
9. **Purge wiring** — add the `POST /api/purge` step to `build.yml`; GitHub
   secrets `PURGE_KEY`, `RIDES_API`.
10. **CI** — add the Functions test job. Confirm all three suites green.
11. **Docs** — `RIDES.md` runbook; decision-log entries; `execution-plan.md`
    phase; `qa-checklist.md` rides + privacy + the concurrency-not-testable note;
    `architecture.md` + `known-constraints.md` (KV namespace, env secrets).
12. **Fill the §8.1 placeholders** from the stakeholder.
13. **QA pass** (qa-reviewer) + a **security/privacy review pass** (new
    checklist section).
14. **Single-team pilot** — soft-launch to one team ~2 weeks. The coordinator
    answers OQ-1 from real use. Stakeholder starts the legal review.

---

## 13. Out of scope (Slice B — separate spec after the pilot)

- End-of-week station rides: `#screen-rides` station block, `config/stations`,
  `week/<wk>/station/<token>`, `PUT`/`DELETE /api/station-request`, the dashboard
  station section, the `הסעת סוף שבוע` settings.
- `manager.html` + `/api/manager/*` behind Cloudflare Access.
- Club-wide rollout (needs the legal review cleared + a courtesy note to parents
  — the app link was approved under OQ-6, but ride-data collection is new).
- QR / claim-code token transfer between devices.

---

## 14. Open questions

Carried from the design record; none block Slice A coding.

1. **Manager feedback + request cutoff.** Mark a ride on/cancelled back to
   players? A lock time after which requests freeze? Coordinator + stakeholder
   decide during the pilot. Data model already leaves room (§9).
2. **Consent wording + contact.** §8.1 is a draft with `[contact]` placeholders;
   finalise with the legal opinion before the pilot ships.
3. **Manager password rotation.** Generated passphrase, manual rotation on
   request in Slice A; Cloudflare Access removes the question in Slice B.
4. **Custom domain.** Starting on `*.pages.dev`. A ~$10/yr domain would make the
   parent link permanent across any future hosting change — revisit before
   club-wide rollout.
