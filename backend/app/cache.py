from __future__ import annotations

import asyncio
import json
from datetime import timedelta
from typing import Any, Awaitable, Callable

from fastapi import HTTPException
from sqlmodel import Session, delete, select

from app.anilist import AniListClient, AniListError
from app.models import ApiCacheEntry, Anime, AnimeStaffRole, AnimeStudio, AnimeVoiceActorRole, Staff, Studio, VoiceActor, utc_now
from app.schemas import (
    AnimeProfileResponse,
    AnimeDetail,
    AnimeSearchResult,
    ComparisonMetricRow,
    EntityCompareResponse,
    EntitySearchResult,
    EntitySummary,
    EntityType,
    ProfileAnimeEntry,
    ProfileDistributionRow,
    ProfileListSummary,
    ProfileScoreBucket,
    ProfileScoreComparison,
    ProfileScoreDeltaRow,
    ProfileTasteAnalysisRow,
    ProfileTasteRow,
    ProfileUserSummary,
    RefreshResponse,
    RelatedAnimeSummary,
)
from app.scoring import role_is_included, score_role, studio_weight


CACHE_TTL = timedelta(days=7)
SEARCH_CACHE_TTL = timedelta(minutes=30)
POPULAR_STAFF_CACHE_TTL = timedelta(hours=12)
STAFF_ANIME_CACHE_TTL = timedelta(hours=12)
ENTITY_CACHE_TTL = timedelta(hours=12)
PROFILE_CACHE_TTL = timedelta(minutes=30)
PROFILE_CACHE_VERSION = "v2"


class ApiResponseCache:
    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}

    async def get_or_fetch_json(
        self,
        session: Session,
        key: str,
        ttl: timedelta,
        fetcher: Callable[[], Awaitable[Any]],
    ) -> Any:
        cached = self._get_fresh(session, key)
        if cached is not None:
            return cached

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self._get_fresh(session, key)
            if cached is not None:
                return cached

            value = await fetcher()
            now = utc_now()
            entry = session.get(ApiCacheEntry, key) or ApiCacheEntry(key=key, value_json="null", expires_at=now)
            entry.value_json = json.dumps(value)
            entry.expires_at = now + ttl
            entry.updated_at = now
            session.add(entry)
            session.commit()
            return value

    def _get_fresh(self, session: Session, key: str) -> Any | None:
        entry = session.get(ApiCacheEntry, key)
        if not entry or entry.expires_at <= utc_now():
            return None
        return json.loads(entry.value_json)


