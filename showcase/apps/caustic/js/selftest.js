import { mulberry32, gaussian } from './rng.js';
import { solveSPD } from './linalg.js';
import { makeProblem, makeFeatures, fit, mse, norm2, runCell } from './model.js';
import { makeNet, makeGrad, gradient, predict } from './mlp.js';

// Ten checks against ground truth derived WITHOUT the code under test — by hand,
// in closed form, or by an independent method. A double-descent curve is a
// plausible-looking shape; a solver that is quietly wrong produces a plausible-
// looking shape too. These are the difference between a measurement and a
// drawing.

const tests = [];
const test = (name, claim, fn) => tests.push({ name, claim, fn });

test('PRNG is reproducible and Gaussian', 'mean 0, variance 1, identical streams from one seed', () => {
  const a = mulberry32(12345), b = mulberry32(12345);
  for (let i = 0; i < 50; i++) if (a() !== b()) return { ok: false, detail: 'streams diverged at ' + i };
  const r = mulberry32(99);
  let m = 0, v = 0;
  const N = 200000;
  const xs = new Float64Array(N);
  for (let i = 0; i < N; i++) { xs[i] = gaussian(r); m += xs[i]; }
  m /= N;
  for (let i = 0; i < N; i++) v += (xs[i] - m) ** 2;
  v /= N - 1;
  const ok = Math.abs(m) < 0.01 && Math.abs(v - 1) < 0.02;
  return { ok, detail: `mean ${m.toFixed(4)} (target 0), var ${v.toFixed(4)} (target 1)` };
});

test('Cholesky solve recovers a planted solution', 'A built as L Lᵀ from a known x: solve(A, Ax) returns x', () => {
  const m = 9, r = mulberry32(7);
  const L = new Float64Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j <= i; j++) L[i * m + j] = i === j ? 1 + Math.abs(gaussian(r)) : gaussian(r) * 0.4;
  const A = new Float64Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < m; k++) s += L[i * m + k] * L[j * m + k]; A[i * m + j] = s; }
  const x = new Float64Array(m);
  for (let i = 0; i < m; i++) x[i] = gaussian(r);
  const b = new Float64Array(m);
  for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < m; j++) s += A[i * m + j] * x[j]; b[i] = s; }
  const { x: got } = solveSPD(A, b, m, 0);
  let e = 0;
  for (let i = 0; i < m; i++) e = Math.max(e, Math.abs(got[i] - x[i]));
  return { ok: e < 1e-8, detail: `max |x̂ − x| = ${e.toExponential(2)}` };
});

test('Least squares matches a hand-solved 2×2', 'closed form computed on paper, not by this code', () => {
  // Fit y = w1·f1 + w2·f2 to three points with f1 = 1, f2 = x.
  // Normal equations: [[3, 6], [6, 14]] w = [9, 20]  ->  w = (1/6)[[14,-6],[-6,3]]·[9,20]
  //                                                        = [(126-120)/6, (-54+60)/6] = [1, 1]
  const A = new Float64Array([3, 6, 6, 14]);
  const b = new Float64Array([9, 20]);
  const { x } = solveSPD(A, b, 2, 0);
  const e = Math.max(Math.abs(x[0] - 1), Math.abs(x[1] - 1));
  return { ok: e < 1e-10, detail: `w = [${x[0].toFixed(9)}, ${x[1].toFixed(9)}], hand answer [1, 1]` };
});

test('Backpropagation matches finite differences', 'central differences on every parameter of a 3→6→1 net', () => {
  const D = 3, H = 6, n = 5, r = mulberry32(4242);
  const net = makeNet(D, H, 42);
  const X = new Float64Array(n * D), Y = new Float64Array(n);
  for (let i = 0; i < n * D; i++) X[i] = gaussian(r);
  for (let i = 0; i < n; i++) Y[i] = gaussian(r);
  const g = makeGrad(D, H);
  gradient(net, X, Y, n, g);
  const loss = () => { let s = 0; for (let i = 0; i < n; i++) { const e = predict(net, X, i * D) - Y[i]; s += e * e; } return s / n; };
  let worst = 0, where = '';
  const scan = (label, arr, garr, len) => {
    for (let i = 0; i < len; i++) {
      const h = 1e-6, o = arr[i];
      arr[i] = o + h; const lp = loss();
      arr[i] = o - h; const lm = loss();
      arr[i] = o;
      const num = (lp - lm) / (2 * h);
      const rel = Math.abs(num - garr[i]) / (Math.max(Math.abs(num), Math.abs(garr[i])) + 1e-10);
      if (rel > worst) { worst = rel; where = `${label}[${i}]`; }
    }
  };
  scan('W1', net.W1, g.W1, H * D); scan('b1', net.b1, g.b1, H); scan('W2', net.W2, g.W2, H);
  return { ok: worst < 1e-5, detail: `worst relative error ${worst.toExponential(2)} at ${where}` };
});

