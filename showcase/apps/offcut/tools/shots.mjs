// Captures screenshots/. Run from the app folder with a server on it:
//   python3 -m http.server 8150 &  node tools/shots.mjs
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://localhost:8150';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const hash = (a, b, detail = 50) => `#a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&detail=${detail}`;

async function open(context, fragment) {
  const page = await context.newPage();
  await page.goto(`${base}/?debug${fragment}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__offcut && window.__offcut.result());
  await page.waitForTimeout(600);
  return page;
}

async function at(page, pos, path) {
  await page.evaluate((pos) => {
    const head = window.__offcut.playhead;
    head.playing = false;
    head.target = null;
    head.pos = pos;
  }, pos);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `screenshots/${path}.png` });
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
{
  const page = await open(desktop, hash('w:CAT', 'w:DOG'));
  await at(page, 0, 'from');
  await at(page, 0.55, 'flight-out');
  await at(page, 1, 'rects');
  await at(page, 2, 'bars');
  await at(page, 3, 'ribbon');
  await at(page, 5.5, 'flight-in');
  await at(page, 6, 'to');
  await page.mouse.move(250, 345);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/hover.png' });
  await page.close();
}
{
  const page = await open(desktop, hash('p:star', 'p:heart', 60));
  await at(page, 0, 'star');
  await at(page, 6, 'heart');
  await page.close();
}
{
  const page = await open(desktop, hash('w:YES', 'w:NO'));
  await at(page, 5.45, 'yes-no');
  await page.close();
}
await desktop.close();

const dark = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
{
  const page = await open(dark, hash('w:CAT', 'w:DOG'));
  await at(page, 4.5, 'dark');
  await page.close();
}
await dark.close();

const phone = await browser.newContext({ ...devices['iPhone 13'] });
{
  const page = await open(phone, hash('w:CAT', 'w:DOG'));
  await page.evaluate(() => document.querySelector('canvas').scrollIntoView({ block: 'center' }));
  await at(page, 6, 'phone');
  await page.close();
}
await phone.close();
await browser.close();
