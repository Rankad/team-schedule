"""Tests for scripts/diff.py - snapshot vs new -> changes (docs/mvp-spec.md 8)."""
import copy

import pytest

import diff


WINDOW = ("2026-08-26", "2026-09-30")


def _session(**kw):
    base = {
        "id": "e1", "team_id": "T_001", "week_key": "2026-09-06",
        "date": "2026-09-08", "weekday": 2,
        "start": "2026-09-08T19:00:00+03:00", "end": "2026-09-08T20:30:00+03:00",
        "location": "ניר דוד", "coach_text": "יהלי שגב",
        "activity_type": "training", "sport": "basketball",
        "notes": None, "flags": None,
    }
    base.update(kw)
    return base


def _snap(sessions):
    return {"generated_at": "x", "events": sessions}


def test_no_snapshot_state_yields_no_changes():
    new = [_session()]
    assert diff.compute_changes(new, None, WINDOW) == []


def test_identical_input_yields_zero_changes():
    new = [_session(id="a"), _session(id="b", team_id="T_002")]
    assert diff.compute_changes(new, _snap(copy.deepcopy(new)), WINDOW) == []


def test_added_session():
    old = [_session(id="a")]
    new = [_session(id="a"), _session(id="b", team_id="T_007")]
    changes = diff.compute_changes(new, _snap(old), WINDOW)
    assert len(changes) == 1
    c = changes[0]
    assert c["kind"] == "added"
    assert c["session_id"] == "b"
    assert c["team_id"] == "T_007"
    assert c["old"] is None
    assert c["new"]["start"] == "2026-09-08T19:00:00+03:00"


def test_removed_session():
    old = [_session(id="a"), _session(id="b")]
    new = [_session(id="a")]
    changes = diff.compute_changes(new, _snap(old), WINDOW)
    assert [c["kind"] for c in changes] == ["removed"]
    assert changes[0]["session_id"] == "b"
    assert changes[0]["new"] is None
    assert changes[0]["old"]["location"] == "ניר דוד"


def test_time_changed():
    old = [_session(id="a")]
    new = [_session(id="a", start="2026-09-08T18:00:00+03:00",
                    end="2026-09-08T19:30:00+03:00")]
    changes = diff.compute_changes(new, _snap(old), WINDOW)
    assert [c["kind"] for c in changes] == ["time_changed"]
    c = changes[0]
    assert c["old"] == {"start": "2026-09-08T19:00:00+03:00",
                        "end": "2026-09-08T20:30:00+03:00"}
    assert c["new"] == {"start": "2026-09-08T18:00:00+03:00",
                        "end": "2026-09-08T19:30:00+03:00"}


def test_location_changed():
    old = [_session(id="a")]
    new = [_session(id="a", location="גן נר")]
    changes = diff.compute_changes(new, _snap(old), WINDOW)
    assert [c["kind"] for c in changes] == ["location_changed"]
    assert changes[0]["old"] == {"location": "ניר דוד"}
    assert changes[0]["new"] == {"location": "גן נר"}


def test_team_changed():
    old = [_session(id="a", team_id="T_001")]
    new = [_session(id="a", team_id="T_009")]
    changes = diff.compute_changes(new, _snap(old), WINDOW)
    assert [c["kind"] for c in changes] == ["team_changed"]
    assert changes[0]["old"] == {"team_id": "T_001"}
    assert changes[0]["new"] == {"team_id": "T_009"}


def test_one_session_can_report_multiple_kinds():
    old = [_session(id="a")]
    new = [_session(id="a", start="2026-09-08T18:00:00+03:00",
                    end="2026-09-08T19:30:00+03:00", location="גן נר")]
    kinds = {c["kind"] for c in diff.compute_changes(new, _snap(old), WINDOW)}
    assert kinds == {"time_changed", "location_changed"}


def test_non_team_rows_are_ignored():
    old = [_session(id="h", team_id=None, activity_type="blocked_hall",
                    location="בית אלפא")]
    new = [_session(id="h", team_id=None, activity_type="blocked_hall",
                    location="ניר דוד")]  # location differs but must be ignored
    assert diff.compute_changes(new, _snap(old), WINDOW) == []


def test_changes_outside_the_served_window_are_dropped():
    old = [_session(id="old1", week_key="2026-06-07", date="2026-06-10")]
    new = []
    assert diff.compute_changes(new, _snap(old), WINDOW) == []


def test_changes_are_sorted_by_week_then_session_then_kind():
    old = [_session(id="a"), _session(id="b", week_key="2026-08-30",
                                      date="2026-09-03")]
    new = [
        _session(id="a", location="x"),
        _session(id="b", week_key="2026-08-30", date="2026-09-03",
                 location="y"),
        _session(id="c", week_key="2026-08-30", date="2026-09-02"),
    ]
    changes = diff.compute_changes(new, _snap(old), WINDOW)
    order = [(c["week_key"], c["session_id"], c["kind"]) for c in changes]
    assert order == sorted(order)
