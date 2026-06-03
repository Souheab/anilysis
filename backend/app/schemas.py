from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


NodeType = Literal["anime", "staff", "studio"]


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
    updatedAt: datetime | None = None


class RefreshResponse(BaseModel):
    anime: AnimeDetail
    staffCount: int
    studioCount: int


class CompareRequest(BaseModel):
    sourceAnimeId: int
    targetAnimeId: int
    roleFilters: list[str] = Field(default_factory=list)


class GraphRequest(CompareRequest):
    maxDepth: int = 2


class SharedStaff(BaseModel):
    staffId: int
    name: str
    imageUrl: str | None = None
    favourites: int | None = None
    sourceRoles: list[str]
    targetRoles: list[str]
    roleCategories: list[str]
    weight: float


class SharedStudio(BaseModel):
    studioId: int
    name: str
    sourceIsMain: bool
    targetIsMain: bool
    weight: float


class ScoreBreakdown(BaseModel):
    sharedStaff: float
    sharedStudios: float
    popularityBonus: float
    pathBonus: float


class PathNode(BaseModel):
    id: str
    type: NodeType
    label: str


class CompareResponse(BaseModel):
    sourceAnime: AnimeDetail
    targetAnime: AnimeDetail
    sharedStaff: list[SharedStaff]
    sharedStudios: list[SharedStudio]
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
