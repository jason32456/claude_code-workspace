// Headless playthrough. Applies a solution to a chamber's solids, then runs a
// dumb bot (hold a direction, jump on a timer) and reports whether the chamber
// actually completes — the check that catches a level authored into a shape no
// player can walk.
//
//   node scripts/play.mjs <levelIndex> --set "2:yaw=0,z=5" --run 9 --dir right
//
// Requires a server on :8099 serving this folder.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const level = Number(args[0] || 0);
const flag = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const sets = (flag('--set', '') || '').split(';').filter(Boolean);
const runFor = Number(flag('--run', 8));
const dir = flag('--dir', 'right');
const jumpEvery = Number(flag('--jump', 0.5));
const shot = flag('--shot', null);

const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__gnomon);

await page.evaluate((n) => window.__gnomon.start(n), level);
await page.waitForTimeout(300);

for (const s of sets) {
  const [idx, kv] = s.split(':');
  await page.evaluate(({ idx, kv }) => {
    const c = window.__gnomon.state.casters[Number(idx)];
    for (const pair of kv.split(',')) {
      const [k, v] = pair.split('=');
      const val = Number(v);
      if (k === 'yaw') c.tYaw = val;
      if (k === 'pitch') c.tPitch = val;
      if (k === 'x') c.tPos.x = val;
      if (k === 'y') c.tPos.y = val;
      if (k === 'z') c.tPos.z = val;
    }
  }, { idx, kv });
}

await page.waitForTimeout(600);
await page.evaluate((d) => { window.__gnomon.input[d] = true; }, dir);

const trace = [];
const start = Date.now();
let nextJump = 0;
while ((Date.now() - start) / 1000 < runFor) {
  const t = (Date.now() - start) / 1000;
  if (t >= nextJump) {
    nextJump = t + jumpEvery;
    await page.evaluate(() => { window.__gnomon.input.jump = true; window.__gnomon.input.jumpHeld = true; });
    await page.waitForTimeout(Number(flag("--hold", 320)));
    await page.evaluate(() => { window.__gnomon.input.jumpHeld = false; });
  }
  await page.waitForTimeout(120);
  const p = await page.evaluate(() => {
    const g = window.__gnomon;
    return [+g.player.x.toFixed(1), +g.player.y.toFixed(1), g.state.deaths, g.state.mode, g.state.motes, g.player.grounded, +g.player.vy.toFixed(1)];
  });
  trace.push(p);
  if (p[3] === 'complete') break;
}
await page.evaluate((d) => { window.__gnomon.input[d] = false; }, dir);

const boxes = await page.evaluate(() => window.__gnomon.state.casters.map((c, n) => {
  const b = c.polys.map((poly) => {
    let a = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { a = Math.min(a, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return [a, y0, x1, y1].map((v) => +v.toFixed(2)).join(', ');
  });
  return `[${n}] ${b.map((s) => `(${s})`).join(' ')}`;
}));
console.log('shadows:\n  ' + boxes.join('\n  '));

const last = trace[trace.length - 1];
console.log(`level ${level + 1}: end x=${last[0]} y=${last[1]} deaths=${last[2]} motes=${last[4]} mode=${last[3]}`);
console.log('path:', trace.filter((_, i) => i % 4 === 0).map((p) => `${p[0]},${p[1]}`).join(' → '));
if (shot) await page.screenshot({ path: shot });
if (errors.length) console.log('ERRORS:', errors);
await browser.close();
