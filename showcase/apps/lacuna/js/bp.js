// Basis pursuit on small dense problems, for the phase-transition experiments:
// min ‖x‖₁ subject to Ax = y, by ADMM. The x-step is an exact projection onto
// {Ax = y} through a Cholesky factor of AAᵀ, so every iterate is feasible and
// the only thing left to converge is the ℓ1 part.

import { rng, permutation } from './rng.js';
import { fwht } from './transforms.js';

export const ENSEMBLES = {
  gaussian: 'Gaussian',
  bernoulli: 'Bernoulli ±1',
  hadamard: 'Partial Hadamard',
};

export function makeMatrix(kind, m, n, rand) {
  const A = new Float64Array(m * n);
  if (kind === 'gaussian') {
    for (let i = 0; i < A.length; i++) A[i] = rand.gauss();
  } else if (kind === 'bernoulli') {
    for (let i = 0; i < A.length; i++) A[i] = rand() < 0.5 ? -1 : 1;
  } else if (kind === 'hadamard') {
    // m distinct random rows of the n×n Hadamard matrix, columns scrambled.
    const rows = permutation(n, rand), cols = permutation(n, rand), e = new Float64Array(n);
    for (let j = 0; j < m; j++) {
      e.fill(0);
      e[rows[j]] = 1;
      fwht(e);
      for (let c = 0; c < n; c++) A[j * n + c] = e[cols[c]];
    }
  } else throw new Error(`unknown ensemble ${kind}`);
  return A;
}

function cholesky(G, m) {
  const L = new Float64Array(m * m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= i; j++) {
      let s = G[i * m + j];
      for (let k = 0; k < j; k++) s -= L[i * m + k] * L[j * m + k];
      if (i === j) {
        if (s <= 0) return null;
        L[i * m + i] = Math.sqrt(s);
      } else L[i * m + j] = s / L[j * m + j];
    }
  }
  return L;
}

function cholSolve(L, m, b) {
  const z = Float64Array.from(b);
  for (let i = 0; i < m; i++) {
    let s = z[i];
    for (let k = 0; k < i; k++) s -= L[i * m + k] * z[k];
    z[i] = s / L[i * m + i];
  }
  for (let i = m - 1; i >= 0; i--) {
    let s = z[i];
    for (let k = i + 1; k < m; k++) s -= L[k * m + i] * z[k];
    z[i] = s / L[i * m + i];
  }
  return z;
}

export function basisPursuit(A, m, n, y, { maxIter = 3000, tol = 1e-7, rho = 1, alpha = 1.6, beat = -Infinity } = {}) {
  const G = new Float64Array(m * m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let c = 0; c < n; c++) s += A[i * n + c] * A[j * n + c];
      G[i * m + j] = G[j * m + i] = s;
    }
  }
  const L = cholesky(G, m);
  if (!L) return null;

  const x = new Float64Array(n), z = new Float64Array(n), u = new Float64Array(n);
  const v = new Float64Array(n), r = new Float64Array(m);
  const project = (src, dst) => {
    for (let i = 0; i < m; i++) {
      let s = -y[i];
      for (let c = 0; c < n; c++) s += A[i * n + c] * src[c];
      r[i] = s;
    }
    const w = cholSolve(L, m, r);
    for (let c = 0; c < n; c++) dst[c] = src[c];
    for (let i = 0; i < m; i++) {
      const wi = w[i];
      if (wi === 0) continue;
      for (let c = 0; c < n; c++) dst[c] -= A[i * n + c] * wi;
    }
  };

  project(z, x); // start at the least-norm solution
  z.set(x);
  const kappa = 1 / rho;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    for (let c = 0; c < n; c++) v[c] = z[c] - u[c];
    project(v, x);
    // x is exactly feasible. The moment its ℓ1 norm drops below `beat`, the
    // point that set `beat` is provably not the minimiser: a certificate of
    // failure, found long before ADMM would crawl to the true optimum.
    if ((iter & 15) === 0) {
      let l1 = 0;
      for (let c = 0; c < n; c++) l1 += Math.abs(x[c]);
      if (l1 < beat) return { x, iters: iter, beaten: true };
    }
    let dz = 0, nz = 0, pr = 0;
    for (let c = 0; c < n; c++) {
      // Over-relaxation (Eckstein–Bertsekas): same fixed point, fewer steps.
      const xh = alpha * x[c] + (1 - alpha) * z[c];
      const a = xh + u[c];
      const zn = a > kappa ? a - kappa : a < -kappa ? a + kappa : 0;
      dz += (zn - z[c]) ** 2;
      z[c] = zn;
      nz += zn * zn;
      const p = x[c] - zn;
      pr += p * p;
      u[c] += xh - zn;
    }
    if (pr < tol * tol * nz && dz < tol * tol * nz) break;
  }
  return { x: z, iters: iter };
}

// One Donoho–Tanner trial: a random k-sparse x₀, m measurements from the
// ensemble, and whether ℓ1 minimisation hands x₀ back.
export let SCALE = 0.3;
export function setScale(v) { SCALE = v; }
export function trial({ n, m, k, kind = 'gaussian', seed }) {
  const rand = rng(seed);
  const x0 = new Float64Array(n);
  const supp = permutation(n, rand);
  for (let i = 0; i < k; i++) x0[supp[i]] = rand.gauss();
  const A = makeMatrix(kind, m, n, rand);
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let c = 0; c < n; c++) s += A[i * n + c] * x0[c];
    y[i] = s;
  }
  // Scale ρ so the shrinkage threshold sits well below the signal's entries.
  let ys = 0;
  for (let i = 0; i < m; i++) ys += y[i] * y[i];
  let l1 = 0;
  for (let c = 0; c < n; c++) l1 += Math.abs(x0[c]);
  const res = basisPursuit(A, m, n, y, { rho: 1 / (SCALE * Math.sqrt(ys / m / n) + 1e-12), beat: l1 * (1 - 1e-9) });
  if (!res) return { success: false, err: Infinity, iters: 0 };
  if (res.beaten) return { success: false, err: NaN, iters: res.iters, certified: true };
  let e = 0, s = 0;
  for (let c = 0; c < n; c++) { e += (res.x[c] - x0[c]) ** 2; s += x0[c] * x0[c]; }
  const err = Math.sqrt(e / Math.max(s, 1e-300));
  return { success: err < 1e-4, err, iters: res.iters };
}
