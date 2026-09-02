import os
from pathlib import Path

import psycopg


def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            for migration_file in sorted(Path("migrations").glob("[0-9][0-9][0-9]_add_*.sql")):
                cursor.execute(migration_file.read_text(encoding="utf-8"))
        conn.commit()


if __name__ == "__main__":
    main()
