"""Tests for scripts/clean.py - row cleaning per docs/mvp-spec.md 2."""
import clean


def test_trims_and_collapses_whitespace():
    assert clean.clean_string("  ילדים   ב   שקד  ") == "ילדים ב שקד"


def test_clean_string_handles_tabs_and_newlines():
    assert clean.clean_string("a\t b\n c") == "a b c"


def test_normalize_dashes_maps_all_variants_to_ascii_hyphen():
    # maqaf, en-dash, em-dash, non-breaking hyphen, ascii
    assert clean.normalize_dashes("א־ב – — ‑ -") == "א-ב - - - -"


def test_parse_form_is_cleaned_and_dash_normalized():
    assert clean.to_parse_form("  נערים ט לאומית – סהר טיבי ") == "נערים ט לאומית - סהר טיבי"


def test_clean_event_keeps_display_and_parse_forms():
    raw = {
        "id": "x",
        "summary": "  ילדים לאומית –עמית נרדע ",
        "location": "  ניר   דוד ",
        "start": None,
        "end": None,
    }
    out = clean.clean_event(raw)
    assert out["summary"] == "ילדים לאומית –עמית נרדע"
    assert out["summary_parse"] == "ילדים לאומית -עמית נרדע"
    assert out["location"] == "ניר דוד"
    assert out["id"] == "x"


def test_clean_event_does_not_mutate_input():
    raw = {"id": "x", "summary": " a ", "location": " b "}
    clean.clean_event(raw)
    assert raw["summary"] == " a "
