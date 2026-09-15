#!/usr/bin/env python3
"""Pack the CMU Pronouncing Dictionary into the front-coded binary the app loads.

    pip install cmudict && python3 tools/build-dict.py

Reads the dictionary out of the installed `cmudict` package and writes data/dict.bin.
The dictionary is sorted, so successive headwords share long prefixes; front-coding
each word against its predecessor is what keeps the payload near a megabyte.

Layout (little-endian):
    magic   "GHOT"                     4 bytes
    version u16 = 1
    nphones u16                        size of the phone symbol table
    nwords  u32
    phone table: for each phone, u8 length + ASCII bytes
    entries: for each word, in sorted order
        u8  shared    bytes shared with the previous headword
        u8  suffixlen
        ..  suffix    ASCII
        u8  nphones
        ..  phone ids u8
"""
import re
import struct
import sys
from pathlib import Path

try:
    import cmudict
except ImportError:
    sys.exit("pip install cmudict")

src = Path(cmudict.__file__).parent / "data" / "cmudict.dict"
OUT = Path(__file__).resolve().parent.parent / "data" / "dict.bin"

entries = []
for line in src.read_text(encoding="utf-8", errors="replace").splitlines():
    line = line.split("#")[0].strip()
    if not line:
        continue
    parts = line.split()
    word, phones = parts[0], parts[1:]
    # "(2)" marks an alternate pronunciation; keep only the primary one.
    if "(" in word or not re.fullmatch(r"[a-z]+", word) or not phones:
        continue
    entries.append((word, phones))

entries.sort(key=lambda e: e[0])
seen = {}
for _, phones in entries:
    for p in phones:
        seen.setdefault(p, len(seen))
symbols = sorted(seen, key=seen.get)
if len(symbols) > 255:
    sys.exit(f"phone table too large for u8 ids: {len(symbols)}")
pid = {p: i for i, p in enumerate(symbols)}

buf = bytearray()
buf += b"GHOT" + struct.pack("<HHI", 1, len(symbols), len(entries))
for s in symbols:
    b = s.encode("ascii")
    buf += bytes([len(b)]) + b

prev = ""
for word, phones in entries:
    shared = 0
    limit = min(len(prev), len(word), 255)
    while shared < limit and prev[shared] == word[shared]:
        shared += 1
    suffix = word[shared:].encode("ascii")
    if len(suffix) > 255 or len(phones) > 255:
        continue
    buf += bytes([shared, len(suffix)]) + suffix
    buf += bytes([len(phones)]) + bytes(pid[p] for p in phones)
    prev = word

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_bytes(buf)
print(f"{len(entries)} words, {len(symbols)} phones -> {OUT} ({len(buf)/1e6:.2f} MB)")
