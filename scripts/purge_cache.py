#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from sqlmodel import Session, delete, func, select  # noqa: E402

from app.database import DATABASE_URL, engine, init_db  # noqa: E402
from app.models import Anime, AnimeStaffRole, AnimeStudio, Staff, Studio  # noqa: E402


TABLES = (AnimeStaffRole, AnimeStudio, Anime, Staff, Studio)


def table_count(session: Session, table: type) -> int:
    count = session.exec(select(func.count()).select_from(table)).one()
    return int(count)


def purge_cache(skip_confirmation: bool) -> None:
    init_db()

    with Session(engine) as session:
        counts = {table.__name__: table_count(session, table) for table in TABLES}
        total_rows = sum(counts.values())

        print(f"Database: {DATABASE_URL}")
        print("Rows to delete:")
        for table_name, count in counts.items():
            print(f"  {table_name}: {count}")

        if total_rows == 0:
            print("Cache is already empty.")
            return

        if not skip_confirmation:
            response = input("Purge all cached anime data? Type 'yes' to continue: ")
            if response.strip().lower() != "yes":
                print("Aborted.")
                return

        for table in TABLES:
            session.exec(delete(table))
        session.commit()

    print(f"Purged {total_rows} cached rows.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Purge the local anime database cache.")
    parser.add_argument("-y", "--yes", action="store_true", help="Skip confirmation prompt.")
    args = parser.parse_args()

    purge_cache(skip_confirmation=args.yes)


if __name__ == "__main__":
    main()
