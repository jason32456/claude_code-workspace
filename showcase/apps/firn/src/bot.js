// A greedy line-picker: it looks a short way ahead along a fan of headings,
// scores the snow and pickups on each, and steers toward the best one. It
// drives the title-screen demo and the bench.
import { PROPS, CELL, SNOW, impactEnergy } from './sim.js';

export function botInput(sim, opts = {}) {
  const w = sim.world, { p, v } = sim, r = sim.r;
  const sp = Math.hypot(v[0], v[2]) || 1;
  const hx = v[0] / sp, hz = v[2] / sp;
  const look = opts.look ?? Math.min(40, 10 + sp * 1.4 + r * 3);
  const m = sim.mass();
  let best = 0, bestScore = -Infinity;
  for (let a = -0.6; a <= 0.601; a += 0.1) {
    const c = Math.cos(a), s = Math.sin(a);
    const dx = hx * c - hz * s, dz = hx * s + hz * c;
    if (dz < 0.25) continue;
    let score = -Math.abs(a) * 3;
    for (let t = 2; t <= look; t += 2) {
      const x = p[0] + dx * t, z = p[2] + dz * t;
      const u = Math.abs(x) / w.hw(z);
      if (u > 0.8) score -= (u - 0.8) * 60;
      const i = Math.floor((x + w.GX) / CELL), j = Math.floor((z - w.z0) / CELL);
      if (i < 0 || j < 0 || i >= w.cx || j >= w.cz) { score -= 20; continue; }
      const o = i + j * w.cx, ty = w.type[o];
      score += Math.min(w.depth[o], r * 1.5) * (ty === SNOW.POWDER ? 1.0 : 1.4);
      if (ty === SNOW.ROCK) score -= 4;
      if (ty === SNOW.ICE) score -= 0.4;
    }
    const b0 = Math.floor(p[2] / 4), b1 = Math.floor((p[2] + look) / 4);
    for (let b = b0; b <= b1; b++) {
      for (const pr of w.buckets.get(b) || []) {
        if (pr.state !== 'up') continue;
        const rx = pr.x - p[0], rz = pr.z - p[2];
        const along = rx * dx + rz * dz;
        if (along < 0 || along > look) continue;
        const off = Math.abs(rx * dz - rz * dx);
        const P = PROPS[pr.kind];
        if (off > r + P.radius + 0.6) continue;
        if (r >= P.absorbR) score += 2 + P.vol * 6;
        else if (impactEnergy(m, sp) * 0.6 > P.breakE) score -= 1;
        else score -= 30 * (1 - along / (look + 1));
      }
    }
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return { steer: Math.max(-1, Math.min(1, best * 3)), tuck: r < 0.5, brake: false };
}
