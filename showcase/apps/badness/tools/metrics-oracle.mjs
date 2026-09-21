// Asks TeX for the natural width of a few hundred real words and commits the
// answers, so the bench can check the font layer on a machine with no TeX.
//
// \number\wd prints scaled points as an integer, so there is no rounding in
// the comparison itself: the number either matches or it does not.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const corpus = JSON.parse(readFileSync(new URL('../data/corpus.json', import.meta.url), 'utf8'));
const seen = new Set();
for (const p of corpus.paragraphs) {
  for (const w of p.split(/\s+/)) {
    const t = w.replace(/[^A-Za-z'.,;:!?()-]/g, '');
    if (t.length > 1 && !/[{}\\$#%&_^~]/.test(t)) seen.add(t);
  }
}
// Include the f-ligature and kern cases deliberately, not just by luck.
for (const w of ['officer', 'difficult', 'baffled', 'flag', 'fifty', 'AV', 'Wo', 'To', 'yet']) seen.add(w);

const words = [...seen].sort().filter((_, i) => i % 3 === 0).slice(0, 400);
const dir = mkdtempSync(join(tmpdir(), 'wd-'));
// Each record is delimited, because TeX wraps the log at 79 columns and a
// wrap can land inside the number itself.
const defs = words.map((w, i) => `\\setbox\\b=\\hbox{${w}}\\message{^^JWD${i}=\\number\\wd\\b;}`).join('\n');
writeFileSync(join(dir, 'm.tex'), `\\batchmode\n\\newbox\\b\n${defs}\n\\end\n`);
try { execFileSync('tex', ['m.tex'], { cwd: dir, stdio: 'ignore', timeout: 120000 }); } catch {}
const log = readFileSync(join(dir, 'm.log'), 'utf8');

const widths = {};
for (const m of log.matchAll(/WD(\d+)\s*=\s*([\d\s]+?);/g)) {
  widths[words[+m[1]]] = Number(m[2].replace(/\s/g, ''));
}

writeFileSync(new URL('../data/metrics-oracle.json', import.meta.url), JSON.stringify({
  note: 'Natural width in scaled points of each word, measured by TeX with cmr10 at 10pt.',
  tex: execFileSync('tex', ['--version']).toString().split('\n')[0],
  widths,
}));
console.log(`words=${Object.keys(widths).length} of ${words.length}`);
