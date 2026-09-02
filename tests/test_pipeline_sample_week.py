"""End-to-end parser/normalisation over the sample week fixture.

This is the Phase 1 "Done when" check: the sample week yields the expected
teams / coaches / sessions, spelling-variant pairs collapse to one team_id,
and non-team rows are typed and excluded from teams.
"""
import calendar_source as cs
from classify import classify
from clean import clean_event
from parse_title import parse_title
from resolve import resolve_team


def _run(calendar_week):
    events = cs.events_from_api_response(calendar_week)
    registry: dict = {}
    team_sessions = []
    non_team = []
    for e in sorted(events, key=lambda x: (x["start"], x["summary"])):
        ce = clean_event(e)
        parsed = classify(parse_title(ce["summary"]))
        seen = e["start"].astimezone(cs.JERUSALEM).date().isoformat()
        team_id, registry = resolve_team(parsed, registry, seen_date=seen)
        row = {"event": e, "parsed": parsed, "team_id": team_id}
        (team_sessions if team_id else non_team).append(row)
    return events, registry, team_sessions, non_team


def test_every_event_is_accounted_for(calendar_week):
    events, _, team_sessions, non_team = _run(calendar_week)
    assert len(events) == 215
    assert len(team_sessions) + len(non_team) == 215


def test_team_and_non_team_split(calendar_week):
    _, registry, team_sessions, non_team = _run(calendar_week)
    assert len(team_sessions) == 200
    assert len(non_team) == 15
    assert len(registry) == 98


def test_non_team_activity_breakdown(calendar_week):
    _, _, _, non_team = _run(calendar_week)
    counts: dict = {}
    for r in non_team:
        key = (r["parsed"]["activity_type"], r["parsed"]["sport"])
        counts[key] = counts.get(key, 0) + 1
    assert counts == {
        ("blocked_hall", "n/a"): 3,
        ("other_sport", "volleyball"): 9,
        ("other_sport", "judo"): 1,
        ("other_sport", "gymnastics"): 1,
        ("unknown", "unknown"): 1,
    }


def test_junk_and_blocked_hall_never_become_teams(calendar_week):
    _, registry, _, _ = _run(calendar_week)
    names = {e["normalized_name"] for e in registry.values()}
    assert not any("תפוס" in n for n in names)
    assert not any("חור בגרב" in n for n in names)
    assert not any("כדורעף" in n for n in names)


def test_spelling_variant_pairs_collapse_end_to_end(calendar_week):
    _, registry, team_sessions, _ = _run(calendar_week)
    by_name = {}
    for r in team_sessions:
        by_name.setdefault(registry[r["team_id"]]["display_name"], set()).add(r["team_id"])
    # "ילדים לאומית" appears as both "-עמית" and " -עמית"; one id, 5 sessions.
    ids = [r["team_id"] for r in team_sessions
           if registry[r["team_id"]]["normalized_name"] == "ילדים לאומית".casefold()]
    assert len(set(ids)) == 1
    assert len(ids) == 5


def test_practice_game_row_is_a_game_with_opponent_note(calendar_week):
    _, registry, team_sessions, _ = _run(calendar_week)
    games = [r for r in team_sessions if r["parsed"]["activity_type"] == "game"]
    assert games, "expected at least one game in the sample week"
    for g in games:
        assert any(n.startswith("יריב:") for n in g["parsed"]["notes"])
        assert g["parsed"]["coaches"] == [] or "הפועל" not in " ".join(g["parsed"]["coaches"])


def test_every_team_session_has_datetimes(calendar_week):
    _, _, team_sessions, _ = _run(calendar_week)
    for r in team_sessions:
        assert r["event"]["start"] is not None
        assert r["event"]["end"] is not None
        assert r["event"]["end"] > r["event"]["start"]
