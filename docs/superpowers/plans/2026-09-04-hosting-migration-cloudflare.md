# Hosting Migration — GitHub Pages → Cloudflare Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the live site from a git-connected Cloudflare Pages project (auto-deploy on push to `main`), retire the GitHub Pages `deploy` job, and leave the old `rankad.github.io/team-schedule/` URL showing a "we moved" redirect — with no change to the Python build, the site code, or the data JSON.

**Architecture:** The GitHub Actions workflow keeps doing exactly one thing: run `pytest`, fetch the club calendar, rebuild `public/data/*.json`, and commit+push to `main`. Cloudflare Pages is connected to the same GitHub repo with **no build command** and output directory `public/`; every push to `main` (the data commits, plus any site or docs commit) triggers a Cloudflare deploy that just uploads `public/`. The GitHub Pages `deploy` job is removed. A tiny `legacy/` folder with a client-side redirect is published once to the old GitHub Pages URL so previously-shared links keep working. This migration is a prerequisite for the rides feature (`docs/superpowers/specs/2026-09-03-rides-coordination-design.md` §11), which later adds `functions/` to this same Cloudflare Pages project.

**Tech Stack:** Cloudflare Pages (free tier, git integration, static — no Functions in this plan). GitHub Actions (existing `.github/workflows/build.yml`, `keepalive.yml`). No code changes to `public/`. Docs in Markdown.

## Global Constraints

- **No build step, no framework, no CDN, no new dependencies.** The site is three static files served from `public/`; Cloudflare Pages build command stays empty and output dir is `public`.
- **The site code in `public/` is not touched by this plan.** It already fetches data with root-relative-free paths (`fetch('data/meta.json')`), so it works identically at a domain root (`*.pages.dev`) and under a subpath (`rankad.github.io/team-schedule/`). Do not add a `<base>` tag, a hardcoded host, `_redirects`, or `_headers`.
- **`GOOGLE_CALENDAR_API_KEY` stays a GitHub Actions secret.** The Python build runs on GitHub Actions, not on Cloudflare. Cloudflare needs **zero** secrets for this static migration. Do not move or duplicate the key.
- **The Python build, `scripts/**`, `tests/**`, `public/data/*.json` shapes, the cron schedule (`0 5,17 * * *` UTC), and `keepalive.yml` are unchanged.**
- **All work on one short-lived branch off `main`.** Merge to `main` only after Task 2 confirms the Cloudflare deploy is live and byte-identical in behaviour.
- **`pytest -q` and `node tests/site_smoke.js` must both stay green** at every commit (they are unaffected, but confirm).
- Amends **DL-026**. Record the new state as **DL-028** and add a pointer from DL-026. Follow the repo's append-only, numbered decision-log convention.
- Repo: `github.com/Rankad/team-schedule` (public). Current live URL: `https://rankad.github.io/team-schedule/`.

---

### Task 1: Branch + write the Cloudflare setup runbook for the stakeholder

**Files:**
- Create: `docs/HOSTING-MIGRATION-USER-TASKS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `docs/HOSTING-MIGRATION-USER-TASKS.md` — the exact Cloudflare dashboard steps. The stakeholder executes them between this task and Task 2. After they finish they report back **the production URL** (`https://<project-name>.pages.dev`) and **the Cloudflare project name**; later tasks substitute those verbatim for the `<PAGES_URL>` / `<PROJECT_NAME>` placeholders.

- [ ] **Step 1: Create the branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feature/hosting-migration-cloudflare
```

- [ ] **Step 2: Write `docs/HOSTING-MIGRATION-USER-TASKS.md`**

Create the file with exactly this content:

```markdown
# Hosting migration — stakeholder tasks (Cloudflare Pages)

These steps need a Cloudflare account and the GitHub repo owner's login. The
agent cannot do them. Do them in order, then tell the agent the two values at
the bottom.

## 1. Create a Cloudflare account (if you don't have one)
- https://dash.cloudflare.com/sign-up — free plan, no card required.
- Verify the email.

