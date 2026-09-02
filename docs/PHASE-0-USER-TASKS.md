# Phase 0 - Tasks for the stakeholder (non-coder friendly)

These four things need a human with a Google account and a GitHub account. They
cannot be automated by the build team. None of them cost money.

Nothing here is urgent for Phase 1 (the parser) - the parser is tested fully
offline against a saved copy of the schedule. These tasks unlock the *automatic
weekly updates* later.

---

## 1. Create our own free Google Calendar API key

Why: the app reads the club's public Google Calendar. Google lets anyone read a
public calendar for free, but you need a personal "key" to identify yourself.
We must use **our own** key, never the one hidden in the club's website.

Steps:
1. Go to https://console.cloud.google.com/ and sign in.
2. Top bar -> "Select a project" -> "New project". Name it e.g.
   `gilboa-schedule`. Create, then select it.
3. Left menu -> "APIs & Services" -> "Library". Search "Google Calendar API".
   Open it and click **Enable**.
4. Left menu -> "APIs & Services" -> "Credentials" -> "Create credentials" ->
   "API key". Copy the key that appears (a long string of letters/numbers).
5. Recommended: click "Edit API key" -> under "API restrictions" choose
   "Restrict key" -> tick only "Google Calendar API" -> Save.
6. Keep the key somewhere private for step 3 below. Do not paste it into email,
   chat, or any file in the project.

No billing account is required for reading a public calendar.

## 2. Create the GitHub repository and push the code

Why: GitHub stores the code, runs the weekly update job for free, and hosts the
website for free.

Steps:
1. Create an account at https://github.com if you don't have one.
2. Create a new **empty** repository (no README), e.g. `gilboa-schedule`.
   Private or public is fine for now.
3. Give the build team the repository URL, or run these commands in the project
   folder (the team can do this for you):
   ```
   git remote add origin https://github.com/<you>/gilboa-schedule.git
   git push -u origin main
   ```

## 3. Add the API key as a repository secret

Why: the weekly job needs the key from step 1, but the key must never be visible
in the code. GitHub "secrets" are the safe place for it.

Steps:
1. In the GitHub repo: "Settings" -> "Secrets and variables" -> "Actions".
2. "New repository secret".
3. Name: `GOOGLE_CALENDAR_API_KEY` (exactly this).
4. Value: paste the key from step 1. Save.

## 4. Run the update job once, by hand, to confirm it works

Why: proves the key works and shows how many sessions were found.

Steps:
1. In the GitHub repo: "Actions" tab.
2. Choose the "Build schedule data" workflow on the left.
3. Click "Run workflow" -> "Run workflow".
4. When it finishes (green tick), open the run and read the
   "Report fetched event count" step. For a normal week it should say a few
   hundred events (the sample week had 215 for 7 days; the job fetches ~5 weeks,
   so expect roughly 800-1200).

If the job fails, send the build team the red step's log text.

---

### What the build team still owes you before this is useful
- Phase 1: the parser that turns messy calendar titles into clean per-team
  sessions (in progress - reviewed with you at a gate before Phase 2).
- Phase 2: `scripts/fetch_and_build.py`, which is what task 4 above actually
  runs. Until Phase 2 lands, the job runs the tests and then skips the build
  step on purpose.
- Phase 3: the website and turning on the automatic daily schedule.
