// Text -> the box/glue/penalty list the line breaker consumes.
//
// This is where the font actually enters. Widths, kerns and ligatures come
// from cmr10.tfm, and the interword glue comes from the font's own dimensions
// rather than a guess, because TeX takes them from there too.

import { box, glue, penalty, SP } from './linebreak.js';

/** Plain TeX's space factors. A period earns a wider, more stretchable gap. */
const SFCODE = { '.': 3000, '?': 3000, '!': 3000, ':': 2000, ';': 1500, ',': 1250 };

export class Font {
  /** @param {object} metrics parsed from data/cmr10.json — already in scaled points */
  constructor(metrics) {
    this.m = metrics;
    this.atSizePt = metrics.atSizePt ?? 10;
  }

  charWidth(code) { return this.m.width[code] ?? 0; }

  kern(a, b) {
    const k = this.m.kern[`${a},${b}`];
    return k === undefined ? 0 : k;
  }

  ligature(a, b) {
    const l = this.m.lig[`${a},${b}`];
    return l === undefined ? null : l;
  }

  get space() { return this.m.fontdimen.space; }
  get stretch() { return this.m.fontdimen.stretch; }
  get shrink() { return this.m.fontdimen.shrink; }
  get extraSpace() { return this.m.fontdimen.extraspace; }
  get quad() { return this.m.fontdimen.quad; }

  /** Display string for a code, mapping CM's ligature slots to real glyphs. */
  glyph(code) { return this.m.ligUnicode[code] ?? String.fromCharCode(code); }

  /**
   * Width of a run of text with ligatures formed and kerns applied, plus the
   * string as it should actually be drawn.
   */
  measure(text) {
    const codes = [];
    for (let i = 0; i < text.length; i++) codes.push(text.charCodeAt(i));

    // Ligature pass, repeated so that f+f -> ff then ff+i -> ffi.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < codes.length - 1; i++) {
        const l = this.ligature(codes[i], codes[i + 1]);
        if (l !== null) {
          codes.splice(i, 2, l);
          i--;
        }
      }
    }

    let width = 0;
    let glyphs = '';
    for (let i = 0; i < codes.length; i++) {
      width += this.charWidth(codes[i]);
      glyphs += this.glyph(codes[i]);
      if (i < codes.length - 1) width += this.kern(codes[i], codes[i + 1]);
    }
    return { width, glyphs, codes };
  }
}

/** Space factor after seeing a character, per TeX §1034. */
function updateSpaceFactor(sf, ch) {
  const code = SFCODE[ch] ?? (ch >= 'A' && ch <= 'Z' ? 999 : 1000);
  if (code === 1000) return 1000;
  if (code < 1000) return code > 0 ? code : sf;
  return sf < 1000 ? 1000 : code;
}

/**
 * Build the item list.
 *
 * @param {string} text
 * @param {Font} font
 * @param {{hyphenator?: import('./hyphenate.js').Hyphenator, hyphenPenalty?: number}} opts
 */
export function typeset(text, font, opts = {}) {
  const { hyphenator, hyphenPenalty = 50 } = opts;
  const items = [];
  const words = text.trim().split(/\s+/);
  const hyphenWidth = font.charWidth('-'.charCodeAt(0));

  let sf = 1000;
  words.forEach((word, wi) => {
    // Split the word at its hyphenation points; each fragment is a box and the
    // gaps between them are flagged penalties, which is exactly how a break
    // there comes to cost `hyphenPenalty` and to count as "hyphenated" when
    // two land in a row.
    const core = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
    let points = [];
    if (hyphenator && core.length > 4) {
      const offset = word.indexOf(core);
      points = hyphenator.positions(core).map((p) => p + offset);
    }

    if (points.length === 0) {
      const m = font.measure(word);
      items.push({ ...box(m.width, word), glyphs: m.glyphs, word: wi });
    } else {
      // A word's kerns and ligatures do not survive being cut into pieces.
      // Measured alone, "daugh" + "ters" is 18205sp wider than "daughters"
      // because the kern across the seam is gone, and "of" + "fi" + "cer" is
      // wider still than "officer" because the ffi ligature never forms.
      //
      // So a fragment is not measured on its own: it is the difference between
      // two prefixes of the whole word. The widths then telescope, an unbroken
      // word is exactly its true width however many pieces it was cut into,
      // and a line broken at a seam is the prefix up to that seam plus a
      // hyphen — which is what TeX's discretionary puts there.
      const seams = [...points, word.length];
      let prevWidth = 0;
      for (let i = 0; i < seams.length; i++) {
        const prefix = word.slice(0, seams[i]);
        const piece = word.slice(i === 0 ? 0 : seams[i - 1], seams[i]);
        const prefixWidth = font.measure(prefix).width;
        items.push({
          ...box(prefixWidth - prevWidth, piece),
          glyphs: font.measure(piece).glyphs,
          word: wi,
        });
        prevWidth = prefixWidth;
        if (i < seams.length - 1) items.push({ ...penalty(hyphenPenalty, hyphenWidth, true), word: wi });
      }
    }

    for (const ch of word) sf = updateSpaceFactor(sf, ch);

    if (wi < words.length - 1) {
      // The space factor widens the gap after a full stop and makes it more
      // willing to stretch, which is why TeX's paragraphs breathe at sentence
      // ends rather than in the middle of clauses.
      let w = font.space, y = font.stretch, z = font.shrink;
      if (sf >= 2000) w += font.extraSpace;
      y = Math.round((y * sf) / 1000);
      z = Math.round((z * 1000) / sf);
      items.push(glue(w, y, z));
    }
  });

  return items;
}
