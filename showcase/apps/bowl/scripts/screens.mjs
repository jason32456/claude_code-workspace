// Captures the README screenshots. Serve this folder on :8097 first, then run
// from the app folder: node scripts/screens.mjs [outdir]
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const out = process.argv[2] || 'screenshots';
const url = 'http://localhost:8097/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.setDefaultTimeout(240000);
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/title.png` });

// Let the expert bot work the shift up to a moment, then frame it.
const shot = async (name, shift, cond, cam = {}) => {
  await page.evaluate(({ shift, cond, cam }) => {
    const B = window.__bowl;
    if (!B.S || B.S.shiftIndex !== shift || cam.fresh) B.play(shift);
    B.freeze(true); B.botOn('expert');
    B.until(new Function('s', `return ${cond}`));
    B.botOff();
    if (cam.hold) { B.S.input.master = !!cam.hold.m; B.S.input.track = !!cam.hold.t; }
    B.scene.setMode(cam.mode ?? 0);
    Object.assign(B.scene.cam, { yaw: cam.yaw ?? 0, pitch: cam.pitch ?? 0, zoom: cam.zoom ?? 1 });
    B.scene.snapCam();
    B.frame(4);
    document.querySelectorAll('.toast').forEach((t) => t.remove());
  }, { shift, cond, cam });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
};

const only = process.argv[3];
const want = (n) => !only || only.split(',').includes(n);
if (want('tower')) await shot('tower', 0, 's.t > 300', { mode: 0, fresh: true });
if (want('crest')) await shot('crest', 0, 's.t > 420', { mode: 1 });
if (want('follow')) await shot('follow', 0, 's.t > 470', { mode: 2 });
if (want('bowl')) await shot('bowl', 0, 's.t > 700', { mode: 3 });
if (want('cold')) await shot('cold', 1, 's.t > 700', { mode: 0, fresh: true });
if (want('night')) await shot('night', 2, 's.t > 1300', { mode: 0, fresh: true });
if (want('nightcrest')) await shot('nightcrest', 2, 's.t > 1360', { mode: 1 });

if (want('result')) {
  await page.evaluate(() => { const B = window.__bowl; B.play(1); B.freeze(true); B.botOn('expert'); B.until(() => false); B.botOff(); B.freeze(false); B.frame(2); });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/result.png` });
}
if (want('phone')) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const ph = await ctx.newPage();
  ph.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await ph.goto(url, { waitUntil: 'networkidle' });
  await ph.waitForTimeout(1500);
  await ph.evaluate(() => { const B = window.__bowl; B.play(0); B.freeze(true); B.botOn('expert'); B.until((s) => s.t > 330); B.botOff(); B.frame(3); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  await ph.waitForTimeout(400);
  await ph.screenshot({ path: `${out}/phone.png` });
}
await browser.close();
