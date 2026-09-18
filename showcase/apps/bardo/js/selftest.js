// Checks against answers derived outside the code being checked. A valuation
// that is subtly wrong is still perfectly self-consistent: the matrix would
// solve, the premium would look plausible, and the price would be wrong. These
// are the things that would catch that.

import * as la from './la.js';
import * as M from './mortality.js';
import { DOCTRINES, compile, rowSumError } from './doctrine.js';
import { tarjanSCC, classify, expectedLives } from './graph.js';
import { value, factors, renewalRewardLimit, expectedYears } from './valuation.js';
import { monteCarlo, empiricalLifetime } from './simulate.js';
import { mulberry32 } from './rng.js';

const ok = (name, pass, detail) => ({ name, pass, detail });

export function runAll() {
  const t = [];

  // 1. Gauss-Jordan against a matrix inverted by hand. A = [[2,1,0],[1,3,1],
  //    [0,1,2]], det = 2(6-1) - 1(2-0) = 8. Solving A x = (1,2,3) by Cramer:
  //    x1 = |[[1,1,0],[2,3,1],[3,1,2]]|/8 = (1(6-1) -1(4-3) +0)/8 = 4/8 = 0.5
  //    x2 = |[[2,1,0],[1,2,1],[0,3,2]]|/8 = (2(4-3) -1(2-0) +0)/8 = 0
  //    x3 = |[[2,1,1],[1,3,2],[0,1,3]]|/8 = (2(9-2) -1(3-0) +1(1-0))/8 = 12/8 = 1.5
  {
    const A = [
      Float64Array.from([2, 1, 0]),
      Float64Array.from([1, 3, 1]),
      Float64Array.from([0, 1, 2]),
    ];
    const r = la.solve(A, Float64Array.from([1, 2, 3]));
    const want = [0.5, 0, 1.5];
    const err = Math.max(...want.map((w, i) => Math.abs(r.x[i] - w)));
    t.push(ok('Gauss-Jordan reproduces a 3x3 solved by Cramer’s rule on paper',
      !r.singular && err < 1e-12, `max |x - x_hand| = ${err.toExponential(2)}`));
  }

  // 2. Survival against the closed form, evaluated without the quadrature.
  {
    const law = { A: 0.001, B: 4e-5, c: 1.09 };
    let worst = 0;
    for (const x of [0, 5, 20, 55, 90, 110]) {
      const closed = Math.exp(-law.A * x - (law.B / Math.log(law.c)) * (Math.pow(law.c, x) - 1));
      worst = Math.max(worst, Math.abs(M.survival(law, x) - closed));
    }
    t.push(ok('Gompertz–Makeham survival matches exp(-Ax - (B/ln c)(c^x - 1)) pointwise',
      worst < 1e-15, `max abs error = ${worst.toExponential(2)}`));
  }

  // 3. The identity d = 1 - delta*abar is the hinge of the whole valuation: it
  //    lets one quadrature serve both legs. Checked against a direct sample
  //    mean of e^{-delta T}, which shares no code with the quadrature.
  {
    const law = { A: 0.0008, B: 4e-5, c: 1.095 };
    const delta = 0.03;
    const quad = M.discountFactor(law, delta);
    const emp = empiricalLifetime(law, delta, 200000, 0xabcdef);
    const sig = Math.abs(quad - emp.discount) / (emp.discountStdErr || 1e-30);
    t.push(ok('E[e⁻ᵟᵀ] from the quadrature identity agrees with a direct Monte Carlo mean',
      sig < 4, `quad ${quad.toFixed(6)} vs MC ${emp.discount.toFixed(6)} = ${sig.toFixed(2)}σ`));
  }

  // 4. Mean lifetime as integral of S against the mean of sampled lifetimes.
  {
    const law = { A: 0.008, B: 1.6e-4, c: 1.11 };
    const quad = M.meanLife(law);
    const emp = empiricalLifetime(law, 0, 200000, 0x1234);
    const rel = Math.abs(quad - emp.mean) / quad;
    t.push(ok('E[T] = ∫S(t)dt agrees with the mean of inverse-CDF samples',
      rel < 0.01, `quad ${quad.toFixed(3)} vs MC ${emp.mean.toFixed(3)}, rel ${(rel * 100).toFixed(2)}%`));
  }

  // 5. Every shipped doctrine compiles to a stochastic matrix.
  {
    let worst = 0, which = '';
    for (const k of Object.keys(DOCTRINES)) {
      const e = rowSumError(compile(DOCTRINES[k]).P);
      if (e > worst) { worst = e; which = k; }
    }
    t.push(ok('Every compiled doctrine has row sums equal to 1 at machine precision',
      worst < 1e-12, `worst = ${worst.toExponential(2)} (${which})`));
  }

  // 6. THE WITHDRAWN CLAIM, asserted as its refutation. rho(DP) <= max d_i by
  //    the infinity-norm bound, checked by power iteration -- which shares no
  //    code with the bound -- over every doctrine plus a random one.
  {
    let worst = -Infinity, detail = '';
    const cases = Object.keys(DOCTRINES).map((k) => [k, compile(DOCTRINES[k])]);
    const rand = mulberry32(0xfeed);
    cases.push(['random', compile({
      ...DOCTRINES.wheel,
      drift: DOCTRINES.wheel.drift.map(() => (rand() - 0.5) * 4),
      sigma: 0.4 + rand() * 3,
      liberate: DOCTRINES.wheel.liberate.map(() => (rand() < 0.5 ? 0 : rand() * 0.2)),
    })]);
    for (const [k, model] of cases) {
      for (const delta of [0.2, 0.04, 1e-4, 1e-6]) {
        const v = value(model, delta);
        // Track the largest violation of the bound across all cases; it must
        // stay at or below zero for the refutation to hold.
        const violation = v.rho - v.maxD;
        if (violation > worst) {
          worst = violation;
          detail = `tightest: ${k} @ δ=${delta}, ρ=${v.rho.toFixed(8)} ≤ max d=${v.maxD.toFixed(8)}`;
        }
      }
    }
    t.push(ok('ρ(DP) ≤ maxᵢ dᵢ < 1 for every doctrine at every δ > 0 — so no doctrine is ever uninsurable',
      worst <= 1e-9, detail));
  }

  // 7. The linear system against the trajectory simulation. Two entirely
  //    separate computations of the same expectation.
  {
    const model = compile(DOCTRINES.wheel);
    const delta = 0.02;
    const v = value(model, delta);
    const mc = monteCarlo(model, 0, delta, 40000, 0x7777);
    const sig = Math.abs(v.apv[0] - mc.apv) / (mc.apvStdErr || 1e-30);
    t.push(ok('Analytic APV from (I − DP)x = c lands inside 4σ of the simulated APV',
      sig < 4, `analytic ${v.apv[0].toFixed(5)} vs MC ${mc.apv.toFixed(5)} ± ${mc.apvStdErr.toFixed(5)} = ${sig.toFixed(2)}σ`));
  }

  // 8. The degenerate doctrine must collapse to textbook whole-life. One life,
  //    certain liberation: the matrix machinery has to reduce to Abar/abar,
  //    which is the scalar formula any actuarial text would print.
  {
    const model = compile(DOCTRINES.terminal);
    const delta = 0.04;
    const v = value(model, delta);
    const law = model.laws[0];
    const abar = M.annuity(law, delta);
    const Abar = 1 - delta * abar;
    const textbook = Abar / abar;
    const rel = Math.abs(v.premium[0] - textbook) / textbook;
    t.push(ok('The single-life doctrine reproduces the textbook whole-life premium Ā/ā',
      rel < 1e-12, `engine ${v.premium[0].toExponential(8)} vs Ā/ā ${textbook.toExponential(8)}, rel ${rel.toExponential(2)}`));
  }

  // 9. THE THESIS. The premium limit from renewal-reward (power iteration +
  //    quadrature, no linear solve) against the valuation at tiny delta.
  {
    let worst = 0, detail = '';
    for (const k of ['wheel', 'mirror']) {
      const model = compile(DOCTRINES[k]);
      const rr = renewalRewardLimit(model);
      const v = value(model, 1e-6);
      const rel = Math.abs(v.premium[0] - rr.limit) / rr.limit;
      if (rel > worst) { worst = rel; detail = `${k}: solve ${v.premium[0].toExponential(6)} vs renewal-reward ${rr.limit.toExponential(6)}, rel ${rel.toExponential(2)}`; }
    }
    t.push(ok('As δ→0 the premium converges to b/Σνᵢmᵢ — reached by power iteration, sharing no code with the solve',
      worst < 1e-3, detail));
  }

  // 10. Tarjan against brute-force reachability by repeated squaring of the
  //     boolean adjacency matrix. Different algorithm, same partition.
  {
    let allMatch = true, detail = '';
    for (const k of Object.keys(DOCTRINES)) {
      const model = compile(DOCTRINES[k]);
      const n = model.N;
      // Boolean transitive closure by repeated squaring.
      let R = Array.from({ length: n }, (_, i) =>
        Float64Array.from({ length: n }, (_, j) => (i === j || model.P[i][j] > 1e-14 ? 1 : 0)));
      for (let s = 0; s < Math.ceil(Math.log2(n + 1)) + 1; s++) {
        const S = la.matMul(R, R);
        R = S.map((row) => Float64Array.from(row, (v) => (v > 0 ? 1 : 0)));
      }
      // Two states share an SCC iff mutually reachable.
      const comps = tarjanSCC(model.P, 1e-14);
      const idOf = new Int32Array(n).fill(-1);
      comps.forEach((c, ci) => c.forEach((s) => { idOf[s] = ci; }));
      for (let i = 0; i < n && allMatch; i++) {
        for (let j = 0; j < n; j++) {
          const mutual = R[i][j] > 0 && R[j][i] > 0;
          if (mutual !== (idOf[i] === idOf[j])) {
            allMatch = false;
            detail = `${k}: states ${i},${j} disagree`;
            break;
          }
        }
      }
    }
    t.push(ok('Tarjan’s SCC partition matches mutual reachability from boolean matrix squaring',
      allMatch, allMatch ? 'all doctrines, every state pair' : detail));
  }

  // 11. Expected lives on the transient block, (I-Q)^{-1}1, against the mean
  //     life count from simulation. Two different objects entirely.
  {
    const model = compile(DOCTRINES.ladder);
    const { lives } = expectedLives(model);
    const analytic = lives ? lives.get(0) : null;
    const mc = monteCarlo(model, 0, 0, 20000, 0x99, { maxLives: 200000 });
    const rel = analytic ? Math.abs(analytic - mc.meanLives) / analytic : 1;
    t.push(ok('Expected lives before liberation, (I−Q)⁻¹1, matches the simulated mean life count',
      analytic !== null && rel < 0.03,
      `analytic ${analytic ? analytic.toFixed(3) : 'n/a'} vs MC ${mc.meanLives.toFixed(3)}, rel ${(rel * 100).toFixed(2)}%`));
  }

  // 12. Homogeneity. The premium is a ratio in which the benefit appears only
  //     in the numerator, so scaling all benefits by k must scale the premium
  //     by exactly k. A sign error or a stray additive term breaks this.
  {
    const model = compile(DOCTRINES.mirror);
    const a = value(model, 0.03, 1);
    const b = value(model, 0.03, 7.5);
    const rel = Math.abs(b.premium[0] / a.premium[0] - 7.5) / 7.5;
    t.push(ok('Scaling every death benefit by 7.5× scales the premium by exactly 7.5×',
      rel < 1e-12, `ratio ${(b.premium[0] / a.premium[0]).toFixed(12)}, rel error ${rel.toExponential(2)}`));
  }

  // 13. Liberation is genuinely absorbing and costs nothing: a soul that has
  //     left the cycle has zero remaining liability at every discount rate.
  {
    let worst = 0;
    for (const k of Object.keys(DOCTRINES)) {
      const model = compile(DOCTRINES[k]);
      for (const delta of [0.05, 0.001]) {
        const v = value(model, delta);
        worst = Math.max(worst, Math.abs(v.apv[model.liberationIndex]));
      }
    }
    t.push(ok('The liberation state carries exactly zero liability in every doctrine',
      worst < 1e-15, `max |APV(Liberation)| = ${worst.toExponential(2)}`));
  }

  // 14. The mixed verdict is real, not a rounding artefact: Mirror's sealed
  //     stations must be finite-at-zero = false while the rest are true.
  {
    const model = compile(DOCTRINES.mirror);
    const cls = classify(model);
    const sealedBad = [0, 1].every((s) => cls.finiteAtZero[s] === 0);
    const restGood = [2, 3, 4, 5].every((s) => cls.finiteAtZero[s] === 1);
    t.push(ok('Mirror returns a genuinely mixed zero-discount verdict: 2 stations sealed, 4 finite',
      cls.verdict === 'mixed' && sealedBad && restGood,
      `verdict "${cls.verdict}", finite ${cls.nFinite}/${cls.nCycle}, sealed [${cls.sealedStates}]`));
  }

  // 15. An exact identity found by noticing two rows of the policy schedule
  //     were always the same number. A soul that never exits the cycle is
  //     alive continuously and forever, so its total discounted exposure is
  //     integral_0^inf e^{-delta t} dt = 1/delta EXACTLY -- independent of the
  //     doctrine, the mortality laws, and the dispersion. It follows that for
  //     any no-exit doctrine the premium is just delta times the APV.
  {
    let worst = 0, detail = '';
    for (const k of ['wheel', 'mirror']) {
      const model = compile(DOCTRINES[k]);
      for (const delta of [0.08, 0.02, 1e-4, 1e-6]) {
        const v = value(model, delta);
        // Only the stations that genuinely never exit.
        const cls = classify(model);
        for (let s = 0; s < model.n; s++) {
          if (cls.finiteAtZero[s]) continue;
          const rel = Math.abs(v.annuityAPV[s] - 1 / delta) * delta;
          if (rel > worst) {
            worst = rel;
            detail = `${k}/${model.names[s]} @ δ=${delta}: ā=${v.annuityAPV[s].toExponential(8)} vs 1/δ=${(1 / delta).toExponential(8)}`;
          }
          const pr = Math.abs(v.premium[s] - delta * v.apv[s]) / (delta * v.apv[s]);
          if (pr > worst) { worst = pr; detail = `${k}/${model.names[s]} @ δ=${delta}: π vs δ·APV rel ${pr.toExponential(2)}`; }
        }
      }
    }
    t.push(ok('For a station that never exits, ā = 1/δ exactly and π = δ·APV — independent of doctrine and mortality',
      worst < 1e-9, `worst relative deviation ${worst.toExponential(2)} — ${detail}`));
  }

  return t;
}
