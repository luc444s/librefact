#!/usr/bin/env bash
#
# Build the PostgreSQL cluster seed (PGDATA) used by first launch.
#
# This G4 avoided running `initdb` at runtime because:
#   * `initdb` calls find_other_exec() to locate a sibling file literally named
#     `postgres`, and Android packaging only ships `lib*.so` names; and
#   * building the cluster once, off-device, keeps first launch fast.
#
# The seed must be produced by a PostgreSQL built with the *same* version and
# configure options, for the *same* architecture. The cross-compiled binaries
# cannot run on an x86 build host; one of these works:
#
#   A) A connected arm Android device/emulator (this script) -- pragmatic.
#   B) An arm64 Linux container with an identically configured glibc build
#      (verify the bionic runtime accepts the resulting PGDATA).
#
# This script implements (A). It assumes a staged prefix already exists on the
# device (see ../postgres-build/), runs initdb as the `shell` user, cleanly
# stops, and pulls a tar of PGDATA.
#
# Usage:
#   ./build-seed.sh <adb-serial> <device-prefix-dir> <out.tar> [locale-provider]
#
set -euo pipefail

SERIAL="${1:?usage: build-seed.sh <adb-serial> <device-prefix-dir> <out.tar> [icu|libc]}"
DEV_PREFIX="${2:?device prefix dir}"
OUT="${3:?output tar path}"
LOCALE_PROVIDER="${4:-icu}"

ADB="${ADB:-adb}"
adb() { "$ADB" -s "$SERIAL" "$@"; }

DATA="$DEV_PREFIX/data"
ENV="export LD_LIBRARY_PATH=$DEV_PREFIX/lib PATH=$DEV_PREFIX/bin:\$PATH HOME=/data/local/tmp TZ=UTC TMPDIR=$DEV_PREFIX/tmp"

echo "=== initdb on device ($DEV_PREFIX) ==="
adb shell "$ENV; mkdir -p $DEV_PREFIX/tmp; rm -rf $DATA; rm -f $DEV_PREFIX/tmp/ashv_key_*; \
  initdb -D $DATA -U postgres --encoding=UTF8 --locale-provider=$LOCALE_PROVIDER \
    $([ "$LOCALE_PROVIDER" = icu ] && echo '--icu-locale=en-US') --no-sync" | tail -4

echo "=== verify clean state ==="
adb shell "$ENV; test ! -e $DATA/postmaster.pid && echo 'no postmaster.pid (ok)'; \
  test -f $DATA/pg_control -o -f $DATA/global/pg_control && echo 'pg_control present (ok)'"

echo "=== package seed ==="
adb shell "cd $DEV_PREFIX && tar -cf /data/local/tmp/pgdata-seed.tar data"
adb pull /data/local/tmp/pgdata-seed.tar "$OUT"
adb shell "rm -f /data/local/tmp/pgdata-seed.tar"

echo "seed written to $OUT"
echo "NOTE: include empty PGDATA directories (pg_notify, pg_wal/archive_status, ...) in the packaged asset."