## 2. Create the Pages project, connected to GitHub
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** tab →
   **Connect to Git**.
2. Authorise Cloudflare for GitHub. Grant access to **`Rankad/team-schedule`**
   (you can limit it to just that repo).
3. Pick the repo. On the build-settings screen:
   - **Project name:** `gilboa-schedule` (this becomes
     `gilboa-schedule.pages.dev` — pick another name if it's taken and note
     what you chose).
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `public`
   - **Root directory:** *(leave as `/`)*
4. **Save and Deploy.** The first deploy runs in ~1 minute. Because the repo
   already contains `public/` with committed data, the site works immediately.

## 3. Confirm it's up
- Open `https://<project name>.pages.dev` — you should see the Hebrew schedule,
  identical to `https://rankad.github.io/team-schedule/`.
- If it 404s or looks empty, check **the build output directory is `public`**
  (not blank, not `/`) in the project's Settings → Builds & deployments.

## 4. (Leave these alone)
- Do **not** set any environment variables or secrets — the static site needs
  none. (The rides feature adds them later, in a separate piece of work.)
- Do **not** add a custom domain yet — we start on `*.pages.dev` on purpose.

## Report back to the agent
- **Production URL:** `https://__________.pages.dev`
- **Cloudflare project name:** `__________`
```

- [ ] **Step 3: Commit**

```bash
git add docs/HOSTING-MIGRATION-USER-TASKS.md
git commit -m "docs: Cloudflare Pages setup runbook for the hosting migration"
```

- [ ] **Step 4: Hand off to the stakeholder**

Tell the stakeholder: "Follow `docs/HOSTING-MIGRATION-USER-TASKS.md`, then send me the `*.pages.dev` URL and the project name." **Do not start Task 2 until they reply with both values.**

---

### Task 2: Verify the Cloudflare deploy is live and behaviourally identical

**Files:** none (verification only).

**Interfaces:**
- Consumes from Task 1: `<PAGES_URL>` (e.g. `https://gilboa-schedule.pages.dev`) and `<PROJECT_NAME>` from the stakeholder.
- Produces: a go/no-go decision. If any check fails, stop and report — do **not** proceed to Task 3 (which removes the GitHub Pages deploy).

- [ ] **Step 1: Load the new site in a browser**

Open `<PAGES_URL>` in the in-app browser (`mcp__Claude_Browser__navigate`).
Expected:
- The Hebrew RTL page renders (club name "גלבוע מעיינות" in the header, week nav arrows).
- No "לא הצלחנו לטעון את הנתונים" fatal card.

- [ ] **Step 2: Confirm the data JSON is served**

In the browser, check the Network panel (`mcp__Claude_Browser__read_network_requests` with `urlPattern: "data/"`).
Expected: `data/meta.json`, `data/teams.json`, `data/schedule.json`, `data/changes.json` all return **200** with `content-type` JSON.

- [ ] **Step 3: Confirm the console is clean**

`mcp__Claude_Browser__read_console_messages` with `onlyErrors: true`.
Expected: no errors (a favicon 404 is acceptable and can be ignored).

- [ ] **Step 4: Exercise the core flow**

In the browser: open "בחירת קבוצה", search a known coach or team substring, follow a result, return to "השבוע שלי".
Expected: the followed team's sessions render grouped by day; the week nav arrows move between the published weeks.

- [ ] **Step 5: Check a share link with a query string**

Navigate to `<PAGES_URL>/?teams=T_001` (use any real `team_id` from `public/data/teams.json`).
Expected: a toast confirms the team was added / the follows row shows it, and the URL's `?teams=` is stripped by `history.replaceState` (existing DL-022 behaviour), proving query-string handling works at the domain root.

- [ ] **Step 6: Record the result**

If every check passed: note `<PAGES_URL>` and `<PROJECT_NAME>` for Tasks 3–5 and continue.
If anything failed: stop. The most likely cause is a wrong build-output directory in the Cloudflare project — send the stakeholder back to `docs/HOSTING-MIGRATION-USER-TASKS.md` §3.

