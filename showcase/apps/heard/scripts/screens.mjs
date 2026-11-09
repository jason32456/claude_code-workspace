// Captures the README screenshots. Serve this folder on :8090 first, then run
// from the app folder: node scripts/screens.mjs
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = process.env.URL || 'http://localhost:8090/';
const out = (n) => new URL(`../screenshots/${n}.png`, import.meta.url).pathname;
const browser = await chromium.launch();
const errors = [];
async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...opts });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  return p;
}
const hideToasts = (p) => p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));

let p = await page();
await p.screenshot({ path: out('timeline') });
await p.selectOption('#preset', 'thanksgiving');
await p.waitForTimeout(600); await hideToasts(p);
await p.hover('.bar[data-step="s3"]');
await p.waitForTimeout(300);
await p.screenshot({ path: out('bottleneck') });
await p.mouse.move(5, 890);
await p.click('[data-tab="insights"]');
await p.waitForTimeout(1500);
await p.screenshot({ path: out('insights') });
await p.click('.helps li:has-text("+1 cook") button');
await p.waitForTimeout(600); await hideToasts(p);
const after = await p.evaluate(() => window.__heard.current.plan.score.viol);
if (after >= 13) errors.push(`Apply +1 cook did not help (${after})`);
await p.click('[data-tab="timeline"]');
await p.click('.dish[data-dish="turkey"] header button[aria-label="Edit steps"]');
await p.waitForTimeout(300);
await p.screenshot({ path: out('two-cooks') });
await p.close();

p = await page();
await p.selectOption('#preset', 'party');
await p.waitForTimeout(500); await hideToasts(p);
await p.click('.dish[data-dish="duck"] header button[aria-label="Edit steps"]');
await p.click('.step[data-step="k6"] details summary');
await p.waitForTimeout(300);
await p.screenshot({ path: out('editor') });
await p.click('[data-tab="sheet"]');
await p.waitForTimeout(300);
await p.screenshot({ path: out('sheet') });
await p.close();

p = await page();
await p.evaluate(() => window.__heard.cook(true));
await p.waitForTimeout(2500);
await p.click('.heard');
await p.waitForTimeout(9000);
await p.click('text=Running late +5');
await p.waitForTimeout(1200);
await p.screenshot({ path: out('cook') });
await p.close();

p = await page({ colorScheme: 'dark' });
await p.selectOption('#preset', 'party');
await p.waitForTimeout(600); await hideToasts(p);
await p.screenshot({ path: out('dark') });
await p.close();

const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const m = await ctx.newPage();
m.on('pageerror', (e) => errors.push(e.message));
await m.goto(BASE, { waitUntil: 'networkidle' });
await m.waitForTimeout(800);
await m.screenshot({ path: out('phone') });
await browser.close();
console.log(errors.length ? errors : 'no errors');
