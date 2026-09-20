#!/usr/bin/env bash
#
# Build the full SYSTUTOR web app (apps/web + vendor + all plugins) and package
# the production bundle as an APK asset so the Android app can serve it.
#
# Produces: app/src/main/assets/webapp.zip  (gitignored)
#
# Usage: scripts/build-webapp.sh
set -euo pipefail

Here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RepoRoot="$(cd "$Here/../.." && pwd)"
Web="$RepoRoot/apps/web"
Out="$Here/../app/src/main/assets/webapp.zip"

if [ ! -f "$Web/node_modules/vite/bin/vite.js" ]; then
  echo "== installing web dependencies"
  npm --prefix "$Web" install --no-package-lock --no-audit --no-fund
fi

echo "== typecheck + build"
( cd "$Web" \
  && node node_modules/typescript/bin/tsc --noEmit \
  && NODE_OPTIONS=--max-old-space-size=2560 node node_modules/vite/bin/vite.js build )

echo "== packaging dist -> $Out"
mkdir -p "$(dirname "$Out")"
rm -f "$Out"
python3 - "$Web/dist" "$Out" <<'PY'
import os
import sys
import zipfile

src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, _dirs, files in os.walk(src):
        for name in files:
            full = os.path.join(root, name)
            zf.write(full, os.path.relpath(full, src))
print(f"wrote {out} ({os.path.getsize(out)} bytes)")
PY
