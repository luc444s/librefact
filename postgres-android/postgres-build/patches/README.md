# Patches

## `libandroid-shmem-android.patch`

Independently authored for this project against
`termux/libandroid-shmem@7f0bd7e25dbdd146265aff7c6a890029e374622d` (3-clause BSD).

It makes the library usable on a stock, non-Termux Android device by:

1. **Replacing the shared-region backend with `memfd_create()`.** Upstream's
   prebuilt uses legacy `/dev/ashmem` (removed in Android 11+) or
   `ASharedMemory_create`, which links `libandroid.so`. `memfd_create` is a
   plain syscall and keeps the resulting `.so` dependent only on
   `liblog`/`libdl`/`libc`.
2. **Deriving the SysV-key coordination directory from `$TMPDIR`.** Upstream
   bakes the compile-time Termux prefix into `_PATH_TMP`; on a stock device that
   path is unwritable and the symlink loop spins forever on `EACCES`.

This is a *portability* fix, not a correctness change to the SysV emulation.

## Prior art and licensing

The bionic PostgreSQL packaging problem was studied via
[Cairn](https://github.com/cairn-ehr/cairn-ehr) (`poc/pg-android-kit`, **AGPL-3.0**)
and [Oliphaunt](https://github.com/f0rr0/oliphaunt) (**MIT**). Cairn's scripts
and patches are **not** copied here. This patch was written from the publicly
documented behaviour of the underlying library and its upstream source. See
`../THIRD_PARTY_NOTICES.md`.

## PostgreSQL source build

For a production runtime, prefer a from-source PostgreSQL build with a
deliberate Android prefix (see `../README.md`) instead of repackaging Termux
binaries. When that build is added, its bionic portability patches belong in
this directory.
