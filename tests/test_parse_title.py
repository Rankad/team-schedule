"""Tests for scripts/parse_title.py - docs/mvp-spec.md 4 (every sub-case)."""
import parse_title
from parse_title import parse_title as pt


# --------------------------------------------------------------------------- #
# 4.1 non-team rows
# --------------------------------------------------------------------------- #
def test_blocked_hall():
    r = pt("אולם בית אלפא תפוס")
    assert r["activity_type"] == "blocked_hall"
    assert r["sport"] == "n/a"
    assert r["is_team"] is False
    assert r["team_name"] is None


def test_volleyball_is_other_sport():
    r = pt("חוג כדורעף בדדו")
    assert r["activity_type"] == "other_sport"
    assert r["sport"] == "volleyball"
    assert r["is_team"] is False


def test_volleyball_with_note():
    r = pt("כדורעף(חצי אולם)")
    assert r["sport"] == "volleyball"
    assert "חצי אולם" in r["notes"]


def test_judo_apostrophe_variant():
    assert pt("ג'ודו בדדו")["sport"] == "judo"


def test_judo_geresh_variant():
    assert pt("ג׳ודו בדדו")["sport"] == "judo"


def test_gymnastics():
    r = pt("התעמלות אומנתית(חצי אולם)")
    assert r["sport"] == "gymnastics"
    assert r["activity_type"] == "other_sport"
    assert "חצי אולם" in r["notes"]


def test_junk_row_is_unknown_and_flagged():
    r = pt("חור בגרב")
    assert r["activity_type"] == "unknown"
    assert r["sport"] == "unknown"
    assert "unrecognized_title" in r["flags"]
    assert r["is_team"] is False


# --------------------------------------------------------------------------- #
# 4.2 notes extraction
# --------------------------------------------------------------------------- #
def test_half_hall_note_removed_from_team_name():
    r = pt("קט סל א בנות מערב-עופר כספי(חצי אולם)")
    assert r["team_name"] == "קט סל א בנות מערב"
    assert r["coaches"] == ["עופר כספי"]
    assert "חצי אולם" in r["notes"]


def test_gym_first_half_hour_note():
    r = pt("נוער על-יואב שנקמן/ניר גוב (חצי שעה ראשונה חדר כושר)")
    assert "חצי שעה ראשונה חדר כושר" in r["notes"]
    assert r["coaches"] == ["יואב שנקמן", "ניר גוב"]
    assert r["team_name"] == "נוער על"


def test_practice_game_note_sets_activity_type_game():
    r = pt("נוער על-הפועל ת\"א (משחק אימון)")
    assert r["activity_type"] == "game"
    assert "משחק אימון" in r["notes"]


def test_pre_mini_class_range_becomes_note():
    r = pt("טרום שקד/ביכורה (ג-ד)-יהלי שגב")
    assert "כיתות ג-ד" in r["notes"]
    assert r["team_name"] == "טרום שקד/ביכורה"
    assert r["coaches"] == ["יהלי שגב"]


# --------------------------------------------------------------------------- #
# 4.3 age-range tokens are not the split point
# --------------------------------------------------------------------------- #
def test_age_token_alef_bet_not_split():
    r = pt("חוגי דדו א-ב בנים-יובל בר לב")
    assert r["team_name"] == "חוגי דדו א-ב בנים"
    assert r["coaches"] == ["יובל בר לב"]


def test_age_token_slash_not_split():
    r = pt("חוגי טירת צבי בנים א/ב-איתן פרג")
    assert r["team_name"] == "חוגי טירת צבי בנים א/ב"
    assert r["coaches"] == ["איתן פרג"]


def test_age_token_he_vav_not_split():
    r = pt("חוגי בנות נעורה ה-ו- וורוד זועבי")
    assert r["team_name"] == "חוגי בנות נעורה ה-ו"
    assert r["coaches"] == ["וורוד זועבי"]


def test_real_hyphen_after_letter_that_ends_in_age_letter_still_splits():
    # "בית אלפא-בן רצין": the substring "א-ב" here is NOT a standalone age token.
    r = pt("חוגי בנים א/ב חפציבה/בית אלפא-בן רצין")
    assert r["team_name"] == "חוגי בנים א/ב חפציבה/בית אלפא"
    assert r["coaches"] == ["בן רצין"]


