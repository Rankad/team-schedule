# Rides — ARCHIVE (backend removed, DL-046)

> **STATUS 2026-11-11: the rides feature is gone.** Front end removed by DL-042,
> **backend removed by DL-046** (`functions/` deleted, purge step removed from
> `build.yml`). The site makes zero `/api/*` calls and stores no personal data in
> the repo. This file is now (1) the stakeholder's manual cleanup checklist and
> (2) a short historical record. **Do not follow any operational step in the
> "Historical" section — the things it describes no longer exist in the repo.**

## 1. Stakeholder manual cleanup (the repo change does not do this)

Do these **in order**. Menu labels in the dashboards may differ slightly from the
wording below.

1. **Merge the PR first.** If the GitHub secrets are deleted before the merge,
   the daily data run goes red, because the old purge step (still on `main`)
   expects them.
2. **Cloudflare dashboard** → Workers & Pages → project `gilboa-schedule`:
   - Remove the KV binding `RIDES_KV` — **Production AND Preview** — under
     Settings → Bindings / Functions.
   - Delete the variables/secrets `MANAGER_PASSPHRASE`, `SITE_ORIGIN`,
     `PURGE_KEY`.
   - Then Storage & Databases → KV → delete the namespace `RIDES_KV`.
     **This permanently erases every stored ride row (players' names). That is
     intended.**
3. **GitHub** → repo Settings → Secrets and variables → Actions: delete
   `PURGE_KEY` and `RIDES_API`. **Keep `GOOGLE_CALENDAR_API_KEY`** — the data
   build needs it.

Mark this done in `docs/decision-log.md` (DL-046 status) once finished. After
step 2, no personal data is stored anywhere.

## 2. What the repo looks like now
- No `functions/`, no `/api/*` routes. After Cloudflare redeploys, `/api/*` falls
  through to the SPA fallback (HTML, HTTP 200). A stale open tab that calls the
  old API just gets HTML.
- `build.yml`: no purge step. The CI job `functions-tests` keeps its old name (so
  any required-status-check setting still matches) but runs only the site smoke
  test. The path filters still list `"functions/**"` (harmless).
- `clearLegacyRidesKeys()` in `public/app.js` stays, to clean old devices.
- No Cloudflare edge rate-limit rule was ever set up (DL-032), so there is none
  to remove.

## 3. Historical (do not follow)

What the backend was, kept only so old docs and commits make sense:
- Cloudflare Pages Functions under `/api/*` (`token`, `me`, `request`, `ping`,
  `purge`, `manager/*`) plus one KV namespace `RIDES_KV` in the same Pages
  project as the static site.
- 3 Cloudflare env secrets (`MANAGER_PASSPHRASE`, `SITE_ORIGIN`, `PURGE_KEY`) and
  2 GitHub secrets (`PURGE_KEY`, `RIDES_API`).
- A "Purge past rides weeks" step at the end of `build-data` that called
  `POST /api/purge` 3×/day to delete ride rows older than the current week
  (DL-043 made it fail loudly).
- 47 Functions unit tests and the Functions part of the `functions-tests` job.

Where to find the real detail: git history (PRs #2, #5, #6; commits before
`cdb3356`), `docs/rides-spec.md` (history only), and DL-029 to DL-043 in
`docs/decision-log.md`. The privacy/legal items (OQ-2 contact placeholder, PPL /
Amendment 13 opinion) are permanently moot unless the feature is ever rebuilt.
