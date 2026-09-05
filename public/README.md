# Static site (`public/`)

RTL Hebrew, mobile-first, **no build step**. Three self-contained files:

| File | Role |
|------|------|
| `index.html` | markup + screen skeletons |
| `styles.css` | all styling (system fonts, `rem` units, one accent colour) |
| `app.js` | data loading, search, My Week rendering, week nav, changes banner |

It reads the generated data from `public/data/{meta,teams,schedule,changes}.json`
via relative `fetch('data/…')`, so it must be served from **inside `public/`**.

## Preview locally

```sh
cd public
python -m http.server 8000
```

Then open <http://localhost:8000> . (Opening `index.html` directly with a
`file://` URL will not work — `fetch` needs an HTTP origin.)

## What it does

- **השבוע שלי (My Week):** the weeks the data job published, one screen per week,
  prev/next arrows. Followed teams are stored per device in `localStorage`
  (`gilboa.followed`, `gilboa.seen_generated_at`). Multi-team families get one
  merged list, each row carrying a coloured dot **and** the team name.
  On the **current week**, days that have already passed are collapsed behind a
  "הצג ימים קודמים (N)" toggle (default collapsed). The choice is remembered per
  device (`gilboa.week_collapsed`). Past and future weeks always show all seven
  days.
- **בחירת קבוצה (Add Team):** search by team name or by coach name,
  whitespace-insensitive, partial match. Tap a result to follow it.
- **Changes banner:** appears only when the data was refreshed since the last
  visit *and* there are changes for a followed team.

No accounts, no server, no tracking. If a data file fails to load the page shows
a Hebrew error instead of a blank screen.

## Manager app (`manager.html`)

A separate, password-gated, unlisted page for the rides coordinator (not
linked from `index.html`). See `docs/RIDES.md` for the URL and how the
passphrase is set/rotated.

## Deploy

Hosted on **Cloudflare Pages** (git integration, no build command, output
directory `public/`). Every push to `main` — the thrice-daily data commits from
`.github/workflows/build.yml`, plus any site edit — triggers a Cloudflare deploy
that uploads this folder. Live at `https://gilboa-schedule.pages.dev`. The old
`rankad.github.io/team-schedule/` URL redirects here. See `docs/HOSTING.md` and
DL-028.
