import { mulberry32, gaussian } from './rng.js';
import { solveSPD } from './linalg.js';

// The learner: P random ReLU features of a D-dimensional input, fit by least
// squares. Below the interpolation threshold (P <= n) that is the ordinary
// normal-equations solution; above it the system is underdetermined and we take
// the MINIMUM-NORM solution, w = Phi^T (Phi Phi^T)^-1 y, which is the one
// gradient descent from zero converges to. That choice is the whole experiment:
// "more parameters" only means something once you say which of the infinitely
// many interpolating solutions you take.

export function makeProblem({ D, n, nTest, noise, seed, nonlinearity = 1.6 }) {
  const rand = mulberry32(seed);

  // Teacher direction is fixed across every cell of a sweep, so that curves
  // from different P are comparable rather than each fitting its own target.
  const tRand = mulberry32(0x9e37);
  const beta = new Float64Array(D);
  let bn = 0;
  for (let j = 0; j < D; j++) { beta[j] = gaussian(tRand); bn += beta[j] * beta[j]; }
  bn = Math.sqrt(bn) || 1;
  for (let j = 0; j < D; j++) beta[j] /= bn;

  const target = (x, off = 0) => {
    let s = 0;
    for (let j = 0; j < D; j++) s += beta[j] * x[off + j];
    return Math.sin(nonlinearity * s) + 0.4 * s;
  };

  const draw = (m) => {
    const X = new Float64Array(m * D);
    for (let i = 0; i < m * D; i++) X[i] = gaussian(rand);
    return X;
  };

  const X = draw(n);
  const Y = new Float64Array(n);
  for (let i = 0; i < n; i++) Y[i] = target(X, i * D) + noise * gaussian(rand);

  const Xt = draw(nTest);
  const Yt = new Float64Array(nTest);
  for (let i = 0; i < nTest; i++) Yt[i] = target(Xt, i * D);

  return { D, n, nTest, X, Y, Xt, Yt, beta, target };
}

export function makeFeatures({ D, P, seed }) {
  const rand = mulberry32(seed);
  const W = new Float64Array(P * D);
  const b = new Float64Array(P);
  for (let i = 0; i < P * D; i++) W[i] = gaussian(rand);
  for (let j = 0; j < P; j++) b[j] = gaussian(rand);

  // sqrt(2/P) keeps the feature Gram matrix O(1) as P grows, so a single ridge
  // value means the same thing at P=4 and P=4000. Without it the "same" lambda
  // silently becomes a thousand times weaker across a sweep and the peak you
  // measure is an artefact of the axis.
  const fscale = Math.sqrt(2 / P);
  const iscale = 1 / Math.sqrt(D);

  // Map a batch of m inputs to a flat m x P feature matrix.
  const map = (X, m) => {
    const Phi = new Float64Array(m * P);
    for (let i = 0; i < m; i++) {
      const xo = i * D, po = i * P;
      for (let j = 0; j < P; j++) {
        let z = b[j];
        const wo = j * D;
        for (let k = 0; k < D; k++) z += W[wo + k] * X[xo + k] * iscale;
        if (z > 0) Phi[po + j] = fscale * z;
      }
    }
    return Phi;
  };
  return { P, D, map };
}

export function fit(Phi, Y, n, P, lambdaRel) {
  if (P <= n) {
    const A = new Float64Array(P * P);
    const b = new Float64Array(P);
    for (let i = 0; i < n; i++) {
      const po = i * P;
      for (let a = 0; a < P; a++) {
        const fa = Phi[po + a];
        if (fa === 0) continue;
        b[a] += fa * Y[i];
        for (let c = 0; c < P; c++) A[a * P + c] += fa * Phi[po + c];
      }
    }
    const { x, jitter } = solveSPD(A, b, P, lambdaRel);
    return { w: x, jitter };
  }
  // Underdetermined: work in the n-dimensional dual. w = Phi^T alpha keeps the
  // solution inside the row space, which is exactly what makes it minimum-norm.
  const K = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      const io = i * P, jo = j * P;
      for (let a = 0; a < P; a++) s += Phi[io + a] * Phi[jo + a];
      K[i * n + j] = s; K[j * n + i] = s;
    }
  }
  const { x: alpha, jitter } = solveSPD(K, Y, n, lambdaRel);
  const w = new Float64Array(P);
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    if (a === 0) continue;
    const io = i * P;
    for (let k = 0; k < P; k++) w[k] += a * Phi[io + k];
  }
  return { w, jitter };
}

export function mse(Phi, Y, m, P, w) {
  let s = 0;
  for (let i = 0; i < m; i++) {
    let p = 0;
    const po = i * P;
    for (let a = 0; a < P; a++) p += w[a] * Phi[po + a];
    const e = p - Y[i];
    s += e * e;
  }
  return s / m;
}

export function norm2(w) {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i] * w[i];
  return Math.sqrt(s);
}

