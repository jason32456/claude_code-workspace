// Procedural test scenes, pure math so they render identically in the page,
// in a worker and under Node. Values are grey levels in [0, 1].

const clamp = (v) => Math.min(1, Math.max(0, v));
const smooth = (e0, e1, v) => { const t = clamp((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// Modified Shepp–Logan phantom (Toft's contrast-enhanced table).
const SHEPP = [
  [1, 0.69, 0.92, 0, 0, 0], [-0.8, 0.6624, 0.874, 0, -0.0184, 0],
  [-0.2, 0.11, 0.31, 0.22, 0, -18], [-0.2, 0.16, 0.41, -0.22, 0, 18],
  [0.1, 0.21, 0.25, 0, 0.35, 0], [0.1, 0.046, 0.046, 0, 0.1, 0],
  [0.1, 0.046, 0.046, 0, -0.1, 0], [0.1, 0.046, 0.023, -0.08, -0.605, 0],
  [0.1, 0.023, 0.023, 0, -0.606, 0], [0.1, 0.023, 0.046, 0.06, -0.605, 0],
];

function phantom(u, v) {
  const x = 2 * u - 1, y = 1 - 2 * v;
  let s = 0;
  for (const [A, a, b, x0, y0, deg] of SHEPP) {
    const t = (deg * Math.PI) / 180, dx = x - x0, dy = y - y0;
    const xr = dx * Math.cos(t) + dy * Math.sin(t), yr = -dx * Math.sin(t) + dy * Math.cos(t);
    if ((xr * xr) / (a * a) + (yr * yr) / (b * b) <= 1) s += A;
  }
  return s;
}

// Three spheres and a box on a table, lit from the upper left.
const SPHERES = [[0.3, 0.62, 0.14, 0.85], [0.58, 0.66, 0.1, 0.55], [0.78, 0.6, 0.075, 0.95]];
function stillLife(u, v) {
  const L = [-0.55, -0.6, 0.58];
  let c = v < 0.55 ? 0.28 + 0.25 * v : 0.62 - 0.3 * (v - 0.55);
  if (v >= 0.55 && v < 0.565) c = 0.78;
  for (const [cx, cy, r] of SPHERES) {
    const sx = cx + 0.6 * r, sy = cy + r * 0.95;
    const d = Math.hypot((u - sx) / (1.3 * r), (v - sy) / (0.35 * r));
    if (v > 0.56) c *= 1 - 0.45 * (1 - smooth(0.6, 1.1, d));
  }
  if (u > 0.06 && u < 0.19 && v > 0.42 && v < 0.72) {
    c = u < 0.15 ? 0.7 : 0.45;
    if (v < 0.47 && u > 0.08 + (0.47 - v)) c = 0.88;
  }
  for (const [cx, cy, r, albedo] of SPHERES) {
    const dx = (u - cx) / r, dy = (v - cy) / r, q = dx * dx + dy * dy;
    if (q < 1) {
      const dz = Math.sqrt(1 - q);
      const lam = Math.max(0, dx * L[0] + dy * L[1] + dz * L[2]);
      const spec = Math.pow(Math.max(0, 2 * dz * (dx * L[0] + dy * L[1] + dz * L[2]) * dz - L[2]), 24);
      c = clamp(albedo * (0.12 + 0.88 * lam) + 0.5 * spec);
    }
  }
  return c;
}

function hash(i) {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// A city at dusk: buildings with lit windows, a moon, a sky gradient.
function skyline(u, v) {
  let c = 0.12 + 0.5 * v * v;
  const md = Math.hypot(u - 0.78, v - 0.2);
  if (md < 0.07) c = 0.95;
  else c += 0.15 * Math.exp(-md * 12);
  const cols = 11, b = Math.floor(u * cols), f = u * cols - b;
  const top = 0.35 + 0.4 * hash(b + 7);
  if (v > top && f > 0.06 && f < 0.94) {
    c = 0.08 + 0.06 * hash(b);
    const wx = (f - 0.06) / 0.88 * 4, wy = (v - top) * 40;
    if (wx % 1 > 0.3 && wx % 1 < 0.75 && wy % 1 > 0.35 && wy % 1 < 0.8) {
      if (hash(b * 131 + Math.floor(wx) * 17 + Math.floor(wy) * 7) > 0.45) c = 0.85;
    }
  }
  if (v > 0.93) c = 0.05;
  return clamp(c);
}

// A resolution chart: bar groups at rising frequency, which no sparsity prior
// likes, next to discs and a ramp, which every one does.
function chart(u, v) {
  if (v < 0.5) {
    const group = Math.floor(u * 4), f = [3, 5, 8, 12][group];
    const lu = u * 4 - group;
    if (lu < 0.1 || lu > 0.9 || v < 0.06 || v > 0.44) return 0.5;
    return Math.floor(((lu - 0.1) / 0.8) * f * 2) % 2 ? 0.1 : 0.9;
  }
  if (u < 0.5) {
    const d = Math.hypot(u - 0.25, v - 0.75);
    return d < 0.18 ? (d < 0.1 ? 0.95 : 0.2) : 0.6;
  }
  return clamp((u - 0.5) * 2) * 0.8 + 0.1;
}

export const SCENES = {
  stilllife: { name: 'Still life', fn: stillLife },
  phantom: { name: 'Shepp–Logan phantom', fn: phantom },
  skyline: { name: 'Skyline', fn: skyline },
  chart: { name: 'Resolution chart', fn: chart },
};

// 4×4 supersampling so edges are anti-aliased the way a real sensor would see them.
export function renderScene(id, side) {
  const fn = SCENES[id].fn, out = new Float64Array(side * side), ss = 4;
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      let s = 0;
      for (let a = 0; a < ss; a++) for (let b = 0; b < ss; b++) s += fn((c + (b + 0.5) / ss) / side, (r + (a + 0.5) / ss) / side);
      out[r * side + c] = clamp(s / (ss * ss));
    }
  }
  return out;
}
