import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:8152/index.html?debug&engine=fake');
await page.waitForFunction(() => window.__offcut?.result());
const out = await page.evaluate(async () => {
  const fake = await import('../dev/stage-fake-engine.js');
  const { view, playhead } = window.__offcut;
  const result = {};
  for (const [cols, rows] of [[100, 10], [250, 12], [500, 12]]) {
    const r = fake.dissect(window.__offcut.result().a.shape, window.__offcut.result().b.shape, { cols, rows });
    playhead.pause();
    view.setResult(r);
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) { view.setPos(0.3 + k * 0.01); view.render(); view.ctx.getImageData(0, 0, 1, 1); }
    result[r.pieces.length] = ((performance.now() - t0) / 20).toFixed(1) + ' ms/frame';
  }
  return result;
});
console.log(out, errors);
await browser.close();
