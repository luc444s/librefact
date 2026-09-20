import io
import json
import os
import sys
import threading
import time
import urllib.request
from contextlib import redirect_stdout
from pathlib import Path

API_PREFIX = "/api/v1"
PORT = 8000
PG_DSN = "postgresql+psycopg://postgres@127.0.0.1:54329/postgres"
PG_LIBPQ = "postgresql://postgres@127.0.0.1:54329/postgres"

PLUGIN_ORDER = [
    "configuracion",
    "productos",
    "crm",
    "stock",
    "ventas",
    "compras",
    "pos",
]


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
    with urllib.request.urlopen(request, timeout=10) as response:
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


def _fix_pg_paths(files_dir, lines):
    """The G4 binaries have a broken pkglibdir, so $libdir does not resolve.

    Rewrite extension scripts to absolute paths and point the plpgsql handler
    at the bundled module, so CREATE EXTENSION and DO blocks work.
    """
    lib_dir = str(Path(files_dir) / "usr" / "lib" / "postgresql")
    ext_dirs = [
        Path(files_dir) / "usr" / "extension",
        Path(files_dir) / "usr" / "share" / "postgresql" / "extension",
    ]
    patched = 0
    for ext_dir in ext_dirs:
        if not ext_dir.is_dir():
            continue
        for path in list(ext_dir.glob("*.sql")) + list(ext_dir.glob("*.control")):
            text = path.read_text(encoding="utf-8", errors="ignore")
            if "$libdir" in text:
                path.write_text(text.replace("$libdir", lib_dir), encoding="utf-8")
                patched += 1

    import psycopg

    with psycopg.connect(PG_LIBPQ) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE pg_proc SET probin = %s WHERE probin = %s",
                (lib_dir + "/plpgsql", "$libdir/plpgsql"),
            )
            updated = cur.rowcount
        conn.commit()

    lines.append("pg paths fixed | scripts={} plpgsql_probin={}".format(patched, updated))


def _enable_plugins(settings, session_factory, lines):
    from systutor.core.config import Settings  # noqa: F401
    from systutor.kernel.audit.service import record_audit
    from systutor.kernel.events.bus import EventBus
    from systutor.kernel.plugins.persistent import (
        enable_plugin,
        get_plugin_registry_record_by_plugin_id,
        sync_plugin_registry_state,
    )
    from systutor.kernel.plugins.runtime import PluginManifestRegistry
    from systutor.kernel.tasks.dispatcher import build_task_dispatcher
    from systutor.sdk import PluginContext

    registry = PluginManifestRegistry(settings.plugins_dir)
    registry.discover()
    lines.append("plugins discovered: {}".format(
        ", ".join(sorted(p.plugin_id for p in registry.discovered())) or "(none)"))

    event_bus = EventBus()
    task_dispatcher = build_task_dispatcher(settings)

    def context_builder(manifest):
        return PluginContext(
            manifest,
            config=settings,
            event_bus=event_bus,
            audit_service=record_audit,
            db_session_provider=session_factory,
            task_dispatcher=task_dispatcher,
        )

    with session_factory() as db:
        sync_plugin_registry_state(db, registry=registry)
        for plugin_id in PLUGIN_ORDER:
            existing = get_plugin_registry_record_by_plugin_id(db, plugin_id=plugin_id)
            if existing is not None and existing.state == "enabled":
                lines.append("plugin {} -> already enabled".format(plugin_id))
                continue
            try:
                record = enable_plugin(
                    db,
                    registry=registry,
                    plugin_id=plugin_id,
                    context_builder=context_builder,
                )
                lines.append("plugin {} -> {} migration={}".format(
                    plugin_id, record.state, record.migration_version))
            except Exception as exc:  # noqa: BLE001
                lines.append("plugin {} FAIL: {!r}".format(plugin_id, exc))
        db.commit()


def _seed_products(files_dir, lines):
    csv_path = Path(files_dir) / "seed_productos.csv"
    if not csv_path.exists():
        lines.append("products seed: csv missing")
        return

    import psycopg

    with psycopg.connect(PG_LIBPQ) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM prod_products")
            existing = cur.fetchone()[0]
    if existing:
        lines.append("products seed skipped | existing={}".format(existing))
        return

    import g5_products_importer as importer

    argv = sys.argv
    sys.argv = [
        "g5_products_importer",
        "--input", str(csv_path),
        "--database-url", PG_LIBPQ,
    ]
    buffer = io.StringIO()
    try:
        with redirect_stdout(buffer):
            rc = importer.main()
    finally:
        sys.argv = argv

    report = buffer.getvalue().strip().splitlines()
    lines.append("products seed rc={} | {}".format(rc, " ".join(report[-8:])))


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
        if files_dir not in sys.path:
            sys.path.insert(0, files_dir)
        settings = _settings(files_dir)

        lines.append(_pg_probe())

        from systutor.core.database import Base, build_engine, build_session_factory

        engine = build_engine(settings)
        Base.metadata.create_all(bind=engine)
        session_factory = build_session_factory(settings)

        _fix_pg_paths(files_dir, lines)
        _enable_plugins(settings, session_factory, lines)

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
        lines.append("PORT {} listening".format(PORT))

        threading.Thread(
            target=_post_start, args=(files_dir, settings), daemon=True
        ).start()
    except Exception as exc:  # noqa: BLE001
        import traceback

        lines.append("G5 CORE FAIL: {!r}".format(exc))
        lines.append(traceback.format_exc())

    return "\n".join(lines)


def _post_start(files_dir, settings):
    """Background work: product seed + diagnostics, after the UI is served."""
    lines = []
    try:
        _seed_products(files_dir, lines)

        ready = _http("GET", "/system/ready")
        lines.append("ready OK | db_connected={} plugins={}".format(
            ready["database_connected"], ready["plugins_loaded"]))

        login = _http("POST", "/auth/login", payload={
            "email": settings.seed_admin_email,
            "password": settings.seed_admin_password,
        })
        token = login["access_token"]
        lines.append("login OK | user={} perms={}".format(
            login["user"]["email"], len(login["user"]["permissions"])))

        runtime = _http("GET", "/system/plugin-runtime", token=token)
        enabled = sorted(r["plugin_id"] for r in runtime if r["state"] == "enabled")
        lines.append("plugin-runtime enabled={} [{}]".format(len(enabled), ", ".join(enabled)))

        products = _http("GET", "/plugins/productos/products?limit=1", token=token)
        lines.append("productos API OK | total={}".format(products["total"]))

        users = _http("GET", "/users", token=token)
        lines.append("users OK | count={}".format(len(users)))

        with urllib.request.urlopen("http://127.0.0.1:{}/".format(PORT), timeout=5) as resp:
            html = resp.read().decode("utf-8", "replace")
        lines.append("index OK | SYSTUTOR={}".format("SYSTUTOR" in html))
    except Exception as exc:  # noqa: BLE001
        lines.append("G5 POST FAIL: {!r}".format(exc))

    for line in lines:
        print("[G5POST] " + line)
