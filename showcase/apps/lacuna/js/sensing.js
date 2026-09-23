// The single-pixel camera's measurement operator Φ = S·H·P, never stored.
// P scrambles pixels (or is the identity), H is the orthonormal Walsh–Hadamard
// transform, S keeps M of its rows. Φ has orthonormal rows, so ΦΦᵀ = I and
// both Φ and Φᵀ cost one O(N log N) transform.

import { rng, permutation } from './rng.js';
import { fwht, sequencies } from './transforms.js';

export const MODES = {
  multilevel: 'Multilevel Hadamard',
  scrambled: 'Scrambled Hadamard',
};

export function makeCamera({ side, m, mode = 'multilevel', seed = 1 }) {
  const n = side * side;
  const rand = rng(seed);
  const perm = mode === 'scrambled' ? permutation(n, rand) : null;
  const rows = mode === 'scrambled' ? uniformRows(n, m, rand) : multilevelRows(side, m, rand);
  const t = new Float64Array(n);

  function apply(x, y = new Float64Array(m)) {
    if (perm) for (let i = 0; i < n; i++) t[i] = x[perm[i]];
    else for (let i = 0; i < n; i++) t[i] = x[i];
    fwht(t);
    for (let j = 0; j < m; j++) y[j] = t[rows[j]];
    return y;
  }

  function adjoint(y, x = new Float64Array(n)) {
    t.fill(0);
    for (let j = 0; j < m; j++) t[rows[j]] = y[j];
    fwht(t);
    if (perm) for (let i = 0; i < n; i++) x[perm[i]] = t[i];
    else for (let i = 0; i < n; i++) x[i] = t[i];
    return x;
  }

  // The mirror pattern for measurement j, as ±1 per pixel.
  function pattern(j, out = new Int8Array(n)) {
    const u = rows[j];
    for (let i = 0; i < n; i++) {
      let v = u & i, c = 0;
      while (v) { v &= v - 1; c ^= 1; }
      out[perm ? perm[i] : i] = c ? -1 : 1;
    }
    return out;
  }

  return { side, n, m, mode, rows, apply, adjoint, pattern };
}

function uniformRows(n, m, rand) {
  // Row 0 is the all-ones pattern, the total brightness; every real
  // single-pixel camera takes it, and it costs one measurement.
  const p = permutation(n - 1, rand);
  const rows = new Int32Array(m);
  rows[0] = 0;
  for (let j = 1; j < m; j++) rows[j] = p[j - 1] + 1;
  return rows;
}

// Sample rows with probability falling off with 2D sequency, so coarse
// structure is fully measured and fine structure is sampled sparsely
// (Adcock, Hansen, Poon & Roman's multilevel sampling, in spirit).
function multilevelRows(side, m, rand) {
  const n = side * side, seq = sequencies(side);
  const keys = new Float64Array(n), idx = new Int32Array(n);
  for (let u = 0; u < n; u++) {
    const r = Math.hypot(seq[(u / side) | 0], seq[u % side]);
    const w = Math.pow(1 + r, -2);
    // Efraimidis–Spirakis: the m largest u^(1/w) are a weighted sample
    // without replacement. Logs keep tiny weights from underflowing.
    keys[u] = Math.log(rand() || 1e-300) / w;
    idx[u] = u;
  }
  idx.sort((a, b) => keys[b] - keys[a]);
  return Int32Array.from(idx.subarray(0, m)).sort();
}
