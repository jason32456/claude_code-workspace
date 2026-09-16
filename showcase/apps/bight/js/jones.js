// The Jones polynomial, via the Kauffman bracket state sum.
//
//   <L> = sum over all 2^n states of  A^(a(s) - b(s)) * delta^(|s| - 1)
//   delta = -A^2 - A^-2
//   f(L) = (-A^3)^(-w(L)) <L>,      V(t) = f(L) with A = t^(-1/4)
//
// A state picks, at each crossing, either the A-smoothing or the B-smoothing;
// |s| is the number of closed loops the smoothed diagram has.
//
// WHICH SMOOTHING IS "A" is the one thing here that cannot be read directly off
// coordinates, and it is exactly where a sign error would hide while every
// panel still looked plausible. Kauffman's definition: rotate the OVER-strand
// counterclockwise onto the under-strand; the two regions swept are the A
// regions, and the A-smoothing opens the channel between them. In terms of the
// four ends in counterclockwise order, that means the A-smoothing joins each
// over-end to the under-end immediately counterclockwise from it.
//
// Rather than trust that derivation, the convention is a FLAG below, and
// selftest 1 pins it against the published V(3_1) = -t^-4 + t^-3 + t^-1. If the
// convention were wrong the trefoil would come back as its own mirror and the
// test would fail loudly instead of the app being quietly chiral-flipped.

import * as L from './laurent.js';
import { cyclicOrder } from './diagram.js';

// delta = -A^2 - A^-2
export const DELTA = L.make([[2, -1n], [-2, -1n]]);

// Pairing of the four ends under each smoothing, given the counterclockwise
// cyclic order of the slots around the crossing.
//
// With ends in CCW order (e0,e1,e2,e3), the two planar smoothings are
// {e0-e1, e2-e3} and {e1-e2, e3-e0}. We must decide which is A.
export function smoothingPairs(c, which) {
  const order = cyclicOrder(c); // 4 slots, CCW
  // Find where the over-strand ends sit in the cyclic order. Slots 1 and 3 are
  // the over-strand (in and out).
  const posOverOut = order.indexOf(3);
  // The A-smoothing joins over-out to the end immediately CCW from it.
  // That pairing is {order[p], order[p+1]} and {order[p+2], order[p+3]}.
  const p = posOverOut;
  const rot = [order[p % 4], order[(p + 1) % 4], order[(p + 2) % 4], order[(p + 3) % 4]];
  const aPairs = [[rot[0], rot[1]], [rot[2], rot[3]]];
  const bPairs = [[rot[1], rot[2]], [rot[3], rot[0]]];
  return which === 'A' ? aPairs : bPairs;
}

// Count loops in a fully smoothed diagram. Each smoothing pairs slots at a
// crossing; arcs pair slots across crossings. Following alternately gives the
// closed loops -- a pure union-find / traversal, no polynomial arithmetic, so
// this shares nothing with the algebra it feeds.
export function countLoops(diagram, stateBits) {
  const { crossings, arcs } = diagram;
  const n = crossings.length;
  if (n === 0) return 1;

  // node = (crossing, slot) -> key
  const key = (c, s) => c * 4 + s;
  const partner = new Int32Array(n * 4).fill(-1); // within-crossing (smoothing)
  for (let c = 0; c < n; c++) {
    const which = (stateBits >> c) & 1 ? 'B' : 'A';
    for (const [s1, s2] of smoothingPairs(crossings[c], which)) {
      partner[key(c, s1)] = key(c, s2);
      partner[key(c, s2)] = key(c, s1);
    }
  }
  // arc connects two (crossing,slot) nodes
  const across = new Int32Array(n * 4).fill(-1);
  for (const a of arcs) {
    const k1 = key(a.from.crossing, a.from.slot);
    const k2 = key(a.to.crossing, a.to.slot);
    across[k1] = k2;
    across[k2] = k1;
  }

  // Both `partner` (smoothings) and `across` (arcs) are perfect matchings on
  // the 4n ends, so every end has degree exactly 2 and the smoothed diagram is
  // a disjoint union of alternating cycles. The loop count is therefore just
  // the number of connected components -- union-find, with no traversal order
  // to get wrong.
  const parent = new Int32Array(n * 4);
  for (let i = 0; i < n * 4; i++) parent[i] = i;
  const find = (x) => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < n * 4; i++) {
    if (partner[i] >= 0) union(i, partner[i]);
    if (across[i] >= 0) union(i, across[i]);
  }

  const roots = new Set();
  for (let i = 0; i < n * 4; i++) roots.add(find(i));
  return roots.size;
}

// The bracket. Exponential in crossing number by construction -- that IS the
// algorithm -- so the caller simplifies the diagram first and this refuses
// rather than hangs when handed too much.
export const MAX_CROSSINGS = 20;

export function kauffmanBracket(diagram) {
  const n = diagram.crossings.length;
  if (n > MAX_CROSSINGS) {
    return { tooBig: true, n, bracket: null, states: 0 };
  }
  if (n === 0) return { tooBig: false, n: 0, bracket: L.one(), states: 1 };

  // Precompute delta^k so each state is one shift-and-add.
  const deltaPow = [L.one()];
  for (let k = 1; k <= n + 2; k++) deltaPow.push(L.mul(deltaPow[k - 1], DELTA));

  const total = 1 << n;
  let acc = L.zero();
  for (let s = 0; s < total; s++) {
    let aCount = 0;
    for (let c = 0; c < n; c++) if (((s >> c) & 1) === 0) aCount++;
    const bCount = n - aCount;
    const loops = countLoops(diagram, s);
    const term = L.shift(deltaPow[loops - 1], aCount - bCount);
    acc = L.add(acc, term);
  }
  return { tooBig: false, n, bracket: acc, states: total };
}

// V(t). The normalisation (-A^3)^(-w) removes the writhe dependence, which is
// what turns the bracket (a regular-isotopy invariant) into an actual knot
// invariant.
export function jones(diagram) {
  const kb = kauffmanBracket(diagram);
  if (kb.tooBig) return { tooBig: true, n: kb.n };
  const w = diagram.writhe;
  // (-A^3)^(-w) = (-1)^(-w) A^(-3w)
  const signPart = (w % 2 === 0) ? 1n : -1n;
  const f = L.shift(L.scale(kb.bracket, signPart), -3 * w);
  // A = t^(-1/4): an A-exponent of e becomes a t-exponent of -e/4.
  let v;
  try {
    v = L.quarter(L.mirror(f)); // mirror flips e -> -e, then divide by 4
  } catch (e) {
    return { tooBig: false, n: kb.n, bracket: kb.bracket, jones: null, error: e.message, writhe: w };
  }
  return {
    tooBig: false,
    n: kb.n,
    states: kb.states,
    bracket: kb.bracket,
    jones: v,
    writhe: w,
  };
}

// |V(-1)| is the determinant of the knot, and the Alexander polynomial reaches
// the same number through completely different machinery. That coincidence is
// the app's strongest oracle, so the evaluation is exact.
export function jonesAtMinusOne(v) {
  let sum = 0n;
  for (const [e, c] of v) {
    // (-1)^e
    const s = ((e % 2) + 2) % 2 === 0 ? 1n : -1n;
    sum += c * s;
  }
  return sum;
}
