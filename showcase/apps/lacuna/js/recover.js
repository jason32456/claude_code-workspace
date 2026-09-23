// Three ways to get an image back from y = Φx:
//   minNorm   the linear answer, Φᵀy (Φ has orthonormal rows)
//   fista     ℓ1 in a wavelet basis, min ½‖ΦWᵀα − y‖² + λ‖α‖₁
//   tv        total variation, min ½‖Φx − y‖² + λ·TV(x), by Chambolle–Pock
// Each iterative solver calls onFrame(x, iter) now and then so the page can
// show the picture sharpening.

import { makeWavelet, grad, div } from './transforms.js';

export function minNorm(cam, y) {
  return cam.adjoint(y);
}

// λ is relative to the largest analysis coefficient of Φᵀy, and shrinks
// geometrically to its final value over the first 60% of iterations.
// Continuation is what makes a small final λ converge in a few hundred steps.
export function fista(cam, y, { basis = 'haar', iters = 300, lambda = 2e-3, onFrame, every = 25 } = {}) {
  const side = cam.side, n = cam.n;
  const W = makeWavelet(basis, side, basis === 'haar' ? 5 : 4);
  const coarse = new Uint8Array(n);
  for (let i = 0; i < n; i++) coarse[i] = W.isCoarse(i) ? 1 : 0;

  const a = W.forward(cam.adjoint(y));
  let amax = 0;
  for (let i = 0; i < n; i++) if (!coarse[i]) amax = Math.max(amax, Math.abs(a[i]));
  const lamEnd = lambda * amax, lamStart = 0.5 * amax, warm = Math.floor(0.6 * iters);

  const z = Float64Array.from(a), prev = Float64Array.from(a);
  const x = new Float64Array(n), r = new Float64Array(cam.m);
  let t = 1;
  for (let k = 0; k < iters; k++) {
    const lam = k < warm ? lamStart * Math.pow(lamEnd / lamStart, k / warm) : lamEnd;
    // Gradient step at z: z − W Φᵀ(Φ Wᵀ z − y), unit step since ‖ΦWᵀ‖ = 1.
    x.set(z);
    W.inverse(x);
    cam.apply(x, r);
    for (let j = 0; j < cam.m; j++) r[j] -= y[j];
    const g = W.forward(cam.adjoint(r));
    const tn = (1 + Math.sqrt(1 + 4 * t * t)) / 2, mom = (t - 1) / tn;
    for (let i = 0; i < n; i++) {
      let v = z[i] - g[i];
      if (!coarse[i]) v = v > lam ? v - lam : v < -lam ? v + lam : 0;
      const nz = v + mom * (v - prev[i]);
      prev[i] = v;
      z[i] = nz;
    }
    t = tn;
    if (onFrame && (k % every === every - 1)) onFrame(W.inverse(Float64Array.from(prev)), k + 1);
  }
  return W.inverse(Float64Array.from(prev));
}

// Chambolle–Pock with the data term handled exactly: because ΦΦᵀ = I,
// prox of τ·½‖Φx − y‖² at v is v + τ/(1+τ)·Φᵀ(y − Φv).
export function tv(cam, y, { iters = 300, lambda = 0.02, onFrame, every = 25 } = {}) {
  const side = cam.side, n = cam.n;
  const tau = 0.35, sigma = 0.35; // τσ‖∇‖² < 1 with ‖∇‖² ≤ 8
  const x = cam.adjoint(y), xbar = Float64Array.from(x), xold = new Float64Array(n);
  const px = new Float64Array(n), py = new Float64Array(n);
  const gx = new Float64Array(n), gy = new Float64Array(n), d = new Float64Array(n);
  const r = new Float64Array(cam.m), c = tau / (1 + tau);
  // Scale λ with the image's own contrast so one setting suits every scene.
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { lo = Math.min(lo, x[i]); hi = Math.max(hi, x[i]); }
  const lam = lambda * Math.max(hi - lo, 1e-6);
  for (let k = 0; k < iters; k++) {
    grad(xbar, side, gx, gy);
    for (let i = 0; i < n; i++) {
      const qx = px[i] + sigma * gx[i], qy = py[i] + sigma * gy[i];
      const s = Math.max(1, Math.hypot(qx, qy) / lam);
      px[i] = qx / s; py[i] = qy / s;
    }
    div(px, py, side, d);
    xold.set(x);
    for (let i = 0; i < n; i++) x[i] += tau * d[i];
    cam.apply(x, r);
    for (let j = 0; j < cam.m; j++) r[j] = y[j] - r[j];
    const back = cam.adjoint(r);
    for (let i = 0; i < n; i++) {
      x[i] += c * back[i];
      xbar[i] = 2 * x[i] - xold[i];
    }
    if (onFrame && (k % every === every - 1)) onFrame(Float64Array.from(x), k + 1);
  }
  return x;
}

export function recover(cam, y, method, opts = {}) {
  if (method === 'tv') return tv(cam, y, opts);
  return fista(cam, y, { ...opts, basis: method });
}
