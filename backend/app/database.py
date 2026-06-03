from collections.abc import Generator
from pathlib import Path
import os

from sqlmodel import Session, SQLModel, create_engine


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "anime_cache.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")

if DATABASE_URL.startswith("sqlite:///"):
    db_path = Path(DATABASE_URL.removeprefix("sqlite:///"))
    db_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
