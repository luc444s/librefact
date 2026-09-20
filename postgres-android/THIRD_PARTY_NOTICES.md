# Third-party notices

This directory contains an experimental Android packaging of PostgreSQL. Track
licenses for every borrowed source, patch, and binary here before any product
distribution.

## Components

| Component | License | How used |
|---|---|---|
| PostgreSQL 18 | PostgreSQL License (permissive) | the server itself |
| PostgreSQL (Termux `binary-arm` packages) | PostgreSQL License | **recon binaries** only (not for product) |
| `termux/libandroid-shmem` | BSD-3-Clause | upstream source; our patch in `postgres-build/patches/` |
| our `libandroid-shmem-android.patch` | same as repo | independently authored portability fix |
| OpenSSL 3 | Apache-2.0 | `libssl.so` / `libcrypto.so` |
| ICU | Unicode License | `libicu*.so` |
| libxml2 | MIT | `libxml2.so` |
| zlib | zlib License | `libz.so` |
| libiconv | LGPL | `libiconv.so` |
| libc++ (shared) | Apache-2.0 with LLVM exception | `libc++_shared.so` |

## Prior art studied (not copied)

| Project | License | Note |
|---|---|---|
| [Cairn](https://github.com/cairn-ehr/cairn-ehr) `poc/pg-android-kit` | **AGPL-3.0** | Reproducible bionic PostgreSQL spike. Its scripts/patches are **not** copied here; only publicly documented findings informed our own patch and build. Do not copy AGPL code into a distributed product without approval. |
| [Oliphaunt](https://github.com/f0rr0/oliphaunt) | **MIT** | Embedded PostgreSQL for Android; reference for static/merged packaging and cluster-seed hydration. MIT, reusable with attribution. |

## Action items before distribution

- Replace the Termux recon binaries with a from-source PostgreSQL build and
  record its exact source hash and configure flags.
- Include full license texts for OpenSSL, ICU, libxml2, zlib, libiconv, libc++
  in the app's assets / distribution.
- Keep any AGPL-derived code out of the product unless the project explicitly
  adopts an AGPL-compatible license.
