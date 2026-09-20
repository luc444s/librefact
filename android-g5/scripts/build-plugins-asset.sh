#!/usr/bin/env bash
#
# Prepare plugin assets for the Android app:
#   - app/src/main/assets/plugins.zip        (all plugins, ported to 3.11)
#   - app/src/main/assets/seed_productos.csv (Peru product seed)
#   - app/src/main/python/g5_products_importer.py (OFF CSV importer)
#
# Ports applied to the copied plugins (the submodules stay pristine):
#   - PEP 695 generic functions in productos/backend/router.py -> TypeVar
#   - crm migration 0005 creates missing crm_* tables before indexing them
#   (symlinks such as commerce/backend -> purchase/backend are dereferenced)
#
# Usage: scripts/build-plugins-asset.sh
set -euo pipefail

Here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RepoRoot="$(cd "$Here/../.." && pwd)"
AppDir="$(cd "$Here/.." && pwd)"
Work="${WORK_DIR:-/tmp/opencode/g5-plugins-asset}"

rm -rf "$Work"
mkdir -p "$Work"
# -h dereferences symlinks (commerce/backend -> purchase/backend).
tar -C "$RepoRoot" -h --exclude='.git' --exclude='__pycache__' -cf - plugins | tar -C "$Work" -xf -

echo "== porting plugins to Python 3.11"
python3 - "$Work/plugins" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])

router = root / "productos" / "backend" / "router.py"
text = router.read_text(encoding="utf-8")
text = text.replace("from typing import Any", "from typing import Any, TypeVar\n\nT = TypeVar(\"T\")", 1)
text = text.replace("async def _run_sync_readonly[T](", "async def _run_sync_readonly(")
text = text.replace("async def _run_mutation[T](", "async def _run_mutation(")
if "[T](" in text:
    raise SystemExit("PEP 695 backport failed in productos/router.py")
router.write_text(text, encoding="utf-8")
print("  backported productos/backend/router.py")

migration = root / "crm" / "migrations" / "005_hot_path_indexes_v1.py"
mtext = migration.read_text(encoding="utf-8")
old = "def upgrade(db) -> None:\n    bind = db.connection()\n    for _, statement in INDEX_STATEMENTS:"
new = (
    "def upgrade(db) -> None:\n"
    "    from systutor.core.database import Base\n"
    "    import plugins.crm.backend.models  # noqa: F401\n\n"
    "    bind = db.connection()\n"
    "    crm_tables = [\n"
    "        table for table in Base.metadata.tables.values()\n"
    "        if table.name.startswith(\"crm_\")\n"
    "    ]\n"
    "    Base.metadata.create_all(bind=bind, tables=crm_tables, checkfirst=True)\n"
    "    for _, statement in INDEX_STATEMENTS:"
)
if old not in mtext:
    raise SystemExit("crm 0005 patch failed")
migration.write_text(mtext.replace(old, new, 1), encoding="utf-8")
print("  patched crm migration 0005 (create missing tables)")
PY

mkdir -p "$AppDir/app/src/main/assets" "$AppDir/app/src/main/python"

echo "== writing plugins.zip"
rm -f "$AppDir/app/src/main/assets/plugins.zip"
python3 - "$Work" "$AppDir/app/src/main/assets/plugins.zip" <<'PY'
import os
import sys
import zipfile

work, out = sys.argv[1], sys.argv[2]
base = os.path.join(work, "plugins")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(base):
        for name in dirs:
            full = os.path.join(root, name)
            zf.writestr(os.path.join("plugins", os.path.relpath(full, base)) + "/", "")
        for name in files:
            full = os.path.join(root, name)
            arc = os.path.join("plugins", os.path.relpath(full, base))
            zf.write(full, arc)
print(f"  {out} ({os.path.getsize(out)} bytes)")
PY

echo "== copying seed + importer"
cp "$RepoRoot/data/productos_peru.csv" "$AppDir/app/src/main/assets/seed_productos.csv"
cp "$RepoRoot/scripts/import_off_products_to_librefact.py" \
   "$AppDir/app/src/main/python/g5_products_importer.py"

echo "== done"
ls -la "$AppDir/app/src/main/assets/" | grep -E "plugins.zip|seed_productos"
