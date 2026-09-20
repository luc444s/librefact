import json
import os
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

API_PREFIX = "/api/v1"
PORT = 8000
PG_DSN = "postgresql+psycopg://postgres@127.0.0.1:54329/postgres"


def _http(method, path, token=None, payload=None):
    url = "http://127.0.0.1:{}{}{}".format(PORT, API_PREFIX, path)
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer {}".format(token)
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=5) as response:
        body = response.read().decode("utf-8")
    return json.loads(body) if body else None


def _wait_ready(deadline):
    last_err = None
    while time.time() < deadline:
        try:
            return _http("GET", "/system/health")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(0.5)
    raise RuntimeError("server not ready: {!r}".format(last_err))


def _settings(files_dir):
    from systutor.core.config import Settings

    os.environ.setdefault("SYSTUTOR_DATABASE_URL", PG_DSN)
    os.environ.setdefault("SYSTUTOR_PLUGINS_DIR", os.path.join(files_dir, "plugins"))
    os.environ.setdefault("SYSTUTOR_REDIS_URL", "")
    os.environ.setdefault("SYSTUTOR_JWT_SECRET_KEY", "g5-android-secret")

    return Settings(
        app_name="SYSTUTOR Android",
        env="local",
        version="0.1.0-g5",
        log_level="WARNING",
        database_url=PG_DSN,
        redis_url="",
        plugins_dir=Path(files_dir) / "plugins",
        jwt_secret_key="g5-android-secret",
    )


def _pg_probe():
    import psycopg

    with psycopg.connect(
        "host=127.0.0.1 port=54329 dbname=postgres user=postgres", connect_timeout=5
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("select version()")
            version = cur.fetchone()[0]
    return "psycopg {} -> {}".format(psycopg.__version__, version)


def _mount_spa(app, web_dir):
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    index = web_dir / "index.html"
    if not index.exists():
        return False

    assets = web_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="webapp-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        candidate = web_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(index))

    return True


def run(files_dir):
    lines = []
    try:
        os.environ.setdefault("PSYCOPG_IMPL", "python")
        settings = _settings(files_dir)

        lines.append(_pg_probe())

        from systutor.core.database import Base, build_engine

        engine = build_engine(settings)
        Base.metadata.create_all(bind=engine)

        from app.main import create_app
        from systutor.api.seed import seed_demo_data

        app = create_app(settings)
        with app.state.session_factory() as db:
            seed = seed_demo_data(db, settings, app.state.plugin_runtime.list_results())
        lines.append("core boot OK | app={} | tenant={}".format(
            settings.app_name, seed["tenant_id"]))

        web_dir = Path(files_dir) / "webapp"
        if _mount_spa(app, web_dir):
            lines.append("spa served from {}".format(web_dir))
        else:
            lines.append("spa NOT found at {}".format(web_dir))

        import uvicorn

        config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
        server = uvicorn.Server(config)
        threading.Thread(target=server.run, daemon=True).start()

        health = _wait_ready(time.time() + 30)
        lines.append("health OK | {} {}".format(health["status"], health["version"]))

        ready = _http("GET", "/system/ready")
        lines.append("ready OK | db_connected={} plugins={}".format(
            ready["database_connected"], ready["plugins_loaded"]))

        login = _http("POST", "/auth/login", payload={
            "email": settings.seed_admin_email,
            "password": settings.seed_admin_password,
        })
        lines.append("login OK | user={} perms={}".format(
            login["user"]["email"], len(login["user"]["permissions"])))

        me = _http("GET", "/auth/me", token=login["access_token"])
        lines.append("me OK | {} @ {}".format(me["full_name"], me["tenant_name"]))

        users = _http("GET", "/users", token=login["access_token"])
        lines.append("users OK | count={}".format(len(users)))

        with urllib.request.urlopen("http://127.0.0.1:{}/".format(PORT), timeout=5) as resp:
            html = resp.read().decode("utf-8", "replace")
        lines.append("index OK | SYSTUTOR={}".format("SYSTUTOR" in html))

        lines.append("PORT {} listening".format(PORT))
    except Exception as exc:  # noqa: BLE001
        import traceback

        lines.append("G5 CORE FAIL: {!r}".format(exc))
        lines.append(traceback.format_exc())

    return "\n".join(lines)
