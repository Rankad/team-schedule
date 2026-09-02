"""Read the club's public Google Calendar.

Primary: Google Calendar API v3 events.list (with our own API key).
Fallback: the keyless public .ics feed.

Both paths return a list of raw event dicts with this shape::

    {
        "id":       str,             # stable event id
        "summary":  str,             # messy "team-coach (notes)" text
        "location": str,             # venue (dirty whitespace)
        "start":    datetime,        # timezone-aware
        "end":      datetime | None, # timezone-aware
        "status":   "confirmed",     # 'cancelled' events are dropped upstream
        "updated":  str | None,      # RFC3339 UTC, for change detection
        "sequence": int | None,
        "all_day":  bool,
    }

The module fails loudly: any HTTP error or unexpected schema raises, so the
build job can never publish partial or garbage data.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Callable, Iterable
from zoneinfo import ZoneInfo

JERUSALEM = ZoneInfo("Asia/Jerusalem")
CALENDAR_ID = "mpkua0beq2409vncahis6t8tuo@group.calendar.google.com"
API_BASE = "https://www.googleapis.com/calendar/v3/calendars/{cal}/events"
ICS_URL = "https://calendar.google.com/calendar/ical/{cal}/public/basic.ics"


class CalendarError(Exception):
    """Base class for calendar-source failures."""


class CalendarFetchError(CalendarError):
    """Network / HTTP transport failure."""


class CalendarSchemaError(CalendarError):
    """The response did not look like what we expect."""


# --------------------------------------------------------------------------- #
# datetime helpers
# --------------------------------------------------------------------------- #
def parse_rfc3339(value: str) -> datetime:
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError as exc:  # pragma: no cover - defensive
        raise CalendarSchemaError(f"unparseable datetime: {value!r}") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=JERUSALEM)
    return dt


def _extract_dt(node: dict | None) -> tuple[datetime | None, bool]:
    """Return (datetime, all_day) from a Calendar API start/end node."""
    if not node:
        return None, False
    if node.get("dateTime"):
        return parse_rfc3339(node["dateTime"]), False
    if node.get("date"):
        d = date.fromisoformat(node["date"])
        return datetime(d.year, d.month, d.day, tzinfo=JERUSALEM), True
    return None, False


# --------------------------------------------------------------------------- #
# API response -> raw events
# --------------------------------------------------------------------------- #
def event_from_api_item(item: dict) -> dict:
    if not isinstance(item, dict):
        raise CalendarSchemaError(f"event is not an object: {item!r}")
    event_id = item.get("id")
    if not event_id:
        raise CalendarSchemaError(f"event has no id: {item!r}")

    start, all_day = _extract_dt(item.get("start"))
    end, _ = _extract_dt(item.get("end"))
    if start is None:
        raise CalendarSchemaError(f"event {event_id} has no usable start: {item!r}")

    sequence = item.get("sequence")
    if sequence is not None:
        try:
            sequence = int(sequence)
        except (TypeError, ValueError) as exc:
            raise CalendarSchemaError(
                f"event {event_id} has non-integer sequence {sequence!r}"
            ) from exc

    return {
        "id": str(event_id),
        "summary": (item.get("summary") or "").strip(),
        "location": (item.get("location") or "").strip(),
        "start": start,
        "end": end,
        "status": item.get("status") or "confirmed",
        "updated": item.get("updated"),
        "sequence": sequence,
        "all_day": all_day,
    }


def events_from_api_response(payload: dict) -> list[dict]:
    """Parse one events.list page (or the fixture) into raw events.

    Drops ``status == 'cancelled'``. Raises CalendarSchemaError on anything
    that is not a recognisable events collection.
    """
    if not isinstance(payload, dict):
        raise CalendarSchemaError("response is not a JSON object")
    if "error" in payload:
        raise CalendarSchemaError(f"API returned an error: {payload['error']!r}")
    items = payload.get("items")
    if not isinstance(items, list):
        raise CalendarSchemaError("response has no 'items' list")

    events: list[dict] = []
    for item in items:
        if (item or {}).get("status") == "cancelled":
            continue
        events.append(event_from_api_item(item))
    return events


# --------------------------------------------------------------------------- #
# API fetch (paginated)
# --------------------------------------------------------------------------- #
Transport = Callable[[str, dict], "tuple[int, dict]"]


def _requests_transport(url: str, params: dict) -> "tuple[int, dict]":
    import requests  # imported lazily so tests need no network stack

    resp = requests.get(url, params=params, timeout=60)
    try:
        body = resp.json()
    except ValueError:
        body = {"error": {"message": resp.text[:500]}}
    return resp.status_code, body


def fetch_events_api(
    calendar_id: str,
    api_key: str,
    time_min: datetime,
    time_max: datetime,
    transport: Transport | None = None,
) -> list[dict]:
    if not api_key:
        raise CalendarFetchError("no API key supplied")
    transport = transport or _requests_transport
    url = API_BASE.format(cal=calendar_id)
    base_params = {
        "key": api_key,
        "singleEvents": "true",
        "orderBy": "startTime",
        "timeMin": _rfc3339(time_min),
        "timeMax": _rfc3339(time_max),
        "maxResults": "2500",
    }

    events: list[dict] = []
    page_token: str | None = None
    seen_tokens: set[str] = set()
    while True:
        params = dict(base_params)
        if page_token:
            params["pageToken"] = page_token
        status, body = transport(url, params)
        if status != 200:
            raise CalendarFetchError(
                f"calendar API HTTP {status}: {str(body)[:300]}"
            )
        events.extend(events_from_api_response(body))
        page_token = body.get("nextPageToken")
        if not page_token:
            break
        if page_token in seen_tokens:
            raise CalendarSchemaError("pagination loop: repeated nextPageToken")
        seen_tokens.add(page_token)
    return events


def _rfc3339(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# --------------------------------------------------------------------------- #
# .ics fallback
# --------------------------------------------------------------------------- #
IcsTransport = Callable[[str], "tuple[int, bytes]"]


def _requests_ics_transport(url: str) -> "tuple[int, bytes]":
    import requests

    resp = requests.get(url, timeout=120)
    return resp.status_code, resp.content


def _ics_dt(prop) -> tuple[datetime | None, bool]:
    if prop is None:
        return None, False
    value = prop.dt
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=JERUSALEM)
        return value, False
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=JERUSALEM), True
    return None, False


def fetch_events_ics(
    calendar_id: str,
    time_min: datetime,
    time_max: datetime,
    transport: IcsTransport | None = None,
) -> list[dict]:
    from icalendar import Calendar

    transport = transport or _requests_ics_transport
    quoted = calendar_id.replace("@", "%40")
    url = ICS_URL.format(cal=quoted)
    status, content = transport(url)
    if status != 200:
        raise CalendarFetchError(f"ics feed HTTP {status}")
    try:
        cal = Calendar.from_ical(content)
    except Exception as exc:  # noqa: BLE001 - surface any parse failure loudly
        raise CalendarSchemaError(f"could not parse .ics feed: {exc}") from exc

    events: list[dict] = []
    for comp in cal.walk("VEVENT"):
        start, all_day = _ics_dt(comp.get("dtstart"))
        end, _ = _ics_dt(comp.get("dtend"))
        if start is None:
            raise CalendarSchemaError(f"ics event without DTSTART: {comp!r}")
        window_end = end or start
        if not (start < time_max and window_end > time_min):
            continue
        status_val = str(comp.get("status", "confirmed")).lower()
        if status_val == "cancelled":
            continue
        seq = comp.get("sequence")
        updated = comp.get("last-modified") or comp.get("dtstamp")
        events.append(
            {
                "id": str(comp.get("uid", "")),
                "summary": str(comp.get("summary", "")).strip(),
                "location": (str(comp.get("location", "")) if comp.get("location") is not None else "").strip(),
                "start": start,
                "end": end,
                "status": "confirmed",
                "updated": _ics_dt(updated)[0].astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                if updated is not None
                else None,
                "sequence": int(seq) if seq is not None else None,
                "all_day": all_day,
            }
        )
    events.sort(key=lambda e: e["start"])
    return events


# --------------------------------------------------------------------------- #
# public entrypoint
# --------------------------------------------------------------------------- #
def get_events(
    time_min: datetime,
    time_max: datetime,
    api_key: str | None,
    calendar_id: str = CALENDAR_ID,
) -> tuple[list[dict], str]:
    """Return (events, source_label). Try the API, fall back to .ics."""
    if api_key:
        try:
            return fetch_events_api(calendar_id, api_key, time_min, time_max), "gcal-api"
        except CalendarError:
            pass
    return fetch_events_ics(calendar_id, time_min, time_max), "gcal-ics"


def in_window(events: Iterable[dict], time_min: datetime, time_max: datetime) -> list[dict]:
    out = []
    for e in events:
        end = e["end"] or e["start"]
        if e["start"] < time_max and end > time_min:
            out.append(e)
    return out
