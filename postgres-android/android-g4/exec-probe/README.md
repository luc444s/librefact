# exec-probe — native exec / linker gate under `untrusted_app`

Tiny APK that answers the single most important question for this architecture:

> Can a normal app (`u:r:untrusted_app`, enforcing SELinux) execute a native PIE
> from `applicationInfo.nativeLibraryDir`, and can that process resolve a custom
> shared library from the same directory?

It packages two executables and one dependency as `jniLibs`:

| File | Kind | Purpose |
|---|---|---|
| `libprobe.so` | PIE executable | prints PID/UID/GID/argv0/`/proc/self/exe`/cwd/TMPDIR/LD_LIBRARY_PATH/SELinux |
| `libg4dep.so` | shared lib | dependency with `g4dep_hello()` |
| `libprobe_dep.so` | PIE executable, `NEEDED libg4dep.so` | linker-resolution gate |

It runs each via `ProcessBuilder`, and also copies `libprobe.so` to `filesDir`
and tries to execute it, to document that path.

## Result (moto e15, Android 14, armv7)

```
libprobe.so      EXEC_OK   UID=10145  SELinux=u:r:untrusted_app:s0:c145,c256,c512,c768  exit=0
libprobe_dep.so  LINK_OK   DEP=dep-loaded-ok                                            exit=0
filesDir copy    IOException: error=13, Permission denied
```

See `../G4-RESULTS.md` for interpretation.

## Build

```sh
ANDROID_NDK=/path/to/ndk ./scripts/build-probes.sh armeabi-v7a app/src/main/jniLibs/armeabi-v7a
cp local.properties.example local.properties
./gradlew :app:assembleDebug
```

`local.properties` and `jniLibs/**/*.so` are git-ignored.
