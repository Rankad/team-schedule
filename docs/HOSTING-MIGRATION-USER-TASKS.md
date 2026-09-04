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
