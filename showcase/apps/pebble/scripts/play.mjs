// Plays a whole match headless: the human side throws randomised draws and hits.
// Usage: node scripts/play.mjs [url] [outdir]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2] || 'http://localhost:8093/';
const out = process.argv[3] || null;
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.click('[data-v="2"]');
await page.click('#start');
const t0 = Date.now();
let throws = 0;
let lastEnd = 0;
while (Date.now() - t0 < 400000) {
  const st = await page.evaluate(() => ({ phase: window.__pebble.phase, end: window.__pebble.game?.end, thrown: window.__pebble.game?.thrown }));
  await page.evaluate(() => { window.__pebble.setFast(true); window.__pebble.setSkipAll(true); });
  if (st.phase === 'aim') {
    throws++;
    await page.evaluate((i) => {
      const P = window.__pebble;
      const spin = i % 2 ? 1 : -1;
      P.aim.spin = spin;
      P.aim.broomX = -spin * (1.0 + Math.random() * 0.4);
      P.release(i % 3 === 2 ? 3.1 : 2.12 + Math.random() * 0.12);
    }, throws);
  }
  if (await page.isVisible('#endcard')) {
    const title = await page.textContent('#end-title');
    const body = await page.textContent('#end-body');
    console.log(`END ${st.end}: ${title} | ${body}`);
    if (out) await page.screenshot({ path: `${out}/end-${st.end}.png` });
    const over = await page.getAttribute('#end-next', 'data-over');
    if (over) break;
    await page.click('#end-next');
  }
  await page.waitForTimeout(150);
}
console.log(`human throws ${throws}, ${(Date.now() - t0) / 1000}s, errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await browser.close();
process.exit(errors.length ? 1 : 0);
