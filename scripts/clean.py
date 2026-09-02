"""Row / event cleaning - docs/mvp-spec.md 2.

Every event or Excel row goes through this first:
1. trim leading/trailing whitespace on every string,
2. collapse internal whitespace runs to a single space,
3. produce a "parse form" where dash variants are normalised to ASCII '-'
   (the original dashes are kept in the display form),
4. clean the ``location`` string (it is the venue name as-is in v0.1).
"""
from __future__ import annotations

import re

# Dash-like characters seen in the source text.
_DASH_CHARS = (
    "־"  # HEBREW PUNCTUATION MAQAF
    "‐"  # HYPHEN
    "‑"  # NON-BREAKING HYPHEN
    "‒"  # FIGURE DASH
    "–"  # EN DASH
    "—"  # EM DASH
    "―"  # HORIZONTAL BAR
    "−"  # MINUS SIGN
)
_DASH_RE = re.compile(f"[{_DASH_CHARS}]")
_WS_RE = re.compile(r"\s+")


def clean_string(value: str | None) -> str:
    """Trim and collapse internal whitespace. ``None`` -> ''."""
    if not value:
        return ""
    return _WS_RE.sub(" ", str(value)).strip()


def normalize_dashes(value: str) -> str:
    """Map every dash-like character to an ASCII hyphen."""
    return _DASH_RE.sub("-", value)


def to_parse_form(value: str | None) -> str:
    """Cleaned + dash-normalised - the string the parser works on."""
    return normalize_dashes(clean_string(value))


def clean_event(raw: dict) -> dict:
    """Return a shallow copy of ``raw`` with cleaned strings.

    Adds ``summary`` (display, cleaned), ``summary_parse`` (dash-normalised)
    and a cleaned ``location``. Does not mutate the input.
    """
    out = dict(raw)
    display = clean_string(raw.get("summary"))
    out["summary"] = display
    out["summary_parse"] = normalize_dashes(display)
    out["location"] = clean_string(raw.get("location"))
    return out
