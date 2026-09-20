#!/usr/bin/env python3
"""Build app/src/main/assets/pgsupport.zip from a PGDATA seed + PostgreSQL share dir.

Usage:
    prepare-assets.py --seed-tar <pgdata-seed.tar> --share-dir <prefix/share/postgresql> \
                      --out app/src/main/assets/pgsupport.zip

The zip contains:
    pgdata/                      (extracted from the seed tar, renamed from data/)
    usr/share/postgresql/...     (runtime PG data: timezone, tsearch_data, ...)

Empty directories are included explicitly (required by PostgreSQL).
Permissions are applied by the app at runtime.
"""
import argparse
import os
import shutil
import tarfile
import tempfile
import zipfile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed-tar", required=True)
    ap.add_argument("--share-dir", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as stage:
        pgdata = os.path.join(stage, "pgdata")
        with tarfile.open(args.seed_tar) as t:
            t.extractall(stage)
        # seed tar is expected to contain a top-level `data/` directory
        if os.path.isdir(os.path.join(stage, "data")) and not os.path.exists(pgdata):
            os.rename(os.path.join(stage, "data"), pgdata)

        share_dst = os.path.join(stage, "usr", "share")
        os.makedirs(share_dst, exist_ok=True)
        shutil.copytree(args.share_dir, os.path.join(share_dst, "postgresql"),
                        dirs_exist_ok=True)

        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        nfiles = ndirs = 0
        with zipfile.ZipFile(args.out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for root, dirs, files in os.walk(stage):
                for d in dirs:
                    p = os.path.join(root, d)
                    z.write(p, os.path.relpath(p, stage) + "/")
                    ndirs += 1
                for f in files:
                    p = os.path.join(root, f)
                    z.write(p, os.path.relpath(p, stage))
                    nfiles += 1
        print(f"wrote {args.out}: {nfiles} files, {ndirs} dirs, "
              f"{os.path.getsize(args.out)} bytes")


if __name__ == "__main__":
    main()
