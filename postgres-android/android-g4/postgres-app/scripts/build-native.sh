#!/usr/bin/env bash
#
# Compile the native PostgreSQL probe/client (libg4sql.so) for Android.
# It links libpq from the staged prefix and is executed from nativeLibraryDir.
#
# Usage:
#   ANDROID_NDK=/path/to/ndk ./build-native.sh <abi> <staged-prefix> <jniLibs-dir>
set -euo pipefail

ABI="${1:?usage: build-native.sh <abi> <staged-prefix> <jniLibs-dir>}"
PREFIX="${2:?prefix}"
JNILIBS="${3:?jniLibs dir}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

case "$ABI" in
  armeabi-v7a) TARGET=armv7a-linux-androideabi; API=24 ;;
  arm64-v8a)   TARGET=aarch64-linux-android;    API=24 ;;
  *) echo "unsupported abi: $ABI" >&2; exit 1 ;;
esac

: "${ANDROID_NDK:?set ANDROID_NDK}"
HOST="linux-x86_64"; [ "$(uname -s)" = Darwin ] && HOST="darwin-x86_64"
CC="$ANDROID_NDK/toolchains/llvm/prebuilt/$HOST/bin/${TARGET}${API}-clang"

mkdir -p "$JNILIBS"
"$CC" -fPIE -pie -O2 "$HERE/app/src/main/jniLibs-src/g4sql.c" \
  -I"$PREFIX/include" -L"$JNILIBS" -lpq -o "$JNILIBS/libg4sql.so"

echo "built $JNILIBS/libg4sql.so"
