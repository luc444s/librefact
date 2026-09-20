# G4-RESULTS — PostgreSQL 18 Server in a normal Android APK

**Result: PASS** (Android 14 / armv7 / `untrusted_app`), with the scope caveats
listed under *Remaining gaps*.

## Success criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Installs normally | ✅ |
| 2 | Runs under app UID / `untrusted_app` | ✅ `u:r:untrusted_app:s0:c…` |
| 3 | No Termux | ✅ |
| 4 | No root | ✅ |
| 5 | No ADB after install | ✅ |
| 6 | No external Linux environment | ✅ |
| 7 | Real PostgreSQL 18 server starts | ✅ 18.2 |
| 8 | PGDATA in private storage | ✅ `/data/user/0/com.g4pg/files/pgdata` |
| 9 | Binds only `127.0.0.1:54329` | ✅ |
| 10 | Unix sockets disabled | ✅ `unix_socket_directories=` |
| 11 | Real wire-protocol connection | ✅ `libpq` |
| 12 | `version()/1/CREATE/INSERT/SELECT` | ✅ `1 | android` |
| 13 | Clean stop | ✅ smart shutdown |
| 14 | Restart | ✅ |
| 15 | Persistence across restart | ✅ row `1 | android` survived |

## Gate sequence (evidence)

```
Phase 1 NATIVE_EXEC (nativeLibraryDir)   PASS   UID=10145, SELinux=untrusted_app, exit=0
Phase 2 NATIVE_LINKER (LD_LIBRARY_PATH)  PASS   libg4sql resolved libpq/libg4dep
exec from filesDir                       BLOCKED java.io.IOException: error=13, Permission denied
AGP packages only lib*.so                CONFIRMED (libX.so.1 dropped from APK)
G0 postgres --version                    PASS   PostgreSQL 18.2 (32-bit)
G1 initdb                                PASS   Success
G2 postmaster + TCP SQL                  PASS   127.0.0.1:54329, CREATE/INSERT/SELECT
G4 APK under untrusted_app               PASS   see SQL + persistence below
```

SQL phase (from `adb logcat -s G4PG`):

```
[sql:phase7] CONNECTED db=postgres user=postgres
[sql:phase7] phase7 row: PostgreSQL 18.2 on arm-unknown-linux-androideabi, … 32-bit
[sql:phase7] phase7 row: 1
[sql:phase7] phase7 row: 1 android
[sql:phase7] SQL_OK
client exit=0
```

Persistence after stop + start:

```
-- start #2 (persistence) --
database system is ready to accept connections
ready marker after 1s
[sql:persist] CONNECTED db=postgres user=postgres
[sql:persist] persist row: 1 android
[sql:persist] SQL_OK
G4 RESULT: done
```

## Findings that shape the production design

1. **`execve` from `nativeLibraryDir` works under `untrusted_app`; from
   `filesDir` it is denied.** This is the gate Cairn left open (they ran as
   `shell`). Consequence: executable code must live in `jniLibs` →
   `nativeLibraryDir`; only data goes to `filesDir`.
2. **AGP packages only `lib*.so`.** A versioned file (`libxml2.so.16`) placed in
   `jniLibs` is silently omitted from the APK, and Termux's transitive deps use
   versioned SONAMEs. Consequences: rename to `libX.so` and rewrite
   `DT_SONAME`/`DT_NEEDED`, or static-link/merge (Oliphaunt's approach).
3. **`LD_LIBRARY_PATH=nativeLibraryDir` resolves custom libraries** for an
   exec'd child process.
4. **`patchelf 0.19.1` corrupts 32-bit ARM ELFs** (interpreter and `.dynamic`
   mangled). An in-place `.dynstr`/`.rodata` rewrite with shorter tokens works.
5. **`share/` resolution is exec-path based** (`/proc/self/exe`). With the binary
   in `nativeLibraryDir` there is no sibling `share/`, so the baked prefix is
   used. The G4 rewrote the baked Termux prefix (31 bytes) to the app path
   (`/data/data/com.g4pg/files/usr`, 28 + NUL) and mirrored `share/postgresql/*`
   into `usr/`. **Production fix:** from-source build with a deliberate prefix
   and/or a patch honouring an env-provided base path.
6. **Extension modules are `<name>.so`, not `lib*.so`** (`pgcrypto.so`,
   `uuid-ossp.so`, ...), so they cannot ship via `jniLibs` and `dlopen` from a
   writable dir is restricted. Decide early: static extension registry or a
   merged library. Not exercised in this G4.
7. **`initdb` cannot run at launch** because `find_other_exec()` looks for a
   sibling literally named `postgres` (packaging forces `libpostgres.so`). Ship
   a pre-initialized **cluster seed** instead.
8. **Empty PGDATA directories must be packaged** (`pg_notify`, …); a naive
   file-walk zip omits them and `postgres` fails to start.
9. **JDBC (`org.postgresql` 42.7.3) does not work on Android** —
   `java.lang.NoClassDefFoundError: java/lang/management/ManagementFactory`.
   A native `libpq` client works and is lighter.
10. **Shared memory:** the Termux prebuilt's `libandroid-shmem` busy-spins on a
    stock device; a rebuild with `memfd_create` + `$TMPDIR` fixes it. Whether
    the SysV shim is avoidable (via `shared_memory_type=mmap`) was not tested.

## Remaining gaps (not production-ready)

- **Recon binaries**: this uses Termux prebuilt PostgreSQL; the production
  artifact should be built from source.
- **Prefix rewrite hack**: not multi-user/work-profile safe. Needs a from-source
  prefix or an env-based path patch.
- **Extensions**: strategy undecided (see finding #6).
- **Lifecycle**: no foreground service; when the app dies, the child postgres
  does not survive in a managed way. Not tested: backgrounding, Activity
  recreation, process death.
- **Security**: `pg_hba.conf` is loopback `trust`; no password bootstrap, no
  `dataExtractionRules` exclusion for `PGDATA`.
- **16 KB pages**: device is 4 KB; 16 KB is **UNTESTED**.
- **Performance**: no profiling of the slow first client start (~15 s observed).

## Recommendation for G5

Viable, but do not ship this artifact. First harden G4: from-source build with a
deliberate prefix, static/merged runtime, foreground-service lifecycle, SCRAM +
backup exclusion, and a 16 KB test. Then proceed to G5 (CPython + FastAPI +
psycopg over `127.0.0.1:54329`).
