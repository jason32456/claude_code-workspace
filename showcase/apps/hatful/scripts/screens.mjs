// node scripts/screens.mjs  (with `python3 -m http.server 8130` running in this folder)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://localhost:8130/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = async (w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
  return ctx.newPage();
};
const shot = (p, name) => p.screenshot({ path: `screenshots/${name}.png` });
const open = async (p, q) => { await p.goto(B + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(600); };

const p = await page(1440, 900);
await open(p, '?demo&step=rules&theme=light'); await shot(p, 'rules');
await open(p, '?demo&step=people&theme=light'); await shot(p, 'people');
await open(p, '?demo&step=rules&theme=dark'); await shot(p, 'dark');

// Sam (row 7) loses every receiver he has left: the Hall banner names him.
await open(p, '?demo&step=rules&theme=light');
for (let j = 0; j < 7; j++) await p.click(`.cell[data-i="7"][data-j="${j}"]`);
await p.waitForTimeout(500); await shot(p, 'impossible');

await open(p, '?demo&step=rules&theme=light');
await p.getByText('One big loop').click(); await p.waitForTimeout(600); await shot(p, 'loop-mode');

await open(p, '?demo&step=hat&theme=light'); await shot(p, 'hat');
await p.getByRole('button', { name: 'Draw names' }).click();
await p.waitForSelector('.hand-row'); await p.waitForTimeout(500); await shot(p, 'handout');
await p.click('.hand-row button.small-btn');
const link = await p.evaluate(() => navigator.clipboard.readText());

await p.getByRole('button', { name: /Open the hat/ }).click();
await p.locator('dialog[open] button').last().click();
await p.waitForTimeout(600);
await p.getByRole('button', { name: 'Verify result' }).click(); await p.waitForTimeout(600);
await p.locator('.loops').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 260));
await p.waitForTimeout(300); await shot(p, 'opened');

const r = await page(1440, 900);
await r.goto(link); await r.waitForTimeout(600); await shot(r, 'reveal-ready');
await r.getByRole('button', { name: /pull/i }).click();
await r.waitForTimeout(1050); await shot(r, 'reveal-confetti');
await r.waitForTimeout(2600); await shot(r, 'reveal');

const m = await page(390, 844);
await open(m, '?demo&step=rules&theme=light'); await shot(m, 'phone');
await m.goto(link.replace('#', '?auto=1#')); await m.waitForTimeout(3800); await shot(m, 'phone-reveal');

await browser.close();
