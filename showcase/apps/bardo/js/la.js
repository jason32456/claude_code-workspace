// Dense linear algebra, written out because the app needs exactly four things
// and a library would hide the one that matters: whether the system is singular.

export function zeros(n, m = n) {
  return Array.from({ length: n }, () => new Float64Array(m));
}

export function identity(n) {
  const A = zeros(n);
  for (let i = 0; i < n; i++) A[i][i] = 1;
  return A;
}

export function matVec(A, x) {
  const n = A.length;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const row = A[i];
    for (let j = 0; j < row.length; j++) s += row[j] * x[j];
    y[i] = s;
  }
  return y;
}

export function matMul(A, B) {
  const n = A.length, k = B.length, m = B[0].length;
  const C = zeros(n, m);
  for (let i = 0; i < n; i++) {
    for (let p = 0; p < k; p++) {
      const a = A[i][p];
      if (a === 0) continue;
      for (let j = 0; j < m; j++) C[i][j] += a * B[p][j];
    }
  }
  return C;
}

// Gauss-Jordan with partial pivoting. Returns { x, singular, pivotMin } — the
// smallest pivot magnitude is reported so callers can tell "solved" from
// "solved, but do not believe it".
export function solve(Ain, bin) {
  const n = Ain.length;
  const A = Ain.map((r) => Float64Array.from(r));
  const b = Float64Array.from(bin);
  let pivotMin = Infinity;

  for (let col = 0; col < n; col++) {
    let best = col, bestAbs = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r][col]);
      if (v > bestAbs) { bestAbs = v; best = r; }
    }
    if (bestAbs < 1e-14) {
      return { x: new Float64Array(n).fill(NaN), singular: true, pivotMin: bestAbs };
    }
    pivotMin = Math.min(pivotMin, bestAbs);
    if (best !== col) {
      const t = A[best]; A[best] = A[col]; A[col] = t;
      const tb = b[best]; b[best] = b[col]; b[col] = tb;
    }
    const piv = A[col][col];
    for (let j = col; j < n; j++) A[col][j] /= piv;
    b[col] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (f === 0) continue;
      for (let j = col; j < n; j++) A[r][j] -= f * A[col][j];
      b[r] -= f * b[col];
    }
  }
  return { x: b, singular: false, pivotMin };
}

export function inverse(Ain) {
  const n = Ain.length;
  const cols = [];
  for (let j = 0; j < n; j++) {
    const e = new Float64Array(n);
    e[j] = 1;
    const r = solve(Ain, e);
    if (r.singular) return null;
    cols.push(r.x);
  }
  const out = zeros(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i][j] = cols[j][i];
  return out;
}

// Spectral radius by power iteration on |A|. For a non-negative matrix — which
// DP always is — Perron-Frobenius makes this the honest dominant eigenvalue,
// and it shares no code with the linear solve it is used to check.
export function spectralRadius(A, iters = 4000, tol = 1e-13) {
  const n = A.length;
  let v = new Float64Array(n).fill(1 / n);
  let lambda = 0, prev = -1;
  for (let k = 0; k < iters; k++) {
    const w = matVec(A, v);
    let norm = 0;
    for (let i = 0; i < n; i++) norm += Math.abs(w[i]);
    if (norm < 1e-300) return 0;
    for (let i = 0; i < n; i++) w[i] /= norm;
    lambda = norm;
    v = w;
    // Near delta = 0 the dominant eigenvalue approaches 1 and convergence
    // slows, so this bails on the iterate rather than a fixed count.
    if (k > 20 && Math.abs(lambda - prev) < tol * Math.max(1, lambda)) break;
    prev = lambda;
  }
  return lambda;
}

// Stationary distribution of a row-stochastic matrix by power iteration.
// Deliberately not a linear solve: the renewal-reward oracle must not share
// machinery with the valuation it is checking.
export function stationary(P, iters = 200000, tol = 1e-15) {
  const n = P.length;
  let v = new Float64Array(n).fill(1 / n);
  for (let k = 0; k < iters; k++) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const vi = v[i];
      if (vi === 0) continue;
      for (let j = 0; j < n; j++) w[j] += vi * P[i][j];
    }
    let s = 0;
    for (let j = 0; j < n; j++) s += w[j];
    if (s > 0) for (let j = 0; j < n; j++) w[j] /= s;
    let diff = 0;
    for (let j = 0; j < n; j++) diff += Math.abs(w[j] - v[j]);
    v = w;
    if (diff < tol) break;
  }
  return v;
}
