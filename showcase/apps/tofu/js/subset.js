// Building a new font.
//
// Reading a font is mechanical. Writing one that a browser's OpenType sanitiser
// will accept is where the format bites, and three things do the biting:
//
//  1. Composite glyphs name their components by glyph id. Renumber the glyphs
//     and those ids must be patched INSIDE the glyph's own bytes, or the subset
//     assembles accents out of whatever now sits at the old index.
//  2. Short `loca` stores offsets halved, so every glyph must be padded to an
//     even length or the offsets cannot represent it.
//  3. `head.checkSumAdjustment` is a checksum written into the very buffer it
//     is computed over. Zero it, sum the file, subtract from 0xB1B0AFBA.
//
// The `cmap` format 4 escape is deliberate. Its `idRangeOffset` field is a byte
// offset measured from its own address into a trailing array — the single
// nastiest layout in the format. Emitting only segments with `idRangeOffset = 0`
// and a computed `idDelta` is fully legal, costs a few extra segments, and
// removes that pointer arithmetic entirely.

import { Reader, FontError } from './sfnt.js';
import { glyphClosure } from './glyf.js';

// What each droppable table does, so the bill can name the cost rather than
// just the byte count.
export const TABLE_ROLES = {
  GSUB: 'ligatures and other glyph substitutions',
  GPOS: 'kerning and mark positioning',
  GDEF: 'glyph classes used by GSUB/GPOS',
  kern: 'legacy kerning pairs',
  fpgm: 'hinting programs',
  prep: 'hinting setup',
  'cvt ': 'hinting control values',
  gasp: 'grid-fitting and anti-aliasing hints',
  hdmx: 'precomputed device metrics',
  LTSH: 'linear threshold metrics',
  VDMX: 'vertical device metrics',
  DSIG: 'digital signature',
  FFTM: 'FontForge timestamps',
  vmtx: 'vertical metrics',
  vhea: 'vertical header',
  morx: 'Apple Advanced Typography substitutions',
  feat: 'Apple Advanced Typography features',
};

// Tables carried through unchanged. `name` stays because it holds the copyright
// and licence, which must survive any subset.
const KEEP_AS_IS = ['name', 'OS/2'];

class Writer {
  constructor() {
    this.parts = [];
    this.length = 0;
  }

  bytes(u8) { this.parts.push(u8); this.length += u8.length; return this; }

  u8(v) { return this.bytes(new Uint8Array([v & 0xff])); }

  u16(v) {
    return this.bytes(new Uint8Array([(v >>> 8) & 0xff, v & 0xff]));
  }

  i16(v) { return this.u16(v < 0 ? v + 0x10000 : v); }

