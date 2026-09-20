# postgres-app — PostgreSQL 18 server APK

Minimal Android app that runs a real PostgreSQL 18 server from
`nativeLibraryDir`, with `PGDATA` in private storage, bound to
`127.0.0.1:54329` (TCP only), and exercises it through the PostgreSQL wire
protocol with a native `libpq` client.

## What it does on launch

1. Extracts `assets/pgsupport.zip` into `filesDir` (`pgdata/`, `usr/share/...`).
2. Applies restrictive permissions and writes a loopback `trust` `pg_hba.conf`.
3. Starts `libpostgres.so` with `listen_addresses=127.0.0.1`, `port=54329`,
   `unix_socket_directories=`.
4. Waits for the "ready to accept connections" log line.
5. Runs `libg4sql.so` (libpq): `select version()`, `select 1`, create/insert/
   select on `g4_apk_test`.
6. Stops, restarts, and re-selects to prove persistence.

All output goes to logcat tag `G4PG` and to the on-screen text.

## Prerequisites

- Android SDK (platform 34, build-tools 34), JDK 17, Gradle 8.9, Android NDK.
- A staged Termux PostgreSQL prefix, a fixed `libandroid-shmem.so`, a seed tar,
  and a share dir — all produced by the scripts in `../../postgres-build/` and
  `../../pg-seed/`. See `../../README.md` for the full sequence.

## Build

```sh
cp local.properties.example local.properties   # set sdk.dir
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb logcat -s G4PG
```

Generated artifacts (`jniLibs/**/*.so`, `assets/*.zip`) are git-ignored and must
be produced by the scripts.

## Notes / known caveats

- `jniLibs` must contain only `lib*.so` names; AGP drops anything else.
- The app uses loopback `trust` auth for the experiment only — not production.
- The Termux prefix rewrite in `normalize-android-libs.py` is a reconnaissance
  device; production should use a from-source build with a deliberate prefix.
