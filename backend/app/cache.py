from __future__ import annotations

from datetime import timedelta

from fastapi import HTTPException
from sqlmodel import Session, delete, select

from app.anilist import AniListClient, AniListError
from app.models import Anime, AnimeStaffRole, AnimeStudio, AnimeVoiceActorRole, Staff, Studio, VoiceActor, utc_now
from app.schemas import AnimeDetail, AnimeSearchResult, RefreshResponse
from app.scoring import role_is_included, score_role, studio_weight


CACHE_TTL = timedelta(days=7)


class AnimeCacheService:
    def __init__(self, client: AniListClient | None = None) -> None:
        self.client = client or AniListClient()

    async def search_anime(self, session: Session, query: str) -> list[AnimeSearchResult]:
        if len(query.strip()) < 2:
            return []
        try:
            results = await self.client.search_anime(query.strip())
        except AniListError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        for item in results:
            self._upsert_anime(session, item)
        session.commit()
        return [AnimeSearchResult(**item) for item in results]

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
