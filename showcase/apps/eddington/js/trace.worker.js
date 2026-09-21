import { buildSky } from './sky.js';
import { camera, shade } from './shade.js';

let sky = null, skyMode = null;

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type !== 'band') return;
  const p = m.p;
  if (skyMode !== p.skyMode) { sky = buildSky(p.skyMode); skyMode = p.skyMode; }
  const cam = camera(p.r0, p.inc);
  const step = m.scale, ss = m.ss || 1;
  const rows = [];
  let rays = 0;
  for (let y = m.y0; y < m.y1; y += step) {
    const row = new Float32Array(Math.ceil(p.W / step) * 3);
    let k = 0;
    for (let x = 0; x < p.W; x += step) {
      let R = 0, G = 0, B = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const px = ((x + (step * (sx + 0.5)) / ss) / p.W) * 2 - 1;
        const py = 1 - ((y + (step * (sy + 0.5)) / ss) / p.H) * 2;
        const c = shade(p, cam, px, py, sky);
        R += c[0]; G += c[1]; B += c[2]; rays++;
      }
      const n = ss * ss;
      row[k++] = R / n; row[k++] = G / n; row[k++] = B / n;
    }
    rows.push({ y, row });
  }
  const payload = { type: 'rows', job: m.job, scale: step, rows, rays };
  self.postMessage(payload, rows.map((r) => r.row.buffer));
};
