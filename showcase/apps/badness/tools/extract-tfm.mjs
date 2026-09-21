// Parses cmr10.tfm as bytes and emits the JSON metrics table the engine reads.
//
// Reading the binary rather than `tftopl`'s decimals is not fussiness. TFM
// stores lengths as 32-bit fixed point with 20 fractional bits, and TeX turns
// those into scaled points with a specific integer routine (store_scaled,
// tex.web S572) whose result differs from ordinary rounding: the interword
// space of cmr10 comes out 218453sp in TeX and 218454sp if you round the
// printed decimal. One scaled point is 1/65536 of a point and will never be
// visible, but it can move a badness across a boundary, and the claim this
// project makes is that none of the numbers differ at all.
//
//   node extract-tfm.mjs /path/to/cmr10.tfm out.json [atSizePt]
import { readFileSync, writeFileSync } from 'node:fs';

const buf = readFileSync(process.argv[2]);
const out = process.argv[3] ?? 'cmr10.json';
const atSizePt = Number(process.argv[4] ?? 10);

const u16 = (i) => buf.readUInt16BE(i * 2);

// --- header ---------------------------------------------------------------
const [lf, lh, bc, ec, nw, nh, nd, ni, nl, nk, ne, np] =
  Array.from({ length: 12 }, (_, i) => u16(i));
if (lf * 4 !== buf.length) throw new Error(`length mismatch: lf=${lf} bytes=${buf.length}`);

let p = 24;
const headerAt = p;           p += lh * 4;
const charInfoAt = p;         p += (ec - bc + 1) * 4;
const widthAt = p;            p += nw * 4;
const heightAt = p;           p += nh * 4;
const depthAt = p;            p += nd * 4;
const italicAt = p;           p += ni * 4;
const ligKernAt = p;          p += nl * 4;
const kernAt = p;             p += nk * 4;
const extenAt = p;            p += ne * 4;
const paramAt = p;

// --- TeX's fixed-point -> scaled-point conversion, S572 -------------------
let z = Math.round(atSizePt * 65536);
let alpha = 16;
while (z >= 0x800000) { z = Math.floor(z / 2); alpha += alpha; }
const beta = Math.floor(256 / alpha);
alpha *= z;

function storeScaled(off) {
  const a = buf[off], b = buf[off + 1], c = buf[off + 2], d = buf[off + 3];
  const sw = Math.floor((Math.floor((Math.floor((d * z) / 256) + c * z) / 256) + b * z) / beta);
  if (a === 0) return sw;
  if (a === 255) return sw - alpha;
  throw new Error(`bad tfm fix_word at ${off}`);
}

const widths = Array.from({ length: nw }, (_, i) => storeScaled(widthAt + i * 4));
const heights = Array.from({ length: nh }, (_, i) => storeScaled(heightAt + i * 4));
const kerns = Array.from({ length: nk }, (_, i) => storeScaled(kernAt + i * 4));
const params = Array.from({ length: np }, (_, i) => storeScaled(paramAt + i * 4));

// --- characters -----------------------------------------------------------
const width = {}, height = {}, tag = {}, remainder = {};
for (let ch = bc; ch <= ec; ch++) {
  const o = charInfoAt + (ch - bc) * 4;
  const wi = buf[o];
  if (wi === 0) continue;                       // character not present
  width[ch] = widths[wi];
  height[ch] = heights[buf[o + 1] >> 4];
  tag[ch] = buf[o + 2] & 3;
  remainder[ch] = buf[o + 3];
}

// --- ligature / kern programs --------------------------------------------
const kern = {}, lig = {};
for (const chStr of Object.keys(tag)) {
  const ch = +chStr;
  if (tag[ch] !== 1) continue;                  // 1 = has a lig/kern program
  let k = remainder[ch];

  // A program may be relocated when the table is large; the first step says so.
  let first = ligKernAt + k * 4;
  if (buf[first] > 128) k = 256 * buf[first + 2] + buf[first + 3];

  for (let guard = 0; guard < nl; guard++) {
    const o = ligKernAt + k * 4;
    const skip = buf[o], next = buf[o + 1], op = buf[o + 2], rem = buf[o + 3];
    if (skip <= 128) {
      // A program is scanned in order and the FIRST instruction matching the
      // next character wins. Labels accumulate, so one program can contain two
      // steps for the same pair: cmr10 reaches "v" through a label shared with
      // "k", which kerns v+a by -0.055555, and then through the block labelled
      // "w", which kerns it by -0.027779. Letting the second overwrite the
      // first makes every "va" in the font 18204sp too wide.
      const key = `${ch},${next}`;
      if (op >= 128) { if (!(key in kern)) kern[key] = kerns[256 * (op - 128) + rem]; }
      else if (op === 0) { if (!(key in lig)) lig[key] = rem; }   // plain LIG=:
    }
    if (skip >= 128) break;
    k += skip + 1;
  }
}

// CM keeps the f-ligatures in slots 11..15; map them to the glyphs a webfont draws.
const ligUnicode = { 11: 'ﬀ', 12: 'ﬁ', 13: 'ﬂ', 14: 'ﬃ', 15: 'ﬄ' };

const metrics = {
  font: 'cmr10',
  atSizePt,
  note: 'Parsed from cmr10.tfm. All lengths are scaled points (1pt = 65536sp), converted with TeX’s store_scaled.',
  fontdimen: {
    slant: params[0], space: params[1], stretch: params[2], shrink: params[3],
    xheight: params[4], quad: params[5], extraspace: params[6],
  },
  width, height, kern, lig, ligUnicode,
};
writeFileSync(out, JSON.stringify(metrics));
console.log(`chars=${Object.keys(width).length} kerns=${Object.keys(kern).length} ligs=${Object.keys(lig).length}`);
console.log(`space=${params[1]} stretch=${params[2]} shrink=${params[3]} quad=${params[5]}  (TeX: 218453 109226 72818)`);
