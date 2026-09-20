#!/usr/bin/env bash
#
# Build a stock-device-portable libandroid-shmem.so for Android.
#
# PostgreSQL needs System V shared memory; Android's bionic libc does not
# provide it, so Termux ships libandroid-shmem. The prebuilt copy assumes the
# Termux prefix and the legacy /dev/ashmem device, so on a normal device it
# spins forever. Our patch (patches/libandroid-shmem-android.patch, authored
# independently for this project) makes it:
#   * derive its coordination directory from $TMPDIR at runtime, and
#   * back regions with memfd_create() (no libandroid.so, only libc/liblog).
#
# Usage:
#   ANDROID_NDK=/path/to/ndk ./build-libandroid-shmem.sh <abi> <out.so>
#
#   abi: armeabi-v7a | arm64-v8a | x86_64
set -euo pipefail

ABI="${1:?usage: build-libandroid-shmem.sh <abi> <out.so>}"
OUT="${2:?usage: build-libandroid-shmem.sh <abi> <out.so>}"
KIT="$(cd "$(dirname "$0")" && pwd)"

case "$ABI" in
  armeabi-v7a) TARGET=armv7a-linux-androideabi; API=28 ;;
  arm64-v8a)   TARGET=aarch64-linux-android;    API=28 ;;
  x86_64)      TARGET=x86_64-linux-android;     API=28 ;;
  *) echo "unsupported abi: $ABI" >&2; exit 1 ;;
esac

: "${ANDROID_NDK:?set ANDROID_NDK to your NDK directory}"
HOST="linux-x86_64"; [ "$(uname -s)" = Darwin ] && HOST="darwin-x86_64"
CC="$ANDROID_NDK/toolchains/llvm/prebuilt/$HOST/bin/${TARGET}${API}-clang"
[ -x "$CC" ] || { echo "NDK clang not found: $CC" >&2; exit 1; }

# Upstream libandroid-shmem is 3-clause BSD. Pin the revision the patch is
# generated against so `patch` cannot silently drift.
SHMEM_COMMIT="${SHMEM_COMMIT:-7f0bd7e25dbdd146265aff7c6a890029e374622d}"
SRC="$(mktemp -d)"
trap 'rm -rf "$SRC"' EXIT

BASE="https://raw.githubusercontent.com/termux/libandroid-shmem/$SHMEM_COMMIT"
for f in shmem.c shm.h LICENSE; do
  curl -fsSL -o "$SRC/$f" "$BASE/$f"
done

# Patch expects -p1 paths (a/shmem.c -> b/shmem.c).
( cd "$SRC" && patch -p1 < "$KIT/patches/libandroid-shmem-android.patch" )

"$CC" -shared -fPIC -O2 -Wall -Wno-unused -I"$SRC" "$SRC/shmem.c" -llog -o "$OUT"

echo "built $OUT"
READELF="${ANDROID_NDK}/toolchains/llvm/prebuilt/${HOST}/bin/llvm-readelf"
"$READELF" -d "$OUT" | awk '/NEEDED/{print "  NEEDED "$NF}'
echo "(expect only liblog/libdl/libc -- no libandroid.so)"
