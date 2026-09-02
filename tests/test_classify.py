"""Tests for scripts/classify.py - sport + activity_type."""
import classify
from parse_title import parse_title


def test_team_training_row():
    r = classify.classify(parse_title("ילדים א מזרח-אור רותם"))
    assert r["sport"] == "basketball"
    assert r["activity_type"] == "training"


def test_practice_game_is_game():
    r = classify.classify(parse_title("נערים לאומית-הפועל ת\"א(משחק אימון)"))
    assert r["activity_type"] == "game"
    assert r["sport"] == "basketball"


def test_opponent_note_alone_implies_game():
    parsed = parse_title("ילדים א מזרח-אור רותם")
    parsed["notes"] = ["יריב: מכבי חיפה"]
    parsed["activity_type"] = "training"
    r = classify.classify(parsed)
    assert r["activity_type"] == "game"


def test_volleyball_row_untouched():
    r = classify.classify(parse_title("חוג כדורעף בדדו"))
    assert r["sport"] == "volleyball"
    assert r["activity_type"] == "other_sport"


def test_blocked_hall_row_untouched():
    r = classify.classify(parse_title("אולם בית אלפא תפוס"))
    assert r["activity_type"] == "blocked_hall"
    assert r["sport"] == "n/a"


def test_classify_does_not_mutate_input():
    parsed = parse_title("ילדים א מזרח-אור רותם")
    parsed["notes"] = ["יריב: x"]
    snapshot = dict(parsed)
    classify.classify(parsed)
    assert parsed == snapshot
