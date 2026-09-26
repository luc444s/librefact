"""Rampa de concurrencia contra la app, con sonda de conexiones a Postgres.

Responde la pregunta que un test de carga cliente-side no puede responder:
no solo CUANDO se degrada, sino POR QUE.

Estrategia: etapas de concurrencia creciente. En cada etapa dispara C requests
simultaneos durante N segundos, mide latencia y estado HTTP, y en paralelo una
sonda cuenta conexiones y `idle in transaction` en Postgres. Si el rate de error
supera el umbral, aborta el resto de la rampa.

Es READ-ONLY: solo pide endpoints GET. No muta datos.

Uso:
    .venv/bin/python scripts/loadtest_concurrency.py
    .venv/bin/python scripts/loadtest_concurrency.py --max 40 --stage-seconds 10
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import Counter
from dataclasses import dataclass, field

import httpx
import psycopg

DEFAULT_BASE = "http://127.0.0.1:8000"
DEFAULT_EMAIL = "admin@example.com"
DEFAULT_PASSWORD = "ChangeMe123!"
DEFAULT_DB = "postgresql://postgres:postgres@localhost:5432/librefact"

# Rango con reading asintetico barato; evita los endpoints de media y facturacion.
DISCOVERY_HINTS = ("/catalog/", "/products", "/branches", "/core/users")


@dataclass
class StageResult:
    concurrency: int
    requests: int = 0
    errors: int = 0
    timeouts: int = 0
    statuses: Counter[str] = field(default_factory=Counter)
    latencies_ms: list[float] = field(default_factory=list)
    peak_conns: int = 0
    peak_idle_in_txn: int = 0
    seconds: float = 0.0

    @property
    def ok_rate(self) -> float:
        return 1.0 if not self.requests else (self.requests - self.errors) / self.requests

    @property
    def rps(self) -> float:
        return self.requests / self.seconds if self.seconds else 0.0

    def pct(self, p: float) -> float:
        if not self.latencies_ms:
            return 0.0
        ordered = sorted(self.latencies_ms)
        idx = min(len(ordered) - 1, int(len(ordered) * p))
        return ordered[idx]


class ConnectionProbe(threading.Thread):
    """Sondea pg_stat_activity en background. Read-only."""

    def __init__(self, dsn: str, interval: float = 0.2) -> None:
        super().__init__(daemon=True)
        self.dsn = dsn
        self.interval = interval
        self.peak_conns = 0
        self.peak_idle_in_txn = 0
        self.samples: list[tuple[float, int, int]] = []
        self._stop = threading.Event()
        self.available = True

    def run(self) -> None:
        try:
            conn = psycopg.connect(self.dsn, connect_timeout=5, autocommit=True)
        except Exception as exc:  # pragma: no cover - depende del entorno
            print(f"  [sonda] no se pudo conectar a Postgres: {exc}", file=sys.stderr)
            self.available = False
            return
        try:
            with conn.cursor() as cur:
                while not self._stop.is_set():
                    cur.execute(
                        "select count(*), "
                        "count(*) filter (where state = 'idle in transaction') "
                        "from pg_stat_activity where datname = current_database()"
                    )
                    total, idle = cur.fetchone()
                    self.peak_conns = max(self.peak_conns, total)
                    self.peak_idle_in_txn = max(self.peak_idle_in_txn, idle)
                    self.samples.append((time.monotonic(), total, idle))
                    self._stop.wait(self.interval)
        finally:
            conn.close()

    def stop(self) -> None:
        self._stop.set()


def login(base: str, email: str, password: str) -> str:
    resp = httpx.post(
        f"{base}/api/v1/auth/login",
        json={"email": email, "password": password},
        timeout=15.0,
    )
    if resp.status_code != 200:
        raise SystemExit(f"login fallo: HTTP {resp.status_code} {resp.text[:200]}")
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        raise SystemExit(f"login sin token. claves: {sorted(data)}")
    return token


def discover_get_paths(
    base: str, token: str, limit: int = 6, only: str | None = None
) -> list[str]:
    """Lee /openapi.json y elige GETs baratos. Read-only.

    ``only`` restringe la seleccion a paths que contengan ese prefijo, lo que
    permite atribuir el consumo de conexiones a un plugin concreto en vez de
    medir el total global.
    """
    try:
        with urllib.request.urlopen(f"{base}/openapi.json", timeout=15) as fh:
            spec = json.load(fh)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise SystemExit(f"no se pudo leer /openapi.json: {exc}")

    def wanted(path: str) -> bool:
        if only and only not in path:
            return False
        if only:
            return "{" not in path and "get" in spec["paths"][path]
        return (
            "get" in spec["paths"][path]
            and "{" not in path
            and any(hint in path for hint in DISCOVERY_HINTS)
        )

    candidates = [path for path in spec.get("paths", {}) if wanted(path)]
    if not candidates:
        scope = f"con prefijo {only!r}" if only else "sin parametros de path"
        raise SystemExit(f"openapi.json no expone GETs {scope}")

    headers = {"Authorization": f"Bearer {token}"}
    chosen: list[str] = []
    for path in candidates:
        try:
            r = httpx.get(f"{base}{path}", headers=headers, timeout=15.0)
        except httpx.HTTPError:
            continue
        if 200 <= r.status_code < 400:
            chosen.append(path)
        if len(chosen) >= limit:
            break
    if not chosen:
        raise SystemExit("ningun GET candidato respondio 2xx/3xx")
    return chosen


async def worker(
    client: httpx.AsyncClient,
    paths: list[str],
    deadline: float,
    result: StageResult,
) -> None:
    idx = 0
    while time.monotonic() < deadline:
        path = paths[idx % len(paths)]
        idx += 1
        started = time.monotonic()
        try:
            resp = await client.get(path)
        except httpx.TimeoutException:
            result.timeouts += 1
            result.errors += 1
            result.statuses["timeout"] = result.statuses.get("timeout", 0) + 1
            continue
        except httpx.HTTPError as exc:
            result.errors += 1
            key = f"transport:{type(exc).__name__}"
            result.statuses[key] = result.statuses.get(key, 0) + 1
            continue
        result.requests += 1
        result.latencies_ms.append((time.monotonic() - started) * 1000)
        key = str(resp.status_code)
        result.statuses[key] = result.statuses.get(key, 0) + 1
        if resp.status_code >= 400:
            result.errors += 1


async def run_stage(
    base: str,
    token: str,
    paths: list[str],
    concurrency: int,
    seconds: float,
    timeout: float,
    keepalive: bool = True,
) -> StageResult:
    result = StageResult(concurrency=concurrency)
    headers = {"Authorization": f"Bearer {token}"}
    # uvicorn cierra las conexiones keepalive ociosas a los 5s
    # (timeout_keep_alive). Reusar una justo en ese momento produce
    # RemoteProtocolError, que es artefacto del cliente y no del servidor.
    pool = 0 if not keepalive else concurrency + 5
    limits = httpx.Limits(max_connections=concurrency + 5, max_keepalive_connections=pool)
    async with httpx.AsyncClient(
        base_url=base, headers=headers, timeout=timeout, limits=limits
    ) as client:
        started = time.monotonic()
        deadline = started + seconds
        await asyncio.gather(
            *(worker(client, paths, deadline, result) for _ in range(concurrency))
        )
        result.seconds = time.monotonic() - started
    return result


def report(result: StageResult, probe: ConnectionProbe) -> None:
    print(f"\n--- concurrencia {result.concurrency:>3} | {result.seconds:.1f}s ---")
    print(f"  requests   : {result.requests}  ({result.rps:.1f} rps)")
    print(f"  ok rate    : {result.ok_rate * 100:.1f}%   errors: {result.errors}  timeouts: {result.timeouts}")
    print(f"  latencia   : p50 {result.pct(0.50):7.1f}ms   p95 {result.pct(0.95):7.1f}ms   p99 {result.pct(0.99):7.1f}ms")
    if result.latencies_ms:
        print(f"  max        : {max(result.latencies_ms):7.1f}ms   media {statistics.fmean(result.latencies_ms):.1f}ms")
    if probe.available:
        print(f"  conexiones : pico {probe.peak_conns}   idle-in-transaction pico {probe.peak_idle_in_txn}")
    if result.statuses:
        print(f"  estados    : {dict(sorted(result.statuses.items()))}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Rampa de concurrencia con sonda de conexiones")
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--email", default=DEFAULT_EMAIL)
    ap.add_argument("--password", default=DEFAULT_PASSWORD)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--max", type=int, default=40, help="concurrencia maxima de la rampa")
    ap.add_argument("--stage-seconds", type=float, default=10.0)
    ap.add_argument("--request-timeout", type=float, default=35.0)
    ap.add_argument(
        "--start",
        type=int,
        default=35,
        help="concurrencia de la primera etapa (util para saltar la zona ya medida)",
    )
    ap.add_argument("--error-abort", type=float, default=0.05, help="corte de seguridad (ratio)")
    ap.add_argument(
        "--no-keepalive",
        action="store_true",
        help="desactiva el pool de conexiones del cliente (evita la carrera con timeout_keep_alive de uvicorn)",
    )
    ap.add_argument(
        "--only",
        default=None,
        help="restringe los endpoints a un prefijo de path (p.ej. /plugins/productos/) para atribuir conexiones a un plugin",
    )
    ap.add_argument(
        "--idle-threshold",
        type=int,
        default=0,
        help="code de salida 1 si el idle-in-transaction pico supera este valor (0 = no evaluar)",
    )
    ap.add_argument(
        "--require-ok-rate",
        type=float,
        default=None,
        help="code de salida 1 si alguna etapa baja de este ratio de ok (0..1)",
    )
    args = ap.parse_args()

    print(f"1. Login en {args.base} ...", flush=True)
    try:
        token = login(args.base, args.email, args.password)
    except SystemExit as exc:
        print(f"  FALLO: {exc}")
        print("  ¿La app esta corriendo?  npm run services")
        return 2
    print("   ok")

    print("2. Descubriendo endpoints GET ...", flush=True)
    paths = discover_get_paths(args.base, token, only=args.only)
    for p in paths:
        print(f"   - {p}")
    if not paths:
        return 2

    print("3. Sonda de conexiones ...", flush=True)
    probe = ConnectionProbe(args.db)
    probe.start()
    if not probe.available:
        print("   sin sonda: los picos de conexion no se podran atribuir al pool")
    else:
        time.sleep(0.4)
    print("   ok" if probe.available else "   (degradado)")

    print(f"\n4. Rampa 1 -> {args.max}, {args.stage_seconds:.0f}s por etapa")
    print("   Solo GET. Corta al primer stage con ratio de error sobre el umbral.\n")

    # Rampa geometrica: cubre el codo sin saltos grandes que mezclen etapas.
    if args.start < 1:
        print(f"--start debe ser >= 1 (recibido {args.start})")
        return 2
    if args.start > args.max:
        print(f"--start ({args.start}) no puede superar --max ({args.max})")
        return 2
    ramp = (1, 2, 5, 10, 20, 30, 40, 60, 80, 100, 150, 200, 300, 500, 800, 1200)
    stages = [args.start] + [c for c in ramp if args.start < c <= args.max]
    if stages[-1] != args.max:
        stages.append(args.max)

    results: list[StageResult] = []
    aborted = False
    for conc in stages:
        if aborted:
            break
        result = asyncio.run(
            run_stage(
                args.base,
                token,
                paths,
                conc,
                args.stage_seconds,
                args.request_timeout,
                keepalive=not args.no_keepalive,
            )
        )
        result.peak_conns = probe.peak_conns
        result.peak_idle_in_txn = probe.peak_idle_in_txn
        report(result, probe)
        results.append(result)
        if result.requests and result.errors / result.requests > args.error_abort:
            print(f"\n   CORTE: ratio de error {result.errors / result.requests:.1%} "
                  f"> {args.error_abort:.0%}. Rampa detenida.")
            aborted = True

    probe.stop()

    print("\n" + "=" * 68)
    print("RESUMEN")
    print("=" * 68)
    print(f"{'conc':>5} {'rps':>8} {'ok%':>7} {'p50 ms':>9} {'p95 ms':>9} {'p99 ms':>9} {'err':>5}")
    for r in results:
        print(f"{r.concurrency:>5} {r.rps:>8.1f} {r.ok_rate * 100:>6.1f}% "
              f"{r.pct(0.50):>9.1f} {r.pct(0.95):>9.1f} {r.pct(0.99):>9.1f} {r.errors:>5}")

    healthy = [r for r in results if r.ok_rate >= 0.95]
    if healthy:
        best = max(healthy, key=lambda r: r.rps)
        first_bad = next((r for r in results if r.ok_rate < 0.95), None)
        print(f"\n  Maximo sostenido sano : concurrencia {best.concurrency} "
              f"({best.rps:.1f} rps, {best.ok_rate * 100:.0f}% ok)")
        if first_bad:
            print(f"  Primer breakage       : concurrencia {first_bad.concurrency} "
                  f"({first_bad.ok_rate * 100:.0f}% ok)")
        if probe.available:
            peak = max(r.peak_conns for r in results)
            print(f"  Pico de conexiones    : {peak}  (QueuePool 5 + overflow 10 = 15 por worker)")

    if probe.samples:
        print(f"\n  Muestras de sonda: {len(probe.samples)}")

    # Umbrales duros: hacen FALLAR la ejecucion (exit 1) si no se cumplen.
    failures: list[str] = []
    if args.idle_threshold:
        worst = max((r.peak_idle_in_txn for r in results), default=0)
        verdict = "OK" if worst <= args.idle_threshold else "FALLA"
        print(f"\n  [umbral] idle-in-transaction pico {worst} <= {args.idle_threshold}: {verdict}")
        if worst > args.idle_threshold:
            failures.append(f"idle-in-transaction pico {worst} > {args.idle_threshold}")
    if args.require_ok_rate is not None:
        worst_ok = min((r.ok_rate for r in results), default=1.0)
        verdict = "OK" if worst_ok >= args.require_ok_rate else "FALLA"
        print(f"  [umbral] ok rate minimo {worst_ok:.3f} >= {args.require_ok_rate}: {verdict}")
        if worst_ok < args.require_ok_rate:
            failures.append(f"ok rate {worst_ok:.3f} < {args.require_ok_rate}")
    if failures:
        print("\n  VEREDICTO: FALLA -> " + "; ".join(failures))
        return 1
    if args.idle_threshold or args.require_ok_rate is not None:
        print("\n  VEREDICTO: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
