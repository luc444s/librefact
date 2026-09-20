# G4-BENCHMARKS

Measured on Motorola moto e15 (MT6769V, 1.8 GB RAM, Android 14, armv7). These
are first-run figures from a debug build on a low-end device; treat as
order-of-magnitude, not tuned numbers.

## Size

| Artifact | Size |
|---|---|
| `app-debug.apk` (built) | ~34 MB |
| Installed `base.apk` | 33,922,916 B (~33.9 MB) |
| `assets/pgsupport.zip` (seed + share) | 5.36 MB compressed |
| PGDATA seed (uncompressed) | ~39 MB |
| `share/postgresql` | 3.6 MB |
| Largest native lib | `libicudata.so` 33.1 MB |

Biggest lever: dropping ICU (`--with-icu=no`, with a libc/`C` locale) removes
~33–38 MB; requires verifying bionic locale behaviour.

## Memory (idle, after startup)

| Process | RSS |
|---|---|
| `libpostgres.so` (postmaster) | ~11.5 MB |
| each backend / worker | ~4 MB |
| total (~9 processes) | ~50 MB |

## Timing

| Phase | Observed |
|---|---|
| Asset extraction (first launch) | ~8 s |
| Server ready after spawn | ~1 s |
| First `libpq` client connect | ~15 s (unexplained; low-end device — needs profiling) |
| Subsequent connects | sub-second |

## Native inventory

`lib/armeabi-v7a/` (12 libs) + system: see `G4-AUDIT.md`. All executable code and
shared libraries are extracted to `nativeLibraryDir` (legacy packaging);
execution confirmed under `untrusted_app`.

## To measure next

- Release build (`assembleRelease`, minified, no debug) sizes and timings.
- `shared_buffers` / cache-hit tradeoffs on 1.8 GB RAM.
- 16 KB page device behaviour.
- Battery / Doze impact once a foreground service exists.
