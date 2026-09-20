import gzip, os, re, subprocess, sys, urllib.request

REPO = "https://packages.termux.dev/apt/termux-main"
ARCH = sys.argv[1] if len(sys.argv) > 1 else "aarch64"
WORK = sys.argv[2] if len(sys.argv) > 2 else f"/tmp/opencode/pgwork-{ARCH}"
DIST = os.path.join(WORK, "debs")
PREFIX = os.path.join(WORK, "prefix")
os.makedirs(DIST, exist_ok=True)
os.makedirs(PREFIX, exist_ok=True)

idx = os.path.join(WORK, "Packages")
if not os.path.exists(idx):
    url = f"{REPO}/dists/stable/main/binary-{ARCH}/Packages.gz"
    raw = urllib.request.urlopen(url, timeout=90).read()
    open(idx, "wb").write(gzip.decompress(raw))

stanzas = {}
for block in open(idx).read().split("\n\n"):
    pkg = fn = None; deps = ""
    for line in block.splitlines():
        if line.startswith("Package: "): pkg = line[9:].strip()
        elif line.startswith("Filename: "): fn = line[10:].strip()
        elif line.startswith("Depends: "): deps = line[9:].strip()
    if pkg: stanzas[pkg] = {"fn": fn, "deps": deps}

print(f"[{ARCH}] postgresql Version: {stanzas['postgresql']['fn']}")

seen, order, queue = set(), [], ["postgresql"]
while queue:
    p = queue.pop(0)
    p = re.split(r"[ (:]", p, maxsplit=1)[0]
    if not p or p in seen: continue
    seen.add(p); order.append(p)
    for d in stanzas.get(p, {}).get("deps", "").split(","):
        d = re.sub(r"\(.*\)", "", d).strip().split(" ")[0]
        if d: queue.append(d)
print(f"[{ARCH}] closure:", " ".join(order))

def extract_deb(path):
    tmp = os.path.join(WORK, "_unpack")
    if os.path.exists(tmp): subprocess.run(["rm", "-rf", tmp])
    os.makedirs(tmp, exist_ok=True)
    members = subprocess.check_output(["ar", "t", path], text=True).split()
    data = [m for m in members if m.startswith("data.tar")][0]
    blob = subprocess.check_output(["ar", "p", path, data])
    flag = "-J" if data.endswith(".xz") else "-z" if data.endswith(".gz") else "--zstd"
    subprocess.run(["tar", flag, "-xf", "-", "-C", tmp], input=blob, check=True)
    src = os.path.join(tmp, "data/data/com.termux/files/usr")
    if os.path.isdir(src):
        subprocess.run(f"tar -cf - -C '{src}' . | tar -xf - -C '{PREFIX}'", shell=True, check=True)

for p in order:
    st = stanzas.get(p)
    if not st or not st["fn"]:
        print(f"  - {p}: no Filename, skip"); continue
    deb = os.path.join(DIST, os.path.basename(st["fn"]))
    if not os.path.exists(deb):
        urllib.request.urlretrieve(f"{REPO}/{st['fn']}", deb)
    extract_deb(deb)
    print(f"  - {p}: ok")

print(f"=== prefix {PREFIX} ===")
p = os.path.join(PREFIX, "bin", "postgres")
subprocess.run(["file", p])
print("initdb:", "ok" if os.path.exists(os.path.join(PREFIX, "bin", "initdb")) else "MISSING")
