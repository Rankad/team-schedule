# Rides — remove the player→parent switch; add a privacy delete control

**Date:** 2026-09-06
**Status:** design approved (stakeholder, 2026-09-06); in implementation on
`feature/rides-one-way-player-mode`
**Amends:** `docs/rides-spec.md` §4.1, §4.5, §4.9, §8.1, §11.2; `docs/ui-ux-spec.md`
Rides section; supersedes the "switch back to parent" behaviour from the rides
Slice A design (`2026-09-03-rides-coordination-design.md` §4.5).

---

## 1. Why

Two problems with the current design, both raised by the stakeholder after real use:

1. **The player→parent switch is a trap, not a feature.** Player mode is a strict
   superset of parent mode — same schedule, same followed teams, same exports,
   plus ride chips. A player never needs parent mode. But the rides summary card
   carries a `מעבר למצב הורה` button that, on one confirm, **deletes every ride
   request the player made that week** (`DELETE /api/me`) and drops the player
   token. An accidental tap costs the player their picks and costs the
   coordinator an accurate headcount — the whole point of the feature.

2. **A player→parent movement should never destroy ride data.** Even setting the
   button aside: no role change should be a data-loss event. Ride rows expire on
   their own via the weekly purge; there is no reason to wipe them early as a
   side effect of a UI mode change.

The consent text currently promises *"מחיקה מיידית: מעבר חזרה למצב הורה מוחק את
הנתונים שלך עכשיו"*. Removing the only delete path would make that promise false
and would leave a parent who tried player mode once with their child's name
sitting server-side until the weekly purge, with no way to pull it back. So the
delete capability is **kept** — but as a deliberate, clearly-labelled privacy
action on the privacy screen, not as a role toggle in the main flow.

---

## 2. What changes (plain language)

- A player has **no in-app way to "become a parent" again**. There is no button
  for it. Player mode is simply the mode you are in once you have registered for
  rides; you stay there.
- **No flow deletes ride selections as a side effect.** Backing out of the
  name-entry step (before a token exists) already deletes nothing; that is
  unchanged. The only remaining path that removes ride data is an explicit,
  named "delete my rides data" action the player has to go looking for.
- A parent switching **to** player mode is completely unchanged — the onboarding
  `הורה`/`שחקן` toggle and the compact `רישום להסעות — מעבר למצב שחקן` link both
  stay exactly as they are (DL-034).
- The privacy screen (`#screen-privacy`) gains a **`מחיקת נתוני ההסעות שלי`**
  button: confirm → `DELETE /api/me` for the visible week → clear the local
  player token/name → the app re-renders as a clean parent view. This is the
  honest home for the "immediate deletion" the consent promises.

---

## 3. Detailed changes

### 3.1 `public/rides.js`

**Remove `exitToParent()` entirely** (currently lines ~353–369) — the
`window.confirm` prompt and the `DELETE /api/me` fire-and-forget call both go.
Remove `exitToParent` from the `window.Rides` export.

**`renderSummaryCard()`** — delete the `rides-exit-parent` button block
(currently lines ~660–663). The summary card is now purely: the weekly rides
line (`ההסעות שלי לשבוע זה: N …` / `טרם נרשמת להסעות השבוע` / the
unavailable+retry state) and a tap target to `goto('rides')`. Nothing else.

**`renderRoleToggle()`** — only render the segmented toggle when
`!isPlayer || entering`. Today an established player who unfollows *every* team
lands back on the onboarding screen and would see the toggle with `שחקן`
selected and `הורה` pressable → `exitToParent`. After this change that edge case
shows no toggle at all: the player just sees the (role-neutral) team-picker they
need. `entering` (mid name-entry, `pendingPlayer`, no token) still renders the
toggle so `שחקן` shows selected and `הורה` can abandon the step.

**`buildRoleToggle()`** — the `parentBtn` click handler drops its
`if (getRole() === 'player') exitToParent()` branch. It keeps only
`else if (pendingPlayer) cancelPlayerEntry()`. `parentBtn` is now a no-op unless
the player is mid-entry.

**`CONSENT_LINES`** — replace

> `['p', 'מחיקה מיידית: מעבר חזרה למצב הורה מוחק את הנתונים שלך עכשיו.']`

with

