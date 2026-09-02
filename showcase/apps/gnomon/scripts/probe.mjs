// Headless chamber probe. Loads each chamber, reports where its shadows actually
// land on the wall, and reports whether the spawn point has ground under it —
// the two things that are tedious to eyeball and easy to get wrong when a level
// is authored as 3D positions.
//
//   node scripts/probe.mjs [levelIndex] [--shot out.png] [--seconds N]
//
// Requires a server on :8099 serving this folder.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const only = args[0] && !args[0].startsWith('--') ? Number(args[0]) : null;
const shot = args.includes('--shot') ? args[args.indexOf('--shot') + 1] : null;
const seconds = args.includes('--seconds') ? Number(args[args.indexOf('--seconds') + 1]) : 1.5;

const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__gnomon);

const count = await page.evaluate(() => window.__gnomon.LEVELS.length);
const list = only == null ? [...Array(count).keys()] : [only];

for (const i of list) {
  await page.evaluate((n) => window.__gnomon.start(n), i);
  await page.waitForTimeout(seconds * 1000);
  const report = await page.evaluate(() => {
    const { state, player } = window.__gnomon;
    const box = (poly) => {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const p of poly) { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); }
      return [a, b, c, d].map((v) => +v.toFixed(2));
    };
    return {
      name: state.level.name,
      spawn: state.level.spawn,
      player: [+player.x.toFixed(2), +player.y.toFixed(2), player.grounded],
      deaths: state.deaths,
      seal: state.seal ? [+state.coverage.toFixed(2), +state.spill.toFixed(2)] : null,
      shadows: state.casters.map((c, n) => ({
        n,
        flags: [...c.flags].join('|') || '-',
        motor: !!c.motor,
        polys: c.polys.map(box),
      })),
      door: state.level.door,
    };
  });
  console.log(`\n== ${i + 1}. ${report.name} ==`);
  console.log(`   spawn ${JSON.stringify(report.spawn)} -> player ${JSON.stringify(report.player)} deaths=${report.deaths}` +
    (report.seal ? ` seal=${report.seal[0]}/${report.seal[1]}` : ''));
  console.log(`   door  ${JSON.stringify(report.door)}`);
  for (const s of report.shadows) {
    console.log(`   [${s.n}] ${s.flags}${s.motor ? ' motor' : ''} ${s.polys.map((p) => `(${p.join(', ')})`).join(' ')}`);
  }
  if (shot && only != null) await page.screenshot({ path: shot });
}

if (errors.length) console.log('\nERRORS:', errors);
await browser.close();
