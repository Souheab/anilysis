from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Anime(SQLModel, table=True):
    id: int = Field(primary_key=True)
    title_romaji: str
    title_english: str | None = None
    title_native: str | None = None
    cover_image_url: str | None = None
    banner_image_url: str | None = None
    year: int | None = None
    format: str | None = None
    episodes: int | None = None
    status: str | None = None
    description: str | None = None
    site_url: str | None = None
    average_score: int | None = None
    popularity: int | None = None
    favourites: int | None = None
    staff_fetched_at: datetime | None = None
    studios_fetched_at: datetime | None = None
    voice_cast_fetched_at: datetime | None = None
    updated_at: datetime = Field(default_factory=utc_now)


class Staff(SQLModel, table=True):
    id: int = Field(primary_key=True)
    name_full: str
    name_native: str | None = None
    image_url: str | None = None
    site_url: str | None = None
    favourites: int | None = None
    updated_at: datetime = Field(default_factory=utc_now)


class Studio(SQLModel, table=True):
    id: int = Field(primary_key=True)
    name: str
    site_url: str | None = None
    favourites: int | None = None
    updated_at: datetime = Field(default_factory=utc_now)


class VoiceActor(SQLModel, table=True):
    id: int = Field(primary_key=True)
    name_full: str
    name_native: str | None = None
    image_url: str | None = None
    site_url: str | None = None
    favourites: int | None = None
    updated_at: datetime = Field(default_factory=utc_now)


class AnimeStaffRole(SQLModel, table=True):
    anime_id: int = Field(foreign_key="anime.id", primary_key=True)
    staff_id: int = Field(foreign_key="staff.id", primary_key=True)
    role: str = Field(primary_key=True)
    role_category: str
    weight: float
    updated_at: datetime = Field(default_factory=utc_now)


class AnimeStudio(SQLModel, table=True):
    anime_id: int = Field(foreign_key="anime.id", primary_key=True)
    studio_id: int = Field(foreign_key="studio.id", primary_key=True)
    is_main: bool = False
    weight: float = 3.5
    updated_at: datetime = Field(default_factory=utc_now)


class AnimeVoiceActorRole(SQLModel, table=True):
    anime_id: int = Field(foreign_key="anime.id", primary_key=True)
    voice_actor_id: int = Field(foreign_key="voiceactor.id", primary_key=True)
    character_name: str = Field(primary_key=True)
    character_image_url: str | None = None
    role_category: str = "voice_actor"
    weight: float = 3.0
    updated_at: datetime = Field(default_factory=utc_now)


class ApiCacheEntry(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value_json: str
    expires_at: datetime
    updated_at: datetime = Field(default_factory=utc_now)
