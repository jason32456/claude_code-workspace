// Builds data/corpus.json from a plain-text public-domain book.
//
// Only the work itself is kept: everything before the Project Gutenberg start
// marker and after the end marker is discarded, so what is committed is Lewis
// Carroll's text (1865, public domain) and none of Gutenberg's boilerplate or
// trademark.
//
//   node tools/build-corpus.mjs alice.txt data/corpus.json
import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync(process.argv[2], 'utf8').replace(/\r/g, '');
const startMarker = /\*\*\* START OF TH(?:IS|E) PROJECT GUTENBERG EBOOK[^\n]*\n/i;
const endMarker = /\*\*\* END OF TH(?:IS|E) PROJECT GUTENBERG EBOOK/i;
let body = raw.split(startMarker)[1] ?? raw;
body = body.split(endMarker)[0];

// cmr10 is a 7-bit font in TeX's original encoding, so typographic characters
// are spelled the way TeX spells them and anything left over is dropped.
const normalise = (s) => s
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/—/g, '---')
  .replace(/–/g, '--')
  .replace(/…/g, '...')
  .replace(/[^\x20-\x7E]/g, '');

const paragraphs = body
  .split(/\n\s*\n/)
  .map((p) => normalise(p.replace(/\s*\n\s*/g, ' ').trim()))
  .filter((p) => {
    if (p.length < 220 || p.length > 900) return false;       // one screen of prose
    if (/^[A-Z0-9 '.,!?-]+$/.test(p)) return false;           // chapter headings
    if (/^\s*CHAPTER/i.test(p)) return false;
    const letters = (p.match(/[A-Za-z]/g) ?? []).length;
    return letters / p.length > 0.7;                          // prose, not verse or tables
  });

// Deduplicate and cap, keeping the order they appear in the book.
const seen = new Set();
const out = [];
for (const p of paragraphs) {
  const key = p.slice(0, 60);
  if (seen.has(key)) continue;
  seen.add(key);
  out.push(p);
  if (out.length >= 200) break;
}

writeFileSync(process.argv[3], JSON.stringify({
  source: "Alice's Adventures in Wonderland, Lewis Carroll, 1865. Public domain.",
  note: 'Project Gutenberg header, footer and licence text removed; only the work itself is kept.',
  paragraphs: out,
}));
const words = out.join(' ').split(/\s+/).length;
console.log(`paragraphs=${out.length} words=${words} chars=${out.join('').length}`);
console.log('first:', out[0].slice(0, 110) + '...');