> `['p', 'מחיקה מיידית: אפשר למחוק את נתוני ההסעות שלך בכל רגע ממסך מדיניות הפרטיות.']`

`PRIVACY_LINES` inherits this (it is `CONSENT_LINES` + the contact line), so the
privacy screen copy updates for free.

**New: `deleteMyRidesData()`** — invoked from the privacy-screen button.

```
1. const p = getPlayer(); if (!p) return;                 // nothing to delete
2. confirm: 'למחוק את כל נתוני ההסעות שלך? הפעולה אינה הפיכה.'
   - window.confirm; on cancel, stop.
3. const wk = currentWeek();
4. best-effort: fetch(apiBase()+'/api/me?token='+enc(p.token)+'&week='+enc(wk),
   { method:'DELETE' }).catch(()=>{})   // same best-effort posture as the old
                                        //   exitToParent — the weekly purge is
                                        //   the backstop
5. clearPlayer();          // removes gilboa.player AND gilboa.role
6. _week = reset to empty (key:null, bySession:{}, loaded:false, failed:false)
7. toast('נתוני ההסעות נמחקו');
8. if on #screen-privacy, goto('myweek'); else rerender();
```

Notes:
- Only the **visible week** is deleted server-side (mirrors the old behaviour and
  the `DELETE /api/me` contract, which is `?week=`-scoped). Any rows for another
  week are left to the purge. This is acceptable: a player only ever has rows for
  the current and possibly next week, and the purge removes past weeks. Documented
  as a known limitation, same class as the old §4.5 note.
- `clearPlayer()` already clears both keys — the device returns to the implicit
  parent default with no token/name in `localStorage`.
- Export `deleteMyRidesData` on `window.Rides` for the smoke test.

**`renderPrivacy()`** — after appending `PRIVACY_LINES`, append the delete
control **only when `getPlayer()` returns a token** (a pure parent has nothing to
delete and should see no button):

```
var del = ce('button', 'privacy-delete', 'מחיקת נתוני ההסעות שלי');
del.type = 'button';
del.addEventListener('click', deleteMyRidesData);
body.appendChild(del);
```

### 3.2 `public/styles.css`

- **Remove** the `.rides-exit-parent` rule (currently ~line 618) — unused.
- **Add** a `.privacy-delete` rule. **Do not introduce a red** — the palette has
  none, and `.ride-cancel` (the existing destructive control, `ביטול הסעה`) is
  styled as: full-width, `--tap` min height, transparent background, no side/
  bottom border, a `1px solid var(--border)` **top** divider with `margin-top`/
  `padding-top: 0.75rem`, `color: var(--accent-dark)`, `font-weight: 600`. Reuse
  that exact treatment for `.privacy-delete` (either share the `.ride-cancel`
  rule or copy it). The action reads as destructive from its label and its
  confirm dialog, not from hue — consistent with the rest of the rides UI.

### 3.3 `public/index.html`

No structural change required — `#screen-privacy` > `#privacy-body` already
exists and `renderPrivacy()` fills it. The button is appended in JS.

### 3.4 `functions/` (backend)

**No change.** `DELETE /api/me` stays exactly as it is (`functions/api/me.js`
`onRequestDelete`) — it is still the endpoint the new privacy control calls. Its
tests (`functions/api/__tests__/me.test.js`) are unaffected.

### 3.5 `tests/site_smoke.js`

- **Keep** the existing name-step back-out assertions (`→ חזרה` / pressing `הורה`
  mid-entry leaves parent mode clean, writes no credential) — still valid.
- **Remove / replace** any assertion that a player sees `מעבר למצב הורה` or that
  switching back deletes rows. (Current file: none assert the exit flow directly,
  so this is mostly additive.)
- **Add:**
  1. In player mode with a token: the rides summary slot contains the summary
     card but **no** button with text `מעבר למצב הורה` (and no `.rides-exit-parent`).
  2. An established player who unfollows every team: `renderRoleToggle()` renders
     **no** `.role-toggle` in `#role-toggle-slot`.
  3. Privacy screen as a player: `renderPrivacy()` appends a
     `מחיקת נתוני ההסעות שלי` button; clicking it (with `window.confirm` stubbed
     true and `fetch` stubbed) clears `gilboa.player` + `gilboa.role` and the
     `_week` cache; as a pure parent, **no** delete button is appended.
  4. Consent dialog body no longer contains the string `מעבר חזרה למצב הורה`;
     it does contain `מסך מדיניות הפרטיות`.