---

### Task 3: Retire the GitHub Pages `deploy` job

**Files:**
- Modify: `.github/workflows/build.yml`

**Interfaces:**
- Consumes: a confirmed-live `<PAGES_URL>` (Task 2).
- Produces: a `build.yml` with a single job `build-data` (fetch + rebuild + commit + push), no Pages permissions, no push/paths trigger. Cloudflare Pages' git integration is now the only deploy path for the main site. The `legacy` redirect (Task 4) reuses Pages one more time via its own job.

- [ ] **Step 1: Replace `.github/workflows/build.yml`**

Overwrite the file with exactly this content:

```yaml
name: Build schedule data

# Fetch the club calendar, rebuild public/data/*.json, commit & push if it
# changed. Deployment is handled by Cloudflare Pages' git integration (it
# deploys public/ on every push to main) — see DL-028. GitHub Pages is retired;
# the old rankad.github.io URL serves the legacy redirect (deploy-legacy-redirect
# job below, run once manually).
on:
  schedule:
    # Twice daily: a morning refresh + an evening one that catches daytime edits.
    # GitHub cron is UTC-only and can't follow Israeli DST. Anchored to WINTER
    # time (UTC+2) on purpose: 05:00/17:00 UTC = 07:00/19:00 Asia/Jerusalem
    # Nov–late March, and 08:00/20:00 during summer time. Do not "fix" to UTC+3.
    - cron: "0 5,17 * * *"
  workflow_dispatch:

permissions:
  contents: write   # build-data commits the regenerated JSON

concurrency:
  group: build-data
  cancel-in-progress: false

jobs:
  build-data:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Set up Python
        uses: actions/setup-python@v6
        with:
          python-version: "3.13"

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt

      - name: Run tests
        run: pytest -q

      - name: Configure git identity
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Build schedule data (fetch + normalize + diff + commit)
        env:
          GOOGLE_CALENDAR_API_KEY: ${{ secrets.GOOGLE_CALENDAR_API_KEY }}
        run: python scripts/fetch_and_build.py --commit

      - name: Report fetched event count
        run: python -c "import json; m=json.load(open('public/data/meta.json')); print('Fetched events:', m['event_count'], '| window', m['window'])"

      - name: Push (no-op if fetch_and_build made no commit)
        run: git push
```

- [ ] **Step 2: Validate the YAML parses**

Run:
```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build.yml')); print('build.yml OK')"
```
Expected: `build.yml OK` (no traceback).

- [ ] **Step 3: Confirm the local test suites are unaffected**

Run:
```bash
pytest -q
```
Expected: same result as on `main` (all pass, or the one known pre-existing `icalendar`-not-installed skip/failure noted in `docs/execution-plan.md` — nothing new).

Run:
```bash
node tests/site_smoke.js
```
Expected: `all site smoke checks passed`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci: drop the GitHub Pages deploy job (Cloudflare Pages now deploys) — DL-028"
```

---

### Task 4: Legacy redirect on the old GitHub Pages URL

**Files:**
- Create: `legacy/index.html`
- Create: `legacy/.nojekyll`
- Modify: `.github/workflows/build.yml` — add a second job `deploy-legacy-redirect` (manual only).

**Interfaces:**
- Consumes: `<PAGES_URL>` from Task 2 (hardcoded into `legacy/index.html`).
- Produces: after one manual run of the `deploy-legacy-redirect` job, `https://rankad.github.io/team-schedule/` serves a page that forwards to `<PAGES_URL>` preserving the query string and hash, with a visible Hebrew "we moved" notice as a fallback. The GitHub Pages source stays "GitHub Actions"; only the uploaded content changes.

- [ ] **Step 1: Create `legacy/index.html`**

Substitute the real `<PAGES_URL>` for `PAGES_URL_HERE` in both places:

