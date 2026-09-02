"""Change detection: last run's snapshot vs the new run (docs/mvp-spec.md 8).

Sessions are matched by the stable calendar event ``id``. We report, per
matched id:

* ``added``            - id new this run
* ``removed``          - id gone this run (also covers events turned
                         ``cancelled``, which are dropped upstream)
* ``time_changed``     - ``start`` / ``end`` differ
* ``location_changed`` - ``location`` differs
* ``team_changed``     - the resolved ``team_id`` differs

Non-team rows (``blocked_hall`` / ``other_sport`` / ``unknown``) are ignored.
Only entries whose ``week_key`` falls inside the served window are kept.
"""
from __future__ import annotations

from datetime import date, timedelta

from build_outputs import NON_TEAM_ACTIVITIES


def _teamish(session: dict) -> bool:
    return session.get("activity_type") not in NON_TEAM_ACTIVITIES


def _index(sessions) -> dict:
    return {s["id"]: s for s in (sessions or []) if _teamish(s)}


def _summary(s: dict) -> dict:
    return {
        "start": s["start"], "end": s["end"],
        "location": s["location"], "team_id": s["team_id"],
    }


def _entry(session: dict, kind: str, old, new) -> dict:
    return {
        "team_id": session["team_id"],
        "week_key": session["week_key"],
        "kind": kind,
        "old": old,
        "new": new,
        "session_id": session["id"],
    }


def _sunday_on_or_before(iso_date: str) -> str:
    d = date.fromisoformat(iso_date)
    return (d - timedelta(days=d.isoweekday() % 7)).isoformat()


def compute_changes(new_sessions, snapshot, window: tuple[str, str]) -> list[dict]:
    """Return the change list. ``snapshot`` is last run's ``build_snapshot``
    output, or ``None`` when there is no prior state (first ever run) - in
    which case there is nothing to diff against and the list is empty.
    """
    if snapshot is None:
        return []

    new_ix = _index(new_sessions)
    old_ix = _index(snapshot.get("events", []))
    changes: list[dict] = []

    for sid, s in new_ix.items():
        o = old_ix.get(sid)
        if o is None:
            changes.append(_entry(s, "added", None, _summary(s)))
            continue
        if (s["start"], s["end"]) != (o["start"], o["end"]):
            changes.append(_entry(
                s, "time_changed",
                {"start": o["start"], "end": o["end"]},
                {"start": s["start"], "end": s["end"]},
            ))
        if s["location"] != o["location"]:
            changes.append(_entry(
                s, "location_changed",
                {"location": o["location"]}, {"location": s["location"]},
            ))
        if s["team_id"] != o["team_id"]:
            changes.append(_entry(
                s, "team_changed",
                {"team_id": o["team_id"]}, {"team_id": s["team_id"]},
            ))

    for sid, o in old_ix.items():
        if sid not in new_ix:
            changes.append(_entry(o, "removed", _summary(o), None))

    lo = _sunday_on_or_before(window[0])
    hi = window[1]
    changes = [c for c in changes if lo <= c["week_key"] <= hi]
    changes.sort(key=lambda c: (c["week_key"], c["session_id"], c["kind"]))
    return changes


def build_changes_file(changes, *, generated_at: str) -> dict:
    return {"generated_at": generated_at, "changes": changes}
