#!/usr/bin/env bash
#
# Bundle the PostgreSQL extension modules (plpgsql, pg_trgm, ...) that the G4
# runtime does not ship, so plugin migrations using DO blocks / extensions work.
#
# The modules come from the same Termux postgresql package G4 used
# (postgresql_18.2-1_arm), staged via postgres-android/postgres-build.
#
# Produces: app/src/main/assets/pgextensions.zip  (usr/lib/postgresql/*.so)
#
# Usage: scripts/build-pg-extensions.sh
set -euo pipefail

Here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RepoRoot="$(cd "$Here/../.." && pwd)"
AppDir="$(cd "$Here/.." && pwd)"
Work="${WORK_DIR:-/tmp/opencode/pgwork-arm}"

if [ ! -d "$Work/prefix/lib/postgresql" ]; then
  echo "== staging Termux PostgreSQL (arm)"
  python3 "$RepoRoot/postgres-android/postgres-build/stage-termux-prefix.py" arm "$Work"
fi

LibDir="$Work/prefix/lib/postgresql"
[ -d "$LibDir" ] || { echo "extension dir not found: $LibDir" >&2; exit 1; }

Out="$AppDir/app/src/main/assets/pgextensions.zip"
mkdir -p "$(dirname "$Out")"
rm -f "$Out"

python3 - "$LibDir" "$Out" <<'PY'
import os
import sys
import zipfile

lib_dir, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for name in sorted(os.listdir(lib_dir)):
        full = os.path.join(lib_dir, name)
        if os.path.isfile(full) and name.endswith(".so"):
            zf.write(full, os.path.join("usr", "lib", "postgresql", name))
print(f"wrote {out} ({os.path.getsize(out)} bytes)")
PY

echo "== done"
ls -la "$Out"
