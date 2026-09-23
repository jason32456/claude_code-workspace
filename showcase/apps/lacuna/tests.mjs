// Runs the same bench the page runs, under Node: `node tests.mjs [id...]`
import { TESTS } from './js/bench.js';

const only = process.argv.slice(2);
let failed = 0;
for (const t of TESTS) {
  if (only.length && !only.includes(t.id)) continue;
  const t0 = performance.now();
  const r = t.run(() => {});
  const ms = performance.now() - t0;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      expected ${r.expected}\n      measured ${r.measured}   (${(ms / 1000).toFixed(1)} s)\n      ${r.detail}`);
  if (!r.pass) failed++;
}
process.exit(failed ? 1 : 0);
