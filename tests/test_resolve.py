"""Tests for scripts/resolve.py - stable team_id (mvp-spec 4.5 + 5)."""
import json

import pytest

import resolve
from parse_title import parse_title


# The six proven same-team pairs from docs/mvp-spec.md 4.5.
PROVEN_PAIRS = [
    ("ילדים ב שקד- רועי שביט", "ילדים ב שקד-רועי שביט"),
    ("נערים ט לאומית - סהר טיבי", "נערים ט לאומית-סהר טיבי"),
    ("ילדים לאומית -עמית נרדע", "ילדים לאומית-עמית נרדע"),
    ("טרום שקד/ביכורה (ג-ד)- יהלי שגב", "טרום שקד/ביכורה (ג-ד)-יהלי שגב"),
    ("קט סל א מרכז- טל יזרעאלי", "קט סל א מרכז-טל יזרעאלי"),
    ("חוגי דדו א-ב בנים-יובל בר לב", "חוגי דדו א/ב בנים-יובל בר לב"),
]


@pytest.mark.parametrize("a,b", PROVEN_PAIRS)
def test_proven_pairs_share_one_normalized_name(a, b):
    na = resolve.normalize_name(parse_title(a)["team_name"])
    nb = resolve.normalize_name(parse_title(b)["team_name"])
    assert na == nb
    assert na != ""


@pytest.mark.parametrize("a,b", PROVEN_PAIRS)
def test_proven_pairs_collapse_to_one_team_id(a, b):
    reg = {}
    id_a, reg = resolve.resolve_team(parse_title(a), reg, seen_date="2026-09-02")
    id_b, reg = resolve.resolve_team(parse_title(b), reg, seen_date="2026-09-03")
    assert id_a == id_b
    assert len(reg) == 1


# Stakeholder rule (DL-012): two rows are the same team ONLY if their team-name
# *words* are identical. Whitespace / dash / slash / א-ב==א/ב differences do not
# make a new team; a shared coach never merges teams. These four near-duplicate
# pairs from the sample week MUST stay separate.
DISTINCT_PAIRS = [
    ("טרום קט סל גוש חרוד-טל גילת", "טרום גוש חרוד (ג-ד)- טל גילת"),
    ("טרום קט סל מולדת/רמת צבי (ג-ד)-פלא תמיר", "טרום מולדת/רמת צבי (ג-ד)- פלא תמיר"),
    ("טרום קט סל רימון(ג-ד)-יהלי שגב", "טרום קט סל רימון בנים (ג-ד)-יהלי שגב"),
    ("טרום קט סל בנות מזרח-פז תשובה", "טרום בנות קט סל מזרח-פז תשובה"),
]


@pytest.mark.parametrize("a,b", DISTINCT_PAIRS)
def test_near_duplicate_names_stay_separate_teams(a, b):
    na = resolve.normalize_name(parse_title(a)["team_name"])
    nb = resolve.normalize_name(parse_title(b)["team_name"])
    assert na != nb
    reg = {}
    id_a, reg = resolve.resolve_team(parse_title(a), reg, seen_date="2026-09-02")
    id_b, reg = resolve.resolve_team(parse_title(b), reg, seen_date="2026-09-02")
    assert id_a != id_b
    assert len(reg) == 2


def test_shared_coach_alone_never_merges_two_teams():
    reg = {}
    id1, reg = resolve.resolve_team(parse_title("ילדים א מזרח-אור רותם"), reg, seen_date="2026-09-02")
    id2, reg = resolve.resolve_team(parse_title("נערים ט מזרח-אור רותם"), reg, seen_date="2026-09-02")
    assert id1 != id2


def test_mints_zero_padded_sequential_ids():
    reg = {}
    id1, reg = resolve.resolve_team(parse_title("ילדים א מזרח-אור רותם"), reg, seen_date="2026-09-02")
    id2, reg = resolve.resolve_team(parse_title("ילדים ב מזרח-יהלי שגב"), reg, seen_date="2026-09-02")
    assert id1 == "T_001"
    assert id2 == "T_002"


def test_existing_id_is_reused_across_runs():
    reg = {}
    id1, reg = resolve.resolve_team(parse_title("קט סל א מרכז-טל יזרעאלי"), reg, seen_date="2026-09-02")
    # a later run, registry already populated with other teams
    _, reg = resolve.resolve_team(parse_title("נשים לאומית-יונתן אורן"), reg, seen_date="2026-09-09")
    id_again, reg = resolve.resolve_team(parse_title("קט סל א מרכז- טל יזרעאלי"), reg, seen_date="2026-09-16")
    assert id_again == id1


def test_first_seen_and_display_name_are_kept_from_first_encounter():
    reg = {}
    _, reg = resolve.resolve_team(parse_title("ילדים לאומית -עמית נרדע"), reg, seen_date="2026-09-02")
    _, reg = resolve.resolve_team(parse_title("ילדים לאומית-עמית נרדע"), reg, seen_date="2026-09-09")
    entry = next(iter(reg.values()))
    assert entry["display_name"] == "ילדים לאומית"
    assert entry["first_seen"] == "2026-09-02"
    assert entry["category"] == "kids"
    assert entry["tier"] == "לאומית"


def test_registry_round_trips_through_json(tmp_path):
    reg = {}
    _, reg = resolve.resolve_team(parse_title("נערים ט לאומית-סהר טיבי"), reg, seen_date="2026-09-02")
    path = tmp_path / "teams_registry.json"
    resolve.save_registry(path, reg)
    loaded = resolve.load_registry(path)
    assert loaded == reg
    assert json.loads(path.read_text(encoding="utf-8"))["T_001"]["normalized_name"]


def test_load_missing_registry_returns_empty(tmp_path):
    assert resolve.load_registry(tmp_path / "nope.json") == {}


def test_non_team_row_resolves_to_none():
    reg = {}
    tid, reg = resolve.resolve_team(parse_title("אולם בית אלפא תפוס"), reg, seen_date="2026-09-02")
    assert tid is None
    assert reg == {}
