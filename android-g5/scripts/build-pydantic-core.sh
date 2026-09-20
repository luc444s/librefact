#!/usr/bin/env bash
#
# Cross-compile pydantic-core for Android armeabi-v7a (Chaquopy / Python 3.11).
#
# Produces: app/wheels/pydantic_core-<ver>-cp311-cp311-android_26_armeabi_v7a.whl
#
# Requirements on the build host:
#   - rustup + target armv7-linux-androideabi
#   - Android NDK r27d at $NDK_ROOT
#   - python3.11 (Chaquopy buildPython) with a maturin>=1.10 venv
#
# Usage: NDK_ROOT=... MATURIN=... scripts/build-pydantic-core.sh [pydantic-core-version]
set -euo pipefail

PydanticCoreVersion="${1:-2.46.5}"
ChaquopyVersion="3.11.14-0"
AndroidApi="${ANDROID_API_LEVEL:-26}"

Here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AppDir="$(cd "$Here/.." && pwd)"
WorkDir="${WORK_DIR:-/tmp/opencode/g5-pydantic-core}"
NDK_ROOT="${NDK_ROOT:-$HOME/.android-toolchain/android-ndk-r27d}"
ToolchainRoot="${TOOLCHAIN_ROOT:-$(dirname "$NDK_ROOT")}"
NDK="$NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64"
Maturin="${MATURIN:-$WorkDir/maturin-venv/bin/maturin}"
Python311="${PYTHON311:-/home/linuxbrew/.linuxbrew/bin/python3.11}"

MavenBase="https://repo1.maven.org/maven2/com/chaquo/python/target/$ChaquopyVersion"

mkdir -p "$WorkDir"
cd "$WorkDir"

echo "== 1/5 Fetching Chaquopy target + stdlib ($ChaquopyVersion)"
[ -f target-armv7.zip ] || curl -sL -o target-armv7.zip "$MavenBase/target-$ChaquopyVersion-armeabi-v7a.zip"
[ -f stdlib.zip ] || curl -sL -o stdlib.zip "$MavenBase/target-$ChaquopyVersion-stdlib.zip"

echo "== 2/5 Building PYO3_CROSS_LIB_DIR layout (PyO3 standard)"
rm -rf pycross
mkdir -p pycross/lib/python3.11
unzip -q -o target-armv7.zip -d target_raw 'include/*' 'jniLibs/*'
cp -r target_raw/include pycross/include
cp target_raw/jniLibs/armeabi-v7a/libpython3.11.so pycross/lib/
unzip -q -o stdlib.zip -d pycross/lib/python3.11

echo "== 3/5 Fetching pydantic-core $PydanticCoreVersion sdist"
SdistUrl="$(curl -s "https://pypi.org/pypi/pydantic-core/$PydanticCoreVersion/json" \
  | "$Python311" -c 'import sys,json;print([f["url"] for f in json.load(sys.stdin)["urls"] if f["packagetype"]=="sdist"][0])')"
[ -f pc-src.tar.gz ] || curl -sL -o pc-src.tar.gz "$SdistUrl"
rm -rf "pydantic_core-$PydanticCoreVersion"
tar xzf pc-src.tar.gz

echo "== 4/5 Ensuring maturin venv"
if [ ! -x "$Maturin" ]; then
  "$Python311" -m venv "$WorkDir/maturin-venv"
  "$WorkDir/maturin-venv/bin/pip" install -q --upgrade pip
  "$WorkDir/maturin-venv/bin/pip" install -q "maturin>=1.10,<2"
fi

echo "== 5/5 Cross-compiling"
export CC="$NDK/bin/armv7a-linux-androideabi${AndroidApi}-clang"
export AR="$NDK/bin/llvm-ar"
export CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER="$CC"
export CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_AR="$AR"
export PYO3_CROSS=1
export PYO3_CROSS_PYTHON_VERSION=3.11
export PYO3_CROSS_LIB_DIR="$WorkDir/pycross"
export RUSTFLAGS="-C linker=$CC -L native=$WorkDir/pycross/lib"
export ANDROID_API_LEVEL="$AndroidApi"

cd "pydantic_core-$PydanticCoreVersion"
"$Maturin" build --release --target armv7-linux-androideabi --out "$WorkDir/wheels"

mkdir -p "$AppDir/app/wheels"
cp "$WorkDir/wheels/"*.whl "$AppDir/app/wheels/"
echo "== Done. Wheel copied to $AppDir/app/wheels/"
ls -la "$AppDir/app/wheels/"
