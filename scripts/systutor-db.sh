#!/bin/bash
set -euo pipefail

if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  . .venv/bin/activate
else
  echo "Falta .venv — ejecuta primero el instalador" >&2
  exit 1
fi

export SYSTUTOR_DATABASE_URL="${SYSTUTOR_DATABASE_URL:-postgresql+psycopg://postgres:postgres@localhost:5432/librefact}"
export SYSTUTOR_PLUGINS_DIR="${SYSTUTOR_PLUGINS_DIR:-$PWD/plugins}"
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$PWD"

cd vendor/systutor-core

python3 - <<'PY'
from psycopg import connect, sql
from sqlalchemy import text
from sqlalchemy.engine import make_url

from systutor.core.config import get_settings
from systutor.core.database import build_session_factory, check_database_connection

settings = get_settings()
url = make_url(settings.database_url)

if url.get_backend_name() != "postgresql":
    print(f"[systutor] DB: esquema {url.get_backend_name()} no soportado para auto-creación, omito")
else:
    if not url.database:
        raise SystemExit("[systutor] DB: la URL no tiene nombre de base")

    target_db = url.database

    connect_kwargs = {
        "dbname": "postgres",
        "user": url.username,
        "password": url.password,
        "host": url.host,
        "port": url.port,
    }

    with connect(**{key: value for key, value in connect_kwargs.items() if value is not None}) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target_db,))
            if cur.fetchone() is None:
                cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(target_db)))
                print(f"[systutor] DB: base creada {target_db}")
            else:
                print(f"[systutor] DB: base existente {target_db}")
PY

alembic upgrade head

python3 - <<'PY'
from sqlalchemy import text

from systutor.core.config import get_settings
from systutor.core.database import build_session_factory, check_database_connection

settings = get_settings()
session_factory = build_session_factory(settings)
check_database_connection(session_factory)

with session_factory() as session:
    session.execute(text("SELECT version_num FROM alembic_version"))

print("[systutor] DB: migraciones aplicadas y validadas")
PY

python3 - <<'PY'
from app.main import app
from systutor.api.seed import seed_demo_data
from systutor.core.database import build_session_factory

settings = app.state.settings
with build_session_factory(settings)() as db:
    print(seed_demo_data(db, settings, app.state.plugin_runtime.list_results()))
PY
