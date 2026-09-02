# "Earlier days" toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the current week only, collapse already-passed days behind a small "show earlier days" expander, remembering the collapsed/expanded choice per device.

**Architecture:** One pure function `splitWeekByToday(weekSessions, viewSunday, today)` partitions a week's already-sorted sessions into past / upcoming day-groups and reports whether the viewed week is the current one. `renderMyWeek` consumes it and renders an expander row plus the past groups (only when expanded). Everything else — the footer summary, the four exports, the changes banner, the per-team "no session this week" notices — keeps using the full week via the untouched `weekSessionsFor`. State lives in one new `localStorage` key. No build, data-format, or Python change.

**Tech Stack:** Vanilla ES5-style JS (`public/app.js`), plain CSS (`public/styles.css`), the dependency-free Node DOM harness (`tests/site_smoke.js`). `node tests/site_smoke.js` is the only test runner.

## Global Constraints

- **No build step, no framework, no external libraries or CDNs.** Vanilla JS only, written in the existing ES5 idiom of `public/app.js` (`var`, `function`, no arrow functions, no `const`/`let`).
- **RTL Hebrew UI, mobile-first**, usable at 360px width; every tappable control ≥ 44px high (`min-height: var(--tap)`).
- **All `localStorage` keys are namespaced `gilboa.*`** and every read/write is wrapped in `try/catch` (private-mode browsers throw).
- **No change** to `public/data/*.json`, the Python scripts, or `.github/workflows/*`.
- **`node tests/site_smoke.js` must exit 0** with every pre-existing assertion still passing. `pytest` is not touched.
- Times are shown as the literal wall-clock string from the data — never re-shifted.
- Ship as a single short-lived branch off `main`, fast-forward merged; the deploy workflow's `push` trigger on `public/**` redeploys automatically.

---

### Task 1: Pure split helpers (`splitWeekByToday`, `groupByDate`)

**Files:**
- Modify: `public/app.js` — add `groupByDate` and `splitWeekByToday` near the other week helpers (after `weekSessionsFor`, ~line 538); add both to the `window.*` export block (~line 987).
- Test: `tests/site_smoke.js` — new `console.log('earlier-days — split helper')` block, inserted immediately before the `console.log('week nav bounds')` line (~line 319).

**Interfaces:**
- Consumes: existing internal `sundayOf(ymd)` (string date math, already in the file).
- Produces:
  - `groupByDate(sessions)` → `Array<[dateStr, Array<session>]>`, in first-seen order (callers pass already date-then-time sorted sessions, so the result is ascending by date with each group time-sorted).
  - `splitWeekByToday(weekSessions, viewSunday, today)` → `{ isCurrentWeek: boolean, pastGroups: Array<[date, session[]]>, upcomingGroups: Array<[date, session[]]> }`.
    - `isCurrentWeek` is `sundayOf(today) === viewSunday`.
    - When not the current week: `pastGroups: []`, `upcomingGroups:` **all** groups.
    - When the current week: a group whose date `< today` goes to `pastGroups`, otherwise `upcomingGroups`.
  - Both exposed as `window.groupByDate` / `window.splitWeekByToday`.

- [ ] **Step 1: Write the failing tests**

In `tests/site_smoke.js`, immediately before the `console.log('week nav bounds');` line, insert:

Use block-scoped `const`/`let` (this is the modern Node harness, not `app.js`) so nothing here can collide with an identifier elsewhere in the harness's async IIFE.

