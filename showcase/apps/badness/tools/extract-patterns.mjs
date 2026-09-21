// Pulls the patterns and the exception list out of Knuth's hyphen.tex.
//
// The file is vendored verbatim in vendor/ (its licence permits unlimited
// redistribution only if unmodified), and this derives the JSON the trie is
// built from at load.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(process.argv[2], 'utf8');
const body = src.replace(/%.*$/gm, '');          // strip TeX comments

const patterns = /\\patterns\{([\s\S]*?)\}/.exec(body)[1]
  .split(/\s+/).filter(Boolean);

// Exceptions are spelled with explicit hyphens, e.g. "as-so-ciate".
const exceptions = {};
for (const w of /\\hyphenation\{([\s\S]*?)\}/.exec(body)[1].split(/\s+/).filter(Boolean)) {
  exceptions[w.replace(/-/g, '')] = w;
}

writeFileSync(process.argv[3], JSON.stringify({
  note: 'Derived from Knuth’s hyphen.tex (vendored verbatim in vendor/hyphen.tex).',
  leftmin: 2,
  rightmin: 3,
  patterns,
  exceptions,
}));
console.log(`patterns=${patterns.length} exceptions=${Object.keys(exceptions).length}`);
console.log('sample:', patterns.slice(0, 6).join(' '), '| longest:', patterns.reduce((a, b) => (b.length > a.length ? b : a)));
