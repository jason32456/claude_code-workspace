// Captures screenshots/. Run from the app folder with a server on it:
//   python3 -m http.server 8140 &  node tools/shots.mjs
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://localhost:8140';
const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function open(level, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript((n) => {
    localStorage.setItem('still-life:furthest', String(n - 1));
    localStorage.setItem('still-life-seen', '1');
  }, level);
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return page;
}

async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

const grab = (page) => page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let bits = '';
  for (let k = 0; k < data.length; k += 4) bits += data[k] > 127 ? '1' : '0';
  return bits;
});

// Two frames a few ticks apart and the cells that differ between them. The
// first two panels are what the screen shows; the third is what motion shows.
{
  const page = await open(1);
  const a = await grab(page);
  await page.waitForTimeout(50);
  const b = await grab(page);
  await page.setViewportSize({ width: 1440, height: 342 });
  await page.setContent(`<body style="margin:0;background:#0b0b0a;color:#8f8a7d;font:12px ui-monospace,Menlo,monospace;letter-spacing:.12em">
    <div style="display:flex;gap:24px;padding:36px 36px 0;justify-content:center">
      ${['ONE FRAME', 'A MOMENT LATER', 'WHAT CHANGED BETWEEN THEM'].map((t, k) => `<figure style="margin:0"><canvas id="c${k}" width="320" height="180" style="width:440px;height:auto;image-rendering:pixelated;display:block"></canvas><figcaption style="padding-top:14px;text-align:center">${t}</figcaption></figure>`).join('')}
    </div></body>`);
  await page.evaluate(([a, b]) => {
    const paint = (id, cell) => {
      const ctx = document.getElementById(id).getContext('2d');
      const image = ctx.createImageData(320, 180);
      for (let k = 0; k < 57600; k++) {
        const [r, g, bl] = cell(k) ? [0xe9, 0xe4, 0xd8] : [0x14, 0x13, 0x0f];
        image.data.set([r, g, bl, 255], k * 4);
      }
      ctx.putImageData(image, 0, 0);
    };
    paint('c0', (k) => a[k] === '1');
    paint('c1', (k) => b[k] === '1');
    paint('c2', (k) => a[k] !== b[k]);
  }, [a, b]);
  await page.screenshot({ path: 'screenshots/triptych.png' });
  await page.context().close();
}

{
  const page = await open(1);
  await hold(page, 'x', 500).catch(() => {});
  await page.keyboard.down('x');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/title-difference.png' });
  await page.keyboard.up('x');
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/paused.png' });
  await page.context().close();
}

// Each level: start it, hold the difference view through the opening breath,
// then again with the player on the move.
const plays = [
  [2, 'hold-still', 'ArrowDown', 350],
  [3, 'they-stop-too', 'ArrowUp', 500],
  [4, 'glass', 'ArrowRight', 2600],
  [6, 'current', 'ArrowDown', 300],
  [7, 'still-life', 'ArrowUp', 500],
];
for (const [level, name, key, ms] of plays) {
  const page = await open(level);
  await hold(page, 'ArrowLeft', 400);
  await page.keyboard.down('x');
  await page.waitForTimeout(3600);
  await page.screenshot({ path: `screenshots/${name}-breath.png` });
  await page.waitForTimeout(1200);
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `screenshots/${name}.png` });
  await page.keyboard.up(key);
  await page.keyboard.up('x');
  await page.context().close();
}

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const text = Buffer.from('READ THIS, THEN TRY TO PHOTOGRAPH IT').toString('base64url');
  await page.goto(`${base}/#note=${text}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.keyboard.down('x');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/note.png' });
  await context.close();
}

{
  const context = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  await context.addInitScript(() => localStorage.setItem('still-life-seen', '1'));
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshots/phone.png' });
  await context.close();
}

await browser.close();
