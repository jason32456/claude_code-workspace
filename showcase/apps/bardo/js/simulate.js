// The oracle. Walks actual soul-trajectories and accumulates discounted
// benefits and discounted premium-exposure directly, sharing nothing with
// valuation.js except the model: no matrix, no solve, no quadrature. Lifetimes
// come from inverse-CDF sampling, transitions from a categorical draw.
//
// If this agrees with the linear system, the linear system is right. If it does
// not, one of them is wrong and the app says so rather than showing the pretty
// one.

import { mulberry32, categorical } from './rng.js';
import { sampleLife } from './mortality.js';

// A trajectory is truncated when the surviving discount weight can no longer
// affect the sum. With delta > 0 the weight decays geometrically, so this is a
// bound on the tail rather than an arbitrary cap. maxLives guards the delta = 0
// recurrent case, where the sum genuinely does not converge.
export function trajectory(model, start, delta, rand, opts = {}) {
  const tol = opts.tol ?? 1e-12;
  const maxLives = opts.maxLives ?? 200000;
  const L = model.liberationIndex;

  let s = start;
  let t = 0;
  let benefit = 0;
  let exposure = 0;
  let lives = 0;
  let liberated = false;

  while (lives < maxLives) {
    if (s === L) { liberated = true; break; }
    const w = Math.exp(-delta * t);
    if (delta > 0 && w < tol) break;

    const T = sampleLife(model.laws[s], rand());
    lives++;

    // Premium is collected continuously while alive: integral over [t, t+T].
    exposure += delta > 0
      ? (w * (1 - Math.exp(-delta * T))) / delta
      : T;

    t += T;
    benefit += model.benefit[s] * Math.exp(-delta * t);

    s = categorical(rand, model.P[s]);
  }

  return { benefit, exposure, lives, liberated, span: t, end: s };
}

export function monteCarlo(model, start, delta, paths = 20000, seed = 0x5eed, opts = {}) {
  const rand = mulberry32(seed);
  let sb = 0, sb2 = 0, se = 0, se2 = 0, sl = 0, nLib = 0;
  for (let p = 0; p < paths; p++) {
    const r = trajectory(model, start, delta, rand, opts);
    sb += r.benefit; sb2 += r.benefit * r.benefit;
    se += r.exposure; se2 += r.exposure * r.exposure;
    sl += r.lives;
    if (r.liberated) nLib++;
  }
  const mb = sb / paths, me = se / paths;
  const vb = Math.max(0, sb2 / paths - mb * mb);
  const ve = Math.max(0, se2 / paths - me * me);
  return {
    apv: mb,
    apvStdErr: Math.sqrt(vb / paths),
    annuityAPV: me,
    annuityStdErr: Math.sqrt(ve / paths),
    premium: mb / me,
    meanLives: sl / paths,
    liberatedFraction: nLib / paths,
    paths,
  };
}

// Station occupancy over the first `depth` lives, for the flow ribbon. This is
// the picture of the doctrine: where a cohort of souls actually ends up,
// life by life.
export function flow(model, start, depth = 24, cohort = 6000, seed = 0xb00c) {
  const rand = mulberry32(seed);
  const { N } = model;
  const grid = Array.from({ length: depth }, () => new Float64Array(N));
  for (let c = 0; c < cohort; c++) {
    let s = start;
    for (let k = 0; k < depth; k++) {
      grid[k][s] += 1;
      if (s === model.liberationIndex) continue;
      s = categorical(rand, model.P[s]);
    }
  }
  for (let k = 0; k < depth; k++) for (let i = 0; i < N; i++) grid[k][i] /= cohort;
  return grid;
}

// Empirical E[e^{-delta T}] and E[T], used by selftests 3 and 4 to check the
// quadrature identity d = 1 - delta * abar against sampling.
export function empiricalLifetime(law, delta, n = 200000, seed = 0xd15c) {
  const rand = mulberry32(seed);
  let sd = 0, sm = 0, sd2 = 0;
  for (let i = 0; i < n; i++) {
    const T = sampleLife(law, rand());
    const v = Math.exp(-delta * T);
    sd += v; sd2 += v * v; sm += T;
  }
  const md = sd / n;
  return {
    discount: md,
    discountStdErr: Math.sqrt(Math.max(0, sd2 / n - md * md) / n),
    mean: sm / n,
  };
}