test('Above the threshold the fit interpolates exactly', 'P > n ⇒ training error is zero to machine precision', () => {
  const n = 25, D = 8, P = 400;
  const prob = makeProblem({ D, n, nTest: 10, noise: 0.3, seed: 77 });
  const feat = makeFeatures({ D, P, seed: 5 });
  const Phi = feat.map(prob.X, n);
  const { w } = fit(Phi, prob.Y, n, P, 1e-13);
  const tr = mse(Phi, prob.Y, n, P, w);
  return { ok: tr < 1e-12, detail: `train MSE = ${tr.toExponential(2)} on ${n} noisy points with ${P} features` };
});

test('The interpolating fit is the minimum-norm one', 'adding any null-space direction strictly increases \u2016w\u2016', () => {
  const n = 12, D = 5, P = 120;
  const prob = makeProblem({ D, n, nTest: 10, noise: 0.2, seed: 31 });
  const feat = makeFeatures({ D, P, seed: 9 });
  const Phi = feat.map(prob.X, n);
  const { w } = fit(Phi, prob.Y, n, P, 1e-13);

  // Orthonormalise the training rows first. Projecting off raw, mutually
  // oblique rows one at a time does not leave a vector orthogonal to all of
  // them \u2014 it leaves a residual that silently invalidates the whole test.
  const basis = [];
  for (let i = 0; i < n; i++) {
    const u = Float64Array.from(Phi.subarray(i * P, (i + 1) * P));
    for (const q of basis) {
      let d = 0;
      for (let k = 0; k < P; k++) d += u[k] * q[k];
      for (let k = 0; k < P; k++) u[k] -= d * q[k];
    }
    let nn = 0;
    for (let k = 0; k < P; k++) nn += u[k] * u[k];
    nn = Math.sqrt(nn);
    if (nn < 1e-10) continue;
    for (let k = 0; k < P; k++) u[k] /= nn;
    basis.push(u);
  }
  const r = mulberry32(555);
  const v = new Float64Array(P);
  for (let i = 0; i < P; i++) v[i] = gaussian(r);
  for (const q of basis) {
    let d = 0;
    for (let k = 0; k < P; k++) d += v[k] * q[k];
    for (let k = 0; k < P; k++) v[k] -= d * q[k];
  }
  let vn = 0;
  for (let k = 0; k < P; k++) vn += v[k] * v[k];
  vn = Math.sqrt(vn);
  for (let k = 0; k < P; k++) v[k] /= vn;

  let resid = 0;
  for (let i = 0; i < n; i++) {
    let d = 0;
    const o = i * P;
    for (let k = 0; k < P; k++) d += v[k] * Phi[o + k];
    resid = Math.max(resid, Math.abs(d));
  }
  const base = norm2(w);
  let worstRatio = Infinity;
  for (const t of [0.25, 1, 4]) {
    const w2 = new Float64Array(P);
    for (let k = 0; k < P; k++) w2[k] = w[k] + t * base * v[k];
    worstRatio = Math.min(worstRatio, norm2(w2) / base);
  }
  return { ok: worstRatio > 1 && resid < 1e-9, detail: `\u2016w+v\u2016/\u2016w\u2016 \u2265 ${worstRatio.toFixed(6)} > 1; null-space residual ${resid.toExponential(1)}` };
});

