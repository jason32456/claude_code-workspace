// Regenerates the README screenshots. Needs a server on :8090 serving this
// folder:  python3 -m http.server 8090 & node scripts/screens.mjs [only]
//
// The "real windows" shot is a composite: three real Sill pages share one
// SharedWorker world, each told its screen rect with ?rect= (a headless browser
// has no window manager to ask), captured separately and placed on a drawn
// desktop at exactly those rects.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.SILL_URL || 'http://localhost:8090/';
const OUT = resolve('screenshots');
const TMP = resolve('screenshots/.tmp');
const only = process.argv[2];
mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

async function desk(name, { level, windows, ms, size = [1440, 900], before, after, afterMs = 1200, progress = 7 }) {
  if (only && only !== name) return;
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: size[0] < 600 ? 2 : 1 });
  await ctx.addInitScript((p) => localStorage.setItem('sill.progress.v1', JSON.stringify({ unlocked: p, current: 0, best: {} })), progress);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${BASE}?mode=desk`);
  await page.waitForFunction(() => window.__sill);
  await page.evaluate(([lv, wins]) => {
    __sill.level(lv);
    __sill.hideHint();
    for (const w of [...__sill.wins]) __sill.minimise(w.n, true);
    wins.forEach((r) => __sill.spawn(...r));
  }, [level, windows.map(([x, y, w, h]) => [x * size[0], y * (size[1] - (size[0] < 760 ? 92 : 52)), w * size[0], h * (size[1] - (size[0] < 760 ? 92 : 52))])]);
  // Spawned windows are numbered after the starting pair, which were minimised; close those.
  await page.evaluate(() => { for (const w of [...__sill.wins]) if (w.min) w.el.querySelector('.close').click(); });
  if (before) await page.evaluate(before);
  await wait(ms);
  if (after) { await page.evaluate(after); await wait(afterMs); }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
}

async function realComposite(name, { level, wins, ms, screen = [1440, 848] }) {
  if (only && only !== name) return;
  const ctx = await browser.newContext();
  const pages = [];
  for (const [label, x, y, w, h] of wins) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}/${label}: ${e.message}`));
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}?pane=1&rect=${x},${y},${w},${h}&screen=0,0,${screen[0]},${screen[1]}`);
    pages.push({ page, label, x, y, w, h });
  }
  await pages[0].page.waitForFunction(() => window.__sill && __sill.snap());
  await pages[0].page.evaluate((lv) => __sill.level(lv), level);
  await wait(ms);
  for (const p of pages) await p.page.screenshot({ path: `${TMP}/${name}-${p.label}.png` });
  await ctx.close();

  const MENU = 26, CHROME = 36;
  const html = `<!doctype html><html><head><style>
  body{margin:0;width:${screen[0]}px;height:${screen[1] + MENU}px;overflow:hidden;font-family:system-ui,sans-serif;
  background:radial-gradient(circle at 1px 1px,rgba(255,255,255,.07) 1px,transparent 1.4px) 0 0/22px 22px,radial-gradient(900px 600px at 75% 15%,rgba(140,170,210,.22),transparent 60%),linear-gradient(165deg,#46566c,#303c4d 48%,#1f2834)}
  .menu{position:absolute;left:0;top:0;right:0;height:${MENU}px;background:rgba(20,26,36,.6);color:#e9eef5;font-size:13px;display:flex;align-items:center;gap:18px;padding:0 14px}
  .w{position:absolute;border-radius:10px;overflow:hidden;box-shadow:0 22px 50px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.45);background:#fff}
  .c{height:${CHROME}px;background:linear-gradient(#eef1f5,#dfe4ea);display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid #c6ccd4;box-sizing:border-box}
  .d{width:12px;height:12px;border-radius:50%}.u{flex:1;margin-left:6px;height:21px;border-radius:6px;background:#fff;color:#556;font-size:11px;display:flex;align-items:center;padding:0 10px;box-shadow:inset 0 0 0 1px #d0d6de;white-space:nowrap;overflow:hidden}
  img{display:block}</style></head><body><div class="menu"><b>Browser</b><span>File</span><span>Edit</span><span>View</span><span>Window</span></div>
  ${wins.map(([label, x, y, w, h], i) => `<div class="w" style="left:${x}px;top:${y + MENU - CHROME}px;width:${w}px;z-index:${i}"><div class="c"><span class="d" style="background:#ff5f57"></span><span class="d" style="background:#febc2e"></span><span class="d" style="background:#28c840"></span><span class="u">sill — ${label}</span></div><img src="${name}-${label}.png" width="${w}" height="${h}"></div>`).join('')}
  </body></html>`;
  writeFileSync(`${TMP}/${name}.html`, html);
  const ctx2 = await browser.newContext({ viewport: { width: screen[0], height: screen[1] + MENU } });
  const p2 = await ctx2.newPage();
  await p2.goto('file://' + `${TMP}/${name}.html`);
  await wait(300);
  await p2.screenshot({ path: `${OUT}/${name}.png` });
  await ctx2.close();
}

// Downstream across three real windows: the spring's window, a middle window
// overlapping it, and a wide one holding the pot.
await realComposite('real-windows', {
  level: 1, ms: 7000,
  wins: [['spring', 40, 70, 430, 265], ['middle', 330, 236, 470, 262], ['pot', 690, 430, 640, 292]],
});

// The main window at full size: HUD, hint, minimap with the other windows on it.
await (async () => {
  if (only && only !== 'real-main') return;
  const ctx = await browser.newContext();
  const others = [];
  for (const r of [[60, 470, 470, 330], [980, 90, 420, 300]]) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: r[2], height: r[3] });
    await p.goto(`${BASE}?pane=1&rect=${r.join(',')}&screen=0,0,1440,848`);
    others.push(p);
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`real-main: ${e.message}`));
  await page.setViewportSize({ width: 1180, height: 700 });
  await page.goto(`${BASE}?mode=real&rect=130,90,1180,700&screen=0,0,1440,848`);
  await page.waitForFunction(() => window.__sill && __sill.snap());
  await page.evaluate(() => __sill.level(3));
  await wait(6500);
  await page.screenshot({ path: `${OUT}/real-main.png` });
  await ctx.close();
})();

await desk('desk-uphill', {
  level: 2, ms: 9000,
  windows: [[0.1, 0.62, 0.36, 0.33], [0.6, 0.06, 0.34, 0.34]],
});

await desk('desk-carry', {
  level: 2, ms: 8000,
  windows: [[0.1, 0.62, 0.36, 0.33], [0.6, 0.06, 0.34, 0.34]],
  // Drag the full window up and across in 1.2 s, the way a hand would.
  after: async () => {
    const w = __sill.wins.find((k) => !k.min);
    const x0 = w.x, y0 = w.y, x1 = 0.33 * innerWidth, y1 = 0.2 * innerHeight;
    for (let i = 1; i <= 48; i++) {
      await new Promise((r) => setTimeout(r, 25));
      const t = i / 48, e = t * t * (3 - 2 * t);
      __sill.move(w.n, x0 + (x1 - x0) * e, y0 + (y1 - y0) * e);
    }
  },
  afterMs: 250,
});

await desk('desk-heat', {
  level: 6, ms: 7000,
  windows: [[0.08, 0.08, 0.36, 0.22], [0.3, 0.3, 0.42, 0.44], [0.66, 0.6, 0.3, 0.34]],
});

await desk('desk-garden', {
  level: 7, ms: 14000,
  windows: [[0.03, 0.04, 0.44, 0.88], [0.53, 0.04, 0.44, 0.88]],
});

await desk('phone', {
  level: 0, ms: 9000, size: [390, 844],
  windows: [[0.05, 0.22, 0.9, 0.42], [0.3, 0.68, 0.6, 0.26]],
});

rmSync(TMP, { recursive: true, force: true });
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
await browser.close();
