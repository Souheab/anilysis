from __future__ import annotations

from dataclasses import dataclass
from math import exp


ROLE_CATEGORY_LABELS = {
    "direction": "Direction",
    "writing": "Writing",
    "design": "Design",
    "music": "Music",
    "animation": "Animation",
    "production": "Production",
    "studio": "Studio",
    "other": "Other",
}


ROLE_KEYWORDS: tuple[tuple[str, str, float], ...] = (
    ("chief director", "direction", 5.0),
    ("director", "direction", 4.8),
    ("original creator", "writing", 4.6),
    ("series composition", "writing", 4.3),
    ("script", "writing", 3.8),
    ("screenplay", "writing", 3.8),
    ("storyboard", "direction", 3.2),
    ("character design", "design", 3.7),
    ("mechanical design", "design", 3.2),
    ("art director", "design", 3.2),
    ("color design", "design", 2.6),
    ("music", "music", 3.5),
    ("composer", "music", 3.5),
    ("sound director", "music", 3.0),
    ("animation director", "animation", 3.2),
    ("key animation", "animation", 2.4),
    ("producer", "production", 2.2),
    ("production", "production", 1.8),
)

SCORE_CURVE_SCALE = 140.0


@dataclass(frozen=True)
class RoleScore:
    category: str
    weight: float


def score_role(role: str) -> RoleScore:
    lowered = role.lower()
    for keyword, category, weight in ROLE_KEYWORDS:
        if keyword in lowered:
            return RoleScore(category=category, weight=weight)
    return RoleScore(category="other", weight=1.0)


def normalize_role_filters(role_filters: list[str] | None) -> set[str]:
    return {role_filter.strip().lower() for role_filter in role_filters or [] if role_filter.strip()}


def role_is_included(category: str, role: str, role_filters: list[str] | None) -> bool:
    normalized = normalize_role_filters(role_filters)
    if not normalized:
        return True
    return category.lower() in normalized or role.lower() in normalized


def popularity_multiplier(favourites: int | None) -> float:
    if not favourites:
        return 1.0
    return 1.0 + min(favourites, 50_000) / 100_000


def studio_weight(is_main: bool) -> float:
    return 4.2 if is_main else 2.8


def path_bonus(path_node_count: int) -> float:
    if path_node_count <= 0:
        return 0.0
    if path_node_count <= 3:
        return 10.0
    return max(0.0, 8.0 - (path_node_count - 3) * 1.5)


def connection_score_from_points(points: float) -> float:
    if points <= 0:
        return 0.0
    return min(100.0, 100.0 * (1.0 - exp(-points / SCORE_CURVE_SCALE)))