### 3.6 Docs to update (in the implementation plan, not this spec)

| file | change |
|---|---|
| `docs/rides-spec.md` | §4.1: "In player mode, neither is shown" → also drop the "holds the §4.5 switch-back" clause. §4.5: retitle to "Delete my rides data — from the privacy screen"; replace the prompt + `DELETE /api/me`-on-role-switch text with the §3.1 `deleteMyRidesData()` flow. §4.9: summary card no longer "the home of `מעבר למצב הורה`". §8.1: consent line updated to match. §11.2 item 7: rewrite from "switch back to parent → prompt → local clear → DELETE /api/me" to the privacy-screen delete flow. |
| `docs/ui-ux-spec.md` | Rides section: the summary-card bullet drops "This card is also home to `מעבר למצב הורה`…"; add a line under the privacy screen for the delete control. |
| `docs/decision-log.md` | **DL-035** (below). |
| `docs/qa-checklist.md` | line ~105: replace the "switching back to parent role prompts, then deletes…" item with "the privacy screen offers `מחיקת נתוני ההסעות שלי` for a player (not a pure parent); it deletes `week/<wk>/req/<token>/*` best-effort and clears the local token; no *other* flow deletes ride data". |
| `docs/lessons-learned.md` | **LL-026** — a role switch that is also a destructive data operation is a footgun; make destructive actions their own named thing. |
| `docs/known-constraints.md` | note: player mode has no in-app "exit"; recovery for a wrongly-player device is clear-site-data (accepted — followed teams are per-device anyway). |

### DL-035 — Rides: player mode is one-way; deletion is a privacy action, not a role switch

- **Date:** 2026-09-06 (stakeholder feedback)
- **Context:** rides-spec §4.5 shipped a `מעבר למצב הורה` button on the rides
  summary card that prompted once and then `DELETE /api/me` — wiping the week's
  ride requests — and dropped the player token. Player mode is a strict superset
  of parent mode, so the "switch" had no functional purpose, but its accidental
  cost was total: the player loses their picks and the coordinator loses the
  headcount the feature exists to produce.
- **Decision:**
  - Remove the player→parent switch entirely. No button, no `exitToParent()`.
    A player stays a player. `renderRoleToggle()` renders nothing for an
    established player even on the (unfollow-everything) onboarding screen.
  - No player→parent movement deletes ride data. Backing out of name entry
    (pre-token) already deletes nothing; that is the only "movement" left.
  - Keep an explicit deletion capability — required to keep the consent promise
    honest — as a `מחיקת נתוני ההסעות שלי` button on `#screen-privacy`, shown
    only to a player. It calls the same `DELETE /api/me` and then clears the
    local token. Framed and worded as deletion the user chose, not a mode change.
  - Consent + privacy copy updated: "immediate deletion" now points at the
    privacy screen, not at "switching back to parent".
- **Status:** Accepted. Amends rides-spec §4.1/§4.5/§4.9/§8.1/§11. No API or KV
  change — `DELETE /api/me` is reused. `localStorage` semantics unchanged
  (`clearPlayer()` still clears both keys).
- **Risk:** Low. Backend untouched; the one removed network call was
  fire-and-forget. Smoke test updated. The only user-visible loss is the ability
  to leave player mode without clearing site data — deliberate, per the above.

---

## 4. Out of scope

- **Club branding / logo / colour theme** (`gilboamaayanot.co.il`). Raised in the
  same conversation but it is a separate visual-identity task with its own
  research (extract the real palette + a properly hosted logo asset, confirm the
  club is fine with us using their mark) and its own spec. Not folded in here.
- Any change to the manager page, the ride chip, the bottom sheet, or the
  weekly-purge job.
- A cross-device token transfer (still a later slice, unchanged).

---

## 5. Testing summary

- `node tests/site_smoke.js` green with the §3.5 additions.
- `pytest` unaffected (no parser change).
- Functions test job unaffected (`DELETE /api/me` contract unchanged).
- Manual: as a player, register for ≥1 ride → open privacy screen → confirm the
  delete button appears, deletes, and returns to a clean parent view; reopen as a
  pure parent → no delete button; confirm there is no `מעבר למצב הורה` anywhere.
