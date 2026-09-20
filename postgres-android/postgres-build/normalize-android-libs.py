#!/usr/bin/env python3
"""Normalize ARM/ARM64 Termux PostgreSQL binaries for Android APK packaging.

Why this exists
---------------
Android's Gradle/AGP packaging only accepts native libraries whose filename
matches ``lib*.so``. Termux's PostgreSQL depends on versioned SONAMEs
(``libxml2.so.16``, ``libicuuc.so.78``, ``libssl.so.3``, ...), and a versioned
file placed in ``jniLibs`` is silently dropped from the APK.

This script:
  * copies the required runtime libraries into a ``jniLibs/<abi>`` tree with
    names AGP accepts (``libX.so``);
  * rewrites the versioned SONAME / DT_NEEDED tokens in ``.dynstr`` in place
    (every replacement is shorter than the original, so ELF offsets stay valid
    -- no need for patchelf, which corrupts 32-bit ARM ELFs);
  * rewrites the baked compile-time prefix string in ``.rodata`` with a
    same-length replacement.

Usage
-----
    python3 normalize-android-libs.py \
        --prefix <staged-termux-prefix> \
        --shmem  <fixed-libandroid-shmem.so> \
        --out    <app/src/main/jniLibs/armeabi-v7a> \
        --old-prefix /data/data/com.termux/files/usr \
        --new-prefix /data/data/com.g4pg/files/usr

NOTE: ``--new-prefix`` must be <= ``--old-prefix`` in length and must match the
application's *baked* data path (package id length matters). For production use
a from-source build with a deliberate ``--prefix`` instead of this rewrite; see
``README.md``.
"""
import argparse
import os
import re
import shutil
import struct
import subprocess

# (source relative to prefix, output name, versioned SONAME to normalize or None)
ITEMS = [
    ("bin/postgres",               "libpostgres.so",         None),
    ("lib/libxml2.so.16",          "libxml2.so",             "libxml2.so.16"),
    ("lib/libssl.so.3",            "libssl.so",              "libssl.so.3"),
    ("lib/libcrypto.so.3",         "libcrypto.so",           "libcrypto.so.3"),
    ("lib/libz.so.1",              "libz.so",                "libz.so.1"),
    ("lib/libandroid-execinfo.so", "libandroid-execinfo.so", None),
    ("lib/libicui18n.so.78",       "libicui18n.so",          "libicui18n.so.78"),
    ("lib/libicuuc.so.78",         "libicuuc.so",            "libicuuc.so.78"),
    ("lib/libicudata.so.78",       "libicudata.so",          "libicudata.so.78"),
    ("lib/libiconv.so",            "libiconv.so",            None),
    ("lib/libc++_shared.so",       "libc++_shared.so",       None),
    ("lib/libpq.so",               "libpq.so",               "libpq.so"),
]

MAP = {
    b"libxml2.so.16": b"libxml2.so",
    b"libssl.so.3": b"libssl.so",
    b"libcrypto.so.3": b"libcrypto.so",
    b"libz.so.1": b"libz.so",
    b"libicui18n.so.78": b"libicui18n.so",
    b"libicuuc.so.78": b"libicuuc.so",
    b"libicudata.so.78": b"libicudata.so",
    b"libreadline.so.8": b"libreadline.so",
    b"libncursesw.so.6": b"libncursesw.so",
}


def dynstr_range(data):
    if data[:4] != b"\x7fELF" or data[4] != 1 or data[5] != 1:
        raise ValueError("only ELF32 little-endian is handled")
    e_shoff = struct.unpack_from("<I", data, 0x20)[0]
    e_shentsize = struct.unpack_from("<H", data, 0x2E)[0]
    e_shnum = struct.unpack_from("<H", data, 0x30)[0]
    e_shstrndx = struct.unpack_from("<H", data, 0x32)[0]
    shstr = struct.unpack_from("<I", data, e_shoff + e_shstrndx * e_shentsize + 0x10)[0]
    for i in range(e_shnum):
        base = e_shoff + i * e_shentsize
        name_off = struct.unpack_from("<I", data, base)[0]
        end = data.index(b"\x00", shstr + name_off)
        if data[shstr + name_off:end] == b".dynstr":
            off = struct.unpack_from("<I", data, base + 0x10)[0]
            size = struct.unpack_from("<I", data, base + 0x14)[0]
            return off, size
    raise ValueError("no .dynstr")


def patch_dynstr(data):
    off, size = dynstr_range(data)
    seg = bytearray(data[off:off + size])
    i = 0
    while i < len(seg):
        j = i
        while j < len(seg) and seg[j] != 0:
            j += 1
        tok = bytes(seg[i:j])
        if tok in MAP:
            new = MAP[tok]
            assert len(new) <= len(tok)
            seg[i:i + len(new)] = new
            for k in range(i + len(new), j):
                seg[k] = 0
        i = j + 1
    data[off:off + size] = seg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--shmem", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--old-prefix", default="/data/data/com.termux/files/usr")
    ap.add_argument("--new-prefix", required=True)
    ap.add_argument("--readelf", default=os.environ.get("READELF", "llvm-readelf"))
    args = ap.parse_args()

    old = args.old_prefix.encode()
    new = args.new_prefix.encode()
    if len(new) > len(old):
        raise SystemExit(f"new prefix longer than old ({len(new)} > {len(old)})")

    os.makedirs(args.out, exist_ok=True)
    for f in os.listdir(args.out):
        p = os.path.join(args.out, f)
        if os.path.isfile(p):
            os.remove(p)

    for rel, out, _soname in ITEMS:
        src = os.path.realpath(os.path.join(args.prefix, rel))
        dst = os.path.join(args.out, out)
        shutil.copy2(src, dst)
        os.chmod(dst, 0o755)
        data = bytearray(open(dst, "rb").read())
        patch_dynstr(data)
        data = data.replace(old, new + b"\x00" * (len(old) - len(new)))
        open(dst, "wb").write(data)
        print(f"staged {rel:30} -> {out}")

    shutil.copy2(args.shmem, os.path.join(args.out, "libandroid-shmem.so"))
    os.chmod(os.path.join(args.out, "libandroid-shmem.so"), 0o755)
    print("staged fixed libandroid-shmem.so")

    print("=== verify ===")
    for f in sorted(os.listdir(args.out)):
        p = os.path.join(args.out, f)
        din = subprocess.run([args.readelf, "-d", p], text=True, capture_output=True).stdout
        needed = re.findall(r"NEEDED.*?\[(.*?)\]", din)
        print(f"  {f:26} needed={needed}")


if __name__ == "__main__":
    main()
