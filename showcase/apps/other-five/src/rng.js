// Deterministic noise + small math helpers. Everything in the reef is generated
// from one seed, so a night can be replayed exactly.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Signed angle from a to b, wrapped to [-PI, PI].
export function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function approach(cur, target, rate, dt) {
  const d = target - cur;
  const step = rate * dt;
  if (Math.abs(d) <= step) return target;
  return cur + Math.sign(d) * step;
}

// ── value noise ────────────────────────────────────────────────────────────
export function makeNoise2D(seed) {
  const rnd = mulberry32(seed);
  const SIZE = 256;
  const table = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < table.length; i++) table[i] = rnd();

  const at = (x, y) => table[(((y & 255) << 8) | (x & 255)) >>> 0];

  return function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
  };
}

export function makeFbm(seed, octaves = 4, gain = 0.5, lacunarity = 2.0) {
  const n = makeNoise2D(seed);
  return function fbm(x, y) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}

export function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
export function range(rnd, a, b) { return a + rnd() * (b - a); }
