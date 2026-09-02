"""Golden normalized output over calendar_week.json (docs/mvp-spec.md 10).

This is the Phase 4 regression anchor: the Excel fallback importer must
reproduce this exact list, modulo the ``id`` field (calendar event id vs a
synthesised Excel id).
"""
import json
from pathlib import Path

import build_outputs as bo
import calendar_source as cs
from resolve import load_registry

FIXTURES = Path(__file__).resolve().parent / "fixtures"
EXPECTED = FIXTURES / "expected_sessions.json"
REGISTRY = Path(__file__).resolve().parent.parent / "data" / "teams_registry.json"


def _pipeline_sessions(calendar_week):
    events = cs.events_from_api_response(calendar_week)
    registry = load_registry(REGISTRY)
    rows = bo.run_pipeline(events, registry)
    return bo.build_schedule(rows, generated_at="GOLDEN")["sessions"]


def test_pipeline_reproduces_the_golden_sessions_exactly(calendar_week):
    expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
    assert _pipeline_sessions(calendar_week) == expected


def test_golden_file_is_canonically_serialised(calendar_week):
    # the committed file must equal what the build would write, byte for byte
    expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
    assert EXPECTED.read_text(encoding="utf-8") == bo.canonical_json(expected)
