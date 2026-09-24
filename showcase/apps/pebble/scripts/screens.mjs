// Captures the README screenshots. Serve this folder on :8093 first, then run
// from the app folder: node scripts/screens.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2] || 'http://localhost:8093/';
const T = 38.405;
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/title.png' });

// Math.random = 0.9 gives yellow the hammer, so red (the human) throws first
await page.evaluate(() => { Math.random = () => 0.9; });
await page.click('#start');
const phase = () => page.evaluate(() => window.__pebble.phase);
const waitPhase = async (ph) => {
  for (let i = 0; i < 600; i++) { if ((await phase()) === ph) return; await page.waitForTimeout(100); }
  throw new Error(`timed out waiting for ${ph}`);
};
const settleFrames = async () => {
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__pebble.snap()); await page.waitForTimeout(500); }
};
await waitPhase('aim');
await page.evaluate((T) => {
  const P = window.__pebble;
  P.place([[8, 0.35, T - 3.3], [9, -0.1, T + 0.35], [1, 0.62, T - 0.15], [10, -0.95, T - 0.6], [2, -0.75, T - 3.0], [11, 1.25, T + 0.9]]);
  P.setThrown(6);
  P.aim.spin = 1;
  P.aim.broomX = -1.05;
}, T);
await settleFrames();
await page.screenshot({ path: 'screenshots/aim.png' });

await page.evaluate(() => { const P = window.__pebble; P.hold(true); P.release(2.17); P.advance(4.2, 1); P.setSweep(true); });
await settleFrames();
await page.screenshot({ path: 'screenshots/sweep.png' });
await page.evaluate(() => { const P = window.__pebble; P.setSweep(false); P.advance(16.5, 0); });
await settleFrames();
await page.screenshot({ path: 'screenshots/house.png' });
await page.evaluate(() => { const P = window.__pebble; P.advance(30, 0); P.hold(false); });
await waitPhase('settle');
await page.evaluate(() => window.__pebble.hold(true));
await settleFrames();
await page.screenshot({ path: 'screenshots/settled.png' });
await page.evaluate(() => { const P = window.__pebble; P.setThrown(16); P.countEnd(); });
await settleFrames();
await page.screenshot({ path: 'screenshots/count.png' });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/endcard.png' });

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await phone.goto(url, { waitUntil: 'networkidle' });
await phone.evaluate(() => { Math.random = () => 0.9; });
await phone.waitForTimeout(1200);
await phone.screenshot({ path: 'screenshots/phone-menu.png' });
await phone.tap('#start');
for (let i = 0; i < 300; i++) { if ((await phone.evaluate(() => window.__pebble.phase)) === 'aim') break; await phone.waitForTimeout(100); }
await phone.evaluate((T) => { const P = window.__pebble; P.place([[8, 0.35, T - 3.3], [9, -0.1, T + 0.35], [1, 0.62, T - 0.15]]); P.setThrown(3); });
for (let i = 0; i < 3; i++) { await phone.evaluate(() => window.__pebble.snap()); await phone.waitForTimeout(500); }
await phone.screenshot({ path: 'screenshots/phone-aim.png' });
console.log('phone scrollWidth', await phone.evaluate(() => document.documentElement.scrollWidth));
await browser.close();