```javascript
  console.log('earlier-days — split helper');
  {
    const SPLIT_WK = '2026-09-06';
    const mkS = (date) => ({
      team_id: 'TX', week_key: SPLIT_WK, date: date, weekday: 0,
      start: date + 'T17:00:00+03:00', end: date + 'T18:30:00+03:00',
    });
    // sorted, multi-day week
    const sw = [mkS('2026-09-06'), mkS('2026-09-08'), mkS('2026-09-08'), mkS('2026-09-10')];

    const mid = window.splitWeekByToday(sw, SPLIT_WK, '2026-09-08');
    assert(mid.isCurrentWeek === true, 'split: today inside the viewed week => isCurrentWeek');
    assert(mid.pastGroups.length === 1 && mid.pastGroups[0][0] === '2026-09-06',
      'split: earlier day is a past group');
    assert(mid.upcomingGroups.map(g => g[0]).join(',') === '2026-09-08,2026-09-10',
      'split: today and later are upcoming groups, grouped by date');

    const outWk = window.splitWeekByToday(sw, SPLIT_WK, '2026-09-20');
    assert(outWk.isCurrentWeek === false, 'split: today outside the viewed week => not current');
    assert(outWk.pastGroups.length === 0 && outWk.upcomingGroups.length === 3,
      'split: non-current week keeps every day in upcomingGroups');

    const doneWk = window.splitWeekByToday(sw, SPLIT_WK, '2026-09-12');
    assert(doneWk.isCurrentWeek === true && doneWk.upcomingGroups.length === 0 && doneWk.pastGroups.length === 3,
      'split: today after every session => all past, no upcoming');

    const freshWk = window.splitWeekByToday(sw, SPLIT_WK, '2026-09-06');
    assert(freshWk.pastGroups.length === 0 && freshWk.upcomingGroups.length === 3,
      'split: today == first session day => nothing past');

    assert(window.groupByDate(sw).length === 3 &&
           window.groupByDate(sw)[1][1].length === 2,
      'groupByDate: one entry per date, sessions collected per day');
  }
```

- [ ] **Step 2: Run the harness to verify the new block fails**

Run: `node tests/site_smoke.js`
Expected: FAIL — lines like `FAIL split: today inside the viewed week => isCurrentWeek` (because `window.splitWeekByToday` is `undefined`, the block throws / asserts fail). Exit code 1.

- [ ] **Step 3: Implement the helpers**

In `public/app.js`, directly after the `weekSessionsFor` function (the block that ends around line 538), add:

```javascript
// [date, [session,...]] pairs in first-seen (ascending) order. Callers pass
// sessions already sorted day-then-time, so each group is time-sorted.
function groupByDate(sessions) {
  var byDate = {}, order = [];
  sessions.forEach(function (s) {
    if (!byDate[s.date]) { byDate[s.date] = []; order.push(s.date); }
    byDate[s.date].push(s);
  });
  return order.map(function (d) { return [d, byDate[d]]; });
}

// Split one week's followed sessions into past / upcoming day-groups.
// "Current week" = the viewed week contains `today`. Whole days only:
// a day is "past" iff its date string is < today.
function splitWeekByToday(weekSessions, viewSunday, today) {
  var groups = groupByDate(weekSessions);
  if (sundayOf(today) !== viewSunday) {
    return { isCurrentWeek: false, pastGroups: [], upcomingGroups: groups };
  }
  var past = [], upcoming = [];
  groups.forEach(function (g) { (g[0] < today ? past : upcoming).push(g); });
  return { isCurrentWeek: true, pastGroups: past, upcomingGroups: upcoming };
}
```

In the `window.*` export block (currently ending at `window.drawWeekImage = drawWeekImage;`, ~line 987) add:

```javascript
window.groupByDate = groupByDate;
window.splitWeekByToday = splitWeekByToday;
```

- [ ] **Step 4: Run the harness to verify the new block passes**

Run: `node tests/site_smoke.js`
Expected: PASS — the six new `ok` lines under `earlier-days — split helper`, and the final line `all site smoke checks passed`. Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add public/app.js tests/site_smoke.js
git commit -m "feat(site): splitWeekByToday / groupByDate pure helpers"
```

---

### Task 2: Wire the expander into `renderMyWeek` + persistence + styles

**Files:**
- Modify: `public/app.js`
  - add `LS_WEEK_COLLAPSED` constant next to `LS_SEEN` (~line 11)
  - add `weekCollapsed` module var + `loadWeekCollapsed` / `saveWeekCollapsed` next to the other `localStorage` helpers (~line 98)
  - replace the day-group build+render block in `renderMyWeek` (currently ~lines 259–273) with the split-aware version
  - add `renderDayGroup` and `renderExpander` helpers next to `renderSession` (~line 368)
- Modify: `public/styles.css` — add a `.week-expander` block after the `.wact` rules (~line 223)
- Test: `tests/site_smoke.js` — add a `console.log('earlier-days — expander UI')` block, and a small `Date` stub at the top of the harness. Insert the UI block right after the split-helper block from Task 1.

**Interfaces:**
- Consumes from Task 1: `splitWeekByToday(weekSessions, viewSunday, today)` returning `{ isCurrentWeek, pastGroups, upcomingGroups }`; group shape `[dateStr, session[]]`.
- Consumes existing: `weekSessionsFor(sunday)`, `todayYmd()`, `renderSession(s, multi)`, `el(tag, cls, text)`, `HE_WEEKDAY`, `dmLabel(ymd)`, `renderSummary(weekSessions)`, CSS vars `--tap` `--accent` `--accent-dark` `--border`.
- Produces: new `localStorage` key `gilboa.week_collapsed` (`'1'` collapsed / `'0'` expanded; absent ⇒ collapsed). A `<button class="week-expander">` rendered as a child of `#week-content` when — and only when — the viewed week is current and has ≥ 1 past day with sessions.

