from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.cache import AnimeCacheService, anime_to_detail
from app.database import get_session
from app.graph import GraphService
from app.schemas import (
    AnimeDetail,
    AnimeSearchResult,
    CompareRequest,
    CompareResponse,
    GraphRequest,
    GraphResponse,
    NodeDetail,
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


@router.post("/anime/{anime_id}/refresh", response_model=RefreshResponse)
async def refresh_anime(anime_id: int, session: Session = Depends(get_session)) -> RefreshResponse:
    return await cache_service.refresh_anime(session, anime_id, force=True)


@router.get("/anime/{anime_id}", response_model=AnimeDetail)
def get_anime(anime_id: int, session: Session = Depends(get_session)) -> AnimeDetail:
    return anime_to_detail(cache_service.get_cached_anime(session, anime_id))


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
