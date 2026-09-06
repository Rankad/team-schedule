"""Stable ``team_id`` resolution - docs/mvp-spec.md 4.5 + 5.

Team identity is the *normalized team name only* (DL-005, clarified by DL-012):
two rows are the same team ONLY if their team-name *words* are identical.
Whitespace duplication, dash/slash separator variants and the ``א/ב`` == ``א-ב``
age-token spelling do NOT make a new team; a shared coach never merges teams
(a coach can train more than one team). The registry
(``data/teams_registry.json``) maps a zero-padded ``T_NNN`` id to
``{normalized_name, display_name, category, tier, sport, first_seen}`` and is
committed. Teams are never deleted - a team absent from a later window simply
has no sessions that week.
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timezone
from pathlib import Path

from clean import to_parse_form
from parse_title import _CLUB_TOKENS

# Standalone age-range tokens - unify the two spellings (א/ב  ==  א-ב).
_AGE_PAIRS = [("א", "ב"), ("ה", "ו"), ("ג", "ד"), ("א", "ג"), ("א", "ד")]
_AGE_RES = [
    re.compile(rf"(?<![^\W\d_]){a}[-/]{b}(?![^\W\d_])")
    for a, b in _AGE_PAIRS
]
_PUNCT_RE = re.compile(r"[\"'`().,:;!?*]")


def normalize_name(team_name: str | None) -> str:
    """Identity key: whitespace collapsed, dash/slash variants unified,
    ``א/ב`` == ``א-ב``, surrounding punctuation stripped.

    '-' and '/' between name parts are folded to spaces so that dirty separator
    variants of the *same words* collapse (DL-010). Different words still mean
    different teams (DL-012) - e.g. "טרום גוש חרוד" and "טרום קט סל גוש חרוד"
    stay separate.
    """
    if not team_name:
        return ""
    text = to_parse_form(team_name)
    # age tokens first, so "א/ב" and "א-ב" become the same "א ב"
    for rx in _AGE_RES:
        text = rx.sub(lambda m: m.group(0).replace("/", " ").replace("-", " "), text)
    text = _PUNCT_RE.sub("", text)
    text = text.replace("-", " ").replace("/", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text.casefold()


def _is_external_club_fixture(parsed: dict) -> bool:
    """True for a game row whose 'team' side is really an outside club or a
    matchup string: activity is a game, there is no coach, no category and no
    tier, and the name carries a club token (הפועל / מכבי / ת"א). Such a row
    must never mint a followable team (DL-038); if it matches an existing
    registry team by normalized name the game attaches there instead.
    """
    return (
        parsed.get("activity_type") == "game"
        and not parsed.get("coaches")
        and parsed.get("category") is None
        and parsed.get("tier") is None
        and any(tok in (parsed.get("team_name") or "") for tok in _CLUB_TOKENS)
    )


def _next_id(registry: dict) -> str:
    nums = [int(k.split("_", 1)[1]) for k in registry if re.fullmatch(r"T_\d+", k)]
    return f"T_{(max(nums) + 1) if nums else 1:03d}"


def resolve_team(parsed: dict, registry: dict, seen_date: str | None = None):
    """Return ``(team_id, registry)``. Non-team rows resolve to ``None``.

    ``registry`` is updated in place (and also returned for convenience).
    """
    if not parsed.get("is_team") or not parsed.get("team_name"):
        return None, registry

    if seen_date is None:
        seen_date = datetime.now(timezone.utc).date().isoformat()

    norm = normalize_name(parsed["team_name"])
    for team_id, entry in registry.items():
        if entry.get("normalized_name") == norm:
            return team_id, registry

    # An outside-club game fixture that matches no existing team stays a
    # team-less game row (it lands in schedule.json with team_id null, never
    # in teams.json).
    if _is_external_club_fixture(parsed):
        return None, registry

    team_id = _next_id(registry)
    registry[team_id] = {
        "normalized_name": norm,
        "display_name": to_parse_form(parsed["team_name"]).strip(" -"),
        "category": parsed.get("category"),
        "tier": parsed.get("tier"),
        "sport": parsed.get("sport", "basketball"),
        "first_seen": seen_date,
    }
    return team_id, registry


def load_registry(path) -> dict:
    path = Path(path)
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_registry(path, registry: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = {k: registry[k] for k in sorted(registry, key=lambda k: int(k.split("_")[1]))}
    path.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
