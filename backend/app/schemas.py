from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


NodeType = Literal["anime", "staff", "studio", "voiceActor"]
EntityType = Literal["anime", "staff", "studio", "voiceActor"]
MAX_ANALYSIS_ANIME = 6


class AnimeSearchResult(BaseModel):
    id: int
    titleRomaji: str
    titleEnglish: str | None = None
    titleNative: str | None = None
    coverImageUrl: str | None = None
    year: int | None = None
    format: str | None = None


class AnimeDetail(AnimeSearchResult):
    bannerImageUrl: str | None = None
    episodes: int | None = None
    status: str | None = None
    description: str | None = None
    siteUrl: str | None = None
    averageScore: int | None = None
    popularity: int | None = None
    favourites: int | None = None
    staffFetchedAt: datetime | None = None
    studiosFetchedAt: datetime | None = None
    voiceCastFetchedAt: datetime | None = None
    updatedAt: datetime | None = None


class PopularStaff(BaseModel):
    id: int
    nameFull: str
    nameNative: str | None = None
    imageUrl: str | None = None
    siteUrl: str | None = None
    favourites: int | None = None
    primaryOccupations: list[str] = Field(default_factory=list)


class PopularStaffAnime(AnimeSearchResult):
    popularity: int | None = None
    roles: list[str] = Field(default_factory=list)


class RefreshResponse(BaseModel):
    anime: AnimeDetail
    staffCount: int
    studioCount: int
    voiceActorCount: int