test('Ridge converges to the unregularised fit as λ→0', 'the two solvers agree in the limit', () => {
  const n = 40, D = 10, P = 15;
  const prob = makeProblem({ D, n, nTest: 10, noise: 0.2, seed: 8 });
  const feat = makeFeatures({ D, P, seed: 3 });
  const Phi = feat.map(prob.X, n);
  const a = fit(Phi, prob.Y, n, P, 1e-2).w;
  const b = fit(Phi, prob.Y, n, P, 1e-12).w;
  let big = 0, small = 0;
  for (let i = 0; i < P; i++) { big = Math.max(big, Math.abs(a[i] - b[i])); }
  const c = fit(Phi, prob.Y, n, P, 1e-10).w;
  for (let i = 0; i < P; i++) small = Math.max(small, Math.abs(c[i] - b[i]));
  return { ok: small < big && small < 1e-4, detail: `λ=1e−10 differs by ${small.toExponential(2)}; λ=1e−2 by ${big.toExponential(2)}` };
});

test('Feature scaling is width-independent', 'mean \u2016\u03c6(x)\u2016\u00b2 is flat from P=40 to P=4000, averaged over feature draws', () => {
  const D = 6;
  const prob = makeProblem({ D, n: 30, nTest: 5, noise: 0, seed: 17 });
  // A single feature draw at small P is a small sample, so its Gram diagonal
  // scatters for reasons that have nothing to do with the 2/P scaling. Average
  // over draws to test the scaling law itself rather than the draw noise.
  const meanSq = (P) => {
    let acc = 0;
    const DRAWS = 12;
    for (let d = 0; d < DRAWS; d++) {
      const feat = makeFeatures({ D, P, seed: 21 + d * 101 });
      const Phi = feat.map(prob.X, 30);
      let s = 0;
      for (let i = 0; i < 30; i++) {
        let q = 0;
        const o = i * P;
        for (let k = 0; k < P; k++) q += Phi[o + k] * Phi[o + k];
        s += q;
      }
      acc += s / 30;
    }
    return acc / DRAWS;
  };
  const vals = [40, 400, 4000].map(meanSq);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return { ok: hi / lo < 1.08, detail: `\u2016\u03c6(x)\u2016\u00b2 = ${vals.map((v) => v.toFixed(3)).join(', ')} at P = 40, 400, 4000 \u2014 ratio ${(hi / lo).toFixed(4)}` };
});

test('The peak sits exactly at P = n', 'searched, not assumed: the worst cell of a sweep is the threshold', () => {
  const n = 30, D = 20;
  const med = (v) => v.slice().sort((x, y) => x - y)[v.length >> 1];
  const at = (P) => med(Array.from({ length: 7 }, (_, t) => Math.min(runCell({ D, n, P, noise: 0.15, lambda: 1e-13, seed: 601 + t * 3313 }).test, 1e12)));
  const Ps = [6, 12, 20, 26, 30, 36, 50, 100, 400];
  const vals = Ps.map(at);
  let arg = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] > vals[arg]) arg = i;
  return { ok: Ps[arg] === n, detail: `worst of ${Ps.join(', ')} was P=${Ps[arg]}, at ${vals[arg].toExponential(2)}; n=${n}` };
});

test('Ridge removes the peak it was predicted to remove', 'same sweep, λ=1e−2: threshold cell no longer the worst by an order of magnitude', () => {
  const n = 30, D = 20;
  const med = (v) => v.slice().sort((x, y) => x - y)[v.length >> 1];
  const at = (P, lam) => med(Array.from({ length: 7 }, (_, t) => Math.min(runCell({ D, n, P, noise: 0.15, lambda: lam, seed: 601 + t * 3313 }).test, 1e12)));
  const bare = at(n, 1e-13), ridged = at(n, 1e-2), baseline = at(8, 1e-2);
  return {
    ok: ridged < bare / 5 && ridged < baseline * 4,
    detail: `at P=n: λ≈0 gives ${bare.toExponential(2)}, λ=1e−2 gives ${ridged.toExponential(2)} (${(bare / ridged).toFixed(0)}× lower)`,
  };
});

export function runSelfTests(onResult) {
  const results = [];
  for (const t of tests) {
    let r;
    try { r = t.fn(); } catch (e) { r = { ok: false, detail: 'threw: ' + e.message }; }
    const row = { name: t.name, claim: t.claim, ...r };
    results.push(row);
    if (onResult) onResult(row);
  }
  return results;
}

export const testCount = tests.length;
