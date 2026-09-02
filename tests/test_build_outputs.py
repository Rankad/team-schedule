"""Tests for scripts/build_outputs.py - normalized sessions -> public/data JSON.

Phase 2, docs/mvp-spec.md 6 (file shapes) + 7 (steps 2-4).
"""
import json
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

import build_outputs as bo
import calendar_source as cs
from resolve import load_registry

JLM = ZoneInfo("Asia/Jerusalem")


# --------------------------------------------------------------------------- #
# week_fields
# --------------------------------------------------------------------------- #
def test_week_fields_midweek_bucketed_to_prior_sunday():
    dt = datetime(2026, 9, 2, 12, 0, tzinfo=JLM)  # Wednesday
    assert bo.week_fields(dt) == ("2026-08-30", 3, "2026-09-02")


def test_week_fields_sunday_is_its_own_week_key_weekday_zero():
    dt = datetime(2026, 9, 6, 8, 0, tzinfo=JLM)  # Sunday
    assert bo.week_fields(dt) == ("2026-09-06", 0, "2026-09-06")


def test_week_fields_saturday_is_weekday_six_same_week_as_wednesday():
    dt = datetime(2026, 9, 5, 20, 0, tzinfo=JLM)  # Saturday
    assert bo.week_fields(dt) == ("2026-08-30", 6, "2026-09-05")


def test_week_fields_uses_jerusalem_wall_time_not_utc():
    # 2026-09-06 22:30 UTC == 2026-09-07 01:30 Jerusalem (Monday)
    dt = datetime(2026, 9, 6, 22, 30, tzinfo=ZoneInfo("UTC"))
    assert bo.week_fields(dt) == ("2026-09-06", 1, "2026-09-07")


# --------------------------------------------------------------------------- #
# run_pipeline
# --------------------------------------------------------------------------- #
@pytest.fixture
def rows(calendar_week):
    events = cs.events_from_api_response(calendar_week)
    registry = load_registry("data/teams_registry.json")
    return bo.run_pipeline(events, registry)


def test_run_pipeline_returns_one_row_per_event(rows):
    assert len(rows) == 215


def test_run_pipeline_resolves_team_and_non_team_rows(rows):
    team = [r for r in rows if r["team_id"] is not None]
    non_team = [r for r in rows if r["team_id"] is None]
    assert len(team) == 200
    assert len(non_team) == 15


def test_run_pipeline_does_not_mint_new_teams_for_the_seeded_week(calendar_week):
    events = cs.events_from_api_response(calendar_week)
    registry = load_registry("data/teams_registry.json")
    before = set(registry)
    bo.run_pipeline(events, registry)
    assert set(registry) == before


def test_every_row_has_a_valid_session_shape(rows):
    keys = {"id", "team_id", "week_key", "date", "weekday", "start", "end",
            "location", "coach_text", "activity_type", "sport", "notes", "flags"}
    for r in rows:
        s = r["session"]
        assert set(s) == keys
        assert s["weekday"] in range(7)
        assert s["week_key"] <= s["date"]


# --------------------------------------------------------------------------- #
# build_schedule
# --------------------------------------------------------------------------- #
def test_build_schedule_shape_and_weeks(rows):
    sched = bo.build_schedule(rows, generated_at="2026-09-02T05:00:00Z")
    assert set(sched) == {"generated_at", "weeks", "sessions"}
    assert sched["generated_at"] == "2026-09-02T05:00:00Z"
    assert sched["weeks"] == ["2026-08-30", "2026-09-06"]
    assert len(sched["sessions"]) == 215


def test_build_schedule_includes_non_team_sessions(rows):
    sched = bo.build_schedule(rows, generated_at="x")
    assert any(s["team_id"] is None for s in sched["sessions"])


def test_build_schedule_sessions_sorted_by_date_then_start(rows):
    sched = bo.build_schedule(rows, generated_at="x")
    keys = [(s["date"], s["start"], s["team_id"] or "", s["id"])
            for s in sched["sessions"]]
    assert keys == sorted(keys)


def test_build_schedule_is_deterministic(rows):
    a = bo.canonical_json(bo.build_schedule(rows, generated_at="x"))
    b = bo.canonical_json(bo.build_schedule(rows, generated_at="x"))
    assert a == b


# --------------------------------------------------------------------------- #
# build_teams
# --------------------------------------------------------------------------- #
def test_build_teams_excludes_non_team_rows_and_covers_the_week(rows):
    teams = bo.build_teams(rows)
    assert all(t["team_id"] is not None for t in teams)
    assert len(teams) == 98


def test_build_teams_row_shape(rows):
    teams = bo.build_teams(rows)
    keys = {"team_id", "display_name", "category", "tier", "sport",
            "coaches", "sample_note"}
    for t in teams:
        assert set(t) == keys
        assert isinstance(t["coaches"], list)


def test_build_teams_aggregates_coaches_for_a_known_team(rows):
    teams = {t["team_id"]: t for t in bo.build_teams(rows)}
    assert teams["T_001"]["display_name"] == "חוגי בנות דדו"
    assert "נעה שמעוני" in teams["T_001"]["coaches"]


def test_build_teams_sorted_by_team_id_number(rows):
    teams = bo.build_teams(rows)
    nums = [int(t["team_id"].split("_")[1]) for t in teams]
    assert nums == sorted(nums)


# --------------------------------------------------------------------------- #
# build_meta
# --------------------------------------------------------------------------- #
def test_build_meta_shape(rows):
    meta = bo.build_meta(
        rows, generated_at="2026-09-02T05:00:00Z", source="gcal-api",
        window=("2026-08-26", "2026-09-30"),
    )
    assert meta == {
        "generated_at": "2026-09-02T05:00:00Z",
        "source": "gcal-api",
        "window": {"from": "2026-08-26", "to": "2026-09-30"},
        "event_count": 215,
    }


# --------------------------------------------------------------------------- #
# build_snapshot / canonical_json
# --------------------------------------------------------------------------- #
def test_build_snapshot_holds_every_session(rows):
    snap = bo.build_snapshot(rows, generated_at="x")
    assert set(snap) == {"generated_at", "events"}
    assert len(snap["events"]) == 215


def test_canonical_json_sorts_keys_and_ends_with_newline():
    text = bo.canonical_json({"b": 1, "a": 2})
    assert text == '{\n  "a": 2,\n  "b": 1\n}\n'
