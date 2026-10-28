// Captures the README screenshots. Serve this folder on :8093 first, then run
// from the app folder: node scripts/screens.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2] || 'http://localhost:8093/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__firn.unlockAll());
await page.screenshot({ path: 'screenshots/title.png' });

const shot = async (name, level, seconds, settle = 40) => {
  await page.evaluate(({ level, seconds, settle }) => {
    const F = window.__firn;
    F.play(level); F.freeze(true); F.advance(seconds); F.frame(true);
    for (let i = 0; i < settle; i++) { F.advance(1 / 60); F.frame(false, false); }
    F.hideToast(); F.frame();
  }, { level, seconds, settle });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/${name}.png` });
};
await shot('powder', 0, 7);
await shot('treeline', 1, 52);
await shot('couloir', 2, 36);
await shot('valley', 3, 72);

// Run Couloir to the ice and catch the curtain breaking.
await page.evaluate(() => {
  const F = window.__firn;
  F.play(2); F.freeze(true);
  while (F.sim.phase === 'run' && F.sim.p[2] < F.sim.world.zWall - 3 * F.sim.r - 6) F.advance(0.05);
  F.frame(true);
  for (let i = 0; i < 400 && !F.sim.curtain.broken && F.sim.phase === 'run'; i++) { F.advance(1 / 60); F.frame(false, false); }
  for (let i = 0; i < 40; i++) { F.advance(1 / 60); F.frame(false, false); }
  F.frame();
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'screenshots/ice.png' });
await page.evaluate(() => { const F = window.__firn; F.advance(4); F.freeze(false); });
await page.waitForFunction(() => window.__firn.mode === 'end', null, { timeout: 60000 });
await page.waitForTimeout(800);
await page.screenshot({ path: 'screenshots/result.png' });

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await phone.goto(url, { waitUntil: 'networkidle' });
await phone.waitForTimeout(1500);
await phone.evaluate(() => { const F = window.__firn; F.play(1); F.freeze(true); F.advance(40); F.frame(true); for (let i = 0; i < 40; i++) { F.advance(1 / 60); F.frame(false, false); } });
await phone.waitForTimeout(400);
await phone.screenshot({ path: 'screenshots/phone.png' });
await browser.close();
