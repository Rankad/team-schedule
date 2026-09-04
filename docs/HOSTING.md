# Hosting & deploy runbook

## Where the site lives
- **Production:** `https://gilboa-schedule.pages.dev` (Cloudflare Pages).
- **Cloudflare project:** `gilboa-schedule`, in the stakeholder's Cloudflare
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
