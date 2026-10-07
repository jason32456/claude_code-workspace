// Deterministic plants. A seed always grows the same plant, so two windows
// looking at the same pot draw the same stems, leaves and flowers.

const SPECIES = [
  { name: 'fern', depth: 4, spread: 0.42, decay: 0.74, len: 34, stem: '#3f6b3a', leaf: '#6fbf5a', flower: '#f4f1e1', petals: 5, petal: 3.2, leafy: 2 },
  { name: 'rose', depth: 4, spread: 0.55, decay: 0.7, len: 32, stem: '#4a3a2c', leaf: '#4e8f43', flower: '#ff6f91', petals: 6, petal: 4.4, leafy: 1 },
  { name: 'marigold', depth: 3, spread: 0.6, decay: 0.78, len: 36, stem: '#4d6b2b', leaf: '#7fb24a', flower: '#ffc23d', petals: 9, petal: 3.8, leafy: 2 },
  { name: 'bluebell', depth: 4, spread: 0.36, decay: 0.76, len: 34, stem: '#35603f', leaf: '#5fa36b', flower: '#8f8cff', petals: 5, petal: 3.6, leafy: 1 },
  { name: 'coral', depth: 5, spread: 0.5, decay: 0.7, len: 30, stem: '#6b3f35', leaf: '#ff8a5c', flower: '#ffd3b8', petals: 4, petal: 3, leafy: 0 },
  { name: 'lily', depth: 3, spread: 0.32, decay: 0.82, len: 40, stem: '#2f6a4f', leaf: '#58b48a', flower: '#fff4fb', petals: 6, petal: 5.2, leafy: 2 },
  { name: 'ember', depth: 4, spread: 0.48, decay: 0.72, len: 32, stem: '#5a3b2a', leaf: '#9cbf4a', flower: '#ff5a3d', petals: 7, petal: 4, leafy: 1 },
];

export function makePlant(seed, species, scale = 1) {
  const sp = SPECIES[((species % SPECIES.length) + SPECIES.length) % SPECIES.length];
  const rnd = mulberry(seed || 1);
  const segs = [];
  const leaves = [];
  const flowers = [];

  function grow(x, y, ang, len, width, depth, t0) {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    const dur = 0.16 + 0.05 * rnd();
    const t1 = t0 + dur;
    segs.push({ x, y, x2, y2, w: width, depth, t0, t1 });
    for (let k = 0; k < sp.leafy; k++) {
      const at = 0.35 + rnd() * 0.55;
      const side = rnd() < 0.5 ? -1 : 1;
      leaves.push({
        x: x + (x2 - x) * at, y: y + (y2 - y) * at,
        ang: ang + side * (0.7 + rnd() * 0.5),
        size: (5 + rnd() * 4) * scale * (1 - depth * 0.12),
        t: t0 + dur * at, depth,
      });
    }
    if (depth >= sp.depth) {
      flowers.push({ x: x2, y: y2, t: t1, rot: rnd() * Math.PI, size: sp.petal * scale * (0.8 + rnd() * 0.4) });
      return;
    }
    const kids = depth === 0 ? 2 : rnd() < 0.35 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const f = kids === 1 ? 0 : k / (kids - 1) - 0.5;
      const a = ang + f * sp.spread * 2 + (rnd() - 0.5) * 0.35;
      grow(x2, y2, a, len * (sp.decay + (rnd() - 0.5) * 0.12), width * 0.68, depth + 1, t1 - 0.02);
    }
  }

  grow(0, 0, -Math.PI / 2 + (rnd() - 0.5) * 0.2, sp.len * scale, 4.2 * scale, 0, 0);

  // Normalise growth time so the last stem finishes at 0.82; flowers open after.
  let tmax = 0;
  for (const s of segs) tmax = Math.max(tmax, s.t1);
  const k = 0.82 / tmax;
  for (const s of segs) { s.t0 *= k; s.t1 *= k; }
  for (const l of leaves) l.t *= k;
  for (const f of flowers) f.t = 0.84 + (f.t * k - 0.6) * 0.15;
  let top = 0;
  for (const s of segs) top = Math.min(top, s.y2);
  return { sp, segs, leaves, flowers, height: -top };
}

// g in [0, 1]: 0 is bare soil, 0.82 is a full-grown plant, 1 is in bloom.
export function drawPlant(ctx, plant, cx, cy, g, time) {
  if (g <= 0) return;
  const { sp } = plant;
  const swayAt = (y, depth) => Math.sin(time * 1.1 + depth * 0.7) * (-y / 40) * 0.9;
  ctx.lineCap = 'round';
  for (const s of plant.segs) {
    const p = (g - s.t0) / (s.t1 - s.t0);
    if (p <= 0) continue;
    const q = Math.min(1, p);
    const ex = s.x + (s.x2 - s.x) * q, ey = s.y + (s.y2 - s.y) * q;
    ctx.strokeStyle = sp.stem;
    ctx.lineWidth = Math.max(0.9, s.w);
    ctx.beginPath();
    ctx.moveTo(cx + s.x + swayAt(s.y, s.depth), cy + s.y);
    ctx.lineTo(cx + ex + swayAt(ey, s.depth), cy + ey);
    ctx.stroke();
  }
  for (const l of plant.leaves) {
    const p = (g - l.t) / 0.12;
    if (p <= 0) continue;
    const q = Math.min(1, p);
    const x = cx + l.x + swayAt(l.y, l.depth), y = cy + l.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(l.ang + Math.sin(time * 1.6 + l.x) * 0.06);
    ctx.fillStyle = sp.leaf;
    ctx.beginPath();
    ctx.ellipse(l.size * q * 0.9, 0, l.size * q, l.size * q * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const f of plant.flowers) {
    const p = (g - f.t) / 0.1;
    if (p <= 0) continue;
    const q = Math.min(1, p);
    const x = cx + f.x + swayAt(f.y, 6), y = cy + f.y;
    const r = f.size * q;
    ctx.fillStyle = sp.flower;
    for (let k = 0; k < sp.petals; k++) {
      const a = f.rot + (k / sp.petals) * Math.PI * 2 + time * 0.15;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.95, r * 0.55, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,214,90,0.95)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    if (q >= 1) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4);
      g.addColorStop(0, `rgba(255,220,150,${0.16 + 0.06 * Math.sin(time * 2 + f.x)})`);
      g.addColorStop(1, 'rgba(255,220,150,0)');
      const op = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = op;
    }
  }
}

export function speciesColor(species) {
  return SPECIES[((species % SPECIES.length) + SPECIES.length) % SPECIES.length].flower;
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
