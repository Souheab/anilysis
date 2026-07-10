from contextlib import asynccontextmanager
from pathlib import Path
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.database import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Anime Analysis API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

static_dir = os.getenv("ANIMEANALYSIS_STATIC_DIR")
if static_dir:
    static_path = Path(static_dir)
    if not static_path.is_dir():
        raise RuntimeError(f"Static frontend directory does not exist: {static_path}")
    # Mount last so that the API routes above always take precedence. html=True
    # also serves index.html for the root of the single-page application.
    app.mount("/", StaticFiles(directory=static_path, html=True), name="frontend")