// One cell of a sweep: build data, build features, fit, score.
export function runCell({ D, n, P, noise, lambda, seed, nTest = 400 }) {
  const prob = makeProblem({ D, n, nTest, noise, seed });
  const feat = makeFeatures({ D, P, seed: seed * 7919 + 13 });
  const Phi = feat.map(prob.X, n);
  const { w, jitter } = fit(Phi, prob.Y, n, P, lambda);
  const PhiT = feat.map(prob.Xt, nTest);
  return {
    train: mse(Phi, prob.Y, n, P, w),
    test: mse(PhiT, prob.Yt, nTest, P, w),
    wNorm: norm2(w),
    jitter,
  };
}

// A probe returns not just the numbers but the fitted function itself, sampled
// densely enough to draw. In D=1 that is a curve over the input line; in D=2 it
// is a surface sampled on a grid. Being able to SEE the interpolant is the
// point: at the threshold it is visibly deranged between the training points,
// and no summary statistic conveys that as well as the shape does.
export function probe({ D, n, P, noise, lambda, seed, res = 220 }) {
  const prob = makeProblem({ D, n, nTest: 600, noise, seed });
  const feat = makeFeatures({ D, P, seed: seed * 7919 + 13 });
  const Phi = feat.map(prob.X, n);
  const { w, jitter } = fit(Phi, prob.Y, n, P, lambda);
  const PhiT = feat.map(prob.Xt, 600);

  const predAt = (M, i) => {
    let p = 0;
    const o = i * P;
    for (let a = 0; a < P; a++) p += w[a] * M[o + a];
    return p;
  };
  const SHOW = Math.min(300, 600);
  const testTrue = new Float64Array(SHOW), testPred = new Float64Array(SHOW);
  for (let i = 0; i < SHOW; i++) { testTrue[i] = prob.Yt[i]; testPred[i] = predAt(PhiT, i); }
  const trainPred = new Float64Array(n);
  for (let i = 0; i < n; i++) trainPred[i] = predAt(Phi, i);

  const out = {
    train: mse(Phi, prob.Y, n, P, w),
    test: mse(PhiT, prob.Yt, 600, P, w),
    wNorm: norm2(w),
    jitter,
    D, n, P,
    points: [],
    testTrue, testPred, trainPred,
  };

  // Training points, in the coordinate the drawing uses: the input value for
  // D=1, the projection onto the teacher direction for D>1.
  for (let i = 0; i < n; i++) {
    let t = 0;
    for (let j = 0; j < D; j++) t += prob.beta[j] * prob.X[i * D + j];
    out.points.push({ x: D === 1 ? prob.X[i] : t, y: prob.Y[i] });
  }

  const LO = -3.2, HI = 3.2;
  if (D === 1) {
    const G = new Float64Array(res);
    for (let i = 0; i < res; i++) G[i] = LO + ((HI - LO) * i) / (res - 1);
    const PhiG = feat.map(G, res);
    const fitCurve = new Float64Array(res), truth = new Float64Array(res);
    for (let i = 0; i < res; i++) {
      let p = 0;
      for (let a = 0; a < P; a++) p += w[a] * PhiG[i * P + a];
      fitCurve[i] = p;
      truth[i] = prob.target(G, i);
    }
    out.grid = G; out.fit = fitCurve; out.truth = truth;
    return out;
  }

  // D >= 2: sample the learned function on a 2-D slice through the input space
  // spanned by the teacher direction and one orthogonal direction, holding the
  // remaining coordinates at zero. The teacher varies only along the first axis,
  // so a correct fit looks like vertical bands and any structure along the
  // second axis is pure variance the model invented.
  const e1 = prob.beta;
  const e2 = new Float64Array(D);
  const r2 = mulberry32(seed * 31 + 5);
  for (let j = 0; j < D; j++) e2[j] = gaussian(r2);
  let dot = 0;
  for (let j = 0; j < D; j++) dot += e2[j] * e1[j];
  let n2 = 0;
  for (let j = 0; j < D; j++) { e2[j] -= dot * e1[j]; n2 += e2[j] * e2[j]; }
  n2 = Math.sqrt(n2) || 1;
  for (let j = 0; j < D; j++) e2[j] /= n2;

  const S = Math.min(res, 96);
  const XG = new Float64Array(S * S * D);
  for (let a = 0; a < S; a++) {
    const u = LO + ((HI - LO) * a) / (S - 1);
    for (let b = 0; b < S; b++) {
      const v = LO + ((HI - LO) * b) / (S - 1);
      const o = (a * S + b) * D;
      for (let j = 0; j < D; j++) XG[o + j] = u * e1[j] + v * e2[j];
    }
  }
  const PhiG = feat.map(XG, S * S);
  const surf = new Float64Array(S * S), truth = new Float64Array(S * S);
  for (let i = 0; i < S * S; i++) {
    let p = 0;
    for (let a = 0; a < P; a++) p += w[a] * PhiG[i * P + a];
    surf[i] = p;
    truth[i] = prob.target(XG, i * D);
  }
  out.surface = surf; out.truth = truth; out.side = S; out.lo = LO; out.hi = HI;
  return out;
}
