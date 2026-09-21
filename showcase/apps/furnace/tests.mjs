// Runs the same bench the page runs, under Node: `node tests.mjs [id...]`
import { makeTests, ggxEnergy } from './js/selftest.js';

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let failed = 0;
for (const t of makeTests()) {
  if (only.length && !only.includes(t.id)) continue;
  const t0 = performance.now();
  const r = t.run();
  const ms = (performance.now() - t0) / 1000;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
  console.log(`      expected  ${r.expected}`);
  console.log(`      measured  ${r.measured}   (${ms.toFixed(1)} s)`);
  console.log(`      ${r.detail}\n`);
  if (!r.pass) failed++;
}

if (process.argv.includes('--ggx')) {
  console.log('GGX metal of albedo 1 in a furnace of radiance 1:\n');
  console.log('  roughness   single-scatter   compensated   energy lost');
  for (const r of ggxEnergy()) {
    console.log(`  ${r.roughness.toFixed(2)}        ${r.single.toFixed(4)}           `
      + `${r.compensated.toFixed(4)}        ${((1 - r.single) * 100).toFixed(1)}%`);
  }
}
process.exit(failed ? 1 : 0);
