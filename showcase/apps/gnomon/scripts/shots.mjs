// Captures the screenshot set used by the README and the showcase card.
// Requires a server on :8099 serving this folder.  node scripts/shots.mjs

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const OUT = new URL('../screenshots/', import.meta.url).pathname;

const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__gnomon);
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + 'title.png' });

// [file, level, setup, settle seconds]
const shots = [
  ['first-light', 0, (g) => { g.state.casters[2].tYaw = 0; g.player.spawn(-2.5, 6.4); }, 1.6],
  ['leverage', 1, (g) => { g.state.casters[4].tPos.z = 7.4; g.player.spawn(-2.5, 12.6); }, 2.2],
  ['confluence', 2, (g) => {
    const [a, b] = [g.state.casters[2], g.state.casters[3]];
    a.tYaw = 0; a.tPitch = 0; a.tPos.x = -2.08;
    b.tYaw = 0; b.tPitch = 0; b.tPos.x = 1.6;
    g.player.spawn(-4.5, 7.4);
  }, 1.8],
  ['the-vane', 3, (g) => { g.player.spawn(-4.5, 8.5); }, 3.4],
  ['narrows', 4, (g) => { g.player.spawn(-0.4, 4.6); }, 2.1],
  ['keyhole', 5, (g) => {
    const s = g.state.level.seal, c = g.state.casters[s.from];
    c.tYaw = s.solution.yaw; c.tPitch = s.solution.pitch; c.tPos.set(...s.solutionPos);
    g.player.spawn(2.0, 4.6);
  }, 1.8],
  ['lamplight', 6, (g) => { g.state.lampTarget.set(4.6, 6.2, 13); g.player.spawn(-6.5, 6.4); }, 2.0],
  ['orrery', 7, (g) => {
    const s = g.state.level.seal, c = g.state.casters[s.from];
    c.tYaw = s.solution.yaw; c.tPitch = s.solution.pitch; c.tPos.set(...s.solutionPos);
    g.player.spawn(-5.6, 9.4);
  }, 2.6],
  ['gnomon', 8, (g) => {
    const s = g.state.level.seal, c = g.state.casters[s.from];
    c.tYaw = s.solution.yaw; c.tPitch = s.solution.pitch; c.tPos.set(...s.solutionPos);
    g.player.spawn(-6.4, 7.2);
  }, 2.4],
];

for (const [file, level, setup, wait] of shots) {
  await page.evaluate((n) => window.__gnomon.start(n), level);
  await page.waitForTimeout(350);
  await page.evaluate(`(${setup.toString()})(window.__gnomon)`);
  await page.waitForTimeout(wait * 1000);
  await page.screenshot({ path: OUT + file + '.png' });
  console.log('shot', file);
}

// The cleared card, reached by walking the first chamber into its door.
await page.evaluate(() => window.__gnomon.start(0));
await page.waitForTimeout(300);
await page.evaluate(() => {
  const g = window.__gnomon;
  g.state.casters[2].tYaw = 0;
  g.state.motes = 2;
  g.state.time = 21.4;
  g.player.spawn(12.4, 5.2);
});
await page.waitForTimeout(1400);
await page.screenshot({ path: OUT + 'cleared.png' });
console.log('shot cleared');

await browser.close();
