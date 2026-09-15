// SFNT container parsing: the table directory and the head tables.
//
// A TrueType file is a directory of four-byte tags pointing at offsets, and
// almost every interesting field is indirect: glyph outlines live at offsets
// stored in another table, whose entries are stored HALVED depending on a flag
// in a third table. Nothing here can be guessed; it is all read.
//
// Everything that can be malformed is checked, because unlike every other input
// in this repo these bytes were laid out by someone else and may be broken.

export class FontError extends Error {
  constructor(message, hint = '') {
    super(message);
    this.name = 'FontError';
    this.hint = hint;
  }
}

export class Reader {
  constructor(buffer, offset = 0) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
    this.pos = offset;
  }

  get length() { return this.view.byteLength; }

  need(n, what) {
    if (this.pos + n > this.view.byteLength) {
      throw new FontError(
        `File ends mid-${what} — wanted ${n} bytes at offset ${this.pos}, only ${this.view.byteLength - this.pos} left.`,
        'The file is truncated or the table directory points outside it.',
      );
    }
  }

  u8() { this.need(1, 'byte'); return this.view.getUint8(this.pos++); }
  u16() { this.need(2, 'uint16'); const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  i16() { this.need(2, 'int16'); const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
  u32() { this.need(4, 'uint32'); const v = this.view.getUint32(this.pos); this.pos += 4; return v; }
  i32() { this.need(4, 'int32'); const v = this.view.getInt32(this.pos); this.pos += 4; return v; }

  tag() {
    this.need(4, 'tag');
    let s = '';
    for (let i = 0; i < 4; i++) s += String.fromCharCode(this.bytes[this.pos + i]);
    this.pos += 4;
    return s;
  }

  // 16.16 fixed point, used by head.version and hhea.
  fixed() { return this.i32() / 65536; }

  // LONGDATETIME: seconds since 1904-01-01. Read as two 32-bit halves because
  // the value exceeds Number.MAX_SAFE_INTEGER only in theory but getBigInt64 is
  // awkward to format.
  longDateTime() {
    const hi = this.u32();
    const lo = this.u32();
    const seconds = hi * 4294967296 + lo;
    return new Date(Date.UTC(1904, 0, 1) + seconds * 1000);
  }

  seek(p) { this.pos = p; return this; }
}

const KNOWN_SIGNATURES = {
  0x00010000: 'TrueType outlines',
  0x74727565: 'TrueType outlines (legacy "true" signature)',
};

export function parseDirectory(buffer) {
  const r = new Reader(buffer);
  if (buffer.byteLength < 12) {
    throw new FontError('That file is too small to be a font.');
  }

  const sfntVersion = r.u32();

  if (sfntVersion === 0x4f54544f) {
    throw new FontError(
      'This is a CFF / PostScript-flavoured OpenType font (OTTO).',
      'Its outlines are cubic Bezier charstrings inside a compressed Type 2 '
      + 'interpreter — a different program, not a bigger version of this one. '
      + 'Tofu handles TrueType (glyf) outlines only.',
    );
  }
  if (sfntVersion === 0x74746366) {
    throw new FontError(
      'This is a TrueType Collection (ttcf) — several fonts in one file.',
      'Extract a single font from it first.',
    );
  }
  if (sfntVersion === 0x774f4646 || sfntVersion === 0x774f4632) {
    throw new FontError(
      'This is a WOFF file — a compressed wrapper around a font.',
      'Tofu reads the raw SFNT container. Decompress it to a .ttf first.',
    );
  }
  if (!KNOWN_SIGNATURES[sfntVersion]) {
    throw new FontError(
      `Unrecognised sfntVersion 0x${sfntVersion.toString(16).padStart(8, '0')}.`,
      'The first four bytes of a TrueType font are 00 01 00 00.',
    );
  }

  const numTables = r.u16();
  r.u16(); // searchRange — derivable, and no reader should trust it
  r.u16(); // entrySelector
  r.u16(); // rangeShift

  const tables = new Map();
  const order = [];
  for (let i = 0; i < numTables; i++) {
    const tag = r.tag();
    const checksum = r.u32();
    const offset = r.u32();
    const length = r.u32();
    if (offset + length > buffer.byteLength) {
      throw new FontError(
        `Table "${tag}" claims bytes ${offset}–${offset + length} but the file is only ${buffer.byteLength} long.`,
        'The table directory points outside the file, so it is corrupt or truncated.',
      );
    }
    tables.set(tag, { tag, checksum, offset, length });
    order.push(tag);
  }

  return { sfntVersion, numTables, tables, order, buffer, byteLength: buffer.byteLength };
}

const required = (font, tag) => {
  const t = font.tables.get(tag);
  if (!t) {
    throw new FontError(
      `This font has no "${tag}" table.`,
      'Every TrueType font needs head, maxp, hhea, hmtx, loca, glyf and cmap.',
    );
  }
  return t;
};

export function parseHead(font) {
  const t = required(font, 'head');
  const r = new Reader(font.buffer, t.offset);
  const head = {
    version: r.fixed(),
    fontRevision: r.fixed(),
    checkSumAdjustment: r.u32(),
    magicNumber: r.u32(),
    flags: r.u16(),
    unitsPerEm: r.u16(),
    created: r.longDateTime(),
    modified: r.longDateTime(),
    xMin: r.i16(), yMin: r.i16(), xMax: r.i16(), yMax: r.i16(),
    macStyle: r.u16(),
    lowestRecPPEM: r.u16(),
    fontDirectionHint: r.i16(),
    indexToLocFormat: r.i16(),
    glyphDataFormat: r.i16(),
  };
  if (head.magicNumber !== 0x5f0f3cf5) {
    throw new FontError(
      `head.magicNumber is 0x${head.magicNumber.toString(16)}, expected 0x5F0F3CF5.`,
      'This is the format\'s own sanity check, so the file is not a valid TrueType font.',
    );
  }
  if (head.unitsPerEm === 0) {
    throw new FontError('head.unitsPerEm is 0, so every glyph would scale to nothing.');
  }
  if (head.indexToLocFormat !== 0 && head.indexToLocFormat !== 1) {
    throw new FontError(
      `head.indexToLocFormat is ${head.indexToLocFormat}, expected 0 (short) or 1 (long).`,
    );
  }
  return head;
}

export function parseMaxp(font) {
  const t = required(font, 'maxp');
  const r = new Reader(font.buffer, t.offset);
  return { version: r.fixed(), numGlyphs: r.u16() };
}

export function parseHhea(font) {
  const t = required(font, 'hhea');
  const r = new Reader(font.buffer, t.offset);
  const h = {
    version: r.fixed(),
    ascender: r.i16(), descender: r.i16(), lineGap: r.i16(),
    advanceWidthMax: r.u16(),
    minLeftSideBearing: r.i16(), minRightSideBearing: r.i16(), xMaxExtent: r.i16(),
    caretSlopeRise: r.i16(), caretSlopeRun: r.i16(), caretOffset: r.i16(),
  };
  r.i16(); r.i16(); r.i16(); r.i16(); // four reserved
  h.metricDataFormat = r.i16();
  h.numberOfHMetrics = r.u16();
  return h;
}

// hmtx is a run of (advanceWidth, lsb) pairs followed by lsb-only entries — the
// last advance repeats for every glyph past numberOfHMetrics, which is how
// monospaced fonts stay small.
export function parseHmtx(font, numGlyphs, numberOfHMetrics) {
  const t = required(font, 'hmtx');
  const r = new Reader(font.buffer, t.offset);
  const advances = new Uint16Array(numGlyphs);
  const lsbs = new Int16Array(numGlyphs);
  let last = 0;
  for (let i = 0; i < numGlyphs; i++) {
    if (i < numberOfHMetrics) {
      last = r.u16();
      advances[i] = last;
      lsbs[i] = r.i16();
    } else {
      advances[i] = last;
      lsbs[i] = r.pos + 2 <= r.length ? r.i16() : 0;
    }
  }
  return { advances, lsbs };
}

export function parseLoca(font, numGlyphs, indexToLocFormat) {
  const t = required(font, 'loca');
  const r = new Reader(font.buffer, t.offset);
  const offsets = new Uint32Array(numGlyphs + 1);
  for (let i = 0; i <= numGlyphs; i++) {
    // The short form stores offsets divided by two, which is why every glyph in
    // a short-loca font must be padded to an even length.
    offsets[i] = indexToLocFormat === 0 ? r.u16() * 2 : r.u32();
  }
  for (let i = 0; i < numGlyphs; i++) {
    if (offsets[i] > offsets[i + 1]) {
      throw new FontError(
        `loca is not monotonic: glyph ${i} starts at ${offsets[i]} but ends at ${offsets[i + 1]}.`,
      );
    }
  }
  return offsets;
}

// --- cmap ------------------------------------------------------------------

const PLATFORM = { 0: 'Unicode', 1: 'Macintosh', 3: 'Windows' };

export function parseCmap(font) {
  const t = required(font, 'cmap');
  const base = t.offset;
  const r = new Reader(font.buffer, base);
  r.u16(); // version
  const numTables = r.u16();

  const subtables = [];
  for (let i = 0; i < numTables; i++) {
    const platformID = r.u16();
    const encodingID = r.u16();
    const offset = r.u32();
    subtables.push({ platformID, encodingID, offset: base + offset });
  }

  // Prefer full-Unicode (format 12) over BMP-only, and Windows over Mac.
  const score = (s) => {
    const fmt = new Reader(font.buffer, s.offset).u16();
    let v = 0;
    if (fmt === 12) v += 100;
    else if (fmt === 4) v += 50;
    if (s.platformID === 3 && s.encodingID === 10) v += 20;
    else if (s.platformID === 3 && s.encodingID === 1) v += 10;
    else if (s.platformID === 0) v += 8;
    return v;
  };

  let best = null;
  let bestScore = -1;
  for (const s of subtables) {
    let sc;
    try { sc = score(s); } catch { continue; }
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  if (!best) throw new FontError('No usable cmap subtable — nothing maps characters to glyphs.');

  const format = new Reader(font.buffer, best.offset).u16();
  const map = format === 12
    ? parseCmap12(font.buffer, best.offset)
    : format === 4
      ? parseCmap4(font.buffer, best.offset)
      : null;
  if (!map) {
    throw new FontError(
      `The best cmap subtable is format ${format}, which Tofu does not read.`,
      'Supported: format 4 (BMP) and format 12 (full Unicode).',
    );
  }

  return {
    map,
    format,
    platform: PLATFORM[best.platformID] ?? `platform ${best.platformID}`,
    encodingID: best.encodingID,
    subtables: subtables.map((s) => ({
      ...s,
      platform: PLATFORM[s.platformID] ?? `platform ${s.platformID}`,
      format: (() => { try { return new Reader(font.buffer, s.offset).u16(); } catch { return -1; } })(),
    })),
  };
}

// Format 4: segmented BMP coverage. idRangeOffset is the awkward one — it is a
// byte offset measured FROM ITS OWN ADDRESS in the array into a trailing
// glyphIdArray, so reading it means doing pointer arithmetic inside the table.
function parseCmap4(buffer, offset) {
  const r = new Reader(buffer, offset);
  r.u16(); // format
  const length = r.u16();
  r.u16(); // language
  const segCountX2 = r.u16();
  const segCount = segCountX2 / 2;
  r.u16(); r.u16(); r.u16(); // searchRange, entrySelector, rangeShift

  const endCodes = new Uint16Array(segCount);
  for (let i = 0; i < segCount; i++) endCodes[i] = r.u16();
  r.u16(); // reservedPad
  const startCodes = new Uint16Array(segCount);
  for (let i = 0; i < segCount; i++) startCodes[i] = r.u16();
  const idDeltas = new Int16Array(segCount);
  for (let i = 0; i < segCount; i++) idDeltas[i] = r.i16();

  const idRangeOffsetPos = r.pos;
  const idRangeOffsets = new Uint16Array(segCount);
  for (let i = 0; i < segCount; i++) idRangeOffsets[i] = r.u16();

  const end = offset + length;
  const view = new DataView(buffer);
  const map = new Map();

  for (let seg = 0; seg < segCount; seg++) {
    const start = startCodes[seg];
    const stop = endCodes[seg];
    if (start === 0xffff) continue;
    for (let cp = start; cp <= stop && cp !== 0x10000; cp++) {
      let gid;
      if (idRangeOffsets[seg] === 0) {
        gid = (cp + idDeltas[seg]) & 0xffff;
      } else {
        const addr = idRangeOffsetPos + seg * 2 + idRangeOffsets[seg] + (cp - start) * 2;
        if (addr + 2 > end || addr + 2 > buffer.byteLength) continue;
        gid = view.getUint16(addr);
        if (gid !== 0) gid = (gid + idDeltas[seg]) & 0xffff;
      }
      if (gid !== 0) map.set(cp, gid);
    }
  }
  return map;
}

// Format 12: flat list of (start, end, startGlyphID) groups. Simple, and the
// only way to reach anything above the BMP.
function parseCmap12(buffer, offset) {
  const r = new Reader(buffer, offset);
  r.u16(); // format
  r.u16(); // reserved
  r.u32(); // length
  r.u32(); // language
  const numGroups = r.u32();
  const map = new Map();
  for (let g = 0; g < numGroups; g++) {
    const start = r.u32();
    const end = r.u32();
    const startGid = r.u32();
    // Guard against a group claiming the whole plane.
    const span = Math.min(end - start, 0x10ffff);
    for (let i = 0; i <= span; i++) map.set(start + i, startGid + i);
  }
  return map;
}

// --- name ------------------------------------------------------------------

const NAME_IDS = {
  0: 'Copyright', 1: 'Family', 2: 'Subfamily', 3: 'Unique ID', 4: 'Full name',
  5: 'Version', 6: 'PostScript name', 7: 'Trademark', 8: 'Manufacturer',
  9: 'Designer', 10: 'Description', 11: 'Vendor URL', 12: 'Designer URL',
  13: 'Licence', 14: 'Licence URL', 16: 'Typographic family', 17: 'Typographic subfamily',
};

export function parseName(font) {
  const t = font.tables.get('name');
  if (!t) return [];
  const r = new Reader(font.buffer, t.offset);
  r.u16(); // format
  const count = r.u16();
  const stringOffset = r.u16();
  const records = [];
  for (let i = 0; i < count; i++) {
    const platformID = r.u16();
    const encodingID = r.u16();
    r.u16(); // languageID
    const nameID = r.u16();
    const length = r.u16();
    const offset = r.u16();
    records.push({ platformID, encodingID, nameID, length, offset });
  }

  const out = [];
  const seen = new Set();
  for (const rec of records) {
    const start = t.offset + stringOffset + rec.offset;
    if (start + rec.length > font.buffer.byteLength) continue;
    const bytes = new Uint8Array(font.buffer, start, rec.length);
    // Windows name records are UTF-16BE; Mac ones are usually MacRoman, which
    // for ASCII is byte-identical.
    let value;
    if (rec.platformID === 3 || (rec.platformID === 0)) {
      value = '';
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        value += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      }
    } else {
      value = String.fromCharCode(...bytes);
    }
    value = value.replace(/\0/g, '').trim();
    if (!value) continue;
    const key = `${rec.nameID}|${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ nameID: rec.nameID, label: NAME_IDS[rec.nameID] ?? `Name ${rec.nameID}`, value });
  }
  out.sort((a, b) => a.nameID - b.nameID);
  return out;
}

export function parseOS2(font) {
  const t = font.tables.get('OS/2');
  if (!t) return null;
  const r = new Reader(font.buffer, t.offset);
  const os2 = {
    version: r.u16(),
    xAvgCharWidth: r.i16(),
    usWeightClass: r.u16(),
    usWidthClass: r.u16(),
    fsType: r.u16(),
  };
  return os2;
}

// Everything the caller needs, parsed once.
export function loadFont(buffer) {
  const font = parseDirectory(buffer);
  const head = parseHead(font);
  const maxp = parseMaxp(font);
  const hhea = parseHhea(font);
  const hmtx = parseHmtx(font, maxp.numGlyphs, hhea.numberOfHMetrics);
  const loca = parseLoca(font, maxp.numGlyphs, head.indexToLocFormat);
  const cmap = parseCmap(font);
  const names = parseName(font);
  const os2 = parseOS2(font);
  required(font, 'glyf');
  return { ...font, head, maxp, hhea, hmtx, loca, cmap, names, os2 };
}
