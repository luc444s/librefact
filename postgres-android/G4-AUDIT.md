# G4-AUDIT — PostgreSQL 18 Server in a normal Android APK

Audit of the environment, target, dependencies, and design decisions taken
before building. Device: **Motorola moto e15** (`lamulg_g`), MediaTek MT6769V.

## Toolchain

| Item | Value |
|---|---|
| Host | Linux x86_64 |
| JDK | Temurin 17.0.20.1 |
| Gradle | 8.9 |
| Android Gradle Plugin | 8.7.0 |
| Android SDK | platform 34, build-tools 34.0.0 |
| Android NDK | r27d |
| compileSdk / targetSdk | 34 / 34 |
| minSdk | 26 (`postgres-app`), 24 (`exec-probe`) |
| Target ABI | `armeabi-v7a` (`armv7a-linux-androideabi`) |
| PostgreSQL | 18.2 (Termux prebuilt `.deb`s, recon) |
| Linker | `/system/bin/linker` (32-bit) |
| libc | Bionic |

## Device

| Item | Value |
|---|---|
| SoC | MediaTek MT6769V/CB (Helio G85, 64-bit silicon) |
| Android | 14 (SDK 34), security patch 2026-08-05 |
| ABI | `armeabi-v7a` only (`abilist64` empty, `ro.zygote=zygote32`) |
| SELinux | Enforcing |
| Root | none |
| RAM | 1.8 GB |
| Page size | 4 KB |
| Free `/data` | ~13 GB |

**Why armv7:** the target plan prefers `arm64-v8a`, but this device's userspace
is 32-bit. Termux ships PostgreSQL 18.2 for `binary-arm`, so the experiment was
re-scoped to armv7 with the user's approval. arm64 remains the production
target.

## PostgreSQL runtime dependency closure (`postgres`)

Shipped (normalized to `lib*.so`):

| NEEDED (original) | Shipped as | Notes |
|---|---|---|
| `libxml2.so.16` | `libxml2.so` | versioned SONAME |
| `libssl.so.3` | `libssl.so` | needs static-link or rewrite |
| `libcrypto.so.3` | `libcrypto.so` | |
| `libz.so.1` | `libz.so` | |
| `libicui18n.so.78` | `libicui18n.so` | ICU (~5.6 MB) |
| `libicuuc.so.78` | `libicuuc.so` | |
| `libicudata.so.78` | `libicudata.so` | ~33 MB, biggest single file |
| `libandroid-execinfo.so` | same | |
| `libandroid-shmem.so` | same | **rebuilt** (memfd + `$TMPDIR`) |
| `libiconv.so` | same | |
| `libc++_shared.so` | same | |
| `libm.so`, `libc.so`, `libdl.so`, `liblog.so` | system | not shipped |

`libpq.so` (client) needs `libssl`, `libcrypto`, `libm`, `libc`.

## Required PostgreSQL resource directories

Baked prefix in the Termux build is `/data/data/com.termux/files/usr`. Required
at runtime: `share/postgresql` (timezone, timezonesets, tsearch_data, extension
misc). The G4 rewrites the baked prefix to the app data path (same length) and
mirrors `share/postgresql/*` into `<prefix>/usr/` because the runtime resolved
the timezone directory as `<prefix>/usr/timezone`.

## Shared memory and semaphores

- Main shared memory / DSM: PostgreSQL on `__ANDROID__` uses `mmap` for dynamic
  shared memory. SysV IPC syscalls are filtered by Android seccomp for app
  processes, so the SysV shim (`libandroid-shmem`) is required for the main
  segment in this Termux build.
- Fixed shim: `memfd_create()` (plain syscall) + `$TMPDIR`-derived key
  directory. See `postgres-build/patches/`.
- Semaphores: `USE_UNNAMED_POSIX_SEMAPHORES` (bionic provides POSIX semaphores).

## Locations

| Item | Location |
|---|---|
| Executable code / `.so` | `applicationInfo.nativeLibraryDir` (extracted native libs) |
| PGDATA | `context.filesDir/pgdata` |
| share / etc | `context.filesDir/usr/...` |
| TMPDIR | `context.filesDir/tmp` |
| Endpoint | `127.0.0.1:54329`, `unix_socket_directories=` empty |

## SELinux / Android constraints (verified, see G4-RESULTS)

- `execve` of a PIE from `nativeLibraryDir` works under `u:r:untrusted_app`.
- `execve` from `filesDir` is denied (`EACCES`, error 13).
- `LD_LIBRARY_PATH=nativeLibraryDir` resolves custom shared libraries.
- AGP packages only files matching `lib*.so`; versioned names are dropped.

## Licensing

- PostgreSQL License (permissive).
- `libandroid-shmem`: BSD-3; patch independently authored here.
- Cairn (`poc/pg-android-kit`): **AGPL-3.0** — studied as prior art only, not copied.
- Oliphaunt: **MIT** — studied as prior-art architecture.
- Termux packages: PostgreSQL license (used as recon binaries).
- OpenSSL 3: Apache-2.0; ICU: Unicode License.

See `THIRD_PARTY_NOTICES.md`.
