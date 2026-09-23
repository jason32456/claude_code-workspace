// Orthonormal transforms. Every forward has an exact inverse, and every one
// preserves the 2-norm, which is what lets FISTA use a unit step.

// In-place fast Walsh–Hadamard transform, natural (Sylvester) order, scaled by
// 1/√n so that it is orthonormal and its own inverse.
export function fwht(a) {
  const n = a.length;
  for (let h = 1; h < n; h <<= 1) {
    for (let i = 0; i < n; i += h << 1) {
      for (let j = i; j < i + h; j++) {
        const x = a[j], y = a[j + h];
        a[j] = x + y;
        a[j + h] = x - y;
      }
    }
  }
  const s = 1 / Math.sqrt(n);
  for (let i = 0; i < n; i++) a[i] *= s;
  return a;
}

// Sign changes along row u of the n×n Sylvester Hadamard matrix. Low sequency
// is coarse detail, which is what multilevel sampling favours.
export function sequencies(n) {
  const out = new Int32Array(n);
  for (let u = 0; u < n; u++) {
    let prev = 1, changes = 0;
    for (let x = 0; x < n; x++) {
      const bits = popcount(u & x) & 1;
      const s = bits ? -1 : 1;
      if (x > 0 && s !== prev) changes++;
      prev = s;
    }
    out[u] = changes;
  }
  return out;
}

function popcount(v) {
  let c = 0;
  while (v) { v &= v - 1; c++; }
  return c;
}

const R3 = Math.sqrt(3), S2 = Math.SQRT2;
export const FILTERS = {
  haar: [1 / S2, 1 / S2],
  db4: [(1 + R3) / (4 * S2), (3 + R3) / (4 * S2), (3 - R3) / (4 * S2), (1 - R3) / (4 * S2)],
};

function highpass(h) {
  const L = h.length, g = new Float64Array(L);
  for (let k = 0; k < L; k++) g[k] = (k % 2 ? -1 : 1) * h[L - 1 - k];
  return g;
}

// One periodic analysis step on a strided line of length n.
function analyse(src, dst, n, h, g, tmp) {
  const half = n >> 1, L = h.length;
  for (let i = 0; i < half; i++) {
    let a = 0, d = 0;
    for (let k = 0; k < L; k++) {
      const v = src[(2 * i + k) % n];
      a += h[k] * v;
      d += g[k] * v;
    }
    tmp[i] = a;
    tmp[half + i] = d;
  }
  for (let i = 0; i < n; i++) dst[i] = tmp[i];
}

function synthesise(src, dst, n, h, g, tmp) {
  const half = n >> 1, L = h.length;
  tmp.fill(0, 0, n);
  for (let i = 0; i < half; i++) {
    const a = src[i], d = src[half + i];
    for (let k = 0; k < L; k++) tmp[(2 * i + k) % n] += h[k] * a + g[k] * d;
  }
  for (let i = 0; i < n; i++) dst[i] = tmp[i];
}

// 2D Mallat decomposition of a side×side image, `levels` deep. The coarse
// block ends up in the top-left (side >> levels) square.
export function makeWavelet(name, side, levels) {
  const h = Float64Array.from(FILTERS[name]), g = highpass(h);
  const line = new Float64Array(side), tmp = new Float64Array(side);
  const pass = (x, n, fn) => {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) line[c] = x[r * side + c];
      fn(line, line, n, h, g, tmp);
      for (let c = 0; c < n; c++) x[r * side + c] = line[c];
    }
    for (let c = 0; c < n; c++) {
      for (let r = 0; r < n; r++) line[r] = x[r * side + c];
      fn(line, line, n, h, g, tmp);
      for (let r = 0; r < n; r++) x[r * side + c] = line[r];
    }
  };
  const coarse = side >> levels;
  return {
    name, side, levels, coarse,
    forward(x) { for (let l = 0, n = side; l < levels; l++, n >>= 1) pass(x, n, analyse); return x; },
    inverse(x) { for (let l = levels - 1; l >= 0; l--) pass(x, side >> l, synthesise); return x; },
    isCoarse(i) { return (i % side) < coarse && ((i / side) | 0) < coarse; },
  };
}

// Forward differences with Neumann boundary, and the negative adjoint, for TV.
export function grad(x, side, gx, gy) {
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      const k = r * side + c;
      gx[k] = c < side - 1 ? x[k + 1] - x[k] : 0;
      gy[k] = r < side - 1 ? x[k + side] - x[k] : 0;
    }
  }
}

export function div(px, py, side, out) {
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      const k = r * side + c;
      let v = 0;
      if (c < side - 1) v += px[k];
      if (c > 0) v -= px[k - 1];
      if (r < side - 1) v += py[k];
      if (r > 0) v -= py[k - side];
      out[k] = v;
    }
  }
}
