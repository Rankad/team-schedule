"""GitHub Action entrypoint: calendar -> public/data/*.json.

Pipeline (docs/mvp-spec.md 7, architecture.md "Build job"):

1. Fetch events for the rolling window [today-7d, today+28d] via
   calendar_source (Google Calendar API when GOOGLE_CALENDAR_API_KEY is set,
   else the keyless .ics feed). Drop cancelled. Fail loudly - any fetch or
   schema error raises and nothing is written.
2. Run the Phase 1 pipeline (clean -> parse_title -> classify -> resolve),
   updating data/teams_registry.json.
3. Bucket into weeks; build the normalized session list.
4. Diff vs data/snapshot.json -> changes.json.
5. Write public/data/{meta,teams,schedule,changes}.json, overwrite
   data/snapshot.json, optionally append data/history/<today>.json.
6. Commit - only with --commit / BUILD_COMMIT=1, and only if the tree changed
   (see decision-log DL-015). The workflow passes --commit; local runs and
   pytest never commit.

The only network call is the calendar fetch.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

import calendar_source as cs
from build_outputs import (
    JERUSALEM,
    build_meta,
    build_schedule,
    build_snapshot,
    build_teams,
    run_pipeline,
    write_json,
)
from diff import build_changes_file, compute_changes
from resolve import load_registry, save_registry

WINDOW_BACK_DAYS = 7
WINDOW_FWD_DAYS = 28

BOT_NAME = "github-actions[bot]"
BOT_EMAIL = "github-actions[bot]@users.noreply.github.com"
# GitHub Actions honours [skip actions] and will NOT re-trigger a workflow for
# this commit. Cloudflare Pages' git integration does NOT recognise [skip actions],
# so the push still deploys the new data. Do NOT use "[skip ci]" here — Cloudflare
# DOES skip builds on that string, which would freeze the live site's schedule.
COMMIT_MSG = "chore(data): refresh schedule data [skip actions]"


def _parse_args(argv):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source-json", help="load a saved calendar payload instead "
                   "of calling the network (offline tests / manual runs)")
    p.add_argument("--api-key", default=os.environ.get("GOOGLE_CALENDAR_API_KEY"))
    p.add_argument("--now", help="value for generated_at (RFC3339); default now")
    p.add_argument("--today", help="anchor date for the rolling window "
                   "(YYYY-MM-DD, Asia/Jerusalem); default today")
    p.add_argument("--out-dir", default="public/data")
    p.add_argument("--data-dir", default="data")
    p.add_argument("--repo-root", default=".")
    p.add_argument("--commit", action="store_true",
                   default=os.environ.get("BUILD_COMMIT") == "1")
    p.add_argument("--history", action="store_true",
                   help="also append data/history/<today>.json")
    return p.parse_args(argv)


def _generated_at(now: str | None) -> str:
    if now:
        return now
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z")


def _window(today: str | None):
    if today:
        anchor = datetime.strptime(today, "%Y-%m-%d").date()
    else:
        anchor = datetime.now(JERUSALEM).date()
    time_min = datetime.combine(anchor - timedelta(days=WINDOW_BACK_DAYS),
                                time(0, 0), JERUSALEM)
    time_max = datetime.combine(anchor + timedelta(days=WINDOW_FWD_DAYS),
                                time(0, 0), JERUSALEM)
    return time_min, time_max, (time_min.date().isoformat(),
                                time_max.date().isoformat())


def _fetch(args, time_min, time_max):
    """Return (events, source_label). Raises cs.CalendarError on any problem."""
    if args.source_json:
        payload = json.loads(Path(args.source_json).read_text(encoding="utf-8"))
        events = cs.events_from_api_response(payload)
        return cs.in_window(events, time_min, time_max), "fixture"
    events, source = cs.get_events(time_min, time_max, args.api_key)
    return cs.in_window(events, time_min, time_max), source


def _git(repo_root: Path, *cmd, check=True):
    return subprocess.run(["git", *cmd], cwd=repo_root, check=check,
                          capture_output=True, text=True)


def _commit_if_changed(repo_root: Path) -> bool:
    _git(repo_root, "add", "-A")
    staged = _git(repo_root, "diff", "--cached", "--quiet", check=False)
    if staged.returncode == 0:
        return False
    _git(repo_root, "-c", f"user.name={BOT_NAME}", "-c", f"user.email={BOT_EMAIL}",
         "commit", "-m", COMMIT_MSG)
    return True


def main(argv=None) -> int:
    args = _parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    out_dir = Path(args.out_dir)
    data_dir = Path(args.data_dir)
    generated_at = _generated_at(args.now)

    time_min, time_max, window = _window(args.today)

    # 1. fetch (fail loudly - nothing written before this succeeds)
    events, source = _fetch(args, time_min, time_max)

    # 2-3. pipeline + weeks
    registry_path = data_dir / "teams_registry.json"
    registry = load_registry(registry_path)
    rows = run_pipeline(events, registry)
    sessions = [r["session"] for r in rows]

    # 4. diff vs last snapshot
    snapshot_path = data_dir / "snapshot.json"
    prior = (json.loads(snapshot_path.read_text(encoding="utf-8"))
             if snapshot_path.exists() else None)
    changes = compute_changes(sessions, prior, window)

    # 5. write everything
    meta = build_meta(rows, generated_at=generated_at, source=source,
                      window=window)
    teams = build_teams(rows)
    schedule = build_schedule(rows, generated_at=generated_at)
    changes_file = build_changes_file(changes, generated_at=generated_at)
    snapshot = build_snapshot(rows, generated_at=generated_at)

    write_json(out_dir / "meta.json", meta)
    write_json(out_dir / "teams.json", teams)
    write_json(out_dir / "schedule.json", schedule)
    write_json(out_dir / "changes.json", changes_file)
    write_json(snapshot_path, snapshot)
    save_registry(registry_path, registry)
    if args.history:
        stamp = args.today or datetime.now(JERUSALEM).date().isoformat()
        write_json(data_dir / "history" / f"{stamp}.json", snapshot)

    print(f"built {len(sessions)} sessions from {source}; "
          f"{len(teams)} teams; {len(changes)} change(s); window {window[0]}..{window[1]}")

    # 6. guarded commit
    if args.commit:
        committed = _commit_if_changed(repo_root)
        print("committed" if committed else "no changes to commit")

    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