```html
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>הכתובת השתנתה — הלו״ז של גלבוע מעיינות</title>
  <link rel="canonical" href="PAGES_URL_HERE/">
  <script>
    // Forward immediately, carrying any ?teams=… share query and #hash.
    (function () {
      var base = "PAGES_URL_HERE/";
      location.replace(base + location.search + location.hash);
    })();
  </script>
  <meta http-equiv="refresh" content="3; url=PAGES_URL_HERE/">
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
           max-width: 32rem; margin: 4rem auto; padding: 0 1.2rem; line-height: 1.6;
           color: #1b1b1b; background: #fafafa; }
    a { color: #0645ad; word-break: break-all; }
    h1 { font-size: 1.3rem; }
  </style>
</head>
<body>
  <h1>הכתובת של הלו״ז השתנתה</h1>
  <p>העמוד עבר לכתובת חדשה. אתם אמורים לעבור אליה עכשיו אוטומטית.</p>
  <p>אם לא — <a href="PAGES_URL_HERE/">לחצו כאן כדי להמשיך</a>.</p>
  <p>כדאי לעדכן את הסימנייה (bookmark) לכתובת החדשה.</p>
</body>
</html>
```

- [ ] **Step 2: Create `legacy/.nojekyll`**

Create an empty file at `legacy/.nojekyll` (prevents GitHub Pages' Jekyll processing).

```bash
touch legacy/.nojekyll
```

- [ ] **Step 3: Add the `deploy-legacy-redirect` job to `build.yml`**

Append this job to `.github/workflows/build.yml` (after `build-data:`), and add back the `pages`/`id-token` permissions it needs. The full `permissions:` block becomes:

```yaml
permissions:
  contents: write   # build-data commits the regenerated JSON
  pages: write      # deploy-legacy-redirect publishes the legacy/ folder
  id-token: write   # OIDC token for deploy-pages
```

And the new job:

```yaml
  deploy-legacy-redirect:
    # Run once, by hand, after the Cloudflare migration: publishes legacy/ to the
    # old GitHub Pages URL so previously-shared rankad.github.io links forward on.
    # Not part of the data pipeline. See DL-028.
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload legacy/ as the Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: legacy

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Validate the YAML again**

```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build.yml')); print('build.yml OK')"
```
Expected: `build.yml OK`.

- [ ] **Step 5: Commit**

```bash
git add legacy/index.html legacy/.nojekyll .github/workflows/build.yml
git commit -m "ci: legacy redirect page for the retired GitHub Pages URL — DL-028"
```

- [ ] **Step 6: (After merge — see Task 6) run the job once and verify**

This step runs **after Task 6 merges to `main`** (the workflow must be on `main` to dispatch it). Trigger it:

```bash
gh workflow run "Build schedule data" --ref main
```

Then, in the GitHub Actions UI, open the run and confirm the `deploy-legacy-redirect` job succeeded (the `build-data` job also runs on a manual dispatch — that's fine, it just refreshes data).

Verify in the browser: navigate to `https://rankad.github.io/team-schedule/` — expected: it lands on `<PAGES_URL>` within ~3 seconds (or immediately via the script). Navigate to `https://rankad.github.io/team-schedule/?teams=T_001` — expected: it lands on `<PAGES_URL>/?teams=T_001` and the team is added.

---

### Task 5: Documentation

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/decision-log.md` — append `DL-028`, add a pointer line to `DL-026`
- Modify: `docs/known-constraints.md` — the "Hosting / runtime" section
- Create: `docs/HOSTING.md` — the ongoing deploy runbook
- Modify: `public/README.md` — the "Deploy" section
- Modify: `docs/execution-plan.md` — progress-log entry

**Interfaces:** none (docs only). Uses `<PAGES_URL>` and `<PROJECT_NAME>` from Task 2.

- [ ] **Step 1: `docs/architecture.md`**

**1a.** Line ~25, in the ASCII diagram, change:
```
        auto-deploy to a free static host (GitHub Pages / Cloudflare Pages)
```
to:
```
        push to main → Cloudflare Pages git integration deploys public/
```

**1b.** In the "Technology choices" table (~line 121), change the `Host` and `Domain` rows to:
```
| Host | Cloudflare Pages (git integration, no build command) | Free CDN, free TLS, no ads; same project will host the rides Functions later |
| Domain | `<PROJECT_NAME>.pages.dev` (custom domain deferred — rides spec OQ-4) | Not required |
```

**1c.** Replace the "Deployment" section (~lines 159–164) with:
```markdown
## Deployment
1. GitHub Actions (`.github/workflows/build.yml`, job `build-data`) runs on the
   twice-daily cron and on manual dispatch: `pytest` → fetch calendar →
   rebuild `public/data/*.json` → commit & push to `main` if anything changed.
2. **Cloudflare Pages** is connected to `Rankad/team-schedule` with no build
   command and output directory `public/`. Every push to `main` — the data
   commits above, plus any site or docs change — triggers a Cloudflare deploy
   that uploads `public/`. Live at `https://<PROJECT_NAME>.pages.dev`.
3. `GOOGLE_CALENDAR_API_KEY` is a **GitHub Actions secret** (the build runs on
   GitHub, not Cloudflare). Cloudflare holds no secrets for the static site.
4. GitHub Pages is retired. The old `rankad.github.io/team-schedule/` URL serves
   a client-side redirect (`legacy/`, published once via the manual
   `deploy-legacy-redirect` job). See DL-028.
5. `.github/workflows/keepalive.yml` (monthly no-op commit) still guards the
   cron against GitHub's 60-day inactivity pause.
```

- [ ] **Step 2: `docs/decision-log.md` — append `DL-028`**

At the end of the file add:

```markdown

## DL-028 — Hosting moved to Cloudflare Pages (amends DL-026)
- **Date:** 2026-09-04
- **Context:** The rides feature (`docs/superpowers/specs/2026-09-03-rides-coordination-design.md`)
  needs server-side endpoints, a KV store, and edge rate-limiting. Cloudflare
  Pages Functions provide all three on the free tier, in the same project that
  serves the static site — but only if the site is hosted on Cloudflare Pages.
  DL-026 chose GitHub Pages (deployed by GitHub Actions) when there was no such
  need. Rather than run the site on one platform and the API on another, the
  site moves to Cloudflare Pages now, as a standalone step before any rides code.
- **Decision:**
  - **Host = Cloudflare Pages**, connected to the GitHub repo via git
    integration. **No build command**; build output directory `public/`;
    production branch `main`. Live at `https://<PROJECT_NAME>.pages.dev`
    (custom domain deferred — rides spec OQ-4).
  - **The Python build is unchanged** and still runs on GitHub Actions
    (`build.yml` job `build-data`): `pytest` → fetch → rebuild
    `public/data/*.json` → commit & push to `main`. Cloudflare auto-deploys on
    that push. No second scheduler, no build step on Cloudflare.
  - **`GOOGLE_CALENDAR_API_KEY` stays a GitHub Actions secret.** Cloudflare
    needs no secrets for the static site.
  - **The GitHub Pages `deploy` job is removed** from `build.yml`. The old
    `rankad.github.io/team-schedule/` URL is kept alive with a client-side
    redirect page (`legacy/index.html`, preserves `?teams=` and `#hash`),
    published once via the manual `deploy-legacy-redirect` job. It can stay
    indefinitely — it costs nothing — or be removed after a transition period.
  - **`keepalive.yml` stays** — the cron-inactivity guard is still needed.
  - Cron schedule, data-file shapes, and all site code are untouched.
- **Status:** Accepted. Supersedes the host choice in DL-026 (DL-026 otherwise
  stands: one workflow that builds data on a twice-daily winter-anchored cron,
  plus the keepalive).
- **Risk:** Low. The site uses only relative paths, so it is host-agnostic;
  behaviour was verified byte-for-byte on `*.pages.dev` before GitHub Pages was
  retired. Reversible: re-add the `deploy` job to restore GitHub Pages.
- **Follow-on:** the rides Slice A work adds `functions/`, a KV namespace, and
  Cloudflare environment secrets to this same project.
```

Then find the `DL-026` "**Status:** Accepted." line and change it to:
```markdown
- **Status:** Superseded on the host choice by **DL-028** (site moved to
  Cloudflare Pages 2026-09-04). The rest of DL-026 stands.
```

- [ ] **Step 3: `docs/known-constraints.md` — "Hosting / runtime" section**

Replace the "Hosting / runtime" bullet list (~lines 52–60) with:

```markdown
## Hosting / runtime
- **Host = Cloudflare Pages** (git integration, no build command, output dir
  `public/`), connected to `Rankad/team-schedule`, production branch `main`.
  Live at `https://<PROJECT_NAME>.pages.dev`. Deploys automatically on every
  push to `main`. See DL-028 (amends DL-026).
- **Cloudflare account:** owned by the stakeholder. The Pages project is
  `<PROJECT_NAME>`. Custom domain deferred (rides spec OQ-4) — the `*.pages.dev`
  URL is the canonical link for now.
- **Secrets:** `GOOGLE_CALENDAR_API_KEY` is a **GitHub Actions** secret only.
  The static site needs no Cloudflare secrets. (The rides feature will add
  Cloudflare environment secrets later — not part of hosting.)
- The Python build + commit still runs on GitHub Actions
  (`.github/workflows/build.yml`, job `build-data`), twice daily. GitHub
  disables scheduled workflows after 60 days of repo inactivity — the periodic
  data commits plus `keepalive.yml` keep it alive.
- GitHub Pages is retired; `rankad.github.io/team-schedule/` serves a redirect
  to the Cloudflare URL (`legacy/`, one-off `deploy-legacy-redirect` job).
- No user accounts ⇒ followed-team selection is per-device (`localStorage`) and
  lost if browser storage is cleared.
- The site only knows the calendar window the job fetches (rolling
  ~today−7d … today+28d).
```

- [ ] **Step 4: Create `docs/HOSTING.md`**

```markdown
# Hosting & deploy runbook

## Where the site lives
- **Production:** `https://<PROJECT_NAME>.pages.dev` (Cloudflare Pages).
- **Cloudflare project:** `<PROJECT_NAME>`, in the stakeholder's Cloudflare
  account, under **Workers & Pages**. Connected to `github.com/Rankad/team-schedule`,
  production branch `main`, no build command, output directory `public/`.
- **Old URL:** `https://rankad.github.io/team-schedule/` — redirects to the
  Cloudflare URL. Backed by `legacy/` in this repo + the manual
  `deploy-legacy-redirect` GitHub Actions job.

## How a deploy happens
1. `build.yml` job `build-data` (twice-daily cron / manual) rebuilds
   `public/data/*.json` and pushes to `main` if the schedule changed.
2. Cloudflare Pages sees the push and deploys `public/` (~1 min). Any other
   push to `main` (site edit, docs) also triggers a deploy — harmless.
3. Watch deploys in the Cloudflare dashboard → the project → **Deployments**.

## Manual redeploy
- Cloudflare dashboard → project → **Deployments** → **Retry deployment** on the
  latest, or **Create deployment** from `main`.
- Or push any commit to `main`.

## Roll back
- Cloudflare dashboard → project → **Deployments** → pick a known-good past
  deployment → **Rollback to this deployment**.

## Restore GitHub Pages (if ever needed)
- Re-add the `deploy` job removed in DL-028 (see git history of
  `.github/workflows/build.yml`) and set repo Settings → Pages → Source =
  "GitHub Actions".

## Secrets
- `GOOGLE_CALENDAR_API_KEY` — GitHub repo → Settings → Secrets and variables →
  Actions. **Not** in Cloudflare.
```

- [ ] **Step 5: `public/README.md` — "Deploy" section**

Replace the "## Deploy" section (~lines 42–48) with:

```markdown
## Deploy

Hosted on **Cloudflare Pages** (git integration, no build command, output
directory `public/`). Every push to `main` — the twice-daily data commits from
`.github/workflows/build.yml`, plus any site edit — triggers a Cloudflare deploy
that uploads this folder. Live at `https://<PROJECT_NAME>.pages.dev`. The old
`rankad.github.io/team-schedule/` URL redirects here. See `docs/HOSTING.md` and
DL-028.
```

- [ ] **Step 6: `docs/execution-plan.md` — progress log**

After the last progress-log entry (the DL-027 "earlier days" toggle entry), add:

```markdown
- **2026-09-04 — Hosting migrated to Cloudflare Pages (DL-028).** Prerequisite
  for the rides feature (needs Pages Functions + KV). Site now served by
  Cloudflare Pages git integration (no build command, output `public/`,
  production branch `main`); the GitHub Actions `build-data` job still rebuilds
  `public/data/*.json` twice daily and pushes to `main`, which auto-deploys.
  GitHub Pages `deploy` job removed; `rankad.github.io/team-schedule/` serves a
  client-side redirect (`legacy/`). `GOOGLE_CALENDAR_API_KEY` stays a GitHub
  secret; Cloudflare holds no secrets. Site code untouched (relative paths, host
  -agnostic); behaviour verified on `*.pages.dev` before cut-over. `pytest` and
  `node tests/site_smoke.js` green. Plan:
  `docs/superpowers/plans/2026-09-04-hosting-migration-cloudflare.md`.
```

- [ ] **Step 7: Fill placeholders**

Search the files touched in this task for `<PAGES_URL>` and `<PROJECT_NAME>` and replace every occurrence with the real values from Task 2. In `legacy/index.html` replace `PAGES_URL_HERE`.

```bash
grep -rn "PROJECT_NAME\|PAGES_URL\|PAGES_URL_HERE" docs/ public/README.md legacy/
```
Expected after replacement: no matches.

- [ ] **Step 8: Verify nothing else broke**

```bash
node tests/site_smoke.js
pytest -q
```
Expected: both green (docs-only task, but confirm).

- [ ] **Step 9: Commit**

```bash
git add docs/architecture.md docs/decision-log.md docs/known-constraints.md docs/HOSTING.md docs/execution-plan.md public/README.md legacy/index.html
git commit -m "docs: record the Cloudflare Pages hosting migration (DL-028)"
```

---

### Task 6: Integration — merge and confirm production

**Files:** none (git + verification).

**Interfaces:**
- Consumes: a green branch with Tasks 1–5 committed, Task 2 passed.
- Produces: `main` updated; Cloudflare production deploy confirmed from the merge commit; the legacy redirect live.

- [ ] **Step 1: Final local checks on the branch**

```bash
node tests/site_smoke.js
pytest -q
python -c "import yaml; yaml.safe_load(open('.github/workflows/build.yml')); yaml.safe_load(open('.github/workflows/keepalive.yml')); print('workflows OK')"
git status
```
Expected: smoke green; pytest as on `main`; `workflows OK`; working tree clean.

- [ ] **Step 2: Merge to `main`**

```bash
git checkout main
git pull --ff-only
git merge --no-ff feature/hosting-migration-cloudflare -m "ci+docs: migrate hosting to Cloudflare Pages (DL-028)"
git push origin main
```

- [ ] **Step 3: Confirm the Cloudflare production deploy**

In the Cloudflare dashboard → project → **Deployments**: a new **Production** deployment should appear for the merge commit and reach "Success" within ~2 minutes.
In the browser: reload `<PAGES_URL>`, confirm the site still loads and `data/schedule.json` is 200.

- [ ] **Step 4: Publish the legacy redirect (Task 4 Step 6)**

```bash
gh workflow run "Build schedule data" --ref main
```
In the Actions UI: confirm the `deploy-legacy-redirect` job succeeds.
In the browser: `https://rankad.github.io/team-schedule/` → forwards to `<PAGES_URL>`; `…/team-schedule/?teams=T_001` → forwards with the query preserved.

- [ ] **Step 5: Confirm the data pipeline still deploys**

The manual dispatch in Step 4 also ran `build-data`. If it produced a data commit, confirm Cloudflare shows a follow-up production deployment for it. If it made no commit (no schedule change), that's expected — note it and move on. Either way, the next scheduled cron run is the real proof; check the Cloudflare Deployments list again after the next `0 5,17 * * *` UTC run.

- [ ] **Step 6: Delete the branch**

```bash
git branch -d feature/hosting-migration-cloudflare
git push origin --delete feature/hosting-migration-cloudflare
```

- [ ] **Step 7: Tell the stakeholder**

Report: the new URL, that the old URL redirects, that GitHub Pages is retired, and that the rides Slice A plans can now be written (spec sign-off + backend-builder-profile question still pending — see the plan-scope discussion).

---

## Self-Review

**Spec coverage** (rides spec §11 "Hosting migration (precedes Slice A)"):
1. *"Create a Cloudflare Pages project connected to the repo, build output `public/`, no build command. Serves at `*.pages.dev`"* → Task 1 (runbook) + Task 2 (verify).
2. *"the Python build still runs on GitHub Actions and commits `public/data/*.json`; Cloudflare Pages auto-deploys on push to `main`. The GitHub Pages workflow is retired; the keepalive job stays"* → Task 3 (retire `deploy`, keep `build-data` and `keepalive.yml` untouched), DL-028.
3. *"Verify the live site on `pages.dev` is byte-identical in behaviour; keep the old GitHub Pages URL alive with a redirect notice for one transition period"* → Task 2 (behaviour checks) + Task 4 (redirect, preserves query/hash) + Task 6 Step 4.
4. *"`architecture.md` + DL-026 amendment + `known-constraints.md` (Cloudflare account, env secrets, `pages.dev` URL)"* → Task 5 (all four docs + `HOSTING.md` runbook + `README` + execution-plan log).

**`GOOGLE_CALENDAR_API_KEY` handling** ("Move `GOOGLE_CALENDAR_API_KEY` handling") — clarified as **no move**: it stays a GitHub Actions secret because the build stays on GitHub Actions. Stated in the Global Constraints, Task 3 Step 1 comment, DL-028, `known-constraints.md`, and `HOSTING.md`.

**Placeholder scan:** `<PAGES_URL>`, `<PROJECT_NAME>`, `PAGES_URL_HERE` are deliberate — they are filled from stakeholder-supplied values in Task 5 Step 7, with a `grep` gate confirming none remain. No "TBD"/"handle errors"/"similar to" placeholders; every YAML and HTML block is complete.

**Consistency:** the workflow is named `Build schedule data` in Task 3 and referenced by that exact name in `gh workflow run "Build schedule data"` (Task 4 Step 6, Task 6 Step 4). The job `deploy-legacy-redirect` is defined in Task 4 Step 3 and referenced by that name in Task 4 Step 6 and Task 6 Step 4. `legacy/` is the folder in `legacy/index.html`, `legacy/.nojekyll`, and `upload-pages-artifact path: legacy`.

**No automated test for the migration itself** — there is nothing to unit-test in a hosting cut-over. Verification is the browser + dashboard checks in Tasks 2 and 6 and the YAML-parse check in Tasks 3–6. `pytest` / `site_smoke.js` are run at every commit only to prove the migration did **not** touch anything they cover.

**Ordering risk:** Task 3 (remove GitHub Pages deploy) is gated behind Task 2 (Cloudflare confirmed live). Task 4's one-off job run and Task 6's merge steps are explicitly ordered so the workflow is on `main` before `gh workflow run` is used. The branch is `--no-ff` merged (not fast-forward) so the migration is one revertable commit range.
