"""Tests for scripts/fetch_and_build.py - the Action entrypoint (offline).

Never touches the live Google API: every test feeds a saved calendar payload
via --source-json (the calendar_week.json fixture).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

import calendar_source as cs
import fetch_and_build as fab

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "tests" / "fixtures" / "calendar_week.json"
REGISTRY = ROOT / "data" / "teams_registry.json"
NOW = "2026-09-02T05:00:00Z"
TODAY = "2026-09-02"


@pytest.fixture
def workspace(tmp_path):
    data_dir = tmp_path / "data"
    out_dir = tmp_path / "public" / "data"
    data_dir.mkdir(parents=True)
    shutil.copy(REGISTRY, data_dir / "teams_registry.json")
    return tmp_path, data_dir, out_dir


def _run(workspace, **over):
    tmp_path, data_dir, out_dir = workspace
    args = [
        "--source-json", str(FIXTURE),
        "--now", NOW, "--today", TODAY,
        "--out-dir", str(out_dir), "--data-dir", str(data_dir),
        "--repo-root", str(tmp_path),
    ]
    for k, v in over.items():
        args += [f"--{k}"] if v is True else [f"--{k}", str(v)]
    return fab.main(args)


def _load(out_dir, name):
    return json.loads((out_dir / name).read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- #
# a single run
# --------------------------------------------------------------------------- #
def test_run_writes_the_four_output_files(workspace):
    _, _, out_dir = workspace
    assert _run(workspace) == 0
    for name in ("meta.json", "teams.json", "schedule.json", "changes.json"):
        assert (out_dir / name).exists()


def test_meta_matches_spec_shape(workspace):
    _, _, out_dir = workspace
    _run(workspace)
    meta = _load(out_dir, "meta.json")
    assert meta["generated_at"] == NOW
    assert meta["event_count"] == 215
    assert meta["window"] == {"from": "2026-08-26", "to": "2026-09-30"}
    assert set(meta) == {"generated_at", "source", "window", "event_count"}


def test_schedule_has_two_weeks_and_215_sessions(workspace):
    _, _, out_dir = workspace
    _run(workspace)
    sched = _load(out_dir, "schedule.json")
    assert sched["weeks"] == ["2026-08-30", "2026-09-06"]
    assert len(sched["sessions"]) == 215


def test_first_run_changes_are_empty_no_prior_snapshot(workspace):
    _, _, out_dir = workspace
    _run(workspace)
    assert _load(out_dir, "changes.json")["changes"] == []


def test_first_run_writes_snapshot_and_updates_registry(workspace):
    _, data_dir, _ = workspace
    _run(workspace)
    assert (data_dir / "snapshot.json").exists()
    assert (data_dir / "teams_registry.json").exists()


def test_history_file_written_only_with_flag(workspace):
    _, data_dir, _ = workspace
    _run(workspace)
    assert not (data_dir / "history").exists()
    _run(workspace, history=True)
    assert (data_dir / "history" / f"{TODAY}.json").exists()


# --------------------------------------------------------------------------- #
# idempotency
# --------------------------------------------------------------------------- #
def test_rerun_same_input_is_byte_identical_and_has_no_changes(workspace):
    _, _, out_dir = workspace
    _run(workspace)
    first = {p.name: p.read_bytes() for p in out_dir.iterdir()}
    _run(workspace)
    second = {p.name: p.read_bytes() for p in out_dir.iterdir()}
    assert first == second
    assert _load(out_dir, "changes.json")["changes"] == []


# --------------------------------------------------------------------------- #
# diff over a modified payload
# --------------------------------------------------------------------------- #
def test_modified_payload_produces_correct_changes(workspace, tmp_path):
    _, _, out_dir = workspace
    _run(workspace)  # establishes the snapshot

    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    items = payload["items"]
    # time change on the first item
    items[0]["start"]["dateTime"] = "2026-09-02T13:00:00+03:00"
    items[0]["end"]["dateTime"] = "2026-09-02T14:00:00+03:00"
    # location change on the second
    items[1]["location"] = "אולם חדש כלשהו"
    # remove the third
    removed_id = items[2]["id"]
    del items[2]
    # add a brand-new event
    items.append({
        "id": "brand-new-event@google.com", "status": "confirmed",
        "summary": "נערים א מזרח-אבי כהן", "location": "ניר דוד",
        "start": {"dateTime": "2026-09-07T18:00:00+03:00"},
        "end": {"dateTime": "2026-09-07T19:30:00+03:00"},
        "sequence": 0, "updated": "2026-09-02T00:00:00Z",
    })
    modified = tmp_path / "modified.json"
    modified.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    _run(workspace, **{"source-json": str(modified)})
    changes = _load(out_dir, "changes.json")["changes"]
    kinds = {}
    for c in changes:
        kinds.setdefault(c["kind"], []).append(c)

    assert any(c["session_id"] == removed_id for c in kinds.get("removed", []))
    assert any(c["session_id"] == "brand-new-event@google.com"
               for c in kinds.get("added", []))
    assert "time_changed" in kinds
    assert "location_changed" in kinds


def test_team_changed_is_detected(workspace, tmp_path):
    _, _, out_dir = workspace
    _run(workspace)

    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    # retag one event's summary so it resolves to a different team
    target = next(i for i in payload["items"]
                  if i["summary"].startswith("חוגי בנות דדו"))
    target["summary"] = "נערים ט לאומית-סהר טיבי"
    modified = tmp_path / "retag.json"
    modified.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    _run(workspace, **{"source-json": str(modified)})
    changes = _load(out_dir, "changes.json")["changes"]
    assert any(c["kind"] == "team_changed" for c in changes)


# --------------------------------------------------------------------------- #
# registry stability
# --------------------------------------------------------------------------- #
def test_registry_ids_are_reused_and_never_dropped(workspace, tmp_path):
    _, data_dir, _ = workspace
    _run(workspace)
    reg1 = json.loads((data_dir / "teams_registry.json").read_text("utf-8"))

    # a later window that only contains one team - the rest must survive
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    payload["items"] = payload["items"][:1]
    modified = tmp_path / "one.json"
    modified.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    _run(workspace, **{"source-json": str(modified)})
    reg2 = json.loads((data_dir / "teams_registry.json").read_text("utf-8"))

    assert set(reg1) <= set(reg2)
    for tid, entry in reg1.items():
        assert reg2[tid] == entry


# --------------------------------------------------------------------------- #
# fail loudly
# --------------------------------------------------------------------------- #
def test_bad_payload_raises_and_writes_nothing(workspace, tmp_path):
    _, _, out_dir = workspace
    bad = tmp_path / "bad.json"
    bad.write_text('{"kind": "calendar#events"}', encoding="utf-8")
    with pytest.raises(cs.CalendarError):
        _run(workspace, **{"source-json": str(bad)})
    assert not out_dir.exists() or not any(out_dir.iterdir())


# --------------------------------------------------------------------------- #
# guarded commit
# --------------------------------------------------------------------------- #
def test_commit_is_off_by_default(workspace):
    tmp_path, _, _ = workspace
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "add", "-A"], cwd=tmp_path, check=True)
    _run(workspace)
    log = subprocess.run(["git", "log", "--oneline"], cwd=tmp_path,
                         capture_output=True, text=True)
    assert log.stdout.strip() == ""


def test_commit_flag_commits_once_then_is_idempotent(workspace):
    tmp_path, _, _ = workspace
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.email", "t@t"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=tmp_path, check=True)

    _run(workspace, commit=True)
    n1 = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=tmp_path,
                        capture_output=True, text=True).stdout.strip()
    _run(workspace, commit=True)
    n2 = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=tmp_path,
                        capture_output=True, text=True).stdout.strip()
    assert n1 == "1"
    assert n2 == "1"  # nothing changed -> no second commit