- [ ] **Step 1: Write the failing tests**

**1a.** At the top of `tests/site_smoke.js`, immediately after the `const ROOT = ...` line (~line 12), add a controllable clock:

```javascript
const RealDate = Date;
let FAKE_NOW = null;                       // null => real time
function setToday(ymd) {
  if (ymd === null) { FAKE_NOW = null; return; }
  const p = ymd.split('-').map(Number);
  FAKE_NOW = new RealDate(p[0], p[1] - 1, p[2], 12, 0, 0).getTime();  // local noon
}
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0 && FAKE_NOW !== null) super(FAKE_NOW);
    else super(...args);
  }
  static now() { return FAKE_NOW !== null ? FAKE_NOW : RealDate.now(); }
}
global.Date = FakeDate;
```

(`FakeDate` inherits `Date.UTC` as a static method, so `Date.UTC(...)` in `app.js` keeps working; one- and multi-arg `new Date(x)` delegate to the real constructor.)

**1b.** Immediately after the `earlier-days — split helper` block, insert. Use block-scoped `const`/`let` throughout so nothing collides with the harness's other identifiers.

```javascript
  console.log('earlier-days — expander UI');
  {
    // pick a real (week, team) where the team trains on >= 2 distinct days
    const gmap = {};
    schedule.sessions.forEach((s) => {
      if (!s.team_id) return;
      const key = s.week_key + '|' + s.team_id;
      (gmap[key] = gmap[key] || new Set()).add(s.date);
    });
    const GK = Object.keys(gmap).sort().filter(key => gmap[key].size >= 2)[0];
    const gWk = GK.split('|')[0];
    const gTid = GK.split('|')[1];
    const gDays = Array.from(gmap[GK]).sort();
    const gPastCount = gDays.length - 1;               // today = last day => that many past days
    const weeksSorted = schedule.weeks.slice().sort();
    const gIdx = weeksSorted.indexOf(gWk);
    const gFullCount = schedule.sessions
      .filter(s => s.team_id === gTid && s.week_key === gWk).length;

    const gotoWeekIndex = (i) => {
      let g = 0;
      while (!prev.disabled && g++ < 40) prev.click();
      next.click();                                    // -> weeksSorted[0]
      for (let k = 0; k < i; k++) next.click();        // -> weeksSorted[i]
    };
    const dayGroups = () => byId['week-content'].querySelectorAll('.day-group').length;
    const summaryNum = () => {
      const mm = /\d+/.exec(byId['summary'].textContent);
      return mm ? +mm[0] : 1;                          // "אימון אחד" has no digit
    };

    // follow ONLY the target team
    let rmB;
    let rg = 0;
    while ((rmB = byId['follows-row'].querySelectorAll('.chip-remove')).length && rg++ < 20) rmB[0].click();
    window.applyTeamsParam('?teams=' + gTid);

    setToday(gDays[gDays.length - 1]);                 // last training day is "today"
    delete store['gilboa.week_collapsed'];
    gotoWeekIndex(gIdx);                               // nav triggers a re-render under the fake clock

    const exp = byId['week-content'].querySelector('.week-expander');
    assert(!!exp, 'expander row shown on the current week when earlier days have sessions');
    assert(exp.textContent.indexOf('הצג ימים קודמים (' + gPastCount + ')') !== -1,
      'collapsed label names the hidden-day count');
    assert(dayGroups() === 1, 'collapsed: only the upcoming day-group is rendered');
    assert(summaryNum() === gFullCount, 'summary counts the whole week while collapsed');

    exp.click();
    assert(store['gilboa.week_collapsed'] === '0', 'expanding persists gilboa.week_collapsed = 0');
    assert(byId['week-content'].querySelector('.week-expander').textContent.indexOf('הסתר ימים קודמים') !== -1,
      'expanded label switches to "hide"');
    assert(dayGroups() === gDays.length, 'expanded: every day-group is rendered');
    assert(summaryNum() === gFullCount, 'summary unchanged by expanding');

    // the choice survives week navigation (in-memory state, no reload)
    next.click(); prev.click();                        // leave the week and come back
    assert(dayGroups() === gDays.length, 'still expanded after navigating away and back');

    byId['week-content'].querySelector('.week-expander').click();
    assert(store['gilboa.week_collapsed'] === '1', 'collapsing again persists = 1');
    assert(dayGroups() === 1, 'collapsed again: back to upcoming only');

    // a non-current published week never shows the expander and renders all its days
    const adjIdx = gIdx + 1 < weeksSorted.length ? gIdx + 1 : gIdx - 1;
    (adjIdx > gIdx ? next : prev).click();
    const adjWk = weeksSorted[adjIdx];
    const adjDayCount = new Set(schedule.sessions
      .filter(s => s.team_id === gTid && s.week_key === adjWk)
      .map(s => s.date)).size;
    assert(!byId['week-content'].querySelector('.week-expander'),
      'no expander when the viewed week is not the current week');
    assert(dayGroups() === adjDayCount,
      'non-current week renders every day-group it has (' + adjDayCount + ')');

    // restore for the remaining checks
    setToday(null);
    delete store['gilboa.week_collapsed'];
    window.applyTeamsParam('?teams=' + T1);
  }
```

