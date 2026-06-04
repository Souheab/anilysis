from fastapi.testclient import TestClient

from app import api
from app.cache import AnimeCacheService


class ApiFakeAniListClient:
    async def search_anime(self, query: str):
        return [
            {
                "id": 1,
                "titleRomaji": "Source",
                "titleEnglish": None,
                "titleNative": None,
                "coverImageUrl": None,
                "bannerImageUrl": None,
                "year": 2020,
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
        return {
            "id": anime_id,
            "titleRomaji": "Source" if anime_id == 1 else "Target",
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
            "averageScore": None,
            "popularity": None,
            "favourites": None,
        }

    async def fetch_staff(self, anime_id: int):
        return [
            {
                "id": 100,
                "nameFull": "Shared Director",
                "nameNative": None,
                "imageUrl": None,
                "siteUrl": None,
                "favourites": 1000,
                "role": "Director",
            }
        ]

    async def fetch_studios(self, anime_id: int):
        return [{"id": 300, "name": "Shared Studio", "siteUrl": None, "favourites": None, "isMain": anime_id == 1}]

    async def fetch_voice_actors(self, anime_id: int):
        return [
            {
                "id": 400,
                "nameFull": "Shared Voice Actor",
                "nameNative": None,
                "imageUrl": None,
                "siteUrl": None,
                "favourites": 2000,
                "characterName": "Hero" if anime_id == 1 else "Rival",
                "characterImageUrl": None,
            }
        ]


def test_search_endpoint_returns_normalized_results(client: TestClient, monkeypatch):
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(ApiFakeAniListClient()))

    response = client.get("/api/search/anime", params={"q": "source"})

    assert response.status_code == 200
    assert response.json()[0]["titleRomaji"] == "Source"


def test_compare_and_graph_endpoints_refresh_missing_cache(client: TestClient, monkeypatch):
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(ApiFakeAniListClient()))

    compare = client.post("/api/compare", json={"sourceAnimeId": 1, "targetAnimeId": 2, "roleFilters": []})
    graph = client.post("/api/graph", json={"sourceAnimeId": 1, "targetAnimeId": 2, "roleFilters": [], "maxDepth": 1})

    assert compare.status_code == 200
    assert compare.json()["sharedStaff"][0]["name"] == "Shared Director"
    assert compare.json()["sharedVoiceActors"][0]["name"] == "Shared Voice Actor"
    assert compare.json()["score"] > 0
    assert graph.status_code == 200
    assert graph.json()["nodes"]
    assert any(node["data"]["type"] == "voiceActor" for node in graph.json()["nodes"])
    assert graph.json()["highlightedPath"]


def test_node_detail_endpoint(client: TestClient, monkeypatch):
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(ApiFakeAniListClient()))
    client.post("/api/compare", json={"sourceAnimeId": 1, "targetAnimeId": 2, "roleFilters": []})

    response = client.get("/api/nodes/staff/100")

    assert response.status_code == 200
    assert response.json()["label"] == "Shared Director"
    assert response.json()["relatedAnime"]


def test_voice_actor_node_detail_endpoint(client: TestClient, monkeypatch):
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(ApiFakeAniListClient()))
    client.post("/api/compare", json={"sourceAnimeId": 1, "targetAnimeId": 2, "roleFilters": []})

    response = client.get("/api/nodes/voiceActor/400")

    assert response.status_code == 200
    assert response.json()["label"] == "Shared Voice Actor"
    assert response.json()["relatedConnections"]
