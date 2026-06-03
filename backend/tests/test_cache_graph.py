from datetime import timedelta

import pytest
from sqlmodel import Session
from sqlmodel import select

from app.cache import AnimeCacheService
from app.graph import GraphService
from app.models import Anime, AnimeStaffRole, AnimeStudio, Staff, Studio, utc_now
from app.scoring import score_role


class FakeAniListClient:
    def __init__(self) -> None:
        self.fetch_count = 0

    async def search_anime(self, query: str):
        return [
            {
                "id": 10,
                "titleRomaji": "Search Result",
                "titleEnglish": None,
                "titleNative": None,
                "coverImageUrl": None,
                "bannerImageUrl": None,
                "year": 2024,
                "format": "TV",
                "episodes": None,
                "status": None,
                "description": None,
                "siteUrl": None,
                "averageScore": None,
                "popularity": None,
                "favourites": None,
            }
        ]

    async def fetch_anime(self, anime_id: int):
        self.fetch_count += 1
        return {
            "id": anime_id,
            "titleRomaji": f"Anime {anime_id}",
            "titleEnglish": None,
            "titleNative": None,
            "coverImageUrl": None,
            "bannerImageUrl": None,
            "year": 2020,
            "format": "TV",
            "episodes": 12,
            "status": "FINISHED",
            "description": None,
            "siteUrl": None,
            "averageScore": 80,
            "popularity": 1000,
            "favourites": 100,
        }

    async def fetch_staff(self, anime_id: int):
        return [
            {
                "id": 100,
                "nameFull": "Shared Director",
                "nameNative": None,
                "imageUrl": None,
                "siteUrl": None,
                "favourites": 2000,
                "role": "Director",
            }
        ]

    async def fetch_studios(self, anime_id: int):
        return [{"id": 300, "name": "Shared Studio", "siteUrl": None, "favourites": None, "isMain": True}]


@pytest.mark.asyncio
async def test_cache_skips_fresh_anime(session: Session):
    client = FakeAniListClient()
    service = AnimeCacheService(client)
    now = utc_now()
    session.add(
        Anime(
            id=1,
            title_romaji="Fresh",
            staff_fetched_at=now - timedelta(days=1),
            studios_fetched_at=now - timedelta(days=1),
        )
    )
    session.commit()

    anime = await service.ensure_anime_loaded(session, 1)

    assert anime.title_romaji == "Fresh"
    assert client.fetch_count == 0


@pytest.mark.asyncio
async def test_cache_refreshes_and_stores_relationships(session: Session):
    service = AnimeCacheService(FakeAniListClient())

    await service.ensure_anime_loaded(session, 1, force=True)

    assert session.get(Anime, 1).title_romaji == "Anime 1"
    assert session.get(Staff, 100).name_full == "Shared Director"
    assert session.get(Studio, 300).name == "Shared Studio"
    assert len(session.exec(select(AnimeStaffRole)).all()) == 1
    assert len(session.exec(select(AnimeStudio)).all()) == 1


def seed_compare_data(session: Session) -> None:
    session.add(Anime(id=1, title_romaji="Source", description="Source description", favourites=500))
    session.add(Anime(id=2, title_romaji="Target"))
    session.add(Anime(id=3, title_romaji="Bridge"))
    session.add(Staff(id=100, name_full="Shared Director", favourites=10_000))
    session.add(Staff(id=101, name_full="Shared Composer", favourites=1_000))
    session.add(Staff(id=102, name_full="Bridge Writer", favourites=100))
    session.add(Studio(id=300, name="Shared Studio"))
    for anime_id, staff_id, role in [
        (1, 100, "Director"),
        (2, 100, "Director"),
        (1, 101, "Music"),
        (2, 101, "Music"),
        (1, 102, "Script"),
        (3, 102, "Script"),
    ]:
        role_score = score_role(role)
        session.add(
            AnimeStaffRole(
                anime_id=anime_id,
                staff_id=staff_id,
                role=role,
                role_category=role_score.category,
                weight=role_score.weight,
            )
        )
    session.add(AnimeStudio(anime_id=1, studio_id=300, is_main=True, weight=4.2))
    session.add(AnimeStudio(anime_id=2, studio_id=300, is_main=False, weight=2.8))
    session.commit()


def test_compare_detects_shared_staff_studios_and_score(session: Session):
    seed_compare_data(session)

    result = GraphService().compare(session, 1, 2, [])

    assert [staff.name for staff in result.sharedStaff][:2] == ["Shared Director", "Shared Composer"]
    assert result.sharedStudios[0].name == "Shared Studio"
    assert result.score > 0
    assert result.shortestPath[0].id == "anime:1"
    assert result.shortestPath[-1].id == "anime:2"


def test_role_filters_limit_shared_staff_and_graph(session: Session):
    seed_compare_data(session)

    result = GraphService().compare(session, 1, 2, ["music"])
    graph = GraphService().cytoscape_graph(session, 1, 2, ["music"], max_depth=1)

    assert [staff.name for staff in result.sharedStaff] == ["Shared Composer"]
    assert all("Director" not in edge.data.get("roles", []) for edge in graph.edges)


def test_staff_popularity_filters_limit_shared_staff_and_graph(session: Session):
    seed_compare_data(session)

    threshold_result = GraphService().compare(session, 1, 2, [], staff_min_favourites=5_000, staff_limit=None)
    top_one_graph = GraphService().cytoscape_graph(session, 1, 2, [], max_depth=1, staff_min_favourites=0, staff_limit=1)

    assert [staff.name for staff in threshold_result.sharedStaff] == ["Shared Director"]
    assert "staff:100" in {node.data["id"] for node in top_one_graph.nodes}
    assert "staff:101" not in {node.data["id"] for node in top_one_graph.nodes}


def test_cytoscape_graph_returns_highlighted_path(session: Session):
    seed_compare_data(session)

    graph = GraphService().cytoscape_graph(session, 1, 2, [], max_depth=1)

    assert {node.data["id"] for node in graph.nodes} >= {"anime:1", "anime:2"}
    assert graph.highlightedPath
    assert any(edge.classes == "highlighted" for edge in graph.edges)


def test_node_detail_enriches_staff_connections(session: Session):
    seed_compare_data(session)

    detail = GraphService().node_detail(session, "staff", 100)

    assert detail.favourites == 10_000
    assert detail.connectionCounts.anime == 2
    assert detail.connectionCounts.roles == 2
    assert detail.topRoles[0].label == "Director"
    assert {connection.id for connection in detail.relatedConnections} == {1, 2}
    assert all(connection.roles == ["Director"] for connection in detail.relatedConnections)


def test_node_detail_enriches_studio_connections(session: Session):
    seed_compare_data(session)

    detail = GraphService().node_detail(session, "studio", 300)

    assert detail.connectionCounts.anime == 2
    assert [role.label for role in detail.topRoles] == ["Main studio", "Studio"]
    assert {connection.id for connection in detail.relatedConnections} == {1, 2}
    assert any(connection.isMain for connection in detail.relatedConnections)


def test_node_detail_enriches_anime_counts_and_about(session: Session):
    seed_compare_data(session)

    detail = GraphService().node_detail(session, "anime", 1)

    assert detail.description == "Source description"
    assert detail.favourites == 500
    assert detail.connectionCounts.staff == 3
    assert detail.connectionCounts.studios == 1
    assert {role.label for role in detail.topRoles} >= {"Director", "Music", "Script"}
