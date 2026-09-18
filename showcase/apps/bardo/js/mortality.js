// Gompertz-Makeham mortality. Each state of rebirth gets a real lifetime
// distribution, which is the whole reason the chain is semi-Markov rather than
// a plain Markov chain with unit steps: transitions carry random holding times,
// so discounting cannot be folded into the transition matrix.
//
//   hazard    mu(x) = A + B c^x
//   survival  S(x) = exp(-A x - (B / ln c)(c^x - 1))

export function hazard(law, x) {
  return law.A + law.B * Math.pow(law.c, x);
}

export function survival(law, x) {
  if (x <= 0) return 1;
  const { A, B, c } = law;
  const lc = Math.log(c);
  return Math.exp(-A * x - (B / lc) * (Math.pow(c, x) - 1));
}

// Where survival has effectively vanished. Gompertz decay is doubly
// exponential, so this is close and the quadrature tail costs nothing.
//
// Cached per (law, floor). This is not a micro-optimisation: sampleLife calls
// it once per draw, and the Monte Carlo makes millions of draws, so an
// uncached horizon dominated the entire runtime of the app.
const horizonCache = new Map();

export function horizon(law, floor = 1e-15) {
  let byFloor = horizonCache.get(law);
  if (byFloor === undefined) { byFloor = new Map(); horizonCache.set(law, byFloor); }
  const hit = byFloor.get(floor);
  if (hit !== undefined) return hit;
  let hi = 1;
  while (survival(law, hi) > floor && hi < 4000) hi *= 2;
  const out = Math.min(hi, 4000);
  byFloor.set(floor, out);
  return out;
}

// One Simpson pass over e^{-delta t} S(t) gives everything the valuation needs.
//
//   abar = integral_0^inf e^{-delta t} S(t) dt      (annuity value)
//   d    = E[e^{-delta T}] = 1 - delta * abar       (integration by parts)
//
// The identity is what lets a single quadrature serve both the benefit leg and
// the premium leg, and at delta = 0 the same integral is E[T]. Self-test 3
// checks d against a direct Monte Carlo estimate, so this identity is not taken
// on trust.
const annuityCache = new Map();

export function annuity(law, delta, panels = 4000) {
  // Keyed per (law, delta, panels). value() asks for the same handful of
  // (law, delta) pairs repeatedly across the sweeps and the self-tests.
  let byDelta = annuityCache.get(law);
  if (byDelta === undefined) { byDelta = new Map(); annuityCache.set(law, byDelta); }
  const key = delta + ':' + panels;
  const hit = byDelta.get(key);
  if (hit !== undefined) return hit;

  const hi = horizon(law);
  const n = panels % 2 === 0 ? panels : panels + 1;
  const h = hi / n;
  let sum = 0;
  for (let k = 0; k <= n; k++) {
    const t = k * h;
    const f = Math.exp(-delta * t) * survival(law, t);
    const w = k === 0 || k === n ? 1 : k % 2 === 1 ? 4 : 2;
    sum += w * f;
  }
  const out = (h / 3) * sum;
  byDelta.set(key, out);
  return out;
}

export function meanLife(law) {
  return annuity(law, 0);
}

export function discountFactor(law, delta) {
  if (delta === 0) return 1;
  return 1 - delta * annuity(law, delta);
}

// Inverse-CDF sampling: solve S(t) = u for t. Independent of the quadrature
// above, which is what makes the Monte Carlo a genuine second opinion rather
// than a restatement of it.
//
// Newton rather than bisection, because the derivative is free: solving
//
//   g(x) = A x + (B/ln c)(c^x - 1) + ln u = 0
//
// has g'(x) = A + B c^x, which is exactly the hazard. g is convex and
// increasing with g(0) = ln u < 0, so Newton from 0 climbs monotonically to
// the root and cannot overshoot below it. A bisection fallback guards the
// extreme tail, where c^x can overflow before the root is reached.
export function sampleLife(law, u) {
  const { A, B, c } = law;
  const lc = Math.log(c);
  const k = B / lc;
  const target = -Math.log(u > 0 ? u : Number.MIN_VALUE);
  const hi = horizon(law, 1e-18);

  const g = (x) => A * x + k * (Math.pow(c, x) - 1) - target;

  let x = Math.min(hi, target / (A + B) || 1);
  for (let i = 0; i < 40; i++) {
    const gx = g(x);
    if (Math.abs(gx) < 1e-12 * (1 + target)) return x;
    const dg = A + B * Math.pow(c, x);
    if (!Number.isFinite(dg) || dg <= 0) break;
    const step = gx / dg;
    const next = x - step;
    if (!Number.isFinite(next) || next < 0 || next > hi) break;
    if (Math.abs(step) < 1e-13 * (1 + x)) return next;
    x = next;
  }

  let lo = 0, up = hi;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + up);
    if (g(mid) < 0) lo = mid; else up = mid;
  }
  return 0.5 * (lo + up);
}
