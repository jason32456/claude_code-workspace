// Derives sensor positions from a reference solution: place windows, trace the
// real dispersion, and put each sensor where its colour actually lands. Every
// level is therefore solvable by construction. Prints fractions for LEVELS.
const S = { x: 0, y: 0, w: 1280, h: 720 };
const WAVES = [400, 435, 470, 505, 540, 575, 610, 645, 680];
const index = (nm) => 1.45 + 0.021 / ((nm / 1000) ** 2);
function element(w) {
  const cx = w.rect.x + w.rect.w / 2, cy = w.rect.y + w.rect.h / 2;
  const R = Math.min(w.rect.w, w.rect.h) * 0.3;
  if (w.kind === 'mirror') { const a = w.rot + Math.PI / 4; const dx = Math.cos(a) * R * 1.25, dy = Math.sin(a) * R * 1.25; return { kind: 'mirror', cx, cy, edges: [[cx - dx, cy - dy, cx + dx, cy + dy]] }; }
  const pts = [0, 1, 2].map((k) => { const a = w.rot - Math.PI / 2 + (k * 2 * Math.PI) / 3; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
  return { kind: 'prism', cx, cy, pts, edges: [0, 1, 2].map((k) => [...pts[k], ...pts[(k + 1) % 3]]) };
}
function segHit(ox, oy, dx, dy, x1, y1, x2, y2) {
  const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - ox) * ey - (y1 - oy) * ex) / den, u = ((x1 - ox) * dy - (y1 - oy) * dx) / den;
  if (t <= 1e-6 || u < 0 || u > 1) return null;
  const L = Math.hypot(ey, ex); return { t, nx: ey / L, ny: -ex / L };
}
function lastRay(elements, src, nm) {
  let ox = src[0], oy = src[1], dx = 1, dy = 0; const n = index(nm);
  for (let b = 0; b < 40; b++) {
    let best = null, el = null;
    for (const e of elements) for (const g of e.edges) { const h = segHit(ox, oy, dx, dy, ...g); if (h && (!best || h.t < best.t)) { best = h; el = e; } }
    if (!best) return { ox, oy, dx, dy };
    const ex = ox + dx * best.t, ey = oy + dy * best.t; let nx = best.nx, ny = best.ny;
    if (el.kind === 'mirror') { const d = dx * nx + dy * ny; dx -= 2 * d * nx; dy -= 2 * d * ny; }
    else {
      if ((ex - el.cx) * nx + (ey - el.cy) * ny < 0) { nx = -nx; ny = -ny; }
      const ent = dx * nx + dy * ny < 0, eta = ent ? 1 / n : n, inx = ent ? nx : -nx, iny = ent ? ny : -ny;
      const cosi = -(dx * inx + dy * iny), k = 1 - eta * eta * (1 - cosi * cosi);
      if (k < 0) { dx += 2 * cosi * inx; dy += 2 * cosi * iny; } else { const f = eta * cosi - Math.sqrt(k); dx = eta * dx + f * inx; dy = eta * dy + f * iny; }
      const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    }
    ox = ex + dx * 0.01; oy = ey + dy * 0.01;
  }
  return null;
}
function solve(name, srcF, wins, dist) {
  const src = [S.x + srcF[0] * S.w, S.y + srcF[1] * S.h];
  const els = wins.map(element);
  const out = [];
  const rays = [['red', 645], ['green', 540], ['violet', 400]].map(([band, nm]) => [band, lastRay(els, src, nm)]);
  // Push the sensors as far out as the screen allows (40 px margin), so the
  // colours have room to separate.
  const inside = (d) => rays.every(([, r]) => { const x = r.ox + r.dx * d, y = r.oy + r.dy * d; return x > 40 && x < S.w - 40 && y > 40 && y < S.h - 40; });
  while (dist > 120 && !inside(dist)) dist -= 10;
  for (const [band, r] of rays) {
    const x = r.ox + r.dx * dist, y = r.oy + r.dy * dist;
    out.push([+(x / S.w).toFixed(3), +(y / S.h).toFixed(3), band, Math.round(x), Math.round(y), +(Math.atan2(r.dy, r.dx) * 180 / Math.PI).toFixed(1)]);
  }
  console.log(name, JSON.stringify(out));
}
const W = (x, y, w, h, kind, rot) => ({ rect: { x, y, w, h }, kind, rot });
// Level 1: one prism window on the beam.
solve('L1', [0, 0.32], [W(240, 90, 380, 300, 'prism', 0.35)], 900);
// Level 2: a mirror on the beam turns it down into a prism below it.
solve('L2', [0, 0.2], [W(150, 24, 300, 240, 'mirror', 0), W(150, 190, 300, 250, 'prism', 0.3)], 900);
// Level 3: the beam enters low; a mirror throws it up into a prism.
solve('L3', [0, 0.88], [W(120, 514, 260, 240, 'mirror', -Math.PI / 2), W(110, 250, 320, 260, 'prism', 0.6)], 900);
