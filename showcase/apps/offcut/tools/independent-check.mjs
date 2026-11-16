// A third opinion that shares no geometry code with the engine or its audit.
//
// Tiling: every piece is painted additively into a bitmap, so a pixel's red
// value is how many pieces cover it. In the two shape frames and the ribbon it
// must match the target painted the same way. Stacks of sub-pixel slivers
// round up, which is why a small share of pixels may disagree.
//
// Overlap: bitmaps cannot be trusted for that, for the same reason, so every
// pair of pieces is clipped against each other exactly, in all seven frames.
//
// Run from the app folder with a server on it:
//   python3 -m http.server 8150 &  node tools/independent-check.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://localhost:8150';
const pairs = [
  ['w:CAT', 'w:DOG', 50], ['w:CAT', 'w:DOG', 0], ['w:CAT', 'w:DOG', 100],
  ['w:YES', 'w:NO', 50], ['w:HELLO', 'w:WORLD', 50], ['w:Offcut', 'p:square', 50],
  ['w:jason?', 'w:Q&A!', 50], ['p:star', 'p:heart', 50], ['p:cat', 'p:fish', 50],
  ['p:crescent', 'p:cross', 50], ['w:2026', 'w:NOW', 80], ['p:arrow', 'w:i', 50],
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let failed = 0;
console.log('pair'.padEnd(26), 'pieces'.padStart(7), 'A wrong'.padStart(9), 'B wrong'.padStart(9), 'ribbon'.padStart(9), 'overlap'.padStart(10), ' result');

for (const [a, b, detail] of pairs) {
  await page.goto('about:blank');
  await page.goto(`${base}/?debug#a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&detail=${detail}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__offcut && window.__offcut.result(), null, { timeout: 20000 });
  await page.waitForTimeout(700);
  const row = await page.evaluate(() => {
    const result = window.__offcut.result();
    const WIDTH = 2400;
    const identity = [1, 0, 0, 0];

    function paint(box, poseOf, shape) {
      const scale = WIDTH / (box[2] - box[0]);
      const canvas = new OffscreenCanvas(WIDTH + 8, Math.ceil((box[3] - box[1]) * scale) + 8);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.globalCompositeOperation = 'lighter';
      const px = (x, y) => [(x - box[0]) * scale + 4, (y - box[1]) * scale + 4];
      ctx.fillStyle = 'rgb(100,0,0)';
      for (const piece of result.pieces) {
        const [c, s, tx, ty] = poseOf(piece);
        ctx.beginPath();
        piece.ring.forEach(([x, y], k) => {
          const [X, Y] = px(c * x - s * y + tx, s * x + c * y + ty);
          if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        });
        ctx.closePath();
        ctx.fill();
      }
      if (shape) {
        ctx.fillStyle = 'rgb(0,100,0)';
        ctx.beginPath();
        for (const region of shape) {
          for (const ring of [region.outer, ...region.holes]) {
            ring.forEach(([x, y], k) => { const [X, Y] = px(x, y); if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
            ctx.closePath();
          }
        }
        ctx.fill('evenodd');
      }
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let wrong = 0, inside = 0;
      for (let k = 0; k < data.length; k += 4) {
        const red = data[k], green = data[k + 1];
        if (green > 50) inside++;
        if (shape && Math.abs(red - green) > 40) wrong++;
      }
      return { wrong, inside };
    }

    const A = paint(result.a.poses[0].box, (p) => p.a[0], result.a.shape);
    const B = paint(result.b.poses[0].box, (p) => p.b[0], result.b.shape);
    const R = paint(result.ribbon.box, () => identity, [{ outer: [[0, 0], [result.ribbon.width, 0], [result.ribbon.width, result.ribbon.height], [0, result.ribbon.height]], holes: [] }]);

    const signedArea = (ring) => {
      let sum = 0;
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
        sum += x1 * y2 - x2 * y1;
      }
      return sum / 2;
    };
    const ccw = (ring) => (signedArea(ring) < 0 ? ring.slice().reverse() : ring);
    function commonArea(subject, clipper) {
      let out = subject;
      for (let i = 0; i < clipper.length && out.length; i++) {
        const [ax, ay] = clipper[i], [bx, by] = clipper[(i + 1) % clipper.length];
        const side = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        const next = [];
        for (let k = 0; k < out.length; k++) {
          const p = out[k], q = out[(k + 1) % out.length];
          const sp = side(p), sq = side(q);
          if (sp >= 0) next.push(p);
          if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
            const t = sp / (sp - sq);
            next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
          }
        }
        out = next;
      }
      return out.length >= 3 ? Math.abs(signedArea(out)) : 0;
    }
    function overlapShare(poseOf) {
      const rings = result.pieces.map((piece) => {
        const [c, s, tx, ty] = poseOf(piece);
        return ccw(piece.ring.map(([x, y]) => [c * x - s * y + tx, s * x + c * y + ty]));
      });
      const boxes = rings.map((ring) => {
        const xs = ring.map((v) => v[0]), ys = ring.map((v) => v[1]);
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      });
      const order = rings.map((_, k) => k).sort((i, j) => boxes[i][0] - boxes[j][0]);
      let overlap = 0;
      for (let m = 0; m < order.length; m++) {
        const i = order[m];
        for (let n = m + 1; n < order.length && boxes[order[n]][0] < boxes[i][2]; n++) {
          const j = order[n];
          if (boxes[i][3] <= boxes[j][1] || boxes[j][3] <= boxes[i][1]) continue;
          overlap += commonArea(rings[i], rings[j]);
        }
      }
      return overlap / result.area;
    }
    let overlap = overlapShare(() => identity);
    for (const side of ['a', 'b']) for (const k of [0, 1, 2]) overlap = Math.max(overlap, overlapShare((p) => p[side][k]));
    return { pieces: result.pieces.length, a: A.wrong / A.inside, b: B.wrong / B.inside, r: R.wrong / R.inside, overlap };
  });
  const ok = row.a < 2e-3 && row.b < 2e-3 && row.r < 2e-3 && row.overlap < 1e-9;
  if (!ok) failed++;
  const pct = (v) => `${(v * 100).toFixed(3)}%`.padStart(9);
  console.log(`${a} > ${b} @${detail}`.padEnd(26), String(row.pieces).padStart(7), pct(row.a), pct(row.b), pct(row.r), row.overlap.toExponential(1).padStart(10), ok ? ' ok' : ' FAIL');
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall pairs tile both shapes and the ribbon, with no overlap in any frame');
process.exit(failed ? 1 : 0);
