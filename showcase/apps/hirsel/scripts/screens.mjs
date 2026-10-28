// Captures the README screenshots. Serve this folder on :8094 first, then run
// from the app folder: node scripts/screens.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2] || 'http://localhost:8094/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const H = window.__hirsel;
  H.unlockAll(); H.freeze(true);
  H.until((s) => s.phase === 'fetch' && s.phaseT > 20);
  H.setCam('dog'); H.frame(true);
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'screenshots/title.png' });

const shot = async (name, course, until, cam, settle = 90) => {
  await page.evaluate(({ course, until, cam, settle }) => {
    const H = window.__hirsel;
    H.play(course); H.freeze(true); H.setCam(cam);
    H.until(new Function('s', 'return ' + until));
    H.frame(true);
    for (let i = 0; i < settle; i++) { H.advance(1 / 60); H.frame(false, false); }
    H.hideToast(); H.frame();
  }, { course, until, cam, settle });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/${name}.png` });
};
await shot('outrun', 1, "s.phase === 'outrun' && s.phaseT > 13", 'dog', 40);
await shot('fetch', 1, "s.phase === 'fetch' && s.j.leg === 0 && Math.abs(s.flock.z - s.course.fetch.z) < 9", 'post');
await shot('drive', 1, "s.phase === 'drive' && s.j.leg === 1 && s.phaseT > 60", 'judge');
await shot('hill', 2, "s.phase === 'fetch' && s.phaseT > 12", 'dog');
await shot('shed', 2, "s.phase === 'shed' && s.j.hold > 1.0", 'judge', 20);
await shot('pen', 0, "s.phase === 'pen' && s.j.inside >= 2", 'judge', 30);

await page.evaluate(() => {
  const H = window.__hirsel;
  H.play(1); H.freeze(true); H.setCam('post');
  H.until(() => false);
  H.frame(true);
  H.showEnd();
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/result.png' });

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await phone.goto(url, { waitUntil: 'networkidle' });
await phone.waitForTimeout(1200);
await phone.evaluate(() => {
  const H = window.__hirsel;
  H.play(1); H.freeze(true); H.setCam('judge');
  H.until((s) => s.phase === 'drive' && s.phaseT > 20);
  H.frame(true); for (let i = 0; i < 60; i++) { H.advance(1 / 60); H.frame(false, false); }
  H.hideToast(); H.frame();
});
await phone.waitForTimeout(400);
await phone.screenshot({ path: 'screenshots/phone.png' });
await browser.close();
