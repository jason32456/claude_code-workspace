// The Alexander polynomial, by Fox's free differential calculus on the
// Wirtinger presentation. This shares NO code with jones.js -- no bracket, no
// state sum, no smoothings. It walks the same diagram and reaches an invariant
// by completely different machinery, which is what makes the bridge theorem
//
//   |Delta(-1)| = |V(-1)| = det(K)
//
// a real cross-check rather than a restatement.
//
// The rows come out of the Fox derivatives of the Wirtinger relators. At a
// positive crossing the relator is r = x_k x_i x_k^-1 x_j^-1 (over-arc k,
// under-arc i in, under-arc j out), and abelianising each generator to t:
//
//   dr/dx_i = t,   dr/dx_j = -1,   dr/dx_k = 1 - t
//
// At a negative crossing r = x_k^-1 x_i x_k x_j^-1 gives t^-1, -1, 1 - t^-1,
// which is the same row scaled by the unit t^-1 -- cleared below to 1, -t, t-1.
// Scaling a row by a unit changes the determinant only by a unit, and Delta is
// only defined up to +-t^k anyway, so the normalisation at the end fixes it.

import * as L from './laurent.js';

// The arcs of the DIAGRAM in the classical sense: maximal over-strands, broken
// at every under-pass. An n-crossing knot diagram has exactly n of them, which
// is asserted rather than assumed.
export function wirtingerArcs(diagram) {
  const { crossings, visits } = diagram;
  const n = crossings.length;
  if (n === 0) return { arcOf: [], perCrossing: [], count: 0 };

  const V = visits.length;
  // Find a starting visit that is an under-pass, so arc 0 begins cleanly.
  let start = visits.findIndex((v) => v.kind === 'under');
  if (start < 0) throw new Error('no under-pass found');

  // Walk from there; the arc index increments after each under-pass.
  const arcAfterVisit = new Int32Array(V);
  let arc = 0;
  for (let step = 0; step < V; step++) {
    const k = (start + step) % V;
    arcAfterVisit[k] = arc;            // the arc LEAVING this visit
    if (visits[k].kind === 'under') {
      // leaving an under-pass starts a fresh arc only after we record it
    }
    const nextK = (start + step + 1) % V;
    if (visits[nextK].kind === 'under') arc++;
  }
  const count = arc % n === 0 && arc > 0 ? arc : arc;
  // The walk wraps, so the final increment must bring us back to arc 0.
  const total = arc;
  if (total !== n) {
    // Arc count must equal crossing number for a knot diagram.
    throw new Error(`arc count ${total} != crossing count ${n}`);
  }

  const perCrossing = crossings.map(() => ({ over: -1, under_in: -1, under_out: -1 }));
  for (let step = 0; step < V; step++) {
    const k = (start + step) % V;
    const vis = visits[k];
    const prevK = (k - 1 + V) % V;
    const arcIn = arcAfterVisit[prevK] % n;
    const arcOut = arcAfterVisit[k] % n;
    const rec = perCrossing[vis.crossing];
    if (vis.kind === 'under') {
      rec.under_in = arcIn;
      rec.under_out = arcOut;
    } else {
      // An over-pass does not break the arc, so in and out are the same arc.
      rec.over = arcOut;
    }
  }
  return { perCrossing, count: n, arcAfterVisit, start };
}

// n x n matrix of Laurent polynomials in t.
export function alexanderMatrix(diagram) {
  const { crossings } = diagram;
  const n = crossings.length;
  const { perCrossing } = wirtingerArcs(diagram);

  const M = Array.from({ length: n }, () => Array.from({ length: n }, () => L.zero()));
  for (let c = 0; c < n; c++) {
    const { over: k, under_in: i, under_out: j } = perCrossing[c];
    if (k < 0 || i < 0 || j < 0) throw new Error(`crossing ${c} missing an arc label`);
    const pos = crossings[c].sign > 0;
    // Entries ADD rather than assign, because a kink can make two of i, j, k
    // the same arc.
    const put = (col, poly) => { M[c][col] = L.add(M[c][col], poly); };
    if (pos) {
      put(i, L.mono(1, 1));                 // t
      put(j, L.mono(-1, 0));                // -1
      put(k, L.add(L.mono(1, 0), L.mono(-1, 1))); // 1 - t
    } else {
      put(i, L.mono(1, 0));                 // 1
      put(j, L.mono(-1, 1));                // -t
      put(k, L.add(L.mono(-1, 0), L.mono(1, 1))); // t - 1
    }
  }
  return M;
}

// Determinant of a matrix of polynomials, exactly, by dynamic programming over
// column subsets: det = sum over permutations, accumulated mask by mask. That
// is O(2^m * m) polynomial multiplies instead of m! of them, and it stays in
// Z[t] with no division anywhere -- no fraction-free elimination to get wrong,
// no evaluation-and-interpolate step that could alias.
export const MAX_MINOR = 16;

export function polyDet(M) {
  const m = M.length;
  if (m === 0) return L.one();
  if (m > MAX_MINOR) return null;

  const size = 1 << m;
  const dp = new Array(size).fill(null);
  dp[0] = L.one();

  for (let mask = 0; mask < size; mask++) {
    const cur = dp[mask];
    if (cur === null || L.isZero(cur)) continue;
    let row = 0, mm = mask;
    while (mm) { row += mm & 1; mm >>= 1; }
    if (row >= m) continue;
    for (let col = 0; col < m; col++) {
      if (mask & (1 << col)) continue;
      const entry = M[row][col];
      if (L.isZero(entry)) continue;
      // Inversion count: how many already-used columns sit above this one.
      let inv = 0;
      for (let q = col + 1; q < m; q++) if (mask & (1 << q)) inv++;
      const signed = (inv % 2 === 0) ? entry : L.scale(entry, -1);
      const next = mask | (1 << col);
      const add = L.mul(cur, signed);
      dp[next] = dp[next] === null ? add : L.add(dp[next], add);
    }
  }
  return dp[size - 1] ?? L.zero();
}

// Delta is only defined up to +- t^k. Normalise: shift so the lowest term sits
// at degree 0, then force that coefficient positive. The Alexander polynomial
// of a knot is palindromic after this, which selftest 6 asserts as a free
// invariant the code never enforces.
export function normalise(p) {
  if (L.isZero(p)) return p;
  const { min } = L.degrees(p);
  let q = L.shift(p, -min);
  if ((q.get(0) ?? 0n) < 0n) q = L.scale(q, -1);
  return q;
}

export function alexander(diagram) {
  const n = diagram.crossings.length;
  if (n === 0) return { alexander: L.one(), minor: 0, n: 0 };
  const M = alexanderMatrix(diagram);
  // Drop the last row and column: the Wirtinger presentation has one redundant
  // relator, so the full matrix is singular and any (n-1)-minor gives Delta.
  const minor = M.slice(0, n - 1).map((row) => row.slice(0, n - 1));
  const det = polyDet(minor);
  if (det === null) return { alexander: null, tooBig: true, n, minor: n - 1 };
  return { alexander: normalise(det), raw: det, n, minor: n - 1 };
}

export function alexanderAtMinusOne(p) {
  let sum = 0n;
  for (const [e, c] of p) sum += c * (((e % 2) + 2) % 2 === 0 ? 1n : -1n);
  return sum;
}

// Palindromic check: Delta(t) == t^deg * Delta(1/t), exactly.
export function isPalindromic(p) {
  if (L.isZero(p)) return true;
  const { min, max } = L.degrees(p);
  const deg = max + min;
  for (const [e, c] of p) {
    if ((p.get(deg - e) ?? 0n) !== c) return false;
  }
  return true;
}
