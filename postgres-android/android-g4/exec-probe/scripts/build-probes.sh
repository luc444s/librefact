#!/usr/bin/env bash
#
# Compile the exec/linker probes for Android (see README.md).
# Usage: ANDROID_NDK=/path/to/ndk ./build-probes.sh <abi> <jniLibs-dir>
set -euo pipefail

ABI="${1:?usage: build-probes.sh <abi> <jniLibs-dir>}"
JNILIBS="${2:?jniLibs dir}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/app/src/main/jniLibs-src"

case "$ABI" in
  armeabi-v7a) TARGET=armv7a-linux-androideabi; API=24 ;;
  arm64-v8a)   TARGET=aarch64-linux-android;    API=24 ;;
  *) echo "unsupported abi: $ABI" >&2; exit 1 ;;
esac

: "${ANDROID_NDK:?set ANDROID_NDK}"
HOST="linux-x86_64"; [ "$(uname -s)" = Darwin ] && HOST="darwin-x86_64"
CC="$ANDROID_NDK/toolchains/llvm/prebuilt/$HOST/bin/${TARGET}${API}-clang"

mkdir -p "$JNILIBS"
"$CC" -fPIE -pie -O2 "$SRC/probe.c" -o "$JNILIBS/libprobe.so"
"$CC" -shared -fPIC -O2 "$SRC/dep.c" -Wl,-soname,libg4dep.so -o "$JNILIBS/libg4dep.so"
"$CC" -fPIE -pie -O2 "$SRC/probe_dep.c" -L"$JNILIBS" -lg4dep -o "$JNILIBS/libprobe_dep.so"

echo "built probes in $JNILIBS"