- [ ] **Step 2: Run the harness to verify it fails**

Run: `node tests/site_smoke.js`
Expected: FAIL — `FAIL expander row shown on the current week ...` and the following new assertions (no `.week-expander` element exists yet). Pre-existing checks still pass. Exit code 1.

- [ ] **Step 3: Add the constant, state, and persistence helpers**

In `public/app.js`, change the constants block (~line 10-11):

```javascript
var LS_FOLLOWED = 'gilboa.followed';
var LS_SEEN = 'gilboa.seen_generated_at';
var LS_WEEK_COLLAPSED = 'gilboa.week_collapsed';
```

Add to the State block (~line 38, next to `var followed = loadFollowed();`):

```javascript
var weekCollapsed = loadWeekCollapsed();   // current week: hide already-passed days
```

Add next to `getSeen` / `setSeen` (~line 98):

```javascript
function loadWeekCollapsed() {
  try { return localStorage.getItem(LS_WEEK_COLLAPSED) !== '0'; } catch (e) { return true; }
}
function saveWeekCollapsed() {
  try { localStorage.setItem(LS_WEEK_COLLAPSED, weekCollapsed ? '1' : '0'); } catch (e) {}
}
```

- [ ] **Step 4: Add the render helpers**

In `public/app.js`, directly after `renderSession` (ends ~line 368), add:

```javascript
function renderDayGroup(group, multi) {
  var date = group[0], sessions = group[1];
  var grp = el('div', 'day-group');
  grp.appendChild(el('div', 'day-head', HE_WEEKDAY[sessions[0].weekday] + ' ' + dmLabel(date)));
  sessions.forEach(function (s) { grp.appendChild(renderSession(s, multi)); });
  return grp;
}

// Toggle row for the current week's already-passed days.
function renderExpander(pastDayCount) {
  var btn = el('button', 'week-expander');
  btn.type = 'button';
  btn.setAttribute('aria-expanded', String(!weekCollapsed));
  btn.appendChild(el('span', 'week-expander-caret', weekCollapsed ? '▸' : '▾'));
  btn.appendChild(document.createTextNode(' ' + (weekCollapsed
    ? 'הצג ימים קודמים (' + pastDayCount + ')'
    : 'הסתר ימים קודמים')));
  btn.addEventListener('click', function () {
    weekCollapsed = !weekCollapsed;
    saveWeekCollapsed();
    renderMyWeek();
  });
  return btn;
}
```

- [ ] **Step 5: Rewrite the day-list block in `renderMyWeek`**

In `public/app.js`, replace this exact block (currently ~lines 259–273):

