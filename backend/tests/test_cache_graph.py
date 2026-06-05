from datetime import timedelta

import pytest
from sqlmodel import Session
from sqlmodel import select

from app.cache import AnimeCacheService
from app.graph import GraphService
from app.models import Anime, AnimeStaffRole, AnimeStudio, AnimeVoiceActorRole, Staff, Studio, VoiceActor, utc_now
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

    async def fetch_voice_actors(self, anime_id: int):
        return [
            {
                "id": 400,
                "nameFull": "Shared Voice Actor",
                "nameNative": None,
                "imageUrl": None,
                "siteUrl": None,
                "favourites": 3000,
                "characterName": "Hero",
                "characterImageUrl": None,
            }
        ]


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
            voice_cast_fetched_at=now - timedelta(days=1),
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
    assert session.get(VoiceActor, 400).name_full == "Shared Voice Actor"
    assert len(session.exec(select(AnimeStaffRole)).all()) == 1
    assert len(session.exec(select(AnimeStudio)).all()) == 1
    assert len(session.exec(select(AnimeVoiceActorRole)).all()) == 1


def seed_compare_data(session: Session) -> None:
    session.add(Anime(id=1, title_romaji="Source", description="Source description", favourites=500))
    session.add(Anime(id=2, title_romaji="Target"))
    session.add(Anime(id=3, title_romaji="Bridge"))
    session.add(Anime(id=4, title_romaji="Unrelated"))
    session.add(Staff(id=100, name_full="Shared Director", favourites=10_000))
    session.add(Staff(id=101, name_full="Shared Composer", favourites=1_000))
    session.add(Staff(id=102, name_full="Bridge Writer", favourites=100))
    session.add(Studio(id=300, name="Shared Studio"))
    session.add(VoiceActor(id=400, name_full="Shared Voice Actor", favourites=8_000))
    session.add(VoiceActor(id=401, name_full="Bridge Voice Actor", favourites=500))
    for anime_id, staff_id, role in [
        (1, 100, "Director"),
        (2, 100, "Director"),
        (3, 100, "Director"),
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
    session.add(AnimeStudio(anime_id=3, studio_id=300, is_main=True, weight=4.2))
    session.add(AnimeVoiceActorRole(anime_id=1, voice_actor_id=400, character_name="Hero", weight=3.0))
    session.add(AnimeVoiceActorRole(anime_id=2, voice_actor_id=400, character_name="Rival", weight=3.0))
    session.add(AnimeVoiceActorRole(anime_id=3, voice_actor_id=400, character_name="Guide", weight=3.0))
    session.add(AnimeVoiceActorRole(anime_id=1, voice_actor_id=401, character_name="Guide", weight=3.0))
    session.add(AnimeVoiceActorRole(anime_id=3, voice_actor_id=401, character_name="Guide", weight=3.0))
    session.commit()


def test_compare_detects_shared_staff_studios_and_score(session: Session):
    seed_compare_data(session)

    result = GraphService().compare(session, [1, 2], [])

    assert [staff.name for staff in result.sharedStaff][:2] == ["Shared Director", "Shared Composer"]
    assert result.sharedStudios[0].name == "Shared Studio"
    assert result.sharedVoiceActors[0].name == "Shared Voice Actor"
    assert set(result.sharedStaff[0].rolesByAnime) == {1, 2}
    assert set(result.sharedVoiceActors[0].charactersByAnime) == {1, 2}
    assert result.scoreBreakdown.sharedVoiceActors > 0
    assert result.score > 0
    assert result.shortestPath[0].id == "anime:1"
    assert result.shortestPath[-1].id == "anime:2"


def test_compare_detects_connections_shared_by_all_selected_anime(session: Session):
    seed_compare_data(session)

    result = GraphService().compare(session, [1, 2, 3], [])

    assert [staff.name for staff in result.sharedStaff] == ["Shared Director"]
    assert result.sharedStaff[0].rolesByAnime == {1: ["Director"], 2: ["Director"], 3: ["Director"]}
    assert [studio.name for studio in result.sharedStudios] == ["Shared Studio"]
    assert result.sharedStudios[0].isMainByAnime == {1: True, 2: False, 3: True}
    assert [actor.name for actor in result.sharedVoiceActors] == ["Shared Voice Actor"]
    assert result.sharedVoiceActors[0].charactersByAnime == {1: ["Hero"], 2: ["Rival"], 3: ["Guide"]}


def test_role_filters_limit_shared_staff_and_graph(session: Session):
    seed_compare_data(session)

    result = GraphService().compare(session, [1, 2, 3], ["music"])
    graph = GraphService().cytoscape_graph(session, [1, 2, 3], ["music"], max_depth=1)

    assert result.sharedStaff == []
    assert all("Director" not in edge.data.get("roles", []) for edge in graph.edges)


def test_staff_popularity_filters_limit_shared_staff_and_graph(session: Session):
    seed_compare_data(session)

    threshold_result = GraphService().compare(session, [1, 2, 3], [], staff_min_favourites=5_000, staff_limit=None)
    top_one_graph = GraphService().cytoscape_graph(session, [1, 2, 3], [], max_depth=1, staff_min_favourites=0, staff_limit=1)

    assert [staff.name for staff in threshold_result.sharedStaff] == ["Shared Director"]
    assert "staff:100" in {node.data["id"] for node in top_one_graph.nodes}
    assert "staff:101" not in {node.data["id"] for node in top_one_graph.nodes}


def test_cytoscape_graph_includes_voice_actor_nodes_and_edges(session: Session):
    seed_compare_data(session)

    graph = GraphService().cytoscape_graph(session, [1, 2], [], max_depth=1)

    assert "voice_actor:400" in {node.data["id"] for node in graph.nodes}
    assert any(edge.data["type"] == "voice_actor" for edge in graph.edges)


def test_cytoscape_graph_shortens_staff_edges_with_full_roles(session: Session):
    seed_compare_data(session)
    for role in ["Script", "Storyboard", "Key Animation"]:
        role_score = score_role(role)
        session.add(
            AnimeStaffRole(
                anime_id=1,
                staff_id=100,
                role=role,
                role_category=role_score.category,
                weight=role_score.weight,
            )
        )
    session.commit()

    graph = GraphService().cytoscape_graph(session, [1, 2], [], max_depth=1)
    edge = next(edge for edge in graph.edges if edge.data["source"] == "anime:1" and edge.data["target"] == "staff:100")

    assert edge.data["label"] == "Director +3"
    assert set(edge.data["roles"]) == {"Director", "Script", "Storyboard", "Key Animation"}


def test_cytoscape_graph_does_not_shorten_voice_actor_edges(session: Session):
    seed_compare_data(session)
    session.add(AnimeVoiceActorRole(anime_id=1, voice_actor_id=400, character_name="Mentor", weight=3.0))
    session.commit()

    graph = GraphService().cytoscape_graph(session, [1, 2], [], max_depth=1)
    edge = next(edge for edge in graph.edges if edge.data["source"] == "anime:1" and edge.data["target"] == "voice_actor:400")

    assert edge.data["label"] == "Hero, Mentor"
    assert "+1" not in edge.data["label"]
    assert edge.data["roles"] == ["Hero", "Mentor"]


def test_cytoscape_graph_returns_highlighted_path(session: Session):
    seed_compare_data(session)

    graph = GraphService().cytoscape_graph(session, [1, 2, 3], [], max_depth=1)

    assert {node.data["id"] for node in graph.nodes} >= {"anime:1", "anime:2", "anime:3"}
    assert graph.highlightedPath
    assert any(edge.classes == "highlighted" for edge in graph.edges)


def test_cytoscape_graph_only_includes_compared_anime(session: Session):
    seed_compare_data(session)

    graph = GraphService().cytoscape_graph(session, [1, 2, 3], [], max_depth=2)

    anime_node_ids = {node.data["id"] for node in graph.nodes if node.data["type"] == "anime"}
    assert anime_node_ids == {"anime:1", "anime:2", "anime:3"}
    assert all(
        edge.data["source"] in anime_node_ids or edge.data["target"] in anime_node_ids
        for edge in graph.edges
    )


def test_node_detail_enriches_staff_connections(session: Session):
    seed_compare_data(session)

    detail = GraphService().node_detail(session, "staff", 100)

    assert detail.favourites == 10_000
    assert detail.connectionCounts.anime == 3
    assert detail.connectionCounts.roles == 3
    assert detail.topRoles[0].label == "Director"
    assert {connection.id for connection in detail.relatedConnections} == {1, 2, 3}
    assert all(connection.roles == ["Director"] for connection in detail.relatedConnections)


def test_node_detail_enriches_studio_connections(session: Session):
    seed_compare_data(session)

    detail = GraphService().node_detail(session, "studio", 300)

    assert detail.connectionCounts.anime == 3
    assert [role.label for role in detail.topRoles] == ["Main studio", "Studio"]
    assert {connection.id for connection in detail.relatedConnections} == {1, 2, 3}
    assert any(connection.isMain for connection in detail.relatedConnections)


def test_node_detail_enriches_anime_counts_and_about(session: Session):
    seed_compare_data(session)

    detail = GraphService().node_detail(session, "anime", 1)

    assert detail.description == "Source description"
    assert detail.favourites == 500
    assert detail.connectionCounts.staff == 3
    assert detail.connectionCounts.studios == 1
    assert detail.connectionCounts.voiceActors == 2
    assert {role.label for role in detail.topRoles} >= {"Director", "Music", "Script"}


def test_node_detail_enriches_voice_actor_connections(session: Session):
    seed_compare_data(session)

    detail = GraphService().node_detail(session, "voiceActor", 400)

    assert detail.favourites == 8_000
    assert detail.connectionCounts.anime == 3
    assert detail.connectionCounts.roles == 3
    assert {role.label for role in detail.topRoles} == {"Hero", "Rival", "Guide"}
    assert {connection.id for connection in detail.relatedConnections} == {1, 2, 3}
