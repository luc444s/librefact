#!/usr/bin/env bash
#
# Sync systutor-core (kernel + reference executable) into the Android host app.
#
# The upstream submodule targets Python >=3.12. Chaquopy on armeabi-v7a only
# supports Python <=3.11, so we copy the sources and backport the two PEP 695
# generic models in systutor/core/pagination.py to typing.Generic, which is
# equivalent on 3.12+ too. The submodule stays pristine.
#
# Usage: scripts/sync-systutor-core.sh
set -euo pipefail

Here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RepoRoot="$(cd "$Here/../.." && pwd)"
Src="$RepoRoot/vendor/systutor-core"
Dest="$Here/../app/src/main/python"
Pagination="$Dest/systutor/core/pagination.py"
Database="$Dest/systutor/core/database.py"

[ -d "$Src/src/systutor" ] || { echo "systutor-core source not found at $Src" >&2; exit 1; }

rm -rf "$Dest/systutor" "$Dest/app"
cp -r "$Src/src/systutor" "$Dest/systutor"
cp -r "$Src/app" "$Dest/app"
find "$Dest/systutor" "$Dest/app" -type d -name __pycache__ -prune -exec rm -rf {} +

python3 - "$Pagination" "$Database" <<'PY'
import pathlib
import sys

pagination_path = pathlib.Path(sys.argv[1])
database_path = pathlib.Path(sys.argv[2])

text = pagination_path.read_text(encoding="utf-8")

old_import = "from pydantic import BaseModel"
new_import = (
    "from typing import Generic, TypeVar\n"
    "\n"
    "from pydantic import BaseModel\n"
    "\n"
    "ItemT = TypeVar(\"ItemT\")"
)
text = text.replace(old_import, new_import, 1)

text = text.replace(
    "class OffsetPageRead[ItemT](BaseModel):",
    "class OffsetPageRead(BaseModel, Generic[ItemT]):",
)
text = text.replace(
    "class NumberedPageRead[ItemT](BaseModel):",
    "class NumberedPageRead(BaseModel, Generic[ItemT]):",
)

if "[ItemT](BaseModel)" in text:
    raise SystemExit("PEP 695 backport failed: generic class left untouched")

pagination_path.write_text(text, encoding="utf-8")
print(f"backported {pagination_path}")

# Android has no asyncpg wheel; psycopg3 provides the async dialect instead.
db_text = database_path.read_text(encoding="utf-8")
old_async = (
    '    """Convierte URL sync a async (psycopg → asyncpg)."""\n'
    '    return url.replace("postgresql+psycopg://", "postgresql+asyncpg://").replace(\n'
    '        "postgresql://", "postgresql+asyncpg://"\n'
    "    )"
)
new_async = (
    '    """Android: asyncpg has no Android wheel, so psycopg3 async is used."""\n'
    '    return url.replace("postgresql://", "postgresql+psycopg://")'
)
if old_async not in db_text:
    raise SystemExit("async URL patch failed: _to_async_url body not found")
database_path.write_text(db_text.replace(old_async, new_async, 1), encoding="utf-8")
print(f"patched {database_path}")
PY

echo "synced systutor-core -> $Dest"
