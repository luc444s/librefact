# PostgreSQL Android cluster seed

`build-seed.sh` produces the `PGDATA` template that the app extracts into its
private storage on first launch, so the device never runs `initdb`.

## Requirements

The seed must match the runtime exactly:

- same PostgreSQL major/version and `CatalogVersion`;
- same configure options that affect on-disk format (`--with-blocksize`,
  `--with-wal-blocksize`, `--with-segsize`, `--data-checksums`);
- same architecture/ABI (`float8_pass_by_value` is archived in `pg_control`);
- same locale/ICU provider recorded in `pg_control`.

## Building it

Cross-compiled Android binaries cannot run on the build host, so the seed is
generated on a device/emulator or an identically configured arm64 environment:

```sh
./build-seed.sh <adb-serial> /data/local/tmp/prefix /tmp/pgdata-seed.tar icu
```

Clean state before packaging:

- no `postmaster.pid` (clean shutdown);
- no `backup_label` / `backup_label.old`;
- no transient `pg_stat*`/`pg_log` leftovers.

## Packaging rules that bit us (see G4-RESULTS.md)

- **Empty directories matter.** `pg_notify`, `pg_wal/archive_status`,
  `pg_tblspc`, `pg_replslot`, `pg_snapshots`, ... must exist. Plain file-walking
  zips omit empty dirs; a zip writer must add directory entries explicitly, or
  `postgres` fails with `could not open directory "pg_notify"`.
- **Permissions.** On extraction, set PGDATA dirs to `0700` and files to `0600`
  (PostgreSQL refuses a group/world-accessible data directory).
- **`pg_hba.conf`** should be replaced at runtime (e.g. loopback `trust` to
  bootstrap, then rotate to `scram-sha-256`). Do not bake a password into the
  seed.
