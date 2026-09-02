"""Parse a calendar ``summary`` / Excel ``title`` - docs/mvp-spec.md 4.

    text -> {
        team_name, coaches[], notes[], activity_type, sport,
        category, tier, flags[], is_team
    }

The text is human-entered and dirty: team name + coach(es) + free-text notes
mashed together with inconsistent separators. All rules here are deterministic
(no LLM - DL-002).
"""
from __future__ import annotations

import re

from clean import to_parse_form

# Age-range tokens that must NOT be treated as the team/coach separator (4.3).
# Only protect a standalone token (not preceded/followed by another letter), so
# that e.g. "בית אלפא-בן רצין" is still split on its real hyphen.
_AGE_PAIRS = [("א", "ב"), ("ה", "ו"), ("ג", "ד"), ("א", "ג"), ("א", "ד")]
_AGE_SENTINEL = "\x00"  # stands in for a protected '-' during the split
_AGE_RES = [
    re.compile(rf"(?<![^\W\d_]){a}-{b}(?![^\W\d_])")
    for a, b in _AGE_PAIRS
]

_CLUB_TOKENS = ("הפועל", "מכבי", 'ת"א')

_JUDO_RE = re.compile(r"ג['׳’]?ודו")
_LETTER_RE = re.compile(r"[^\W\d_]", re.UNICODE)
_CLASS_RANGE_RE = re.compile(r"^[א-ת]-[א-ת]$")

# 4.6 category keywords, first match wins - order matters.
_CATEGORY_RULES = [
    ("טרום קט סל", "pre_mini"),
    ("טרום", "pre_mini"),
    ("קט סל א", "mini_a"),
    ("קט סל ב", "mini_b"),
    ("קט סל", "mini"),
    ("ילדים א", "kids_a"),
    ("ילדים ב", "kids_b"),
    ("ילדים", "kids"),
    ("ילדות", "girls_kids"),
    ("נערים ט", "youth_9"),
    ("נערים", "youth"),
    ("נערות", "girls_youth"),
    ("נוער", "juniors"),
    ("נשים", "women"),
    ("ליגה", "league"),
    ("חוגי", "recreational"),
    ("חוג", "recreational"),
]
# Tier tokens. לאומית / ארצית / מחוזית are distinctive substrings; על is the
# premier-league marker and must match only as a standalone Hebrew word, never
# the substring inside e.g. "מעלה גלבוע" (DL-013).
_TIER_TOKENS = ("לאומית", "ארצית", "מחוזית")
_TIER_WORD_RES = [("על", re.compile(r"(?<![^\W\d_])על(?![^\W\d_])"))]


def _is_letter(ch: str) -> bool:
    return bool(_LETTER_RE.match(ch))


def _dedup(seq):
    seen = set()
    out = []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _result(**kw) -> dict:
    base = {
        "team_name": None,
        "coaches": [],
        "notes": [],
        "activity_type": "training",
        "sport": "basketball",
        "category": None,
        "tier": None,
        "flags": [],
        "is_team": True,
    }
    base.update(kw)
    return base


def _non_team(activity_type: str, sport: str, notes, flags=None) -> dict:
    return _result(
        team_name=None,
        activity_type=activity_type,
        sport=sport,
        notes=_dedup(notes),
        flags=list(flags or []),
        is_team=False,
    )


# --------------------------------------------------------------------------- #
# 4.2 notes extraction
# --------------------------------------------------------------------------- #
def _extract_notes(text: str):
    notes: list[str] = []
    is_game = False

    def take_paren(m):
        nonlocal is_game
        inner = m.group(1).strip()
        if not inner:
            return " "
        if "משחק אימון" in inner:
            is_game = True
            notes.append("משחק אימון")
        elif "חדר כושר" in inner:
            notes.append(inner)
        elif "חצי אולם" in inner:
            notes.append("חצי אולם")
        elif _CLASS_RANGE_RE.match(inner):
            notes.append(f"כיתות {inner}")
        else:
            notes.append(inner)
        return " "

    text = re.sub(r"\(([^)]*)\)", take_paren, text)

    # non-parenthesised occurrences
    if "משחק אימון" in text:
        is_game = True
        notes.append("משחק אימון")
        text = text.replace("משחק אימון", " ")
    if "חצי שעה ראשונה חדר כושר" in text:
        notes.append("חצי שעה ראשונה חדר כושר")
        text = text.replace("חצי שעה ראשונה חדר כושר", " ")
    if "חצי אולם" in text:
        notes.append("חצי אולם")
        text = text.replace("חצי אולם", " ")

    text = re.sub(r"\s+", " ", text).strip(" -")
    return text, _dedup(notes), is_game


