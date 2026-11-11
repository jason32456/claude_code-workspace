// Captures the README screenshots. Serve this folder on :8097 first, then run
// from the app folder: node scripts/screens.mjs [outdir] [only]
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const out = process.argv[2] || 'screenshots';
const only = process.argv[3];
const want = (n) => !only || only.split(',').includes(n);
const url = 'http://localhost:8097/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
if (want('title')) await page.screenshot({ path: `${out}/title.png` });

// Let a bot dive up to a moment, then frame it.
const shot = async (name, site, cond, cam = {}) => {
  await page.evaluate(({ site, cond, cam }) => {
    const X = window.__siltout;
    if (!X.S || X.S.siteIndex !== site || cam.fresh || X.S.done || X.S === undefined) X.play(site);
    X.freeze(true); X.botOn(cam.bot || 'expert');
    X.until(new Function('s', `return ${cond}`));
    X.botOff();
    if (cam.yaw != null) X.S.diver.yaw += cam.yaw;
    if (cam.pitch != null) X.S.diver.pitch = cam.pitch;
    if (cam.touch) { X.S.input.touch = true; X.until((s) => !!s.diver.touching, 5); }
    X.view(cam.mode ?? 0, cam.free ? cam.free(X.S) : null);
    X.frame(3);
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    if (cam.toast) { const el = document.createElement('div'); el.className = 'toast ' + (cam.toastKind || 'info'); el.textContent = cam.toast; document.getElementById('toasts').appendChild(el); }
  }, { site, cond, cam: { ...cam, free: undefined } });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const shots = [
  ['basin', 0, 's.reel.ties.length > 0 && s.t > 16', { mode: 1, fresh: true }],
  ['tunnel', 0, 's.t > 40', { mode: 0 }],
  ['throne', 0, 's.objective', { mode: 1 }],
  ['goldline', 1, 's.t > 50', { mode: 1, fresh: true }],
  ['silted', 1, 's.objective && s.t > s.stats.turnT + 25', { mode: 0, fresh: true, bot: 'flutter', touch: true }],
  ['restriction', 2, 's.diver.pos[0] > 43', { mode: 1, fresh: true }],
  ['lantern', 2, 's.objective', { mode: 0 }],
  ['backup', 2, 's.light.backup && s.t > 0', { mode: 0 }],
];
for (const [n, i, c, cam] of shots) if (want(n)) { await shot(n, i, c, cam); console.log('shot', n); }

if (want('result')) {
  await page.evaluate(() => { const X = window.__siltout; X.play(1); X.freeze(true); X.botOn('expert'); X.until(() => false); X.botOff(); X.freeze(false); X.finish(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/result.png` });
}
if (want('phone')) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const ph = await ctx.newPage();
  ph.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await ph.goto(url, { waitUntil: 'networkidle' });
  await ph.waitForTimeout(1500);
  await ph.evaluate(() => { const X = window.__siltout; X.play(0); X.freeze(true); X.botOn('expert'); X.until((s) => s.t > 45); X.botOff(); X.view(0); X.frame(3); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  await ph.waitForTimeout(400);
  await ph.screenshot({ path: `${out}/phone.png` });
}
await browser.close();