class AnimeCacheService:
    def __init__(self, client: AniListClient | None = None) -> None:
        self.client = client or AniListClient()
        self._load_locks: dict[int, asyncio.Lock] = {}
        self.api_cache = ApiResponseCache()

    async def search_anime(self, session: Session, query: str) -> list[AnimeSearchResult]:
        normalized_query = query.strip()
        if len(normalized_query) < 2:
            return []
        try:
            results = await self.api_cache.get_or_fetch_json(
                session,
                f"anilist:search_anime:{normalized_query.casefold()}",
                SEARCH_CACHE_TTL,
                lambda: self.client.search_anime(normalized_query),
            )
        except AniListError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        for item in results:
            self._upsert_anime(session, item)
        session.commit()
        return [AnimeSearchResult(**item) for item in results]

    async def search_entities(self, session: Session, entity_type: EntityType, query: str) -> list[EntitySearchResult]:
        normalized_query = query.strip()
        if len(normalized_query) < 2:
            return []
        if entity_type == "anime":
            anime = await self.search_anime(session, normalized_query)
            return [
                EntitySearchResult(
                    id=item.id,
                    type="anime",
                    label=item.titleEnglish or item.titleRomaji,
                    subtitle=" • ".join(str(value) for value in [item.format, item.year] if value),
                    imageUrl=item.coverImageUrl,
                )
                for item in anime
            ]
        try:
            if entity_type == "studio":
                results = await self.api_cache.get_or_fetch_json(
                    session,
                    f"anilist:search_entity:studio:{normalized_query.casefold()}",
                    SEARCH_CACHE_TTL,
                    lambda: self.client.search_studios(normalized_query),
                )
                return [
                    EntitySearchResult(
                        id=item["id"],
                        type="studio",
                        label=item["name"],
                        subtitle="Animation studio" if item.get("isAnimationStudio") else "Studio",
                        siteUrl=item.get("siteUrl"),
                    )
                    for item in results
                ]
            results = await self.api_cache.get_or_fetch_json(
                session,
                f"anilist:search_entity:{entity_type}:{normalized_query.casefold()}",
                SEARCH_CACHE_TTL,
                lambda: self.client.search_staff(normalized_query, voice_actor_only=entity_type == "voiceActor"),
            )
            return [
                EntitySearchResult(
                    id=item["id"],
                    type=entity_type,
                    label=item["nameFull"],
                    subtitle=" / ".join(item.get("primaryOccupations") or []) or ("Voice Actor" if entity_type == "voiceActor" else "Staff"),
                    imageUrl=item.get("imageUrl"),
                    siteUrl=item.get("siteUrl"),
                )
                for item in results
            ]
        except AniListError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    async def search_all(self, session: Session, query: str, limit: int = 8) -> list[EntitySearchResult]:
        normalized_query = query.strip()
        if len(normalized_query) < 2:
            return []
        entity_types: tuple[EntityType, ...] = ("anime", "staff", "studio", "voiceActor")
        results: list[EntitySearchResult] = []
        for entity_type in entity_types:
            items = await self.search_entities(session, entity_type, normalized_query)
            results.extend(items[:limit])
        return results

    async def popular_staff(self, session: Session, kind: str, limit: int) -> list[dict[str, Any]]:
        normalized_kind = kind.strip() or "Director"
        try:
            return await self.api_cache.get_or_fetch_json(
                session,
                f"anilist:popular_staff:{normalized_kind.casefold()}:{limit}",
                POPULAR_STAFF_CACHE_TTL,
                lambda: self.client.fetch_popular_staff(kind=normalized_kind, limit=limit),
            )
        except AniListError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    async def staff_directed_anime(self, session: Session, staff_id: int, role: str, limit: int) -> list[dict[str, Any]]:
        normalized_role = role.strip()
        try:
            return await self.api_cache.get_or_fetch_json(
                session,
                f"anilist:staff_directed_anime:{staff_id}:{normalized_role.casefold()}:{limit}",
                STAFF_ANIME_CACHE_TTL,
                lambda: self.client.fetch_staff_directed_anime(staff_id=staff_id, role=normalized_role, limit=limit),
            )
        except AniListError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    async def profile_anime(self, session: Session, username: str) -> AnimeProfileResponse:
        normalized_username = username.strip()
        if len(normalized_username) < 2:
            raise HTTPException(status_code=422, detail="username must be at least 2 characters")
        try:
            data = await self.api_cache.get_or_fetch_json(
                session,
                f"anilist:profile_anime:{PROFILE_CACHE_VERSION}:{normalized_username.casefold()}",
                PROFILE_CACHE_TTL,
                lambda: self.client.fetch_user_anime_profile(normalized_username),
            )
        except AniListError as exc:
            message = str(exc)
            if "was not found" in message or "is private" in message:
                raise HTTPException(status_code=404, detail=message) from exc
            raise HTTPException(status_code=502, detail=message) from exc
        return self._profile_response(data)

    async def compare_entities(self, session: Session, entity_type: EntityType, left_id: int, right_id: int) -> EntityCompareResponse:
        if left_id == right_id:
            raise HTTPException(status_code=422, detail="leftId and rightId must be different")
        if entity_type == "anime":
            await self.ensure_anime_loaded(session, left_id)
            await self.ensure_anime_loaded(session, right_id)
            return self._compare_anime_entities(session, left_id, right_id)
        left = await self._entity_summary(session, entity_type, left_id)
        right = await self._entity_summary(session, entity_type, right_id)
        overlap = self._related_overlap(left.relatedAnime, right.relatedAnime)
        metrics = self._creator_metrics(entity_type, left, right, len(overlap))
        notes = ["Related anime are sorted by AniList popularity and cached for 12 hours."]
        if entity_type == "voiceActor":
            notes.append("Voice actors use AniList staff records with voice-acting character media.")
        return EntityCompareResponse(type=entity_type, left=left, right=right, metrics=metrics, overlap=overlap, notes=notes)

    async def entity_summary(self, session: Session, entity_type: EntityType, entity_id: int) -> EntitySummary:
        if entity_type == "anime":
            anime = await self.ensure_anime_loaded(session, entity_id)
            return self._anime_entity_summary(session, anime)
        return await self._entity_summary(session, entity_type, entity_id)

    async def refresh_anime(self, session: Session, anime_id: int, force: bool = True) -> RefreshResponse:
        anime = await self.ensure_anime_loaded(session, anime_id, force=force)
        staff_count = len(session.exec(select(AnimeStaffRole).where(AnimeStaffRole.anime_id == anime_id)).all())
        studio_count = len(session.exec(select(AnimeStudio).where(AnimeStudio.anime_id == anime_id)).all())
        voice_actor_count = len({role.voice_actor_id for role in session.exec(select(AnimeVoiceActorRole).where(AnimeVoiceActorRole.anime_id == anime_id)).all()})
        return RefreshResponse(anime=anime_to_detail(anime), staffCount=staff_count, studioCount=studio_count, voiceActorCount=voice_actor_count)

    async def ensure_anime_loaded(self, session: Session, anime_id: int, force: bool = False) -> Anime:
        cached = session.get(Anime, anime_id)
        if cached and not force and self._is_fresh(cached):
            return cached
        lock = self._load_locks.setdefault(anime_id, asyncio.Lock())
        async with lock:
            cached = session.get(Anime, anime_id)
            if cached and not force and self._is_fresh(cached):
                return cached
            return await self._load_anime(session, anime_id)

    async def _load_anime(self, session: Session, anime_id: int) -> Anime:
        try:
            anime_data = await self.client.fetch_anime(anime_id)
            staff_data = await self.client.fetch_staff(anime_id)
            studio_data = await self.client.fetch_studios(anime_id)
            voice_actor_data = await self.client.fetch_voice_actors(anime_id)
        except AniListError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        anime = self._upsert_anime(session, anime_data)
        now = utc_now()
        anime.staff_fetched_at = now
        anime.studios_fetched_at = now
        anime.voice_cast_fetched_at = now
        anime.updated_at = now

        session.exec(delete(AnimeStaffRole).where(AnimeStaffRole.anime_id == anime_id))
        session.exec(delete(AnimeStudio).where(AnimeStudio.anime_id == anime_id))
        session.exec(delete(AnimeVoiceActorRole).where(AnimeVoiceActorRole.anime_id == anime_id))

        seen_staff_roles: set[tuple[int, str]] = set()
        for item in staff_data:
            staff = Staff(
                id=item["id"],
                name_full=item["nameFull"],
                name_native=item.get("nameNative"),
                image_url=item.get("imageUrl"),
                site_url=item.get("siteUrl"),
                favourites=item.get("favourites"),
                updated_at=now,
            )
            session.merge(staff)
            role = item["role"].strip()
            if (item["id"], role) in seen_staff_roles:
                continue
            seen_staff_roles.add((item["id"], role))
            role_score = score_role(role)
            session.add(
                AnimeStaffRole(
                    anime_id=anime_id,
                    staff_id=item["id"],
                    role=role,
                    role_category=role_score.category,
                    weight=role_score.weight,
                    updated_at=now,
                )
            )

        seen_voice_roles: set[tuple[int, str]] = set()
        for item in voice_actor_data:
            voice_actor = VoiceActor(
                id=item["id"],
                name_full=item["nameFull"],
                name_native=item.get("nameNative"),
                image_url=item.get("imageUrl"),
                site_url=item.get("siteUrl"),
                favourites=item.get("favourites"),
                updated_at=now,
            )
            session.merge(voice_actor)
            character_name = item.get("characterName", "Unknown character").strip() or "Unknown character"
            if (item["id"], character_name) in seen_voice_roles:
                continue
            seen_voice_roles.add((item["id"], character_name))
            session.add(
                AnimeVoiceActorRole(
                    anime_id=anime_id,
                    voice_actor_id=item["id"],
                    character_name=character_name,
                    character_image_url=item.get("characterImageUrl"),
                    role_category="voice_actor",
                    weight=3.0,
                    updated_at=now,
                )
            )

        seen_studios: set[int] = set()
        for item in studio_data:
            studio = Studio(
                id=item["id"],
                name=item["name"],
                site_url=item.get("siteUrl"),
                favourites=item.get("favourites"),
                updated_at=now,
            )
            session.merge(studio)
            if item["id"] in seen_studios:
                continue
            seen_studios.add(item["id"])
            session.add(
                AnimeStudio(
                    anime_id=anime_id,
                    studio_id=item["id"],
                    is_main=bool(item.get("isMain")),
                    weight=studio_weight(bool(item.get("isMain"))),
                    updated_at=now,
                )
            )

        session.add(anime)
        session.commit()
        session.refresh(anime)
        return anime

    def get_cached_anime(self, session: Session, anime_id: int) -> Anime:
        anime = session.get(Anime, anime_id)
        if not anime:
            raise HTTPException(status_code=404, detail=f"Anime {anime_id} is not cached")
        return anime

    def get_node_detail(self, session: Session, node_type: str, node_id: int):
        from app.graph import GraphService

        return GraphService().node_detail(session, node_type, node_id)

    def _is_fresh(self, anime: Anime) -> bool:
        now = utc_now()
        return bool(
            anime.staff_fetched_at
            and anime.studios_fetched_at
            and anime.voice_cast_fetched_at
            and now - anime.staff_fetched_at < CACHE_TTL
            and now - anime.studios_fetched_at < CACHE_TTL
            and now - anime.voice_cast_fetched_at < CACHE_TTL
        )

    def _upsert_anime(self, session: Session, item: dict) -> Anime:
        existing = session.get(Anime, item["id"])
        anime = existing or Anime(id=item["id"], title_romaji=item["titleRomaji"])
        anime.title_romaji = item["titleRomaji"]
        anime.title_english = item.get("titleEnglish")
        anime.title_native = item.get("titleNative")
        anime.cover_image_url = item.get("coverImageUrl")
        anime.banner_image_url = item.get("bannerImageUrl")
        anime.year = item.get("year")
        anime.format = item.get("format")
        anime.episodes = item.get("episodes")
        anime.status = item.get("status")
        anime.description = item.get("description")
        anime.site_url = item.get("siteUrl")
        anime.average_score = item.get("averageScore")
        anime.popularity = item.get("popularity")
        anime.favourites = item.get("favourites")
        anime.updated_at = utc_now()
        session.add(anime)
        return anime

    async def _entity_summary(self, session: Session, entity_type: EntityType, entity_id: int) -> EntitySummary:
        try:
            if entity_type == "studio":
                data = await self.api_cache.get_or_fetch_json(
                    session,
                    f"anilist:entity:studio:{entity_id}",
                    ENTITY_CACHE_TTL,
                    lambda: self.client.fetch_studio_entity(entity_id),
                )
                related = self._related_anime_summaries(data.get("relatedAnime") or [])
                return EntitySummary(
                    id=data["id"],
                    type="studio",
                    label=data["name"],
                    subtitle="Animation studio" if data.get("isAnimationStudio") else "Studio",
                    siteUrl=data.get("siteUrl"),
                    favourites=data.get("favourites"),
                    metadata={"isAnimationStudio": data.get("isAnimationStudio")},
                    relatedAnime=related,
                )
            data = await self.api_cache.get_or_fetch_json(
                session,
                f"anilist:entity:{entity_type}:{entity_id}",
                ENTITY_CACHE_TTL,
                lambda: self.client.fetch_staff_entity(entity_id, voice_actor=entity_type == "voiceActor"),
            )
        except AniListError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        related = self._related_anime_summaries(data.get("relatedAnime") or [])
        return EntitySummary(
            id=data["id"],
            type=entity_type,
            label=data["nameFull"],
            subtitle=" / ".join(data.get("primaryOccupations") or []) or ("Voice Actor" if entity_type == "voiceActor" else "Staff"),
            imageUrl=data.get("imageUrl"),
            siteUrl=data.get("siteUrl"),
            favourites=data.get("favourites"),
            metadata={"nameNative": data.get("nameNative"), "primaryOccupations": data.get("primaryOccupations") or []},
            relatedAnime=related,
        )

    def _compare_anime_entities(self, session: Session, left_id: int, right_id: int) -> EntityCompareResponse:
        from app.graph import GraphService

        graph_service = GraphService()
        left_anime = self.get_cached_anime(session, left_id)
        right_anime = self.get_cached_anime(session, right_id)
        comparison = graph_service.compare(session, [left_id, right_id], [], staff_limit=None)
        left = self._anime_entity_summary(session, left_anime)
        right = self._anime_entity_summary(session, right_anime)
        metrics = [
            self._metric("averageScore", "Average score", left_anime.average_score, right_anime.average_score, suffix="%"),
            self._metric("popularity", "Popularity", left_anime.popularity, right_anime.popularity),
            self._metric("favourites", "Favourites", left_anime.favourites, right_anime.favourites),
            self._metric("year", "Year", left_anime.year, right_anime.year, higher_is_better=None),
            self._metric("episodes", "Episodes", left_anime.episodes, right_anime.episodes, higher_is_better=None),
            self._metric("format", "Format", left_anime.format, right_anime.format, higher_is_better=None),
            self._metric("status", "Status", left_anime.status, right_anime.status, higher_is_better=None),
            self._metric("staffCount", "Staff count", self._staff_count(session, left_id), self._staff_count(session, right_id)),
            self._metric("studioCount", "Studio count", self._studio_count(session, left_id), self._studio_count(session, right_id)),
            self._metric("voiceActorCount", "Voice actor count", self._voice_actor_count(session, left_id), self._voice_actor_count(session, right_id)),
            self._metric("sharedStaff", "Shared staff", len(comparison.sharedStaff), len(comparison.sharedStaff), higher_is_better=None),
            self._metric("sharedStudios", "Shared studios", len(comparison.sharedStudios), len(comparison.sharedStudios), higher_is_better=None),
            self._metric("sharedVoiceActors", "Shared voice actors", len(comparison.sharedVoiceActors), len(comparison.sharedVoiceActors), higher_is_better=None),
            self._metric("connectionScore", "Connection score", comparison.score, comparison.score, higher_is_better=None),
        ]
        overlap = [
            RelatedAnimeSummary(**anime_to_detail(anime).model_dump())
            for anime in [left_anime, right_anime]
        ]
        notes = ["Shared anime rows show the selected pair; shared staff/studio/voice actor counts come from the relationship analyzer."]
        return EntityCompareResponse(type="anime", left=left, right=right, metrics=metrics, overlap=overlap, notes=notes)

    def _anime_entity_summary(self, session: Session, anime: Anime) -> EntitySummary:
        detail = anime_to_detail(anime)
        return EntitySummary(
            id=anime.id,
            type="anime",
            label=anime.title_english or anime.title_romaji,
            subtitle=" • ".join(str(value) for value in [anime.format, anime.year] if value),
            imageUrl=anime.cover_image_url,
            siteUrl=anime.site_url,
            favourites=anime.favourites,
            metadata={
                **detail.model_dump(mode="json"),
                "staffCount": self._staff_count(session, anime.id),
                "studioCount": self._studio_count(session, anime.id),
                "voiceActorCount": self._voice_actor_count(session, anime.id),
            },
            relatedAnime=[
                RelatedAnimeSummary(
                    id=anime.id,
                    titleRomaji=anime.title_romaji,
                    titleEnglish=anime.title_english,
                    titleNative=anime.title_native,
                    coverImageUrl=anime.cover_image_url,
                    year=anime.year,
                    format=anime.format,
                    averageScore=anime.average_score,
                    popularity=anime.popularity,
                    favourites=anime.favourites,
                )
            ],
        )

    def _creator_metrics(self, entity_type: EntityType, left: EntitySummary, right: EntitySummary, overlap_count: int) -> list[ComparisonMetricRow]:
        left_average_score = self._average_numeric(left.relatedAnime, "averageScore")
        right_average_score = self._average_numeric(right.relatedAnime, "averageScore")
        left_average_popularity = self._average_numeric(left.relatedAnime, "popularity")
        right_average_popularity = self._average_numeric(right.relatedAnime, "popularity")
        metrics = [
            self._metric("favourites", "Favourites", left.favourites, right.favourites),
            self._metric("animeCount", "Anime credits", len(left.relatedAnime), len(right.relatedAnime)),
            self._metric("averageAnimeScore", "Average anime score", left_average_score, right_average_score, suffix="%"),
            self._metric("averagePopularity", "Average popularity", left_average_popularity, right_average_popularity),
            self._metric("sharedAnime", "Shared anime", overlap_count, overlap_count, higher_is_better=None),
            self._metric("mostPopularAnime", "Most popular anime", self._top_anime_label(left.relatedAnime), self._top_anime_label(right.relatedAnime), higher_is_better=None),
        ]
        if entity_type == "studio":
            metrics.insert(2, self._metric("mainStudioCount", "Main-studio credits", self._main_studio_count(left.relatedAnime), self._main_studio_count(right.relatedAnime)))
        if entity_type == "voiceActor":
            metrics.insert(2, self._metric("characterCount", "Character roles", self._role_count(left.relatedAnime), self._role_count(right.relatedAnime)))
        if entity_type == "staff":
            metrics.insert(2, self._metric("topRoles", "Top roles", self._top_roles(left.relatedAnime), self._top_roles(right.relatedAnime), higher_is_better=None))
        return metrics

    def _metric(
        self,
        key: str,
        label: str,
        left: int | float | str | None,
        right: int | float | str | None,
        suffix: str = "",
        higher_is_better: bool | None = True,
    ) -> ComparisonMetricRow:
        winner: str = "neutral"
        if isinstance(left, (int, float)) and isinstance(right, (int, float)) and higher_is_better is not None:
            if left == right:
                winner = "tie"
            elif (left > right) == higher_is_better:
                winner = "left"
            else:
                winner = "right"
        return ComparisonMetricRow(
            key=key,
            label=label,
            leftValue=self._format_metric_value(left, suffix),
            rightValue=self._format_metric_value(right, suffix),
            leftRaw=left,
            rightRaw=right,
            winner=winner,
            higherIsBetter=higher_is_better,
        )

    def _format_metric_value(self, value: int | float | str | None, suffix: str = "") -> str:
        if value is None or value == "":
            return "Unknown"
        if isinstance(value, float):
            return f"{value:,.1f}{suffix}"
        if isinstance(value, int):
            return f"{value:,}{suffix}"
        return value

    def _related_anime_summaries(self, items: list[dict[str, Any]]) -> list[RelatedAnimeSummary]:
        return [
            RelatedAnimeSummary(
                id=item["id"],
                titleRomaji=item["titleRomaji"],
                titleEnglish=item.get("titleEnglish"),
                titleNative=item.get("titleNative"),
                coverImageUrl=item.get("coverImageUrl"),
                year=item.get("year"),
                format=item.get("format"),
                averageScore=item.get("averageScore"),
                popularity=item.get("popularity"),
                favourites=item.get("favourites"),
                roles=item.get("roles") or [],
                isMain=item.get("isMain"),
            )
            for item in items
        ]

    def _profile_response(self, data: dict[str, Any]) -> AnimeProfileResponse:
        entries = [ProfileAnimeEntry(**item) for item in data.get("entries") or []]
        completed = [entry for entry in entries if entry.listStatus == "COMPLETED"]
        scored_completed = [entry for entry in completed if isinstance(entry.score, (int, float)) and entry.score > 0]
        scored_entries = [entry for entry in entries if isinstance(entry.score, (int, float)) and entry.score > 0]
        total = len(entries)
        status_counts = self._count_by(entries, lambda entry: self._status_label(entry.listStatus))
        watched_episodes = sum(self._watched_episode_count(entry) for entry in entries)
        score_scale = self._profile_score_scale(scored_entries)

        return AnimeProfileResponse(
            user=ProfileUserSummary(**data["user"]),
            summary=ProfileListSummary(
                totalEntries=total,
                completedCount=len(completed),
                watchedEpisodes=watched_episodes,
                meanScore=self._mean_score(scored_completed or scored_entries),
                statusCounts=status_counts,
            ),
            statusDistribution=self._distribution(status_counts, total),
            formatDistribution=self._distribution(self._count_by(entries, lambda entry: entry.format or "Unknown"), total),
            yearDistribution=self._distribution(self._count_by(entries, self._year_bucket), total),
            scoreDistribution=self._score_distribution(scored_entries),
            topGenres=self._taste_rows(entries, lambda entry: entry.genres),
            topTags=self._taste_rows(entries, lambda entry: entry.tags),
            topStudios=self._taste_rows(entries, lambda entry: entry.studios),
            scoreComparison=self._score_comparison(scored_entries, score_scale),
            genreTaste=self._taste_analysis_rows(entries, lambda entry: entry.genres, score_scale),
            tagTaste=self._taste_analysis_rows(entries, lambda entry: entry.tags, score_scale),
            studioTaste=self._taste_analysis_rows(entries, lambda entry: entry.studios, score_scale),
            staffAffinity=self._staff_affinity_rows(entries, score_scale),
            highestRated=sorted(
                scored_entries,
                key=lambda entry: (entry.score or 0, entry.averageScore or 0, entry.popularity or 0),
                reverse=True,
            )[:8],
            lowestRatedCompleted=sorted(
                scored_completed,
                key=lambda entry: (entry.score or 0, -(entry.averageScore or 0), -(entry.popularity or 0)),
            )[:8],
            longestWatched=sorted(
                entries,
                key=lambda entry: (self._watched_episode_count(entry), entry.score or 0),
                reverse=True,
            )[:8],
            recentlyUpdated=sorted(entries, key=lambda entry: entry.updatedAt or 0, reverse=True)[:8],
        )

    def _count_by(self, entries: list[ProfileAnimeEntry], labeler: Callable[[ProfileAnimeEntry], str]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for entry in entries:
            label = labeler(entry)
            counts[label] = counts.get(label, 0) + 1
        return counts

    def _distribution(self, counts: dict[str, int], total: int, limit: int | None = None) -> list[ProfileDistributionRow]:
        rows = [
            ProfileDistributionRow(
                label=label,
                count=count,
                percentage=round((count / total) * 100, 1) if total else 0,
            )
            for label, count in counts.items()
        ]
        rows.sort(key=lambda row: (row.count, row.label), reverse=True)
        return rows[:limit] if limit else rows

    def _taste_rows(
        self,
        entries: list[ProfileAnimeEntry],
        labels_for: Callable[[ProfileAnimeEntry], list[str]],
        limit: int = 8,
    ) -> list[ProfileTasteRow]:
        counts: dict[str, int] = {}
        scores: dict[str, list[float]] = {}
        for entry in entries:
            for label in labels_for(entry):
                counts[label] = counts.get(label, 0) + 1
                if isinstance(entry.score, (int, float)) and entry.score > 0:
                    scores.setdefault(label, []).append(float(entry.score))
        rows = [
            ProfileTasteRow(
                label=label,
                count=count,
                meanScore=round(sum(scores[label]) / len(scores[label]), 1) if scores.get(label) else None,
            )
            for label, count in counts.items()
        ]
        rows.sort(key=lambda row: (row.count, row.meanScore or 0, row.label), reverse=True)
        return rows[:limit]

    def _score_comparison(self, entries: list[ProfileAnimeEntry], score_scale: float) -> ProfileScoreComparison:
        comparable = [entry for entry in entries if self._normalized_community_score(entry, score_scale) is not None]
        deltas = [self._score_delta_row(entry, score_scale) for entry in comparable]
        user_scores = [float(entry.score or 0) for entry in comparable]
        community_scores = [
            score for entry in comparable
            if (score := self._normalized_community_score(entry, score_scale)) is not None
        ]
        mean_user = round(sum(user_scores) / len(user_scores), 1) if user_scores else None
        mean_community = round(sum(community_scores) / len(community_scores), 1) if community_scores else None
        mean_delta = round(mean_user - mean_community, 1) if mean_user is not None and mean_community is not None else None
        return ProfileScoreComparison(
            meanUserScore=mean_user,
            meanCommunityScore=mean_community,
            meanDelta=mean_delta,
            overRated=sorted(deltas, key=lambda row: (row.scoreDelta or 0, row.score or 0), reverse=True)[:6],
            underRated=sorted(deltas, key=lambda row: (row.scoreDelta or 0, -(row.score or 0)))[:6],
            buckets=self._score_delta_buckets(comparable, score_scale),
        )

    def _taste_analysis_rows(
        self,
        entries: list[ProfileAnimeEntry],
        labels_for: Callable[[ProfileAnimeEntry], list[str]],
        score_scale: float,
        limit: int = 8,
    ) -> list[ProfileTasteAnalysisRow]:
        grouped: dict[str, list[ProfileAnimeEntry]] = {}
        for entry in entries:
            for label in labels_for(entry):
                grouped.setdefault(label, []).append(entry)
        rows = [
            self._taste_analysis_row(label, label_entries, score_scale)
            for label, label_entries in grouped.items()
        ]
        rows.sort(key=lambda row: (row.count, row.meanScore or 0, row.meanDelta or -999, row.label), reverse=True)
        return rows[:limit]

    def _staff_affinity_rows(
        self,
        entries: list[ProfileAnimeEntry],
        score_scale: float,
        limit: int = 8,
    ) -> list[ProfileTasteAnalysisRow]:
        grouped: dict[str, list[ProfileAnimeEntry]] = {}
        roles_by_staff: dict[str, set[str]] = {}
        for entry in entries:
            for staff in entry.staff:
                grouped.setdefault(staff.name, []).append(entry)
                roles_by_staff.setdefault(staff.name, set()).update(staff.roles)
        rows = [
            self._taste_analysis_row(
                label,
                label_entries,
                score_scale,
                role_summary=", ".join(sorted(roles_by_staff.get(label, set()))) or None,
            )
            for label, label_entries in grouped.items()
        ]
        rows.sort(key=lambda row: (row.count, row.meanScore or 0, row.meanDelta or -999, row.label), reverse=True)
        return rows[:limit]

    def _taste_analysis_row(
        self,
        label: str,
        entries: list[ProfileAnimeEntry],
        score_scale: float,
        role_summary: str | None = None,
    ) -> ProfileTasteAnalysisRow:
        scored = [entry for entry in entries if isinstance(entry.score, (int, float)) and entry.score > 0]
        community_scores = [
            score for entry in scored
            if (score := self._normalized_community_score(entry, score_scale)) is not None
        ]
        user_mean = self._mean_score(scored)
        community_mean = round(sum(community_scores) / len(community_scores), 1) if community_scores else None
        return ProfileTasteAnalysisRow(
            label=label,
            count=len(entries),
            completedCount=len([entry for entry in entries if entry.listStatus == "COMPLETED"]),
            meanScore=user_mean,
            meanCommunityScore=community_mean,
            meanDelta=round(user_mean - community_mean, 1) if user_mean is not None and community_mean is not None else None,
            roleSummary=role_summary,
            representativeAnime=[
                AnimeSearchResult(
                    id=entry.id,
                    titleRomaji=entry.titleRomaji,
                    titleEnglish=entry.titleEnglish,
                    titleNative=entry.titleNative,
                    coverImageUrl=entry.coverImageUrl,
                    year=entry.year,
                    format=entry.format,
                )
                for entry in sorted(entries, key=lambda item: (item.score or 0, item.popularity or 0), reverse=True)[:3]
            ],
        )

    def _profile_score_scale(self, entries: list[ProfileAnimeEntry]) -> float:
        scores = [float(entry.score or 0) for entry in entries if isinstance(entry.score, (int, float)) and entry.score > 0]
        return 10.0 if scores and max(scores) <= 10 else 100.0

    def _normalized_community_score(self, entry: ProfileAnimeEntry, score_scale: float) -> float | None:
        if not isinstance(entry.averageScore, (int, float)) or entry.averageScore <= 0:
            return None
        score = float(entry.averageScore)
        if score_scale <= 10:
            score /= 10
        return round(score, 1)

    def _score_delta_row(self, entry: ProfileAnimeEntry, score_scale: float) -> ProfileScoreDeltaRow:
        community_score = self._normalized_community_score(entry, score_scale)
        user_score = float(entry.score or 0) if isinstance(entry.score, (int, float)) else None
        return ProfileScoreDeltaRow(
            id=entry.id,
            titleRomaji=entry.titleRomaji,
            titleEnglish=entry.titleEnglish,
            titleNative=entry.titleNative,
            coverImageUrl=entry.coverImageUrl,
            year=entry.year,
            format=entry.format,
            score=user_score,
            averageScore=entry.averageScore,
            normalizedCommunityScore=community_score,
            scoreDelta=round(user_score - community_score, 1) if user_score is not None and community_score is not None else None,
            siteUrl=entry.siteUrl,
        )

    def _score_delta_buckets(self, entries: list[ProfileAnimeEntry], score_scale: float) -> list[ProfileScoreBucket]:
        buckets: dict[str, list[float]] = {"Below community": [], "Near community": [], "Above community": []}
        threshold = 0.75 if score_scale <= 10 else 7.5
        for entry in entries:
            community_score = self._normalized_community_score(entry, score_scale)
            if community_score is None or not isinstance(entry.score, (int, float)):
                continue
            delta = float(entry.score) - community_score
            if delta > threshold:
                buckets["Above community"].append(delta)
            elif delta < -threshold:
                buckets["Below community"].append(delta)
            else:
                buckets["Near community"].append(delta)
        return [
            ProfileScoreBucket(
                label=label,
                count=len(values),
                meanDelta=round(sum(values) / len(values), 1) if values else None,
            )
            for label, values in buckets.items()
        ]

    def _score_distribution(self, entries: list[ProfileAnimeEntry]) -> list[ProfileDistributionRow]:
        if not entries:
            return []
        scores = [float(entry.score or 0) for entry in entries]
        max_score = max(scores)
        counts: dict[str, int] = {}
        if max_score <= 10:
            for score in scores:
                bucket_start = int(score)
                label = f"{bucket_start}-{min(10, bucket_start + 1)}"
                counts[label] = counts.get(label, 0) + 1
        else:
            for score in scores:
                bucket_start = min(90, int(score // 10) * 10)
                label = f"{bucket_start}-{bucket_start + 9 if bucket_start < 90 else 100}"
                counts[label] = counts.get(label, 0) + 1
        return self._distribution(counts, len(entries))

    def _mean_score(self, entries: list[ProfileAnimeEntry]) -> float | None:
        scores = [float(entry.score or 0) for entry in entries if isinstance(entry.score, (int, float)) and entry.score > 0]
        return round(sum(scores) / len(scores), 1) if scores else None

    def _watched_episode_count(self, entry: ProfileAnimeEntry) -> int:
        if isinstance(entry.progress, int) and entry.progress > 0:
            return min(entry.progress, entry.episodes or entry.progress)
        if entry.listStatus == "COMPLETED" and isinstance(entry.episodes, int):
            return entry.episodes
        return 0

    def _status_label(self, status: str) -> str:
        labels = {
            "CURRENT": "Watching",
            "PLANNING": "Planning",
            "COMPLETED": "Completed",
            "DROPPED": "Dropped",
            "PAUSED": "Paused",
            "REPEATING": "Repeating",
        }
        return labels.get(status, status.replace("_", " ").title())

    def _year_bucket(self, entry: ProfileAnimeEntry) -> str:
        if not entry.year:
            return "Unknown"
        decade = (entry.year // 10) * 10
        return f"{decade}s"

    def _related_overlap(self, left: list[RelatedAnimeSummary], right: list[RelatedAnimeSummary]) -> list[RelatedAnimeSummary]:
        right_ids = {item.id for item in right}
        return [item for item in left if item.id in right_ids]

    def _average_numeric(self, anime: list[RelatedAnimeSummary], field: str) -> float | None:
        values = [getattr(item, field) for item in anime]
        numeric_values = [value for value in values if isinstance(value, (int, float))]
        if not numeric_values:
            return None
        return round(sum(numeric_values) / len(numeric_values), 1)

    def _top_anime_label(self, anime: list[RelatedAnimeSummary]) -> str | None:
        if not anime:
            return None
        top = max(anime, key=lambda item: item.popularity or 0)
        return top.titleEnglish or top.titleRomaji

    def _main_studio_count(self, anime: list[RelatedAnimeSummary]) -> int:
        return sum(1 for item in anime if item.isMain is True)

    def _role_count(self, anime: list[RelatedAnimeSummary]) -> int:
        return sum(max(1, len(item.roles)) for item in anime)

    def _top_roles(self, anime: list[RelatedAnimeSummary]) -> str | None:
        counts: dict[str, int] = {}
        for item in anime:
            for role in item.roles:
                counts[role] = counts.get(role, 0) + 1
        if not counts:
            return None
        return " / ".join(role for role, _ in sorted(counts.items(), key=lambda item: (item[1], item[0]), reverse=True)[:3])

    def _staff_count(self, session: Session, anime_id: int) -> int:
        return len({role.staff_id for role in session.exec(select(AnimeStaffRole).where(AnimeStaffRole.anime_id == anime_id)).all()})

    def _studio_count(self, session: Session, anime_id: int) -> int:
        return len({role.studio_id for role in session.exec(select(AnimeStudio).where(AnimeStudio.anime_id == anime_id)).all()})

    def _voice_actor_count(self, session: Session, anime_id: int) -> int:
        return len({role.voice_actor_id for role in session.exec(select(AnimeVoiceActorRole).where(AnimeVoiceActorRole.anime_id == anime_id)).all()})


def anime_to_detail(anime: Anime) -> AnimeDetail:
    return AnimeDetail(
        id=anime.id,
        titleRomaji=anime.title_romaji,
        titleEnglish=anime.title_english,
        titleNative=anime.title_native,
        coverImageUrl=anime.cover_image_url,
        bannerImageUrl=anime.banner_image_url,
        year=anime.year,
        format=anime.format,
        episodes=anime.episodes,
        status=anime.status,
        description=anime.description,
        siteUrl=anime.site_url,
        averageScore=anime.average_score,
        popularity=anime.popularity,
        favourites=anime.favourites,
        staffFetchedAt=anime.staff_fetched_at,
        studiosFetchedAt=anime.studios_fetched_at,
        voiceCastFetchedAt=anime.voice_cast_fetched_at,
        updatedAt=anime.updated_at,
    )


def included_staff_roles(session: Session, anime_id: int, role_filters: list[str] | None) -> list[AnimeStaffRole]:
    roles = session.exec(select(AnimeStaffRole).where(AnimeStaffRole.anime_id == anime_id)).all()
    return [role for role in roles if role_is_included(role.role_category, role.role, role_filters)]