```javascript
  var byDate = {};
  var order = [];
  weekSessions.forEach(function (s) {
    if (!byDate[s.date]) { byDate[s.date] = []; order.push(s.date); }
    byDate[s.date].push(s);
  });

  var multi = followed.length > 1;
  order.forEach(function (date) {
    var grp = el('div', 'day-group');
    var wd = byDate[date][0].weekday;
    grp.appendChild(el('div', 'day-head', HE_WEEKDAY[wd] + ' ' + dmLabel(date)));
    byDate[date].forEach(function (s) { grp.appendChild(renderSession(s, multi)); });
    content.appendChild(grp);
  });
```

with:

```javascript
  var multi = followed.length > 1;
  var split = splitWeekByToday(weekSessions, viewSunday, todayYmd());

  if (split.isCurrentWeek && split.pastGroups.length) {
    content.appendChild(renderExpander(split.pastGroups.length));
    if (!weekCollapsed) {
      split.pastGroups.forEach(function (g) { content.appendChild(renderDayGroup(g, multi)); });
    }
  }

  if (split.upcomingGroups.length) {
    split.upcomingGroups.forEach(function (g) { content.appendChild(renderDayGroup(g, multi)); });
  } else if (split.isCurrentWeek && split.pastGroups.length) {
    content.appendChild(el('div', 'no-data', 'אין עוד אימונים השבוע'));
  }
```

Leave everything else in `renderMyWeek` unchanged — `weekSessions` is still passed whole to `renderSummary(weekSessions)` at the end, and the "followed teams with no session this week" loop is untouched.

- [ ] **Step 6: Add the styles**

In `public/styles.css`, after the `.wact:focus-visible` rule (~line 222), add:

```css
/* ---------- "Earlier days" expander (current week only) ---------- */
.week-expander {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  min-height: var(--tap);
  margin: 0 0 1rem;
  padding: 0.4rem 0.1rem;
  background: none;
  border: none;
  border-bottom: 1px dashed var(--border);
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
}
.week-expander:active { color: var(--accent-dark); }
.week-expander:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.week-expander-caret { font-size: 0.8em; line-height: 1; }
```

- [ ] **Step 7: Run the harness to verify everything passes**

Run: `node tests/site_smoke.js`
Expected: PASS — every `earlier-days — expander UI` assertion prints `ok`, and the run ends `all site smoke checks passed`, exit 0. Confirm the pre-existing sections (`load`, `add team`, `follow + My Week render`, `changes banner`, `buildWeekText`, `buildICS`, `drawWeekImage`, `week nav bounds`, `unfollow`) still all print `ok`.

- [ ] **Step 8: Commit**

```bash
git add public/app.js public/styles.css tests/site_smoke.js
git commit -m "feat(site): collapse already-passed days on the current week"
```

---

### Task 3: Documentation + decision record

**Files:**
- Modify: `public/README.md` — add the toggle to the "What it does" list.
- Modify: `docs/decision-log.md` — new `DL-027`.
- Modify: `docs/execution-plan.md` — progress-log entry.
- Modify: `docs/ui-ux-spec.md` — note the current-week collapse in the My Week screen description.

**Interfaces:** none (docs only).

- [ ] **Step 1: `public/README.md`**

In the "What it does" list, under the `השבוע שלי (My Week)` bullet, append a sub-line:

```markdown
  On the **current week**, days that have already passed are collapsed behind a
  "הצג ימים קודמים (N)" toggle (default collapsed). The choice is remembered per
  device (`gilboa.week_collapsed`). Past and future weeks always show all seven
  days.
```

- [ ] **Step 2: `docs/decision-log.md`**

Append at the end of the file:

