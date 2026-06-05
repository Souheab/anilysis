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

    compare = client.post("/api/compare", json={"animeIds": [1, 2, 3], "roleFilters": []})
    graph = client.post("/api/graph", json={"animeIds": [1, 2, 3], "roleFilters": [], "maxDepth": 1})

    assert compare.status_code == 200
    assert [anime["id"] for anime in compare.json()["anime"]] == [1, 2, 3]
    assert compare.json()["sharedStaff"][0]["name"] == "Shared Director"
    assert set(compare.json()["sharedStaff"][0]["rolesByAnime"]) == {"1", "2", "3"}
    assert compare.json()["sharedVoiceActors"][0]["name"] == "Shared Voice Actor"
    assert set(compare.json()["sharedVoiceActors"][0]["charactersByAnime"]) == {"1", "2", "3"}
    assert compare.json()["score"] > 0
    assert graph.status_code == 200
    assert graph.json()["nodes"]
    assert any(node["data"]["type"] == "voiceActor" for node in graph.json()["nodes"])
    assert graph.json()["highlightedPath"]


def test_compare_and_graph_validate_anime_ids(client: TestClient, monkeypatch):
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(ApiFakeAniListClient()))

    too_few = client.post("/api/compare", json={"animeIds": [1], "roleFilters": []})
    duplicate = client.post("/api/compare", json={"animeIds": [1, 1], "roleFilters": []})
    too_many = client.post("/api/graph", json={"animeIds": [1, 2, 3, 4, 5, 6, 7], "roleFilters": [], "maxDepth": 1})

    assert too_few.status_code == 422
    assert duplicate.status_code == 422
    assert too_many.status_code == 422


def test_node_detail_endpoint(client: TestClient, monkeypatch):
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(ApiFakeAniListClient()))
    client.post("/api/compare", json={"animeIds": [1, 2], "roleFilters": []})

    response = client.get("/api/nodes/staff/100")

    assert response.status_code == 200
    assert response.json()["label"] == "Shared Director"
    assert response.json()["relatedAnime"]


def test_voice_actor_node_detail_endpoint(client: TestClient, monkeypatch):
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(ApiFakeAniListClient()))
    client.post("/api/compare", json={"animeIds": [1, 2], "roleFilters": []})

    response = client.get("/api/nodes/voiceActor/400")

    assert response.status_code == 200
    assert response.json()["label"] == "Shared Voice Actor"
    assert response.json()["relatedConnections"]
