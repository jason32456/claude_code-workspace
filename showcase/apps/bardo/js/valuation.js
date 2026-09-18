// The valuation. Two dense solves and a division, and the division is the
// point of the whole project.
//
// Benefits, starting from station i: a benefit falls due at the end of this
// life, discounted by the lifetime; then the next life begins somewhere.
//
//   x_i = b_i E[e^{-delta T_i}] + E[e^{-delta T_i}] sum_j P_ij x_j
//       = c_i + (D P x)_i,           c_i = b_i d_i,  D = diag(d_i)
//   => (I - D P) x = c
//
// Premiums, paid continuously at unit rate while alive, over every life:
//
//   abar_i = (1 - d_i)/delta + d_i sum_j P_ij abar_j
//   => (I - D P) abar = (1 - d)/delta
//
// SAME matrix, different right-hand side. That is why the two legs diverge
// together as delta -> 0, and why their ratio survives.
//
//   level premium  pi_i = x_i / abar_i     (equivalence principle)
//
// WHY THERE IS NO INSOLVENCY VERDICT. This app was designed to report
// "UNINSURABLE - premium diverges" for doctrines with no exit. That cannot
// happen. D P is non-negative and
//
//   rho(DP) <= ||DP||_inf = max_i d_i * sum_j P_ij = max_i d_i < 1
//
// for any delta > 0, because d_i = E[e^{-delta T_i}] < 1 strictly whenever the
// lifetime is not identically zero. The bound never mentions P. Every doctrine
// prices at every positive discount rate, and the verdict the project was built
// around was excluded by two lines of algebra. The bound is asserted against
// power iteration in selftest 6 rather than believed.

import { solve, matMul, zeros, spectralRadius, stationary } from './la.js';
import { discountFactor, annuity, meanLife } from './mortality.js';
import { classify, expectedLives } from './graph.js';

// Discount factors and mean lifetimes per state. Liberation is a dead end: no
// further life, no further benefit, no further premium.
export function factors(model, delta) {
  const { N, liberationIndex: L } = model;
  const d = new Float64Array(N);
  const abarOwn = new Float64Array(N);
  const means = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (i === L) { d[i] = 0; abarOwn[i] = 0; means[i] = 0; continue; }
    const law = model.laws[i];
    const a = annuity(law, delta);
    abarOwn[i] = a;
    d[i] = delta === 0 ? 1 : 1 - delta * a;
    means[i] = meanLife(law);
  }
  return { d, abarOwn, means };
}

function buildDP(model, d) {
  const { N, P } = model;
  const DP = zeros(N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) DP[i][j] = d[i] * P[i][j];
  }
  return DP;
}

export function value(model, delta, benefitScale = 1) {
  const { N, liberationIndex: L } = model;
  const { d, abarOwn, means } = factors(model, delta);
  const DP = buildDP(model, d);

  const A = zeros(N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) A[i][j] = (i === j ? 1 : 0) - DP[i][j];
  }

  const cBen = new Float64Array(N);
  const cPrem = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (i === L) continue;
    cBen[i] = benefitScale * model.benefit[i] * d[i];
    // (1 - d_i)/delta is exactly abarOwn at delta > 0 by the same identity that
    // produced d; at delta = 0 the limit is E[T_i]. Using abarOwn directly
    // avoids 0/0 and is numerically better than the quotient at small delta.
    cPrem[i] = abarOwn[i];
  }

  const ben = solve(A, cBen);
  const prem = solve(A, cPrem);
  const rho = spectralRadius(DP);

  const premium = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    premium[i] = prem.x[i] > 0 ? ben.x[i] / prem.x[i] : NaN;
  }

  return {
    delta,
    d,
    means,
    rho,
    maxD: Math.max(...Array.from(d)),
    apv: ben.x,
    annuityAPV: prem.x,
    premium,
    singular: ben.singular || prem.singular,
    pivotMin: Math.min(ben.pivotMin, prem.pivotMin),
  };
}

// The renewal-reward limit, reached through no shared code with value().
//
// As delta -> 0 both legs diverge, and the quotient tends to the long-run rate
// of claims per unit time: one benefit every cycle, cycles averaging
// sum_i nu_i m_i where nu is the stationary distribution of the JUMP chain.
//
//   pi_inf = (sum_i nu_i b_i) / (sum_i nu_i m_i)
//
// nu comes from power iteration; m from quadrature. No linear solve anywhere.
// Only meaningful for a recurrent doctrine — an absorbing one ends up in
// liberation with probability one and has no long-run claim rate at all.
export function renewalRewardLimit(model, benefitScale = 1) {
  const cls = classify(model);
  if (cls.verdict === 'absorbing') return null;

  const { N, liberationIndex: L } = model;
  // Restrict to the recurrent non-liberation class the chain actually settles
  // in, so the stationary vector is well defined.
  const traps = cls.traps;
  if (traps.length !== 1) return null;
  const members = traps[0].members.filter((s) => s !== L);
  if (members.length === 0) return null;

  const k = members.length;
  const sub = Array.from({ length: k }, () => new Float64Array(k));
  for (let a = 0; a < k; a++) {
    let rowSum = 0;
    for (let b = 0; b < k; b++) rowSum += model.P[members[a]][members[b]];
    for (let b = 0; b < k; b++) {
      sub[a][b] = rowSum > 0 ? model.P[members[a]][members[b]] / rowSum : a === b ? 1 : 0;
    }
  }

  const nu = stationary(sub);
  let num = 0, den = 0;
  for (let a = 0; a < k; a++) {
    const s = members[a];
    num += nu[a] * benefitScale * model.benefit[s];
    den += nu[a] * meanLife(model.laws[s]);
  }
  return { limit: num / den, nu, members, meanCycle: den };
}

export function summary(model, delta, benefitScale = 1) {
  const v = value(model, delta, benefitScale);
  const cls = classify(model);
  const { lives } = expectedLives(model);
  const rr = renewalRewardLimit(model, benefitScale);
  return { ...v, classification: cls, expectedLives: lives, renewal: rr };
}

// Expected total UNDISCOUNTED years covered, on the transient block:
// (I - Q) y = m_T. Distinct from the annuity value, which is discounted.
// Returns null for a doctrine that never exits, where the answer is genuinely
// infinite rather than large.
export function expectedYears(model) {
  const { N, liberationIndex: L, P } = model;
  const cls = classify(model);
  const idx = [];
  for (let s = 0; s < N; s++) if (s !== L && cls.finiteAtZero[s]) idx.push(s);
  if (idx.length === 0) return null;

  const k = idx.length;
  const A = Array.from({ length: k }, () => new Float64Array(k));
  const m = new Float64Array(k);
  for (let a = 0; a < k; a++) {
    m[a] = meanLife(model.laws[idx[a]]);
    for (let b = 0; b < k; b++) A[a][b] = (a === b ? 1 : 0) - P[idx[a]][idx[b]];
  }
  const r = solve(A, m);
  if (r.singular) return null;
  const out = new Map();
  for (let a = 0; a < k; a++) out.set(idx[a], r.x[a]);
  return out;
}
