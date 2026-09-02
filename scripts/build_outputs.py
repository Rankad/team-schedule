"""Normalized sessions -> the four ``public/data/*.json`` files.

docs/mvp-spec.md 6 (exact file shapes) + 7 steps 2-4 + architecture.md
"Static output files".

The pipeline is deterministic: the same calendar response always yields
byte-identical JSON. Every array is sorted on a stable key and
``canonical_json`` sorts object keys, so tests can pin the output. The only
non-deterministic value (``generated_at``) is injected by the caller.
"""
from __future__ import annotations

import json
from datetime import timedelta
from zoneinfo import ZoneInfo

from classify import classify
from clean import clean_event
from parse_title import parse_title
from resolve import resolve_team

JERUSALEM = ZoneInfo("Asia/Jerusalem")

# Non-team rows still appear in schedule.json (docs/mvp-spec.md 4.1) but never
# in teams.json and are ignored by the diff.
NON_TEAM_ACTIVITIES = frozenset({"blocked_hall", "other_sport", "unknown"})

SESSION_KEYS = (
    "id", "team_id", "week_key", "date", "weekday", "start", "end",
    "location", "coach_text", "activity_type", "sport", "notes", "flags",
)


# --------------------------------------------------------------------------- #
# week bucketing
# --------------------------------------------------------------------------- #
def week_fields(start) -> tuple[str, int, str]:
    """(week_key, weekday, date) for a session start.

    ``week_key`` = ISO date of that week's Sunday (Asia/Jerusalem).
    ``weekday`` = 0 Sunday .. 6 Saturday. ``date`` = local ISO date.
    """
    local = start.astimezone(JERUSALEM)
    weekday = local.isoweekday() % 7  # Mon..Sun 1..7  ->  Sun..Sat 0..6
    sunday = local.date() - timedelta(days=weekday)
    return sunday.isoformat(), weekday, local.date().isoformat()


def _iso(dt) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(JERUSALEM).isoformat()


def _none_if_empty(seq):
    seq = list(seq or [])
    return seq or None


# --------------------------------------------------------------------------- #
# one event -> one normalized session
# --------------------------------------------------------------------------- #
def normalized_session(raw: dict, parsed: dict, team_id: str | None) -> dict:
    week_key, weekday, date_str = week_fields(raw["start"])
    coaches = list(parsed.get("coaches") or [])
    return {
        "id": raw["id"],
        "team_id": team_id,
        "week_key": week_key,
        "date": date_str,
        "weekday": weekday,
        "start": _iso(raw["start"]),
        "end": _iso(raw.get("end")),
        "location": raw.get("location") or None,
        "coach_text": "/".join(coaches) if coaches else None,
        "activity_type": parsed["activity_type"],
        "sport": parsed["sport"],
        "notes": _none_if_empty(parsed.get("notes")),
        "flags": _none_if_empty(parsed.get("flags")),
    }


# --------------------------------------------------------------------------- #
# full Phase 1 pipeline over a list of raw events
# --------------------------------------------------------------------------- #
def run_pipeline(events: list[dict], registry: dict) -> list[dict]:
    """clean -> parse_title -> classify -> resolve for every event.

    ``registry`` is updated in place (find-or-create stable ``team_id``).
    Returns a list of rows ``{"raw", "parsed", "team_id", "session"}`` in a
    stable order (by start time, then raw summary).
    """
    rows: list[dict] = []
    for raw in sorted(events, key=lambda e: (e["start"], e["summary"])):
        cleaned = clean_event(raw)
        parsed = classify(parse_title(cleaned["summary"]))
        raw = dict(raw)
        raw["location"] = cleaned["location"]
        seen_date = raw["start"].astimezone(JERUSALEM).date().isoformat()
        team_id, registry = resolve_team(parsed, registry, seen_date=seen_date)
        rows.append({
            "raw": raw,
            "parsed": parsed,
            "team_id": team_id,
            "session": normalized_session(raw, parsed, team_id),
        })
    return rows


# --------------------------------------------------------------------------- #
# builders for the four output files
# --------------------------------------------------------------------------- #
def _session_sort_key(s: dict):
    return (s["date"], s["start"] or "", s["team_id"] or "", s["id"])


def build_schedule(rows: list[dict], *, generated_at: str) -> dict:
    sessions = sorted((r["session"] for r in rows), key=_session_sort_key)
    weeks = sorted({s["week_key"] for s in sessions})
    return {"generated_at": generated_at, "weeks": weeks, "sessions": sessions}


def build_snapshot(rows: list[dict], *, generated_at: str) -> dict:
    """State kept only for the next run's diff (docs/mvp-spec.md 6)."""
    sessions = sorted((r["session"] for r in rows), key=_session_sort_key)
    return {"generated_at": generated_at, "events": sessions}


def build_teams(rows: list[dict]) -> list[dict]:
    """One row per resolved team that has >= 1 session in the window.

    Coaches are aggregated across every session of that team in the window;
    ``sample_note`` is the first note seen (in stable session order).
    """
    by_team: dict[str, dict] = {}
    for r in sorted(rows, key=lambda r: _session_sort_key(r["session"])):
        team_id = r["team_id"]
        if team_id is None:
            continue
        parsed = r["parsed"]
        entry = by_team.get(team_id)
        if entry is None:
            entry = by_team[team_id] = {
                "team_id": team_id,
                "display_name": parsed["team_name"],
                "category": parsed.get("category"),
                "tier": parsed.get("tier"),
                "sport": parsed.get("sport") or "basketball",
                "_coaches": set(),
                "sample_note": None,
            }
        entry["_coaches"].update(parsed.get("coaches") or [])
        if entry["sample_note"] is None:
            notes = parsed.get("notes") or []
            if notes:
                entry["sample_note"] = notes[0]

    teams: list[dict] = []
    for team_id in sorted(by_team, key=lambda k: int(k.split("_")[1])):
        entry = by_team[team_id]
        coaches = sorted(entry.pop("_coaches"))
        entry["coaches"] = coaches
        teams.append(entry)
    return teams


def build_meta(rows: list[dict], *, generated_at: str, source: str,
               window: tuple[str, str]) -> dict:
    return {
        "generated_at": generated_at,
        "source": source,
        "window": {"from": window[0], "to": window[1]},
        "event_count": len(rows),
    }


# --------------------------------------------------------------------------- #
# serialization
# --------------------------------------------------------------------------- #
def canonical_json(obj) -> str:
    """Deterministic JSON: sorted keys, 2-space indent, trailing newline."""
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_json(path, obj) -> None:
    from pathlib import Path

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(canonical_json(obj), encoding="utf-8")
