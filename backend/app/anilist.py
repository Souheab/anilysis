from __future__ import annotations

import asyncio
import time
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

SEARCH_STAFF_QUERY = """
query SearchStaff($search: String!, $page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    staff(search: $search) {
      id
      name { full native }
      image { large medium }
      siteUrl
      favourites
      primaryOccupations
    }
  }
}
"""


SEARCH_STUDIO_QUERY = """
query SearchStudio($search: String!, $page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    studios(search: $search) {
      id
      name
      siteUrl
      favourites
      isAnimationStudio
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


ANIME_VOICE_ACTORS_QUERY = """
query AnimeVoiceActors($id: Int!, $page: Int!, $perPage: Int!) {
  Media(id: $id, type: ANIME) {
    characters(page: $page, perPage: $perPage, sort: ROLE) {
      pageInfo { hasNextPage currentPage lastPage }
      edges {
        node {
          id
          name { full native }
          image { large medium }
        }
        voiceActors(language: JAPANESE) {
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


POPULAR_STAFF_QUERY = """
query PopularStaff($page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    staff(sort: FAVOURITES_DESC) {
      id
      name { full native }
      image { large medium }
      siteUrl
      favourites
      primaryOccupations
    }
  }
}
"""


STAFF_DIRECTED_ANIME_QUERY = """
query StaffDirectedAnime($id: Int!, $page: Int!, $perPage: Int!) {
  Staff(id: $id) {
    staffMedia(type: ANIME, sort: POPULARITY_DESC, page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      edges {
        staffRole
        node {
          id
          title { romaji english native }
          coverImage { large medium }
          startDate { year }
          format
          popularity
        }
      }
    }
  }
}
"""


STAFF_ENTITY_DETAIL_QUERY = """
query StaffEntityDetail($id: Int!, $page: Int!, $perPage: Int!) {
  Staff(id: $id) {
    id
    name { full native }
    image { large medium }
    siteUrl
    favourites
    primaryOccupations
    staffMedia(type: ANIME, sort: POPULARITY_DESC, page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      edges {
        staffRole
        node {
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
    }
    characterMedia(sort: POPULARITY_DESC, page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      edges {
        characterRole
        characters {
          id
          name { full native }
        }
        node {
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
    }
  }
}
"""


STUDIO_ENTITY_DETAIL_QUERY = """
query StudioEntityDetail($id: Int!, $page: Int!, $perPage: Int!) {
  Studio(id: $id) {
    id
    name
    siteUrl
    favourites
    isAnimationStudio
    media(type: ANIME, sort: POPULARITY_DESC, page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      edges {
        isMain
        node {
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
    }
  }
}
"""


USER_ANIME_PROFILE_QUERY = """
query UserAnimeProfile($username: String!) {
  User(name: $username) {
    id
    name
    avatar { large medium }
    bannerImage
    siteUrl
  }
  MediaListCollection(userName: $username, type: ANIME) {
    lists {
      name
      status
      entries {
        id
        status
        score
        progress
        updatedAt
        media {
          id
          title { romaji english native }
          coverImage { large medium }
          bannerImage
          startDate { year }
          format
          episodes
          status
          siteUrl
          averageScore
          popularity
          favourites
          genres
          tags { name rank }
          studios {
            edges {
              isMain
              node { id name }
            }
          }
          staff(perPage: 35) {
            edges {
              role
              node {
                id
                name { full }
                image { large medium }
                siteUrl
              }
            }
          }
        }
      }
    }
  }
}
"""

CORE_PROFILE_STAFF_ROLE_KEYWORDS = (
    "director",
    "original creator",
    "original story",
    "series composition",
    "script",
    "screenplay",
    "character design",
    "character designer",
    "music",
    "chief animation director",
    "animation director",
)

VOICE_ACTOR_OCCUPATION_KEYWORDS = ("voice actor",)
MANGAKA_OCCUPATION_KEYWORDS = (
    "mangaka",
    "manga",
    "comic artist",
    "comic author",
    "comic creator",
)
NON_VOICE_STAFF_KINDS = {"non-voice staff", "non voice staff", "non-voice actor staff", "non voice actor staff"}
ANIME_PRODUCTION_STAFF_KINDS = {
    "anime production",
    "anime production staff",
    "production staff",
    "direct production",
    "direct anime production",
}


class AniListClient:
    _rate_lock: asyncio.Lock | None = None
    _rate_lock_loop: asyncio.AbstractEventLoop | None = None
    _last_request_at = 0.0

    def __init__(
        self,
        endpoint: str = ANILIST_ENDPOINT,
        timeout: float = 30.0,
        transient_retry_delay: float = 0.5,
        error_retry_delay: float = 0.3,
        min_request_interval: float = 1.0,
    ) -> None:
        self.endpoint = endpoint
        self.timeout = timeout
        self.transient_retry_delay = transient_retry_delay
        self.error_retry_delay = error_retry_delay
        self.min_request_interval = min_request_interval

    async def _graphql(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                await self._throttle()
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(self.endpoint, json={"query": query, "variables": variables})
                if response.status_code == 429 or 500 <= response.status_code < 600:
                    last_error = AniListError(self._format_response_error(response))
                    await asyncio.sleep(self._retry_delay(response, attempt))
                    continue
                try:
                    payload = response.json()
                except ValueError as exc:
                    raise AniListError(self._format_response_error(response, "returned a non-JSON response")) from exc
                if payload.get("errors"):
                    raise AniListError(str(payload["errors"]))
                response.raise_for_status()
                if "data" not in payload:
                    raise AniListError("AniList response did not include a data field")
                return payload["data"]
            except (httpx.HTTPError, AniListError) as exc:
                last_error = exc
                await asyncio.sleep(self.error_retry_delay * (attempt + 1))
        raise AniListError(f"AniList request failed: {last_error}") from last_error

    async def _throttle(self) -> None:
        if self.min_request_interval <= 0:
            return
        lock = self._get_rate_lock()
        async with lock:
            now = time.monotonic()
            elapsed = now - AniListClient._last_request_at
            if elapsed < self.min_request_interval:
                await asyncio.sleep(self.min_request_interval - elapsed)
                now = time.monotonic()
            AniListClient._last_request_at = now

    def _get_rate_lock(self) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        if AniListClient._rate_lock is None or AniListClient._rate_lock_loop is not loop:
            AniListClient._rate_lock = asyncio.Lock()
            AniListClient._rate_lock_loop = loop
            AniListClient._last_request_at = 0.0
        return AniListClient._rate_lock

    def _retry_delay(self, response: httpx.Response, attempt: int) -> float:
        retry_after = self._retry_after_seconds(response)
        fallback = self.transient_retry_delay * (attempt + 1)
        if retry_after is None:
            return fallback
        return max(retry_after, fallback)

    def _retry_after_seconds(self, response: httpx.Response) -> float | None:
        value = response.headers.get("Retry-After")
        if not value:
            return None
        try:
            delay = float(value)
        except ValueError:
            return None
        return max(0.0, delay)

    def _format_response_error(self, response: httpx.Response, reason: str | None = None) -> str:
        status = f"HTTP {response.status_code}"
        label = "rate limited" if response.status_code == 429 else "request failed"
        if reason:
            label = reason
        body = response.text.strip().replace("\n", " ")
        if len(body) > 160:
            body = f"{body[:157]}..."
        if body:
            return f"AniList {label}: {status}: {body}"
        return f"AniList {label}: {status}"

    async def search_anime(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        data = await self._graphql(SEARCH_ANIME_QUERY, {"search": query, "page": 1, "perPage": limit})
        return [self._normalize_anime(media) for media in data["Page"]["media"]]

    async def search_staff(self, query: str, limit: int = 10, voice_actor_only: bool = False) -> list[dict[str, Any]]:
        data = await self._graphql(SEARCH_STAFF_QUERY, {"search": query, "page": 1, "perPage": limit})
        results = [self._normalize_staff(node) for node in data["Page"]["staff"] if node.get("id")]
        if voice_actor_only:
            results = [
                staff for staff in results
                if any("voice actor" in occupation.casefold() for occupation in staff.get("primaryOccupations") or [])
            ]
        return results

    async def search_studios(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        data = await self._graphql(SEARCH_STUDIO_QUERY, {"search": query, "page": 1, "perPage": limit})
        return [self._normalize_studio(node) for node in data["Page"]["studios"] if node.get("id")]

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

    async def fetch_voice_actors(self, anime_id: int, per_page: int = 50, max_pages: int = 6) -> list[dict[str, Any]]:
        cast: list[dict[str, Any]] = []
        page = 1
        while page <= max_pages:
            data = await self._graphql(
                ANIME_VOICE_ACTORS_QUERY,
                {"id": anime_id, "page": page, "perPage": per_page},
            )
            connection = data["Media"]["characters"]
            for edge in connection.get("edges") or []:
                character = edge.get("node") or {}
                character_name = (character.get("name") or {}).get("full") or "Unknown character"
                character_image = ((character.get("image") or {}).get("large") or (character.get("image") or {}).get("medium"))
                for actor in edge.get("voiceActors") or []:
                    if not actor.get("id"):
                        continue
                    cast.append(
                        {
                            "id": actor["id"],
                            "nameFull": (actor.get("name") or {}).get("full") or "Unknown voice actor",
                            "nameNative": (actor.get("name") or {}).get("native"),
                            "imageUrl": ((actor.get("image") or {}).get("large") or (actor.get("image") or {}).get("medium")),
                            "siteUrl": actor.get("siteUrl"),
                            "favourites": actor.get("favourites"),
                            "characterName": character_name,
                            "characterImageUrl": character_image,
                        }
                    )
            if not (connection.get("pageInfo") or {}).get("hasNextPage"):
                break
            page += 1
        return cast

    async def fetch_popular_staff(
        self,
        kind: str = "Director",
        limit: int = 50,
        per_page: int = 50,
        max_pages: int = 40,
    ) -> list[dict[str, Any]]:
        popular_staff: list[dict[str, Any]] = []
        page = 1
        normalized_kind = kind.strip().casefold()
        occupation_filters = {
            "composer": ("composer", "music"),
            "voice actor": VOICE_ACTOR_OCCUPATION_KEYWORDS,
            "mangaka": MANGAKA_OCCUPATION_KEYWORDS,
        }.get(normalized_kind, (normalized_kind,))
        include_all_staff = normalized_kind in {"all", "all staff", "staff"}
        exclude_voice_actors = normalized_kind in NON_VOICE_STAFF_KINDS | ANIME_PRODUCTION_STAFF_KINDS
        exclude_mangaka = normalized_kind in ANIME_PRODUCTION_STAFF_KINDS
        include_unfiltered_staff = include_all_staff or exclude_voice_actors or exclude_mangaka
        while page <= max_pages and len(popular_staff) < limit:
            data = await self._graphql(
                POPULAR_STAFF_QUERY,
                {"page": page, "perPage": per_page},
            )
            connection = data["Page"]
            for node in connection.get("staff") or []:
                occupations = [
                    occupation
                    for occupation in node.get("primaryOccupations") or []
                    if isinstance(occupation, str)
                ]
                if exclude_voice_actors and any(
                    occupation_filter in occupation.casefold()
                    for occupation in occupations
                    for occupation_filter in VOICE_ACTOR_OCCUPATION_KEYWORDS
                ):
                    continue
                if exclude_mangaka and any(
                    occupation_filter in occupation.casefold()
                    for occupation in occupations
                    for occupation_filter in MANGAKA_OCCUPATION_KEYWORDS
                ):
                    continue
                if not include_all_staff and not any(
                    occupation_filter in occupation.casefold()
                    for occupation in occupations
                    for occupation_filter in occupation_filters
                ) and not include_unfiltered_staff:
                    continue
                if not node.get("id"):
                    continue
                popular_staff.append(
                    {
                        "id": node["id"],
                        "nameFull": (node.get("name") or {}).get("full") or "Unknown staff",
                        "nameNative": (node.get("name") or {}).get("native"),
                        "imageUrl": ((node.get("image") or {}).get("large") or (node.get("image") or {}).get("medium")),
                        "siteUrl": node.get("siteUrl"),
                        "favourites": node.get("favourites"),
                        "primaryOccupations": occupations,
                    }
                )
                if len(popular_staff) >= limit:
                    break
            if not (connection.get("pageInfo") or {}).get("hasNextPage"):
                break
            page += 1
        return popular_staff

    async def fetch_staff_directed_anime(
        self,
        staff_id: int,
        role: str = "Director",
        limit: int = 12,
        per_page: int = 50,
        max_pages: int = 4,
    ) -> list[dict[str, Any]]:
        anime_by_id: dict[int, dict[str, Any]] = {}
        page = 1
        normalized_role = role.casefold()
        while page <= max_pages and len(anime_by_id) < limit:
            data = await self._graphql(
                STAFF_DIRECTED_ANIME_QUERY,
                {"id": staff_id, "page": page, "perPage": per_page},
            )
            staff = data.get("Staff")
            if not staff:
                raise AniListError(f"Staff {staff_id} was not found")
            connection = staff["staffMedia"]
            for edge in connection.get("edges") or []:
                staff_role = edge.get("staffRole")
                if not isinstance(staff_role, str) or normalized_role not in staff_role.casefold():
                    continue
                media = edge.get("node") or {}
                anime_id = media.get("id")
                if not anime_id:
                    continue
                normalized = anime_by_id.get(anime_id)
                if not normalized:
                    normalized = self._normalize_anime(media)
                    normalized["popularity"] = media.get("popularity")
                    normalized["roles"] = []
                    anime_by_id[anime_id] = normalized
                normalized["roles"].append(staff_role)
            if len(anime_by_id) >= limit or not (connection.get("pageInfo") or {}).get("hasNextPage"):
                break
            page += 1

        return sorted(
            anime_by_id.values(),
            key=lambda anime: anime.get("popularity") or 0,
            reverse=True,
        )[:limit]

    async def fetch_staff_entity(self, staff_id: int, voice_actor: bool = False, per_page: int = 25, max_pages: int = 3) -> dict[str, Any]:
        detail: dict[str, Any] | None = None
        anime_by_id: dict[int, dict[str, Any]] = {}
        page = 1
        connection_name = "characterMedia" if voice_actor else "staffMedia"
        while page <= max_pages:
            data = await self._graphql(
                STAFF_ENTITY_DETAIL_QUERY,
                {"id": staff_id, "page": page, "perPage": per_page},
            )
            staff = data.get("Staff")
            if not staff:
                raise AniListError(f"Staff {staff_id} was not found")
            if detail is None:
                detail = self._normalize_staff(staff)
            connection = staff.get(connection_name) or {}
            for edge in connection.get("edges") or []:
                media = edge.get("node") or {}
                anime_id = media.get("id")
                if not anime_id:
                    continue
                normalized = anime_by_id.get(anime_id)
                if normalized is None:
                    normalized = self._normalize_related_anime(media)
                    anime_by_id[anime_id] = normalized
                if voice_actor:
                    for character in edge.get("characters") or []:
                        name = (character.get("name") or {}).get("full") or (character.get("name") or {}).get("native")
                        if name:
                            normalized["roles"].append(name)
                else:
                    role = edge.get("staffRole")
                    if isinstance(role, str) and role.strip():
                        normalized["roles"].append(role.strip())
            if not (connection.get("pageInfo") or {}).get("hasNextPage"):
                break
            page += 1

        if detail is None:
            raise AniListError(f"Staff {staff_id} was not found")
        detail["relatedAnime"] = self._sorted_related_anime(anime_by_id)
        return detail

    async def fetch_studio_entity(self, studio_id: int, per_page: int = 25, max_pages: int = 3) -> dict[str, Any]:
        detail: dict[str, Any] | None = None
        anime_by_id: dict[int, dict[str, Any]] = {}
        page = 1
        while page <= max_pages:
            data = await self._graphql(
                STUDIO_ENTITY_DETAIL_QUERY,
                {"id": studio_id, "page": page, "perPage": per_page},
            )
            studio = data.get("Studio")
            if not studio:
                raise AniListError(f"Studio {studio_id} was not found")
            if detail is None:
                detail = self._normalize_studio(studio)
            connection = studio.get("media") or {}
            for edge in connection.get("edges") or []:
                media = edge.get("node") or {}
                anime_id = media.get("id")
                if not anime_id:
                    continue
                normalized = anime_by_id.get(anime_id)
                if normalized is None:
                    normalized = self._normalize_related_anime(media)
                    anime_by_id[anime_id] = normalized
                normalized["isMain"] = bool(edge.get("isMain"))
                normalized["roles"] = ["Main studio" if edge.get("isMain") else "Studio"]
            if not (connection.get("pageInfo") or {}).get("hasNextPage"):
                break
            page += 1

        if detail is None:
            raise AniListError(f"Studio {studio_id} was not found")
        detail["relatedAnime"] = self._sorted_related_anime(anime_by_id)
        return detail

    async def fetch_user_anime_profile(self, username: str) -> dict[str, Any]:
        data = await self._graphql(USER_ANIME_PROFILE_QUERY, {"username": username})
        user = data.get("User")
        collection = data.get("MediaListCollection")
        if not user:
            raise AniListError(f"AniList user {username} was not found")
        if not collection:
            raise AniListError(f"AniList anime list for {username} was not found or is private")

        entries: list[dict[str, Any]] = []
        seen_entry_ids: set[int] = set()
        seen_media_ids: set[int] = set()
        for list_group in collection.get("lists") or []:
            for entry in list_group.get("entries") or []:
                media = entry.get("media") or {}
                media_id = media.get("id")
                entry_id = entry.get("id")
                if not media_id:
                    continue
                if isinstance(entry_id, int):
                    if entry_id in seen_entry_ids:
                        continue
                    seen_entry_ids.add(entry_id)
                elif media_id in seen_media_ids:
                    continue
                seen_media_ids.add(media_id)
                entries.append(self._normalize_profile_entry(entry, list_group.get("status")))

        return {
            "user": self._normalize_user(user),
            "entries": entries,
        }

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

    def _normalize_staff(self, node: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": node["id"],
            "nameFull": (node.get("name") or {}).get("full") or "Unknown staff",
            "nameNative": (node.get("name") or {}).get("native"),
            "imageUrl": ((node.get("image") or {}).get("large") or (node.get("image") or {}).get("medium")),
            "siteUrl": node.get("siteUrl"),
            "favourites": node.get("favourites"),
            "primaryOccupations": [
                occupation for occupation in node.get("primaryOccupations") or []
                if isinstance(occupation, str)
            ],
        }

    def _normalize_studio(self, node: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": node["id"],
            "name": node.get("name") or "Unknown studio",
            "siteUrl": node.get("siteUrl"),
            "favourites": node.get("favourites"),
            "isAnimationStudio": node.get("isAnimationStudio"),
        }

    def _normalize_related_anime(self, media: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_anime(media)
        return {
            **normalized,
            "roles": [],
            "isMain": None,
        }

    def _normalize_user(self, user: dict[str, Any]) -> dict[str, Any]:
        avatar = user.get("avatar") or {}
        return {
            "id": user["id"],
            "name": user.get("name") or "AniList user",
            "avatarImageUrl": avatar.get("large") or avatar.get("medium"),
            "bannerImageUrl": user.get("bannerImage"),
            "siteUrl": user.get("siteUrl"),
        }

    def _normalize_profile_entry(self, entry: dict[str, Any], list_status: str | None) -> dict[str, Any]:
        media = entry.get("media") or {}
        normalized = self._normalize_anime(media)
        studios: list[str] = []
        for edge in ((media.get("studios") or {}).get("edges") or []):
            node = edge.get("node") or {}
            name = node.get("name")
            if name and (edge.get("isMain") or name not in studios):
                studios.append(name)
        staff_by_id: dict[int, dict[str, Any]] = {}
        for edge in ((media.get("staff") or {}).get("edges") or []):
            role = edge.get("role")
            node = edge.get("node") or {}
            staff_id = node.get("id")
            if not isinstance(role, str) or not isinstance(staff_id, int) or not self._is_core_profile_staff_role(role):
                continue
            name = (node.get("name") or {}).get("full")
            if not name:
                continue
            image = node.get("image") or {}
            credit = staff_by_id.setdefault(
                staff_id,
                {
                    "id": staff_id,
                    "name": name,
                    "imageUrl": image.get("large") or image.get("medium"),
                    "siteUrl": node.get("siteUrl"),
                    "roles": [],
                },
            )
            if role not in credit["roles"]:
                credit["roles"].append(role)
        return {
            **normalized,
            "listStatus": entry.get("status") or list_status or "UNKNOWN",
            "score": entry.get("score"),
            "progress": entry.get("progress"),
            "updatedAt": entry.get("updatedAt"),
            "genres": [genre for genre in media.get("genres") or [] if isinstance(genre, str)],
            "tags": [
                tag.get("name")
                for tag in media.get("tags") or []
                if isinstance(tag, dict) and tag.get("name") and (tag.get("rank") or 0) >= 50
            ],
            "studios": studios,
            "staff": list(staff_by_id.values()),
        }

    def _is_core_profile_staff_role(self, role: str) -> bool:
        normalized_role = role.casefold()
        return any(keyword in normalized_role for keyword in CORE_PROFILE_STAFF_ROLE_KEYWORDS)

    def _sorted_related_anime(self, anime_by_id: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
        for anime in anime_by_id.values():
            anime["roles"] = sorted(set(anime.get("roles") or []))
        return sorted(
            anime_by_id.values(),
            key=lambda anime: (anime.get("popularity") or 0, anime.get("averageScore") or 0),
            reverse=True,
        )