def test_age_token_alef_gimel_not_split():
    r = pt("חוגי בנים א-ג כפר יחזקאל/גדעונה/גבע- עדן אוריה")
    assert r["team_name"] == "חוגי בנים א-ג כפר יחזקאל/גדעונה/גבע"
    assert r["coaches"] == ["עדן אוריה"]


# --------------------------------------------------------------------------- #
# 4.4 team / coach split
# --------------------------------------------------------------------------- #
def test_split_on_last_letter_bordered_hyphen():
    r = pt("נערים ט לאומית - סהר טיבי")
    assert r["team_name"] == "נערים ט לאומית"
    assert r["coaches"] == ["סהר טיבי"]


def test_leading_space_hyphen_coach():
    r = pt("ילדים לאומית -עמית נרדע")
    assert r["team_name"] == "ילדים לאומית"
    assert r["coaches"] == ["עמית נרדע"]


def test_multi_coach_split_on_slash():
    r = pt("נוער על-יואב שנקמן/ניר גוב/טל גילת")
    assert r["coaches"] == ["יואב שנקמן", "ניר גוב", "טל גילת"]


def test_opponent_not_coach_via_game():
    r = pt("נוער על-הפועל ת\"א (משחק אימון)")
    assert r["coaches"] == []
    assert any(n.startswith("יריב:") for n in r["notes"])
    assert "הפועל ת\"א" in " ".join(r["notes"])
    assert r["team_name"] == "נוער על"


def test_opponent_not_coach_via_club_token_without_paren_space():
    r = pt("נערים לאומית-הפועל ת\"א(משחק אימון)")
    assert r["coaches"] == []
    assert r["activity_type"] == "game"
    assert r["team_name"] == "נערים לאומית"


def test_no_hyphen_team_has_no_coach():
    r = pt("חוגי בנות ביה\"ס דקלים")
    assert r["is_team"] is True
    assert r["coaches"] == []


def test_club_token_on_left_is_still_team_name():
    r = pt("הפועל העמק-שרון אברהמי/גולן יבלונבסקי")
    assert r["team_name"] == "הפועל העמק"
    assert r["coaches"] == ["שרון אברהמי", "גולן יבלונבסקי"]


# --------------------------------------------------------------------------- #
# 4.6 category / tier
# --------------------------------------------------------------------------- #
import pytest


@pytest.mark.parametrize(
    "title,category",
    [
        ("טרום קט סל דדו (ג-ד)-יובל בר לב", "pre_mini"),
        ("קט סל א מרכז-טל יזרעאלי", "mini_a"),
        ("קט סל ב מרכז-יוגב פרטי", "mini_b"),
        ("קט סל א בנות מזרח-נעה שמעוני", "mini_a"),
        ("ילדים א מזרח-אור רותם", "kids_a"),
        ("ילדים ב מזרח-יהלי שגב", "kids_b"),
        ("ילדים לאומית-עמית נרדע", "kids"),
        ("נערים ט לאומית-סהר טיבי", "youth_9"),
        ("נערים ארצית-ירון רוטנברג", "youth"),
        ("נערות א על-ברק וינריב", "girls_youth"),
        ("ילדות א בוגרות-נעה שמעוני", "girls_kids"),
        ("נוער לאומית-טל יזרעאלי", "juniors"),
        ("נשים לאומית-יונתן אורן", "women"),
        ("ליגה ב עמק המעיינות-מאיר שפירא", "league"),
        ("חוגי בנות דדו-נעה שמעוני", "recreational"),
        ("חוג דקלים א-ב בנים- איתן פרג", "recreational"),
    ],
)
def test_category_detection(title, category):
    assert pt(title)["category"] == category


@pytest.mark.parametrize(
    "title,tier",
    [
        ("נערים ט לאומית-סהר טיבי", "לאומית"),
        ("נוער ארצית-עמית נרדע", "ארצית"),
        ("נערים מחוזית-גילי בן זאב", "מחוזית"),
        ("קט סל א מרכז-טל יזרעאלי", None),
    ],
)
def test_tier_detection(title, tier):
    assert pt(title)["tier"] == tier


def test_team_row_defaults_basketball_training():
    r = pt("ילדים א מזרח-אור רותם")
    assert r["sport"] == "basketball"
    assert r["activity_type"] == "training"
    assert r["is_team"] is True
