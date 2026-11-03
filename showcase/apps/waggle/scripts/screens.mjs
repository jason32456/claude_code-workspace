// Captures the README screenshots. Serve this folder on :8097 first, then run
// from the app folder: node scripts/screens.mjs
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2] || 'http://localhost:8097/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/title.png' });

// Let the expert bot run the colony, then park the player somewhere scenic.
const scenic = async (name, day, hour, at, view = 0) => {
  await page.evaluate(({ day, hour, at, view }) => {
    const W = window.__waggle;
    W.unlockAll(); W.play(day); W.freeze(true); W.botOn('expert');
    W.until((s) => s.hour >= hour);
    W.botOff();
    const s = W.sim, P = s.player;
    if (P.inHive) { s.dance && (s.dance.state = 'ready'); P.inHive = false; s.dance = null; }
    const [x, z, agl, tx, tz] = at;
    P.x = x; P.z = z; P.y = s.ground(x, z) + agl; P.speed = 13; P.bank = 0.2;
    P.yaw = ((Math.atan2(tx - x, -(tz - z)) * 180) / Math.PI + 360) % 360;
    Object.assign(s.input, { turn: 0.15, fwd: 0, climb: 0, waggle: false });
    W.view(view); W.snap(); W.frame(20);
    document.querySelectorAll('.toast').forEach((t) => t.remove());
  }, { day, hour, at, view });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/${name}.png` });
};

await scenic('meadow', 0, 13.2, [470, 300, 7, 640, 450]);
await scenic('orchard', 1, 10.6, [-250, -150, 12, -390, -270]);
await scenic('heath', 2, 14.5, [-280, -960, 14, -380, -1160]);
await scenic('beeline', 2, 14.0, [-120, -330, 22, -360, -1120], 1);

// Mid-waggle on the comb.
await page.evaluate(() => {
  const W = window.__waggle;
  W.play(0); W.freeze(true); W.botOn('expert');
  W.until((s) => s.player.inHive && s.dance.runs.length >= 4 && s.dance.state === 'run' && s.dance.t > 1.3);
  W.frame(1);
  document.querySelectorAll('.toast').forEach((t) => t.remove());
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'screenshots/dance.png' });

// End of day.
await page.evaluate(() => {
  const W = window.__waggle;
  W.play(1); W.freeze(true); W.botOn('expert');
  W.until(() => false, 9999);
  W.endScreen(W.sim.result);
  W.frame(2);
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/result.png' });

// Phone.
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const ph = await ctx.newPage();
ph.on('pageerror', (e) => console.log('PAGEERROR phone', e.message));
await ph.goto(url, { waitUntil: 'networkidle' });
await ph.waitForTimeout(2000);
await ph.evaluate(() => {
  const W = window.__waggle;
  W.unlockAll(); W.play(0); W.freeze(true); W.botOn('expert');
  W.until((s) => s.hour >= 12.2 && !s.player.inHive);
  W.botOff(); W.snap(); W.frame(20);
  document.querySelectorAll('.toast').forEach((t) => t.remove());
});
await ph.waitForTimeout(400);
await ph.screenshot({ path: 'screenshots/phone.png' });
await browser.close();
