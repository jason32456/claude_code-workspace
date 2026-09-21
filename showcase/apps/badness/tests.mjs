// Runs the same bench the page runs, under Node: `node tests.mjs [id...]`
import { readFileSync } from 'node:fs';
import { makeTests, corpusStudy } from './js/selftest.js';

const load = (f) => JSON.parse(readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8'));
const data = {
  metrics: load('cmr10.json'),
  patterns: load('hyphen-en-us.json'),
  texOracle: load('tex-oracle.json'),
  hyphenOracle: load('hyphen-oracle.json'),
  metricsOracle: load('metrics-oracle.json'),
  corpus: load('corpus.json'),
};

const only = process.argv.slice(2).filter((a) => a !== '--study');
let failed = 0;
for (const t of makeTests(data)) {
  if (only.length && !only.includes(t.id)) continue;
  const t0 = performance.now();
  const r = t.run();
  const ms = performance.now() - t0;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
  console.log(`      expected  ${r.expected}`);
  console.log(`      measured  ${r.measured}   (${(ms / 1000).toFixed(1)} s)`);
  console.log(`      ${r.detail}\n`);
  if (!r.pass) failed++;
}

if (process.argv.includes('--study')) {
  console.log('Corpus: 200 paragraphs of Alice, broken three ways.\n');
  console.log('            lines             visibly bad lines    mean badness      hyphens        rivers      optimal');
  console.log('  measure   opt  best grd     opt  best   grd      opt  best  grd    opt best grd  opt best grd  strictly better');
  for (const r of corpusStudy(data)) {
    const p3 = (n) => String(n).padStart(3);
    const p4 = (n) => String(n).padStart(4);
    const mean = (k) => (r[k].sumBadness / r[k].lines).toFixed(0).padStart(4);
    console.log(`  ${String(r.measure + 'pt').padEnd(8)} ${p4(r.optimal.lines)} ${p4(r.best.lines)} ${p4(r.greedy.lines)}    `
      + `${p4(r.optimal.badLines)} ${p4(r.best.badLines)} ${p4(r.greedy.badLines)}     `
      + `${mean('optimal')} ${mean('best')} ${mean('greedy')}    `
      + `${p3(r.optimal.hyphens)} ${p3(r.best.hyphens)} ${p3(r.greedy.hyphens)}  `
      + `${p3(r.optimal.rivers)} ${p3(r.best.rivers)} ${p3(r.greedy.rivers)}   `
      + `${String(r.optimalWins).padStart(4)}/${r.paragraphs}`);
  }
}

process.exit(failed ? 1 : 0);
