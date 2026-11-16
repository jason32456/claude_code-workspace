import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1540, height: 1300 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:8151/dev/engine-view.html');
await page.waitForFunction(() => document.title === 'ready', null, { timeout: 15000 });
await page.screenshot({ path: process.argv[2], fullPage: true });
await browser.close();
