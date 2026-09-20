import sys
import platform
import threading
import time
import urllib.request


def _pydantic_probe():
    import pydantic
    from pydantic import BaseModel

    class M(BaseModel):
        x: int

    return "pydantic {} OK (validate={})".format(pydantic.VERSION, M(x=1).x)


def _fastapi_probe():
    import fastapi
    import uvicorn

    app = fastapi.FastAPI()

    @app.get("/ping")
    def ping():
        return {"pong": True}

    config = uvicorn.Config(app, host="127.0.0.1", port=8765, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.time() + 20
    last_err = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen("http://127.0.0.1:8765/ping", timeout=2) as r:
                body = r.read().decode()
            server.should_exit = True
            return "fastapi {} / uvicorn {} OK ({})".format(
                fastapi.__version__, uvicorn.__version__, body)
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(0.5)
    server.should_exit = True
    raise RuntimeError("uvicorn self-request failed: {!r}".format(last_err))


def _sqlalchemy_probe():
    import sqlalchemy
    import pg8000

    engine = sqlalchemy.create_engine("postgresql+pg8000://user:pass@127.0.0.1:54329/db")
    return "sqlalchemy {} + pg8000 {} OK (dialect={})".format(
        sqlalchemy.__version__, pg8000.__version__, engine.dialect.name)


def probe():
    lines = [
        "Python {} | {} | {} | {}".format(
            sys.version.split()[0],
            platform.machine(),
            platform.system(),
            sys.maxsize > 2 ** 32 and "64bit" or "32bit",
        )
    ]
    for fn in (_pydantic_probe, _fastapi_probe, _sqlalchemy_probe):
        try:
            lines.append(fn())
        except Exception as exc:  # noqa: BLE001
            lines.append("{} FAIL: {!r}".format(fn.__name__, exc))
    return "\n".join(lines)
