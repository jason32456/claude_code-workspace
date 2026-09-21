// Asks TeX to hyphenate a large word list and commits the answers.
//
// \showhyphens typesets its argument in a box of infinite width and reports
// the result with every discretionary shown, which is TeX telling you exactly
// where it would allow a break in each word. That makes it the natural oracle
// for Liang's algorithm: same patterns, same \lefthyphenmin and
// \righthyphenmin, so agreement should be total rather than approximate.
//
//   node tools/hyphen-oracle.mjs words.txt data/hyphen-oracle.json [count]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const all = readFileSync(process.argv[2], 'utf8').split('\n')
  .map((w) => w.trim().toLowerCase())
  .filter((w) => /^[a-z]{5,18}$/.test(w));

// A deterministic spread through the list rather than the first N, which would
// all begin with "a".
const want = Number(process.argv[4] ?? 6000);
const step = Math.max(1, Math.floor(all.length / want));
const words = [];
for (let i = 0; i < all.length && words.length < want; i += step) words.push(all[i]);

const dir = mkdtempSync(join(tmpdir(), 'hyph-'));
const results = {};
const BATCH = 400;

for (let i = 0; i < words.length; i += BATCH) {
  const batch = words.slice(i, i + BATCH);
  writeFileSync(join(dir, 'h.tex'), `\\batchmode\n\\showhyphens{${batch.join(' ')}}\n\\end\n`);
  try {
    execFileSync('tex', ['h.tex'], { cwd: dir, stdio: 'ignore', timeout: 120000 });
  } catch { /* batchmode reports the underfull box as a warning */ }
  const log = readFileSync(join(dir, 'h.log'), 'utf8');

  // The box contents follow "\tenrm" and run to the blank line before the
  // \hbox summary. TeX wraps the log at 79 columns mid-token, so the newlines
  // are removed before splitting rather than treated as separators.
  // Only tokens that are words we actually asked for are kept. TeX wraps the
  // log at 79 columns, and a wrap landing inside a word can otherwise leave a
  // fragment behind that looks like a disagreement: "i-ta-tions" appears to
  // break after one letter, which \lefthyphenmin forbids, because it is the
  // tail of "recitations" and not a word at all.
  const asked = new Set(batch);
  for (const m of log.matchAll(/\\tenrm ([\s\S]*?)\n\s*\n/g)) {
    const flat = m[1].replace(/\n/g, '');
    for (const tok of flat.split(/ +/)) {
      const plain = tok.replace(/-/g, '');
      if (asked.has(plain)) results[plain] = tok;
    }
  }
}

const found = Object.keys(results).length;
writeFileSync(process.argv[3], JSON.stringify({
  note: 'TeX’s own hyphenation of each word, from \\showhyphens.',
  tex: execFileSync('tex', ['--version']).toString().split('\n')[0],
  source: 'word-list (MIT), sampled evenly',
  words: results,
}));
const withBreaks = Object.values(results).filter((w) => w.includes('-')).length;
console.log(`asked=${words.length} answered=${found} hyphenatable=${withBreaks}`);
console.log('sample:', Object.values(results).slice(0, 8).join(' '));
