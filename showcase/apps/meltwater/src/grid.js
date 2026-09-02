export const N = 128;
export const CELL = 1.0;
export const CELL_AREA = CELL * CELL;
export const WORLD = N * CELL;

export const idx = (x, z) => z * N + x;
export const inBounds = (x, z) => x >= 0 && z >= 0 && x < N && z < N;

// Grid space is 0..N; world space is centred on the origin so the camera can
// orbit a sensible pivot.
export const gx2wx = (x) => (x - (N - 1) / 2) * CELL;
export const wx2gx = (wx) => wx / CELL + (N - 1) / 2;

export function bilinear(field, x, z) {
  const cx = Math.max(0, Math.min(N - 1.001, x));
  const cz = Math.max(0, Math.min(N - 1.001, z));
  const x0 = cx | 0;
  const z0 = cz | 0;
  const fx = cx - x0;
  const fz = cz - z0;
  const x1 = Math.min(N - 1, x0 + 1);
  const z1 = Math.min(N - 1, z0 + 1);
  const a = field[z0 * N + x0];
  const b = field[z0 * N + x1];
  const c = field[z1 * N + x0];
  const d = field[z1 * N + x1];
  return a * (1 - fx) * (1 - fz) + b * fx * (1 - fz) + c * (1 - fx) * fz + d * fx * fz;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise with a fixed permutation, good enough for terrain grain and far
// cheaper than a gradient noise we would only ever sample on a lattice.
export function makeNoise(seed) {
  const rand = mulberry32(seed);
  const size = 256;
  const table = new Float32Array(size * size);
  for (let i = 0; i < table.length; i++) table[i] = rand();
  const at = (xi, zi) => table[((zi & 255) << 8) | (xi & 255)];
  const smooth = (t) => t * t * (3 - 2 * t);

  const octave = (x, z, f) => {
    const px = x * f;
    const pz = z * f;
    const x0 = Math.floor(px);
    const z0 = Math.floor(pz);
    const fx = smooth(px - x0);
    const fz = smooth(pz - z0);
    const a = at(x0, z0);
    const b = at(x0 + 1, z0);
    const c = at(x0, z0 + 1);
    const d = at(x0 + 1, z0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  };

  return (x, z, freq = 0.05, octaves = 4) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = freq;
    for (let o = 0; o < octaves; o++) {
      sum += octave(x, z, f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.07;
    }
    return sum / norm - 0.5;
  };
}