# --------------------------------------------------------------------------- #
# 4.3 / 4.4 split
# --------------------------------------------------------------------------- #
def _protect_age_tokens(text: str) -> str:
    for rx in _AGE_RES:
        text = rx.sub(lambda m: m.group(0).replace("-", _AGE_SENTINEL), text)
    return text


def _restore(text: str) -> str:
    return text.replace(_AGE_SENTINEL, "-")


def _split_team_coach(text: str):
    protected = _protect_age_tokens(text)
    split_at = None
    for m in re.finditer("-", protected):
        i = m.start()
        left = protected[:i].rstrip()
        right = protected[i + 1:].lstrip()
        if left and right and _is_letter(left[-1]) and _is_letter(right[0]):
            split_at = i
    if split_at is None:
        return _restore(protected).strip(" -"), ""
    team = _restore(protected[:split_at]).strip(" -")
    coach_blob = _restore(protected[split_at + 1:]).strip()
    return team, coach_blob


# --------------------------------------------------------------------------- #
# 4.6 category / tier
# --------------------------------------------------------------------------- #
def detect_category(team_name: str):
    for kw, cat in _CATEGORY_RULES:
        if kw in team_name:
            return cat
    return None


def detect_tier(team_name: str):
    for tok in _TIER_TOKENS:
        if tok in team_name:
            return tok
    for tok, rx in _TIER_WORD_RES:
        if rx.search(team_name):
            return tok
    return None


# --------------------------------------------------------------------------- #
# entrypoint
# --------------------------------------------------------------------------- #
def parse_title(text: str) -> dict:
    text = to_parse_form(text)
    if not text:
        return _non_team("unknown", "unknown", [], ["unrecognized_title"])

    body, notes, is_game = _extract_notes(text)

    # 4.1 non-team rows (checked on the note-stripped body)
    if "אולם" in body and "תפוס" in body:
        return _non_team("blocked_hall", "n/a", notes)
    if "כדורעף" in body:
        return _non_team("other_sport", "volleyball", notes)
    if _JUDO_RE.search(body):
        return _non_team("other_sport", "judo", notes)
    if "התעמלות" in body:
        return _non_team("other_sport", "gymnastics", notes)

    team_name, coach_blob = _split_team_coach(body)

    if not team_name:
        return _non_team("unknown", "unknown", notes, ["unrecognized_title"])

    category = detect_category(team_name)
    tier = detect_tier(team_name)

    # 4.1 junk: no hyphen AND no team keyword
    if not _has_real_hyphen(body) and category is None:
        return _non_team("unknown", "unknown", notes, ["unrecognized_title"])

    flags: list[str] = []
    coaches: list[str] = []
    activity_type = "game" if is_game else "training"

    right_has_club = any(tok in coach_blob for tok in _CLUB_TOKENS)
    if coach_blob and (is_game or right_has_club):
        notes = _dedup(notes + [f"יריב: {coach_blob}"])
        coaches = []
    else:
        coaches = [c.strip() for c in coach_blob.split("/") if c.strip()]

    if any(tok in team_name for tok in _CLUB_TOKENS):
        flags.append("team_name_has_club_token")

    return _result(
        team_name=team_name,
        coaches=coaches,
        notes=_dedup(notes),
        activity_type=activity_type,
        sport="basketball",
        category=category,
        tier=tier,
        flags=flags,
        is_team=True,
    )


def _has_real_hyphen(body: str) -> bool:
    protected = _protect_age_tokens(body)
    return "-" in protected
