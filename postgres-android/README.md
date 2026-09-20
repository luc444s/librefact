# postgres-android

Reusable **PostgreSQL 18 Server for Android**, packaged as a normal (non-root,
non-Termux, non-VM) APK. This directory is self-contained and independent from
SYSTUTOR; the goal is a reusable `postgres-android-<abi>` runtime.

## Status

> **FROZEN — 2026-09-20.** The G4 milestone is complete and this directory is the
> durable record. Do not start new work here without unfreezing. To resume:
> re-install the toolchain (JDK 17, Android SDK 34, NDK r27d, Gradle 8.9),
> re-stage the prefix and rebuild the seed — see *Quick start* below. Generated
> binaries and staged prefixes are intentionally **not** committed.

**G4 PASS** on Android 14 / armv7 (MediaTek MT6769V), running under
`u:r:untrusted_app`, with `PGDATA` in private app storage, TCP-only on
`127.0.0.1:54329`, real wire protocol via `libpq`, and persistence across
restart. See [`G4-RESULTS.md`](G4-RESULTS.md).

Scope caveat: this G4 used **Termux prebuilt binaries** plus a length-preserving
prefix rewrite for reconnaissance. The production artifact should be a
**from-source** build with a deliberate Android prefix. See G4-RESULTS for the
gaps.

## Layout

```
postgres-android/
├── G4-AUDIT.md              # toolchain, ABI, library inventory, decisions
├── G4-RESULTS.md            # gates, evidence, findings, remaining gaps
├── G4-BENCHMARKS.md         # sizes, RSS, timings
├── THIRD_PARTY_NOTICES.md   # licensing (Cairn AGPL, Oliphaunt MIT, ...)
├── postgres-build/          # stage + normalize Termux binaries; shmem patch
├── pg-seed/                 # build the PGDATA seed template
└── android-g4/
    ├── exec-probe/          # minimal APK proving native exec/link under untrusted_app
    └── postgres-app/        # the real PostgreSQL APK
```

## Quick start (recon path)

```sh
# 1. Stage a Termux PostgreSQL prefix for the target ABI
python3 postgres-build/stage-termux-prefix.py armeabi-v7a /tmp/pgwork

# 2. Build the stock-device-portable shared-memory shim
ANDROID_NDK=/path/to/ndk \
  postgres-build/build-libandroid-shmem.sh armeabi-v7a /tmp/pgwork/fixed-shmem.so

# 3. Normalize libraries into jniLibs (rename + rewrite SONAMEs/prefixed paths)
python3 postgres-build/normalize-android-libs.py \
  --prefix /tmp/pgwork/prefix --shmem /tmp/pgwork/fixed-shmem.so \
  --out android-g4/postgres-app/app/src/main/jniLibs/armeabi-v7a \
  --new-prefix /data/data/com.g4pg/files/usr

# 4. Build the seed (needs a device/emulator with the staged prefix) and assets
pg-seed/build-seed.sh <serial> /data/local/tmp/prefix /tmp/pgdata-seed.tar icu
python3 android-g4/postgres-app/scripts/prepare-assets.py \
  --seed-tar /tmp/pgdata-seed.tar \
  --share-dir /tmp/pgwork/prefix/share/postgresql \
  --out android-g4/postgres-app/app/src/main/assets/pgsupport.zip

# 5. Compile the native libpq client and build the APK
ANDROID_NDK=/path/to/ndk \
  android-g4/postgres-app/scripts/build-native.sh armeabi-v7a \
  /tmp/pgwork/prefix android-g4/postgres-app/app/src/main/jniLibs/armeabi-v7a
cd android-g4/postgres-app && ./gradlew :app:assembleDebug
```

## Production direction (not done here)

1. **Build PostgreSQL from source** for the target ABI with a deliberate prefix
   (ideally a small source patch so `get_share_path`/`find_other_exec` honour an
   environment-provided base path), instead of rewriting the Termux prefix.
2. **Static/merged runtime**: avoid versioned SONAMEs and non-`lib*.so`
   extension modules (see `G4-RESULTS.md` finding #2 and #6). Consider a static
   extension registry as done by Oliphaunt.
3. **Lifecycle**: a foreground service (or equivalent) so the server survives
   Android killing the hosting app.
4. **Security**: SCRAM password bootstrap, `dataExtractionRules` to keep
   `PGDATA` out of Auto Backup.
5. **16 KB page devices**: build with `-Wl,-z,max-page-size=16384` and test.

## Licensing

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Do **not** copy Cairn's
AGPL scripts or patches into a distributed product; this project ships only an
independently authored shmem portability patch.
