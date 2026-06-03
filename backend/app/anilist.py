from __future__ import annotations

import asyncio
from typing import Any

import httpx


ANILIST_ENDPOINT = "https://graphql.anilist.co"


class AniListError(RuntimeError):
    pass


SEARCH_ANIME_QUERY = """
query SearchAnime($search: String!, $page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME) {
      id
      title { romaji english native }
      coverImage { large medium }
      startDate { year }
      format
    }
  }
}
"""


ANIME_METADATA_QUERY = """
query AnimeMetadata($id: Int!) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    coverImage { large medium }
    bannerImage
    startDate { year }
    format
    episodes
    status
    description(asHtml: false)
    siteUrl
    averageScore
    popularity
    favourites
  }
}
"""


ANIME_STAFF_QUERY = """
query AnimeStaff($id: Int!, $page: Int!, $perPage: Int!) {
  Media(id: $id, type: ANIME) {
    staff(page: $page, perPage: $perPage, sort: RELEVANCE) {
      pageInfo { hasNextPage currentPage lastPage }
      edges {
        role
        node {
          id
          name { full native }
          image { large medium }
          siteUrl
          favourites
        }
      }
    }
  }
}
"""


ANIME_STUDIOS_QUERY = """
query AnimeStudios($id: Int!) {
  Media(id: $id, type: ANIME) {
    studios {
      edges {
        isMain
        node {
          id
          name
          siteUrl
        }
      }
    }
  }
}
"""


class AniListClient:
    def __init__(self, endpoint: str = ANILIST_ENDPOINT, timeout: float = 30.0) -> None:
        self.endpoint = endpoint
        self.timeout = timeout

    async def _graphql(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(self.endpoint, json={"query": query, "variables": variables})
                if response.status_code == 429 or 500 <= response.status_code < 600:
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
                payload = response.json()
                if payload.get("errors"):
                    raise AniListError(str(payload["errors"]))
                response.raise_for_status()
                return payload["data"]
            except (httpx.HTTPError, AniListError) as exc:
                last_error = exc
                await asyncio.sleep(0.3 * (attempt + 1))
        raise AniListError(f"AniList request failed: {last_error}") from last_error

    async def search_anime(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        data = await self._graphql(SEARCH_ANIME_QUERY, {"search": query, "page": 1, "perPage": limit})
        return [self._normalize_anime(media) for media in data["Page"]["media"]]

    async def fetch_anime(self, anime_id: int) -> dict[str, Any]:
        data = await self._graphql(ANIME_METADATA_QUERY, {"id": anime_id})
        media = data.get("Media")
        if not media:
            raise AniListError(f"Anime {anime_id} was not found")
        return self._normalize_anime(media)

    async def fetch_staff(self, anime_id: int, per_page: int = 50, max_pages: int = 6) -> list[dict[str, Any]]:
        staff: list[dict[str, Any]] = []
        page = 1
        while page <= max_pages:
            data = await self._graphql(
                ANIME_STAFF_QUERY,
                {"id": anime_id, "page": page, "perPage": per_page},
            )
            connection = data["Media"]["staff"]
            for edge in connection.get("edges") or []:
                node = edge.get("node") or {}
                if node.get("id") and edge.get("role"):
                    staff.append(
                        {
                            "id": node["id"],
                            "nameFull": (node.get("name") or {}).get("full") or "Unknown staff",
                            "nameNative": (node.get("name") or {}).get("native"),
                            "imageUrl": ((node.get("image") or {}).get("large") or (node.get("image") or {}).get("medium")),
                            "siteUrl": node.get("siteUrl"),
                            "favourites": node.get("favourites"),
                            "role": edge["role"],
                        }
                    )
            if not (connection.get("pageInfo") or {}).get("hasNextPage"):
                break
            page += 1
        return staff

    async def fetch_studios(self, anime_id: int) -> list[dict[str, Any]]:
        studios: list[dict[str, Any]] = []
        data = await self._graphql(ANIME_STUDIOS_QUERY, {"id": anime_id})
        connection = data["Media"]["studios"]
        for edge in connection.get("edges") or []:
            node = edge.get("node") or {}
            if node.get("id"):
                studios.append(
                    {
                        "id": node["id"],
                        "name": node.get("name") or "Unknown studio",
                        "siteUrl": node.get("siteUrl"),
                        "favourites": None,
                        "isMain": bool(edge.get("isMain")),
                    }
                )
        return studios

    def _normalize_anime(self, media: dict[str, Any]) -> dict[str, Any]:
        title = media.get("title") or {}
        cover = media.get("coverImage") or {}
        start_date = media.get("startDate") or {}
        return {
            "id": media["id"],
            "titleRomaji": title.get("romaji") or title.get("english") or "Untitled anime",
            "titleEnglish": title.get("english"),
            "titleNative": title.get("native"),
            "coverImageUrl": cover.get("large") or cover.get("medium"),
            "bannerImageUrl": media.get("bannerImage"),
            "year": start_date.get("year"),
            "format": media.get("format"),
            "episodes": media.get("episodes"),
            "status": media.get("status"),
            "description": media.get("description"),
            "siteUrl": media.get("siteUrl"),
            "averageScore": media.get("averageScore"),
            "popularity": media.get("popularity"),
            "favourites": media.get("favourites"),
        }
