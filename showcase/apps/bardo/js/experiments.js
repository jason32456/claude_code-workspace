// The claims, run in the page rather than quoted from the README. Every number
// the app asserts about itself is produced here, at load, from the same code
// that draws the policy schedule.

import { DOCTRINES, compile } from './doctrine.js';
import { value, renewalRewardLimit } from './valuation.js';
import { meanLife } from './mortality.js';
import { classify } from './graph.js';
import { monteCarlo } from './simulate.js';

export const DELTAS = [0.08, 0.04, 0.02, 0.01, 0.004, 0.001, 4e-4, 1e-4, 1e-5, 1e-6];

// C1 + C2. Both legs against the discount rate, and the quotient.
export function discountSweep(model) {
  const rows = DELTAS.map((delta) => {
    const v = value(model, delta);
    return {
      delta,
      apv: v.apv[0],
      annuity: v.annuityAPV[0],
      premium: v.premium[0],
      rho: v.rho,
      maxD: v.maxD,
    };
  });
  const rr = renewalRewardLimit(model);
  const first = rows[0], last = rows[rows.length - 1];
  return {
    rows,
    limit: rr ? rr.limit : null,
    apvGrowth: last.apv / first.apv,
    annuityGrowth: last.annuity / first.annuity,
    premiumDrift: last.premium / first.premium,
    // C1: the bound rho(DP) <= max d_i, which never mentions P.
    boundHolds: rows.every((r) => r.rho <= r.maxD + 1e-9),
    worstRho: Math.max(...rows.map((r) => r.rho)),
  };
}

// C4. The compression, and the convexity bound that explains it.
export function doctrineComparison(delta = 1e-5) {
  const entries = Object.keys(DOCTRINES).map((key) => {
    const model = compile(DOCTRINES[key]);
    const v = value(model, delta);
    const rr = renewalRewardLimit(model);
    const cls = classify(model);
    const means = model.laws.map((l) => meanLife(l));
    return {
      key,
      name: model.spec.name,
      note: model.spec.note,
      apv: v.apv[0],
      premium: v.premium[0],
      limit: rr ? rr.limit : null,
      meanCycle: rr ? rr.meanCycle : null,
      verdict: cls.verdict,
      nFinite: cls.nFinite,
      nCycle: cls.nCycle,
      minMean: Math.min(...means),
      maxMean: Math.max(...means),
    };
  });

  const apvs = entries.map((e) => e.apv);
  const prems = entries.map((e) => e.premium);
  const multi = entries.filter((e) => e.key !== 'terminal');

  // The convexity bound, taken over the union of all shipped mortality laws.
  const allMeans = entries.flatMap((e) => [e.minMean, e.maxMean]);
  const lo = 1 / Math.max(...allMeans);
  const hi = 1 / Math.min(...allMeans);

  return {
    entries,
    delta,
    apvSpread: Math.max(...apvs) / Math.min(...apvs),
    premiumSpread: Math.max(...prems) / Math.min(...prems),
    multiPremiumSpread: Math.max(...multi.map((e) => e.premium)) / Math.min(...multi.map((e) => e.premium)),
    bound: { lo, hi },
    // C4 as a pass/fail: every premium inside the interval convexity forces.
    boundHolds: prems.every((p) => p >= lo - 1e-12 && p <= hi + 1e-12),
    compression: (Math.max(...apvs) / Math.min(...apvs)) / (Math.max(...prems) / Math.min(...prems)),
  };
}

// C6. Dispersion, with no predicted direction.
export function dispersionSweep(key = 'wheel', delta = 0.02) {
  const sigmas = [0.5, 0.7, 0.9, 1.15, 1.5, 2.0, 3.0];
  const rows = sigmas.map((sigma) => {
    const model = compile({ ...DOCTRINES[key], sigma });
    const v = value(model, delta);
    const rr = renewalRewardLimit(model);
    return {
      sigma,
      premium: v.premium[0],
      apv: v.apv[0],
      limit: rr ? rr.limit : null,
      meanCycle: rr ? rr.meanCycle : null,
    };
  });
  // Monotone from the second point on; the first is the exception that ships.
  const tail = rows.slice(1);
  const monotoneTail = tail.every((r, i) => i === 0 || r.premium < tail[i - 1].premium);
  return {
    rows,
    delta,
    monotoneTail,
    nonMonotoneAtLow: rows[0].premium < rows[1].premium,
    direction: rows[rows.length - 1].premium < rows[0].premium ? 'lowers' : 'raises',
  };
}

// The oracle panel: three routes to one premium.
export function oracleAgreement(model, delta = 0.01, paths = 30000) {
  const v = value(model, delta);
  const mc = monteCarlo(model, 0, delta, paths);
  const rr = renewalRewardLimit(model);

  const sigmaApv = mc.apvStdErr || 1e-30;
  return {
    delta,
    paths,
    analyticAPV: v.apv[0],
    simulatedAPV: mc.apv,
    apvSigmas: Math.abs(v.apv[0] - mc.apv) / sigmaApv,
    analyticPremium: v.premium[0],
    simulatedPremium: mc.premium,
    premiumRelErr: Math.abs(v.premium[0] - mc.premium) / v.premium[0],
    renewalLimit: rr ? rr.limit : null,
    meanLives: mc.meanLives,
    liberatedFraction: mc.liberatedFraction,
  };
}
