"""Tests for scripts/calendar_source.py - offline only, no live network."""
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

import calendar_source as cs

JLM = ZoneInfo("Asia/Jerusalem")


def test_events_from_api_response_parses_the_sample_week(calendar_week):
    events = cs.events_from_api_response(calendar_week)
    assert len(events) == 215


def test_parsed_event_has_clean_typed_fields(calendar_week):
    events = cs.events_from_api_response(calendar_week)
    ev = next(e for e in events if e["summary"].startswith("חוגי בנות דדו"))
    assert ev["id"]
    assert isinstance(ev["start"], datetime)
    assert ev["start"].tzinfo is not None
    assert isinstance(ev["end"], datetime)
    assert ev["end"] > ev["start"]
    assert ev["status"] == "confirmed"


def test_start_is_jerusalem_wall_time(calendar_week):
    events = cs.events_from_api_response(calendar_week)
    ev = next(e for e in events if e["summary"].startswith("חוגי בנות דדו"))
    local = ev["start"].astimezone(JLM)
    assert (local.hour, local.minute) == (14, 30)


def test_cancelled_events_are_skipped():
    payload = {
        "items": [
            {"id": "a", "status": "confirmed", "summary": "x",
             "start": {"dateTime": "2026-09-02T14:30:00+03:00"},
             "end": {"dateTime": "2026-09-02T15:30:00+03:00"}},
            {"id": "b", "status": "cancelled", "summary": "y",
             "start": {"dateTime": "2026-09-02T14:30:00+03:00"},
             "end": {"dateTime": "2026-09-02T15:30:00+03:00"}},
        ]
    }
    events = cs.events_from_api_response(payload)
    assert [e["id"] for e in events] == ["a"]


def test_missing_items_key_raises_schema_error():
    with pytest.raises(cs.CalendarSchemaError):
        cs.events_from_api_response({"kind": "calendar#events"})


def test_api_error_payload_raises():
    with pytest.raises(cs.CalendarSchemaError):
        cs.events_from_api_response({"error": {"code": 403, "message": "no"}})


def test_event_without_start_raises_schema_error():
    payload = {"items": [{"id": "a", "summary": "x", "status": "confirmed"}]}
    with pytest.raises(cs.CalendarSchemaError):
        cs.events_from_api_response(payload)


def test_fetch_events_follows_pagination_and_reports_http_errors():
    pages = [
        {"items": [{"id": "1", "status": "confirmed", "summary": "a",
                    "start": {"dateTime": "2026-09-02T14:00:00+03:00"},
                    "end": {"dateTime": "2026-09-02T15:00:00+03:00"}}],
         "nextPageToken": "p2"},
        {"items": [{"id": "2", "status": "confirmed", "summary": "b",
                    "start": {"dateTime": "2026-09-02T16:00:00+03:00"},
                    "end": {"dateTime": "2026-09-02T17:00:00+03:00"}}]},
    ]
    calls = []

    def transport(url, params):
        calls.append(params.get("pageToken"))
        return 200, pages[len(calls) - 1]

    events = cs.fetch_events_api(
        calendar_id="cal", api_key="k",
        time_min=datetime(2026, 9, 1, tzinfo=timezone.utc),
        time_max=datetime(2026, 10, 1, tzinfo=timezone.utc),
        transport=transport,
    )
    assert [e["id"] for e in events] == ["1", "2"]
    assert calls == [None, "p2"]


def test_fetch_events_api_raises_on_non_200():
    def transport(url, params):
        return 403, {"error": {"message": "forbidden"}}

    with pytest.raises(cs.CalendarFetchError):
        cs.fetch_events_api(
            calendar_id="cal", api_key="k",
            time_min=datetime(2026, 9, 1, tzinfo=timezone.utc),
            time_max=datetime(2026, 10, 1, tzinfo=timezone.utc),
            transport=transport,
        )


def test_ics_fallback_parses_and_filters_window(tmp_path):
    ics = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:in@x\r\n"
        "SUMMARY:in window\r\n"
        "LOCATION:hall\r\n"
        "DTSTART:20260902T110000Z\r\n"
        "DTEND:20260902T120000Z\r\n"
        "SEQUENCE:2\r\n"
        "STATUS:CONFIRMED\r\n"
        "END:VEVENT\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:out@x\r\n"
        "SUMMARY:out of window\r\n"
        "DTSTART:20250101T110000Z\r\n"
        "DTEND:20250101T120000Z\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )

    def transport(url):
        return 200, ics.encode("utf-8")

    events = cs.fetch_events_ics(
        calendar_id="cal",
        time_min=datetime(2026, 9, 1, tzinfo=timezone.utc),
        time_max=datetime(2026, 10, 1, tzinfo=timezone.utc),
        transport=transport,
    )
    assert [e["id"] for e in events] == ["in@x"]
    assert events[0]["sequence"] == 2
