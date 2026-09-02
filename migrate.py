import os
from pathlib import Path

import psycopg


def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return
    migration = Path("migrations/002_add_tutor_nombre_to_turnos.sql").read_text(encoding="utf-8")
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute(migration)
        conn.commit()


if __name__ == "__main__":
    main()
