// Fox p-colourings. A third invariant, cheap, and computed TWO independent ways
// so they check each other.
//
// Colour every arc of the diagram with an element of Z_p. A colouring is valid
// when at every crossing the two under-arcs and the over-arc satisfy
//
//   i + j = 2k   (mod p)
//
// The valid colourings form a linear subspace of Z_p^n, so the count is
// p^nullity -- obtained here by Gaussian elimination mod p. It is also
// obtainable by trying all p^n assignments, which is exponential and useless in
// general but is a genuine oracle for small diagrams: it shares no code with
// the elimination.
//
// The theorem that ties this to everything else: a knot admits a NON-TRIVIAL
// p-colouring iff p divides det(K). Since det(K) already arrives twice over
// (from Jones at -1 and Alexander at -1), this is a third road to the same
// number, and selftest 5 asserts all three agree.

import { wirtingerArcs } from './alexander.js';

function rows(diagram) {
  const n = diagram.crossings.length;
  const { perCrossing } = wirtingerArcs(diagram);
  return perCrossing.map(({ over: k, under_in: i, under_out: j }) => {
    const r = new Int32Array(n);
    r[i] += 1;
    r[j] += 1;
    r[k] -= 2;
    return r;
  });
}

// Nullity of the colouring system mod p, by elimination. p must be prime.
export function colourNullity(diagram, p) {
  const n = diagram.crossings.length;
  if (n === 0) return { nullity: 1, count: p, rank: 0 };
  const M = rows(diagram).map((r) => Int32Array.from(r, (x) => ((x % p) + p) % p));
  const m = M.length;
  let rank = 0;
  const where = new Int32Array(n).fill(-1);

  for (let col = 0; col < n && rank < m; col++) {
    let piv = -1;
    for (let r = rank; r < m; r++) if (M[r][col] % p !== 0) { piv = r; break; }
    if (piv < 0) continue;
    const t = M[piv]; M[piv] = M[rank]; M[rank] = t;
    // scale to make the pivot 1
    const inv = modInverse(M[rank][col], p);
    for (let c = col; c < n; c++) M[rank][c] = (M[rank][c] * inv) % p;
    for (let r = 0; r < m; r++) {
      if (r === rank) continue;
      const f = M[r][col] % p;
      if (f === 0) continue;
      for (let c = col; c < n; c++) {
        M[r][c] = ((M[r][c] - f * M[rank][c]) % p + p * Math.abs(f) + p) % p;
      }
    }
    where[col] = rank;
    rank++;
  }
  const nullity = n - rank;
  return { nullity, rank, count: Math.pow(p, nullity) };
}

function modInverse(a, p) {
  a = ((a % p) + p) % p;
  for (let x = 1; x < p; x++) if ((a * x) % p === 1) return x;
  throw new Error(`no inverse for ${a} mod ${p}`);
}

// Brute force over all p^n assignments. Exponential on purpose: it is the
// oracle for colourNullity, not a production path.
export const MAX_ENUM = 3 ** 13;

export function colourEnumerate(diagram, p) {
  const n = diagram.crossings.length;
  if (n === 0) return { count: p, tooBig: false };
  const total = Math.pow(p, n);
  if (total > MAX_ENUM) return { count: null, tooBig: true, total };
  const R = rows(diagram);
  const assign = new Int32Array(n);
  let count = 0;
  for (let s = 0; s < total; s++) {
    let v = s;
    for (let a = 0; a < n; a++) { assign[a] = v % p; v = (v - assign[a]) / p; }
    let ok = true;
    for (let r = 0; r < R.length && ok; r++) {
      let acc = 0;
      for (let a = 0; a < n; a++) acc += R[r][a] * assign[a];
      if (((acc % p) + p) % p !== 0) ok = false;
    }
    if (ok) count++;
  }
  return { count, tooBig: false, total };
}

// Non-trivial colourings are those using more than one colour. There are always
// p constant ones.
export function hasNonTrivial(diagram, p) {
  const { count } = colourNullity(diagram, p);
  return count > p;
}

// The primes worth trying, given a determinant.
export function colouringPrimes() {
  return [3, 5, 7, 11, 13];
}