class CompareRequest(BaseModel):
    animeIds: list[int] = Field(min_length=1, max_length=MAX_ANALYSIS_ANIME)
    roleFilters: list[str] = Field(default_factory=list)
    staffMinFavourites: int = Field(default=0, ge=0)
    staffLimit: int | None = Field(default=40, ge=1, le=200)

    @field_validator("animeIds")
    @classmethod
    def anime_ids_must_be_unique(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("animeIds must be unique")
        return value


class GraphRequest(CompareRequest):
    maxDepth: int = 2


class SharedStaff(BaseModel):
    staffId: int
    name: str
    imageUrl: str | None = None
    favourites: int | None = None
    rolesByAnime: dict[int, list[str]]
    roleCategories: list[str]
    weight: float


class SharedStudio(BaseModel):
    studioId: int
    name: str
    isMainByAnime: dict[int, bool]
    weight: float


class SharedVoiceActor(BaseModel):
    voiceActorId: int
    name: str
    imageUrl: str | None = None
    favourites: int | None = None
    charactersByAnime: dict[int, list[str]]
    roleCategories: list[str]
    weight: float


class ScoreBreakdown(BaseModel):
    sharedStaff: float
    sharedStudios: float
    sharedVoiceActors: float
    popularityBonus: float
    pathBonus: float


class PathNode(BaseModel):
    id: str
    type: NodeType
    label: str


class CompareResponse(BaseModel):
    anime: list[AnimeDetail]
    sharedStaff: list[SharedStaff]
    sharedStudios: list[SharedStudio]
    sharedVoiceActors: list[SharedVoiceActor]
    score: float
    scoreBreakdown: ScoreBreakdown
    shortestPath: list[PathNode]


class CytoscapeElement(BaseModel):
    data: dict[str, Any]
    classes: str = ""


class GraphResponse(BaseModel):
    nodes: list[CytoscapeElement]
    edges: list[CytoscapeElement]
    highlightedPath: list[str]


class NodeTopRole(BaseModel):
    label: str
    category: str | None = None
    count: int = 0


class RelatedConnection(AnimeSearchResult):
    roles: list[str] = Field(default_factory=list)
    roleCategories: list[str] = Field(default_factory=list)
    isMain: bool | None = None


class ConnectionCounts(BaseModel):
    anime: int = 0
    staff: int = 0
    studios: int = 0
    voiceActors: int = 0
    roles: int = 0


class NodeDetail(BaseModel):
    id: int
    type: NodeType
    label: str
    imageUrl: str | None = None
    siteUrl: str | None = None
    description: str | None = None
    favourites: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    relatedAnime: list[AnimeSearchResult] = Field(default_factory=list)
    topRoles: list[NodeTopRole] = Field(default_factory=list)
    relatedConnections: list[RelatedConnection] = Field(default_factory=list)
    connectionCounts: ConnectionCounts = Field(default_factory=ConnectionCounts)


class EntitySearchResult(BaseModel):
    id: int
    type: EntityType
    label: str
    subtitle: str | None = None
    imageUrl: str | None = None
    siteUrl: str | None = None


class RelatedAnimeSummary(AnimeSearchResult):
    averageScore: int | None = None
    popularity: int | None = None
    favourites: int | None = None
    roles: list[str] = Field(default_factory=list)
    isMain: bool | None = None


class EntitySummary(BaseModel):
    id: int
    type: EntityType
    label: str
    subtitle: str | None = None
    imageUrl: str | None = None
    siteUrl: str | None = None
    favourites: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    relatedAnime: list[RelatedAnimeSummary] = Field(default_factory=list)


class ComparisonMetricRow(BaseModel):
    key: str
    label: str
    leftValue: str
    rightValue: str
    leftRaw: float | str | None = None
    rightRaw: float | str | None = None
    winner: Literal["left", "right", "tie", "neutral"] = "neutral"
    higherIsBetter: bool | None = True


class EntityCompareRequest(BaseModel):
    type: EntityType
    leftId: int
    rightId: int

    @field_validator("rightId")
    @classmethod
    def ids_must_differ(cls, value: int, info) -> int:
        if info.data.get("leftId") == value:
            raise ValueError("leftId and rightId must be different")
        return value


class EntityCompareResponse(BaseModel):
    type: EntityType
    left: EntitySummary
    right: EntitySummary
    metrics: list[ComparisonMetricRow]
    overlap: list[RelatedAnimeSummary] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class ProfileUserSummary(BaseModel):
    id: int
    name: str
    avatarImageUrl: str | None = None
    bannerImageUrl: str | None = None
    siteUrl: str | None = None


class ProfileListSummary(BaseModel):
    totalEntries: int = 0
    completedCount: int = 0
    watchedEpisodes: int = 0
    meanScore: float | None = None
    statusCounts: dict[str, int] = Field(default_factory=dict)


class ProfileDistributionRow(BaseModel):
    label: str
    count: int
    percentage: float = 0


class ProfileTasteRow(BaseModel):
    label: str
    count: int
    meanScore: float | None = None


class ProfileAnimeEntry(AnimeSearchResult):
    listStatus: str
    score: float | None = None
    progress: int | None = None
    episodes: int | None = None
    averageScore: int | None = None
    popularity: int | None = None
    favourites: int | None = None
    siteUrl: str | None = None
    genres: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    studios: list[str] = Field(default_factory=list)
    updatedAt: int | None = None


class AnimeProfileResponse(BaseModel):
    user: ProfileUserSummary
    summary: ProfileListSummary
    statusDistribution: list[ProfileDistributionRow] = Field(default_factory=list)
    formatDistribution: list[ProfileDistributionRow] = Field(default_factory=list)
    yearDistribution: list[ProfileDistributionRow] = Field(default_factory=list)
    scoreDistribution: list[ProfileDistributionRow] = Field(default_factory=list)
    topGenres: list[ProfileTasteRow] = Field(default_factory=list)
    topTags: list[ProfileTasteRow] = Field(default_factory=list)
    topStudios: list[ProfileTasteRow] = Field(default_factory=list)
    highestRated: list[ProfileAnimeEntry] = Field(default_factory=list)
    lowestRatedCompleted: list[ProfileAnimeEntry] = Field(default_factory=list)
    longestWatched: list[ProfileAnimeEntry] = Field(default_factory=list)
    recentlyUpdated: list[ProfileAnimeEntry] = Field(default_factory=list)
