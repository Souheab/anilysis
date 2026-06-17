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


class ApiFakePopularStaffClient:
    def __init__(self) -> None:
        self.popular_staff_count = 0
        self.directed_anime_count = 0

    async def fetch_popular_staff(self, kind: str = "Director", limit: int = 50):
        self.popular_staff_count += 1
        return [
            {
                "id": 2,
                "nameFull": f"Popular {kind}",
                "nameNative": None,
                "imageUrl": None,
                "siteUrl": "https://anilist.co/staff/2",
                "favourites": 12000,
                "primaryOccupations": [kind],
            }
        ][:limit]

    async def fetch_staff_directed_anime(self, staff_id: int, role: str = "Director", limit: int = 12):
        self.directed_anime_count += 1
        return [
            {
                "id": 99,
                "titleRomaji": "Directed Anime" if role == "Director" else f"{role or 'Staff'} Anime",
                "titleEnglish": None,
                "titleNative": None,
                "coverImageUrl": None,
                "year": 2001,
                "format": "MOVIE",
                "popularity": 1000,
                "roles": [role or "Director"],
            }
        ][:limit]


def test_search_endpoint_returns_normalized_results(client: TestClient, monkeypatch):
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(ApiFakeAniListClient()))

    response = client.get("/api/search/anime", params={"q": "source"})

    assert response.status_code == 200
    assert response.json()[0]["titleRomaji"] == "Source"


def test_popular_staff_endpoint_returns_directors_by_default(client: TestClient, monkeypatch):
    anilist = ApiFakePopularStaffClient()
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(anilist))

    response = client.get("/api/staff/popular")
    cached_response = client.get("/api/staff/popular")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": 2,
            "nameFull": "Popular Director",
            "nameNative": None,
            "imageUrl": None,
            "siteUrl": "https://anilist.co/staff/2",
            "favourites": 12000,
            "primaryOccupations": ["Director"],
        }
    ]
    assert cached_response.status_code == 200
    assert cached_response.json() == response.json()
    assert anilist.popular_staff_count == 1


def test_staff_directed_anime_endpoint_returns_popular_directed_anime(client: TestClient, monkeypatch):
    anilist = ApiFakePopularStaffClient()
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(anilist))

    response = client.get("/api/staff/2/directed-anime")
    cached_response = client.get("/api/staff/2/directed-anime")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": 99,
            "titleRomaji": "Directed Anime",
            "titleEnglish": None,
            "titleNative": None,
            "coverImageUrl": None,
            "year": 2001,
            "format": "MOVIE",
            "popularity": 1000,
            "roles": ["Director"],
        }
    ]
    assert cached_response.status_code == 200
    assert cached_response.json() == response.json()
    assert anilist.directed_anime_count == 1


def test_staff_directed_anime_endpoint_accepts_role(client: TestClient, monkeypatch):
    anilist = ApiFakePopularStaffClient()
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(anilist))

    response = client.get("/api/staff/2/directed-anime", params={"role": "Music"})

    assert response.status_code == 200
    assert response.json()[0]["titleRomaji"] == "Music Anime"
    assert response.json()[0]["roles"] == ["Music"]


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

    too_few = client.post("/api/compare", json={"animeIds": [], "roleFilters": []})
    duplicate = client.post("/api/compare", json={"animeIds": [1, 1], "roleFilters": []})
    too_many = client.post("/api/graph", json={"animeIds": [1, 2, 3, 4, 5, 6, 7], "roleFilters": [], "maxDepth": 1})

    assert too_few.status_code == 422
    assert duplicate.status_code == 422
    assert too_many.status_code == 422


def test_single_anime_compare_and_graph(client: TestClient, monkeypatch):
    monkeypatch.setattr(api, "cache_service", AnimeCacheService(ApiFakeAniListClient()))

    compare = client.post("/api/compare", json={"animeIds": [1], "roleFilters": []})
    graph = client.post("/api/graph", json={"animeIds": [1], "roleFilters": [], "maxDepth": 1})

    assert compare.status_code == 200
    assert compare.json()["anime"][0]["id"] == 1
    assert compare.json()["sharedStaff"] == []
    assert compare.json()["sharedStudios"] == []
    assert compare.json()["sharedVoiceActors"] == []
    assert compare.json()["score"] == 0
    assert compare.json()["shortestPath"] == []
    assert graph.status_code == 200
    assert "anime:1" in {node["data"]["id"] for node in graph.json()["nodes"]}
    assert graph.json()["highlightedPath"] == []


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
