#!/usr/bin/env bash
#
# Bundle the PostgreSQL runtime from the installed G4 APK (com.g4pg) into the
# android-g5 app, so systutor-core can run against a real PostgreSQL.
#
# The G4 build artifacts are intentionally not committed to postgres-android/,
# so we pull them from the APK installed on the test device.
#
# Populates (all gitignored):
#   app/src/main/jniLibs/armeabi-v7a/*.so   (postgres + libpq + deps)
#   app/src/main/assets/pgsupport.zip        (PGDATA seed + share files)
#
# Usage: ADB=... scripts/fetch-g4-postgres.sh
set -euo pipefail

Here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AppDir="$(cd "$Here/.." && pwd)"
ADB="${ADB:-$HOME/.android-toolchain/android-sdk/platform-tools/adb}"
Work="${WORK_DIR:-/tmp/opencode/g4-postgres}"
Pkg="com.g4pg"
# Must match app/build.gradle applicationId (8 chars, same length as com.g4pg).
G5_PKG="com.g5pg"

mkdir -p "$Work"

echo "== resolving $Pkg APK"
ApkPath="$("$ADB" shell pm path "$Pkg" | sed 's/package://' | tr -d '\r')"
[ -n "$ApkPath" ] || { echo "$Pkg not installed on device" >&2; exit 1; }
"$ADB" pull "$ApkPath" "$Work/g4pg.apk"

echo "== extracting native libs + seed"
rm -rf "$Work/x"
mkdir -p "$Work/x"
( cd "$Work/x" && unzip -q "$Work/g4pg.apk" 'lib/armeabi-v7a/*' 'assets/pgsupport.zip' )

DestLib="$AppDir/app/src/main/jniLibs/armeabi-v7a"
DestAssets="$AppDir/app/src/main/assets"
mkdir -p "$DestLib" "$DestAssets"

cp "$Work/x/lib/armeabi-v7a/"*.so "$DestLib/"
rm -f "$DestLib/libg4sql.so"   # G4's internal SQL test client, not needed
cp "$Work/x/assets/pgsupport.zip" "$DestAssets/pgsupport.zip"

echo "== rewriting embedded prefix $Pkg -> $G5_PKG (length-preserving)"
python3 - "$DestLib" "$Pkg" "$G5_PKG" <<'PY'
import pathlib
import sys

lib_dir = pathlib.Path(sys.argv[1])
old = sys.argv[2].encode()
new = sys.argv[3].encode()
assert len(old) == len(new), "package ids must have equal length"

for so in sorted(lib_dir.glob("*.so")):
    data = so.read_bytes()
    count = data.count(old)
    if count:
        so.write_bytes(data.replace(old, new))
    print(f"  {so.name}: {count} occurrence(s)")
PY

echo "== done"
ls -la "$DestLib"
ls -la "$DestAssets"