  u32(v) {
    return this.bytes(new Uint8Array([
      (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff,
    ]));
  }

  tag(s) {
    return this.bytes(new Uint8Array([0, 1, 2, 3].map((i) => s.charCodeAt(i) & 0xff)));
  }

  build() {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

const pad4 = (n) => (4 - (n % 4)) % 4;

// Table checksum: the sum of its uint32s, with the tail zero-padded.
function checksum(bytes) {
  let sum = 0;
  const n = bytes.length;
  for (let i = 0; i < n; i += 4) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const b3 = bytes[i + 3] ?? 0;
    sum = (sum + (((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0)) >>> 0;
  }
  return sum >>> 0;
}

// Walk a composite glyph's bytes and report where each component glyph id sits,
// so the ids can be patched in place without re-serializing the record (which
// would risk dropping instructions or point-matching args).
function compositeIdOffsets(buffer, glyphStart, glyphLength) {
  const r = new Reader(buffer, glyphStart);
  const numberOfContours = r.i16();
  if (numberOfContours >= 0) return [];
  r.pos += 8; // bbox

  const offsets = [];
  const end = glyphStart + glyphLength;
  let flags;
  do {
    if (r.pos + 4 > end) break;
    flags = r.u16();
    offsets.push(r.pos - glyphStart); // glyphIndex sits here
    r.u16();
    r.pos += (flags & 0x0001) ? 4 : 2;           // args
    if (flags & 0x0008) r.pos += 2;              // scale
    else if (flags & 0x0040) r.pos += 4;         // x and y scale
    else if (flags & 0x0080) r.pos += 8;         // 2x2
  } while (flags & 0x0020);
  return offsets;
}

// cmap format 4, built only from segments whose idRangeOffset is zero.
function buildCmap4(pairs) {
  // pairs: sorted [codepoint, newGid], BMP only.
  const segments = [];
  let i = 0;
  while (i < pairs.length) {
    const [startCp, startGid] = pairs[i];
    const delta = (startGid - startCp) & 0xffff;
    let j = i;
    while (
      j + 1 < pairs.length
      && pairs[j + 1][0] === pairs[j][0] + 1
      && ((pairs[j + 1][1] - pairs[j + 1][0]) & 0xffff) === delta
    ) j++;
    segments.push({ start: startCp, end: pairs[j][0], delta });
    i = j + 1;
  }
  // The format requires a terminating segment at 0xFFFF.
  segments.push({ start: 0xffff, end: 0xffff, delta: 1 });

  const segCount = segments.length;
  const w = new Writer();
  const length = 16 + segCount * 8;
  w.u16(4).u16(length).u16(0);
  w.u16(segCount * 2);
  const pow = 2 ** Math.floor(Math.log2(segCount));
  w.u16(pow * 2);                       // searchRange
  w.u16(Math.log2(pow));                // entrySelector
  w.u16(segCount * 2 - pow * 2);        // rangeShift
  for (const s of segments) w.u16(s.end);
  w.u16(0);                             // reservedPad
  for (const s of segments) w.u16(s.start);
  for (const s of segments) w.u16(s.delta);
  for (let k = 0; k < segCount; k++) w.u16(0); // idRangeOffset, all zero
  return { bytes: w.build(), segCount };
}

// cmap format 12, needed only when a retained codepoint sits above the BMP.
function buildCmap12(pairs) {
  const groups = [];
  for (const [cp, gid] of pairs) {
    const last = groups[groups.length - 1];
    if (last && cp === last.end + 1 && gid === last.startGid + (last.end - last.start) + 1) {
      last.end = cp;
    } else {
      groups.push({ start: cp, end: cp, startGid: gid });
    }
  }
  const w = new Writer();
  w.u16(12).u16(0);
  w.u32(16 + groups.length * 12);
  w.u32(0);
  w.u32(groups.length);
  for (const g of groups) { w.u32(g.start); w.u32(g.end); w.u32(g.startGid); }
  return { bytes: w.build(), groupCount: groups.length };
}

function buildCmapTable(pairs) {
  const bmp = pairs.filter(([cp]) => cp <= 0xffff);
  const supp = pairs;
  const needs12 = pairs.some(([cp]) => cp > 0xffff);

  const sub4 = buildCmap4(bmp);
  const subs = [{ platformID: 3, encodingID: 1, bytes: sub4.bytes }];
  let groupCount = 0;
  if (needs12) {
    const sub12 = buildCmap12(supp);
    groupCount = sub12.groupCount;
    subs.push({ platformID: 3, encodingID: 10, bytes: sub12.bytes });
  }

  const w = new Writer();
  w.u16(0).u16(subs.length);
  let offset = 4 + subs.length * 8;
  for (const s of subs) {
    w.u16(s.platformID).u16(s.encodingID).u32(offset);
    offset += s.bytes.length;
  }
  for (const s of subs) w.bytes(s.bytes);
  return { bytes: w.build(), segCount: sub4.segCount, groupCount, formats: subs.length === 2 ? [4, 12] : [4] };
}

export function subsetFont(font, text, options = {}) {
  const { keepNotdef = true } = options;

  const codepoints = [];
  const missing = [];
  const seen = new Set();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (seen.has(cp)) continue;
    seen.add(cp);
    if (font.cmap.map.has(cp)) codepoints.push(cp);
    else missing.push(ch);
  }
  if (codepoints.length === 0) {
    throw new FontError(
      'None of those characters exist in this font.',
      'A subset with no glyphs would render as tofu everywhere.',
    );
  }
  codepoints.sort((a, b) => a - b);

  // Closure: the mapped glyphs, .notdef, and every component they depend on.
  const seeds = codepoints.map((cp) => font.cmap.map.get(cp));
  if (keepNotdef) seeds.push(0);
  const keep = glyphClosure(font, seeds);

  // Old gid order is preserved so the new ids stay monotonic in the old ones,
  // which keeps cmap segments long and the table small.
  const oldGids = [...keep].sort((a, b) => a - b);
  const newIdOf = new Map(oldGids.map((g, i) => [g, i]));
  const numGlyphs = oldGids.length;

  // --- glyf, with composite component ids patched in place.
  const glyfTable = font.tables.get('glyf');
  const glyphChunks = [];
  const newLoca = new Uint32Array(numGlyphs + 1);
  let total = 0;
  let compositesPatched = 0;

  for (let i = 0; i < numGlyphs; i++) {
    newLoca[i] = total;
    const gid = oldGids[i];
    const start = font.loca[gid];
    const end = font.loca[gid + 1];
    const len = end - start;
    if (len === 0) { glyphChunks.push(new Uint8Array(0)); continue; }

    const chunk = new Uint8Array(font.buffer.slice(glyfTable.offset + start, glyfTable.offset + end));
    for (const off of compositeIdOffsets(font.buffer, glyfTable.offset + start, len)) {
      const oldComponent = (chunk[off] << 8) | chunk[off + 1];
      const mapped = newIdOf.get(oldComponent);
      if (mapped === undefined) {
        throw new FontError(
          `Glyph ${gid} is built from component ${oldComponent}, which the closure missed.`,
          'This is a bug in the subsetter, not in the font.',
        );
      }
      chunk[off] = (mapped >>> 8) & 0xff;
      chunk[off + 1] = mapped & 0xff;
      compositesPatched++;
    }

    // Pad to an even length so a short loca can address the next glyph.
    const padded = chunk.length % 2 === 0 ? chunk : (() => {
      const p = new Uint8Array(chunk.length + 1);
      p.set(chunk);
      return p;
    })();
    glyphChunks.push(padded);
    total += padded.length;
  }
  newLoca[numGlyphs] = total;

  const glyfBytes = new Uint8Array(total);
  {
    let o = 0;
    for (const c of glyphChunks) { glyfBytes.set(c, o); o += c.length; }
  }

  // --- loca. Short format halves every offset, so it needs all of them even.
  const canUseShort = total < 0x20000 && newLoca.every((v) => v % 2 === 0);
  const indexToLocFormat = canUseShort ? 0 : 1;
  const locaW = new Writer();
  for (let i = 0; i <= numGlyphs; i++) {
    if (canUseShort) locaW.u16(newLoca[i] / 2);
    else locaW.u32(newLoca[i]);
  }

  // --- hmtx: full metrics for every glyph, no run-length tail.
  const hmtxW = new Writer();
  for (const gid of oldGids) {
    hmtxW.u16(font.hmtx.advances[gid]);
    hmtxW.i16(font.hmtx.lsbs[gid]);
  }

  // --- cmap
  const pairs = codepoints.map((cp) => [cp, newIdOf.get(font.cmap.map.get(cp))]);
  const cmapBuilt = buildCmapTable(pairs);

  // --- head, copied and patched.
  const headSrc = font.tables.get('head');
  const headBytes = new Uint8Array(font.buffer.slice(headSrc.offset, headSrc.offset + 54));
  new DataView(headBytes.buffer).setUint32(8, 0);               // checkSumAdjustment, filled later
  new DataView(headBytes.buffer).setInt16(50, indexToLocFormat);

  // --- hhea, copied with numberOfHMetrics updated.
  const hheaSrc = font.tables.get('hhea');
  const hheaBytes = new Uint8Array(font.buffer.slice(hheaSrc.offset, hheaSrc.offset + 36));
  new DataView(hheaBytes.buffer).setUint16(34, numGlyphs);

  // --- maxp, copied with numGlyphs updated.
  const maxpSrc = font.tables.get('maxp');
  const maxpBytes = new Uint8Array(font.buffer.slice(maxpSrc.offset, maxpSrc.offset + maxpSrc.length));
  new DataView(maxpBytes.buffer, maxpBytes.byteOffset).setUint16(4, numGlyphs);

  // --- post 3.0: no glyph names. Keeping the original would name the wrong
  // glyphs, which is worse than naming none.
  const postW = new Writer();
  postW.u32(0x00030000).u32(0).i16(0).i16(0).u32(0).u32(0).u32(0).u32(0).u32(0);

  const out = new Map();
  out.set('head', headBytes);
  out.set('hhea', hheaBytes);
  out.set('maxp', maxpBytes);
  out.set('hmtx', hmtxW.build());
  out.set('cmap', cmapBuilt.bytes);
  out.set('loca', locaW.build());
  out.set('glyf', glyfBytes);
  out.set('post', postW.build());
  for (const tag of KEEP_AS_IS) {
    const t = font.tables.get(tag);
    if (t) out.set(tag, new Uint8Array(font.buffer.slice(t.offset, t.offset + t.length)));
  }

  const dropped = font.order
    .filter((tag) => !out.has(tag))
    .map((tag) => ({
      tag,
      bytes: font.tables.get(tag).length,
      role: TABLE_ROLES[tag] ?? 'unknown purpose',
    }));

  const bytes = serialize(out);

  return {
    bytes,
    numGlyphs,
    oldGids,
    newIdOf,
    codepoints,
    missing,
    dropped,
    indexToLocFormat,
    compositesPatched,
    cmapSegments: cmapBuilt.segCount,
    cmapFormats: cmapBuilt.formats,
    originalSize: font.byteLength,
    tableSizes: [...out.entries()].map(([tag, b]) => ({ tag, bytes: b.length })),
  };
}

// Table directory + padded table data + the self-referential checksum.
function serialize(tables) {
  const tags = [...tables.keys()].sort(); // the spec requires ascending tag order
  const numTables = tags.length;
  const headerSize = 12 + numTables * 16;

  let offset = headerSize;
  const entries = [];
  for (const tag of tags) {
    const body = tables.get(tag);
    entries.push({ tag, body, offset, length: body.length });
    offset += body.length + pad4(body.length);
  }
  const totalSize = offset;

  const file = new Uint8Array(totalSize);
  const view = new DataView(file.buffer);

  const pow = 2 ** Math.floor(Math.log2(numTables));
  view.setUint32(0, 0x00010000);
  view.setUint16(4, numTables);
  view.setUint16(6, pow * 16);
  view.setUint16(8, Math.log2(pow));
  view.setUint16(10, numTables * 16 - pow * 16);

  let d = 12;
  for (const e of entries) {
    for (let i = 0; i < 4; i++) file[d + i] = e.tag.charCodeAt(i) & 0xff;
    view.setUint32(d + 4, checksum(e.body));
    view.setUint32(d + 8, e.offset);
    view.setUint32(d + 12, e.length);
    d += 16;
    file.set(e.body, e.offset);
  }

  // checkSumAdjustment is computed over the finished file with its own field
  // zeroed, which it already is.
  const headEntry = entries.find((e) => e.tag === 'head');
  if (headEntry) {
    const whole = checksum(file);
    const adjustment = (0xb1b0afba - whole) >>> 0;
    view.setUint32(headEntry.offset + 8, adjustment);
  }

  return file;
}