```markdown

## DL-027 — Current-week view collapses already-passed days (opt-out toggle)
- **Date:** 2026-09-02 (Phase 3, post-launch)
- **Context:** A parent opened the app mid-week (season start) and saw only
  Wed–Sat. Investigation confirmed the site never hid past days — the data
  genuinely had almost nothing on Sun–Tue that first week. The parent asked for
  a way to choose "what's left this week" vs "the whole week".
- **Decision:** On the **current week only**, collapse day-groups earlier than
  today behind a `הצג ימים קודמים (N)` / `הסתר ימים קודמים` toggle row at the top
  of the list. Default **collapsed** for a new visitor; the choice is persisted
  in `localStorage` (`gilboa.week_collapsed`, `'1'`/`'0'`, absent ⇒ collapsed)
  and survives week navigation. Whole days only — a session earlier today still
  shows. Past and future weeks are unaffected. The footer summary, all four
  exports, the changes banner, and the per-team "no session this week" notices
  keep operating on the **full** week regardless of the toggle. Implemented as a
  pure `splitWeekByToday()` helper + render wiring; no build / data / Python
  change. Spec: `docs/superpowers/specs/2026-09-02-week-view-toggle-design.md`.
- **Status:** Accepted.
- **Risk:** Low. Pure-function + DOM-harness tested; a real-device RTL glance at
  the toggle row is still worthwhile.
```

- [ ] **Step 3: `docs/execution-plan.md`**

In the progress log, after the DL-024 verification entry, add:

```markdown
- **2026-09-02 — "earlier days" toggle (post-launch tweak).** On the current
  week, already-passed days collapse behind a `הצג ימים קודמים (N)` toggle
  (default collapsed, remembered per device — `gilboa.week_collapsed`). Pure
  `splitWeekByToday()` helper + `renderMyWeek` wiring; summary and exports still
  use the full week. `node tests/site_smoke.js` green. DL-027;
  spec + plan under `docs/superpowers/`.
```

- [ ] **Step 4: `docs/ui-ux-spec.md`**

Find the My Week screen description and add one sentence where the day list / week is described:

```markdown
On the current week, days before today are collapsed by default behind a
"הצג ימים קודמים (N)" toggle at the top of the list; the parent can expand them
and the choice is remembered. Other weeks always show the full Sun–Sat.
```

(If the exact anchor differs, place it in the paragraph that describes the My Week day list.)

- [ ] **Step 5: Verify nothing else changed & the harness is still green**

Run: `node tests/site_smoke.js`
Expected: `all site smoke checks passed`, exit 0. (No code changed in this task, but confirm.)

- [ ] **Step 6: Commit**

```bash
git add public/README.md docs/decision-log.md docs/execution-plan.md docs/ui-ux-spec.md
git commit -m "docs: record the current-week earlier-days toggle (DL-027)"
```

---

## Integration & rollout (after all tasks)

- [ ] `node tests/site_smoke.js` → green.
- [ ] `git checkout main && git merge --ff-only <branch> && git push origin main` — the push touches `public/**`, so "Build & deploy" runs and republishes.
- [ ] Load `https://rankad.github.io/team-schedule/` on a phone: with a followed team, on the current week, confirm the toggle row appears, expands/collapses, and the choice sticks after a reload.

## Self-review notes

- **Spec coverage:** behavior split (Task 1) · expander UI + labels + count (Task 2 step 4-5) · default collapsed (Task 2, `loadWeekCollapsed` returns `true` when absent; test "collapsed default") · persistence across week navigation (Task 2 test "still expanded after navigating away and back") · persistence across visits — `saveWeekCollapsed` writes `'0'`/`'1'` (asserted) and `loadWeekCollapsed` reads it at boot; a true page reload can't be simulated in the one-shot harness, so this leg is verified by the write assertion + the manual phone check · current-week-only (Task 1 `isCurrentWeek`, Task 2 test "no expander when not current") · empty-upcoming message `אין עוד אימונים השבוע` (Task 2 step 5 `else if`) · no-past ⇒ nothing changes (Task 2 step 5 guard `split.pastGroups.length`) · summary/exports/banner untouched (Task 2 step 5 final paragraph; test "summary counts the whole week") · `gilboa.*` namespace + try/catch (Task 2 step 3).
- **No placeholders:** every step has full code or an exact command + expected output.
- **Type consistency:** `splitWeekByToday` returns `{isCurrentWeek,pastGroups,upcomingGroups}` in Task 1 and is consumed with those exact names in Task 2 step 5; group shape `[date, session[]]` produced by `groupByDate` and consumed by `renderDayGroup(group, multi)` as `group[0]`/`group[1]`.
- **Untested-but-low-risk:** the `אין עוד אימונים השבוע` branch has no dedicated harness assertion (it needs a followed team whose only sessions this week are in the past — hard to guarantee from live data). The code path is a one-line `else if`; a real-device check covers it.
