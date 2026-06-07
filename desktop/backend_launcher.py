from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn


def _add_backend_to_path() -> None:
    backend_dir = Path(__file__).resolve().parents[1] / "backend"
    if backend_dir.exists():
        sys.path.insert(0, str(backend_dir))


def main() -> None:
    _add_backend_to_path()

    host = os.getenv("BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("BACKEND_PORT", "8000"))

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=False,
        access_log=False,
    )


if __name__ == "__main__":
    main()

