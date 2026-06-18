from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.cache import AnimeCacheService, anime_to_detail
from app.database import get_session
from app.graph import GraphService
from app.schemas import (
    AnimeDetail,
    AnimeProfileResponse,
    AnimeSearchResult,
    CompareRequest,
    CompareResponse,
    EntityCompareRequest,
    EntityCompareResponse,
    EntitySearchResult,
    EntitySummary,
    EntityType,
    GraphRequest,
    GraphResponse,
    NodeDetail,
    PopularStaff,
    PopularStaffAnime,
    RefreshResponse,
)


router = APIRouter(prefix="/api")
cache_service = AnimeCacheService()
graph_service = GraphService()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/search/anime", response_model=list[AnimeSearchResult])
async def search_anime(q: str, session: Session = Depends(get_session)) -> list[AnimeSearchResult]:
    return await cache_service.search_anime(session, q)


@router.get("/search/entities", response_model=list[EntitySearchResult])
async def search_entities(
    type: EntityType,
    q: str,
    session: Session = Depends(get_session),
) -> list[EntitySearchResult]:
    return await cache_service.search_entities(session, type, q)


@router.get("/search/all", response_model=list[EntitySearchResult])
async def search_all(q: str, limit: int = 8, session: Session = Depends(get_session)) -> list[EntitySearchResult]:
    bounded_limit = min(10, max(1, limit))
    return await cache_service.search_all(session, q, limit=bounded_limit)


@router.get("/staff/popular", response_model=list[PopularStaff])
async def popular_staff(kind: str = "Director", limit: int = 50, session: Session = Depends(get_session)) -> list[PopularStaff]:
    bounded_limit = min(50, max(1, limit))
    return await cache_service.popular_staff(session, kind=kind, limit=bounded_limit)


@router.get("/staff/{staff_id}/directed-anime", response_model=list[PopularStaffAnime])
async def staff_directed_anime(
    staff_id: int,
    role: str = "Director",
    limit: int = 12,
    session: Session = Depends(get_session),
) -> list[PopularStaffAnime]:
    bounded_limit = min(24, max(1, limit))
    return await cache_service.staff_directed_anime(session, staff_id=staff_id, role=role, limit=bounded_limit)


@router.get("/profile/anime", response_model=AnimeProfileResponse)
async def profile_anime(username: str, session: Session = Depends(get_session)) -> AnimeProfileResponse:
    return await cache_service.profile_anime(session, username)


@router.post("/anime/{anime_id}/refresh", response_model=RefreshResponse)
async def refresh_anime(anime_id: int, session: Session = Depends(get_session)) -> RefreshResponse:
    return await cache_service.refresh_anime(session, anime_id, force=True)


@router.get("/anime/{anime_id}", response_model=AnimeDetail)
def get_anime(anime_id: int, session: Session = Depends(get_session)) -> AnimeDetail:
    return anime_to_detail(cache_service.get_cached_anime(session, anime_id))


@router.post("/entities/compare", response_model=EntityCompareResponse)
async def compare_entities(request: EntityCompareRequest, session: Session = Depends(get_session)) -> EntityCompareResponse:
    return await cache_service.compare_entities(session, request.type, request.leftId, request.rightId)


@router.get("/entities/{entity_type}/{entity_id}", response_model=EntitySummary)
async def entity_summary(entity_type: EntityType, entity_id: int, session: Session = Depends(get_session)) -> EntitySummary:
    return await cache_service.entity_summary(session, entity_type, entity_id)


@router.post("/compare", response_model=CompareResponse)
async def compare_anime(request: CompareRequest, session: Session = Depends(get_session)) -> CompareResponse:
    for anime_id in request.animeIds:
        await cache_service.ensure_anime_loaded(session, anime_id)
    return graph_service.compare(
        session,
        request.animeIds,
        request.roleFilters,
        request.staffMinFavourites,
        request.staffLimit,
    )


@router.post("/graph", response_model=GraphResponse)
async def graph(request: GraphRequest, session: Session = Depends(get_session)) -> GraphResponse:
    for anime_id in request.animeIds:
        await cache_service.ensure_anime_loaded(session, anime_id)
    return graph_service.cytoscape_graph(
        session,
        request.animeIds,
        request.roleFilters,
        request.maxDepth,
        request.staffMinFavourites,
        request.staffLimit,
    )


@router.get("/nodes/{node_type}/{node_id}", response_model=NodeDetail)
def node_detail(node_type: str, node_id: int, session: Session = Depends(get_session)) -> NodeDetail:
    return cache_service.get_node_detail(session, node_type, node_id)
