"""Finalise ``sport`` and ``activity_type`` for a parsed row.

``parse_title`` already assigns these; ``classify`` is the single canonical
place the rest of the pipeline relies on, and it is idempotent. Non-team rows
(``blocked_hall`` / ``other_sport`` / ``unknown``) pass through unchanged.
"""
from __future__ import annotations

_TEAM_ACTIVITIES = {"training", "game"}


def _is_game(parsed: dict) -> bool:
    if parsed.get("activity_type") == "game":
        return True
    for note in parsed.get("notes", []):
        if "משחק אימון" in note or note.strip().startswith("יריב:"):
            return True
    return False


def classify(parsed: dict) -> dict:
    out = dict(parsed)
    out["notes"] = list(parsed.get("notes", []))
    out["coaches"] = list(parsed.get("coaches", []))
    out["flags"] = list(parsed.get("flags", []))

    if not parsed.get("is_team"):
        return out

    out["sport"] = parsed.get("sport") or "basketball"
    out["activity_type"] = "game" if _is_game(parsed) else "training"
    if out["activity_type"] not in _TEAM_ACTIVITIES:  # defensive
        out["activity_type"] = "training"
    return out
