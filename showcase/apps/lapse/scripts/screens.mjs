// Captures the README screenshots. Serve this folder on :8097 first, then run
// from the app folder: node scripts/screens.mjs
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2] || 'http://localhost:8097/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.setDefaultTimeout(240000);
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/title.png' });

// Let the expert bot fly the player's balloon to a moment, then frame it.
const shot = async (name, flight, cond, cam = {}) => {
  await page.evaluate(({ flight, cond, cam }) => {
    const L = window.__lapse;
    L.unlockAll(); L.play(flight); L.freeze(true); L.botOn('expert');
    L.until(new Function('s', `return ${cond}`));
    L.botOff();
    L.scene.setMode(cam.mode ?? 0);
    Object.assign(L.scene.cam, cam);
    L.scene.snapCam();
    L.frame(4);
    document.querySelectorAll('.toast').forEach((t) => t.remove());
  }, { flight, cond, cam });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/${name}.png` });
};

await shot('meadows', 0, 's.t > 380', { yaw: 3.6, pitch: 0.1, dist: 90 });
await shot('drop', 0, 's.markers.some((m) => m.who === "you" && m.task === 1 && !m.landed && m.trail.length > 30)', { yaw: 2.4, pitch: 0.35, dist: 120 });
await shot('valley', 1, 's.t > 760', { yaw: 3.3, pitch: 0.18, dist: 110 });
await shot('basket', 1, 's.t > 1000', { mode: 1, yaw: 0.3, pitch: -0.1 });
await shot('saltings', 2, 's.t > 640', { yaw: 4.4, pitch: 0.16, dist: 130 });
await shot('map', 2, 's.t > 1250', { mode: 2, mapH: 1600 });

// End of flight.
await page.evaluate(() => {
  const L = window.__lapse;
  L.play(1); L.freeze(true); L.botOn('expert');
  L.until(() => false, 9999);
  L.endScreen(L.sim.result);
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/result.png' });

// Phone.
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const ph = await ctx.newPage();
ph.setDefaultTimeout(240000);
ph.on('pageerror', (e) => console.log('PAGEERROR phone', e.message));
await ph.goto(url, { waitUntil: 'networkidle' });
await ph.waitForTimeout(2000);
await ph.evaluate(() => {
  const L = window.__lapse;
  L.unlockAll(); L.play(0); L.freeze(true); L.botOn('expert');
  L.until((s) => s.t > 420);
  L.botOff(); L.scene.cam.dist = 110; L.scene.snapCam(); L.frame(4);
  document.querySelectorAll('.toast').forEach((t) => t.remove());
});
await ph.waitForTimeout(400);
await ph.screenshot({ path: 'screenshots/phone.png' });
await browser.close();
