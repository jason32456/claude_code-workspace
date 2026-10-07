// Real-window mode across separate pages. Headless browsers have no window
// manager, so each page is told where it "is" on a 1440×848 screen with
// ?rect=x,y,w,h; everything else (the SharedWorker, the shared world, the
// per-window rendering) is the real code path.
//
//   node scripts/windows.mjs [outDir]       (needs a server on :8090)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.env.SILL_URL || 'http://localhost:8090/';
const out = process.argv[2] || 'screenshots';
const SCREEN = '0,0,1440,848';
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext();
const errors = [];

async function open(name, x, y, w, h) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}?pane=1&rect=${x},${y},${w},${h}&screen=${SCREEN}`);
  return { page, name, x, y, w, h };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = (p) => p.page.evaluate(() => {
  const s = __sill.snap();
  if (!s) return null;
  const mine = s.panes.find((q) => q.id === __sill.id);
  let held = 0;
  for (let i = 0; i < s.n; i++) if (mine && s.home[i] === mine.key) held++;
  return { panes: s.panes.length, n: s.n, held, fills: s.fills, spilled: s.stats.spilled };
});

// Level 1 on a 1440×848 screen: spring at (245, 229), pot on a pillar at
// (677, 509). A sits over the spring; B overlaps A's lower-right corner and
// holds the pot; C is off to the side.
const A = await open('A', 120, 150, 420, 300);
const B = await open('B', 420, 300, 400, 246);
const C = await open('C', 900, 140, 440, 330);
await A.page.evaluate(() => __sill.level(0));
await wait(9000);

const s1 = { A: await snap(A), B: await snap(B), C: await snap(C) };
console.log('after 9 s', JSON.stringify(s1));
for (const w of [A, B, C]) await w.page.screenshot({ path: `${out}/_win-${w.name}.png` });

// Close A: its water has no floor any more and falls; the part above B lands in B.
const beforeB = s1.B.held;
await A.page.close();
await wait(2500);
const s2 = { B: await snap(B), C: await snap(C) };
console.log('A closed', JSON.stringify(s2));

const checks = [
  ['three windows share one world', s1.A.panes === 3 && s1.B.panes === 3 && s1.C.panes === 3],
  ['water crossed from A into B through the overlap', s1.B.held > 0 || s1.B.fills[0] > 0],
  ['the pot drank', s1.B.fills[0] > 0],
  ['C holds nothing (no spring, no overlap)', s1.C.held === 0],
  ['closing A removed it from the world', s2.B.panes === 2],
  ['closing A dropped its water', s2.B.spilled > s1.B.spilled || s2.B.held > beforeB],
  ['no page errors', errors.length === 0],
];
for (const [name, ok] of checks) console.log(ok ? 'PASS' : 'FAIL', name);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
process.exit(checks.every((c) => c[1]) ? 0 : 1);
