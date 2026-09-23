// Predictions that come from outside the solvers.

const SQRT2PI = Math.sqrt(2 * Math.PI);
export const phi = (t) => Math.exp(-t * t / 2) / SQRT2PI;

// Gaussian upper tail Q(t) = ½ erfc(t/√2), via the Numerical Recipes erfc
// (fractional error < 1.2e-7 everywhere).
export function Q(t) {
  const x = t / Math.SQRT2, z = Math.abs(x), u = 1 / (1 + 0.5 * z);
  const r = u * Math.exp(-z * z - 1.26551223 + u * (1.00002368 + u * (0.37409196 + u * (0.09678418 +
    u * (-0.18628806 + u * (0.27886807 + u * (-1.13520398 + u * (1.48851587 +
    u * (-0.82215223 + u * 0.17087277)))))))));
  return 0.5 * (x >= 0 ? r : 2 - r);
}

// Statistical dimension of the ℓ1 descent cone at a k-sparse point, per
// coordinate (Amelunxen, Lotz, McCoy & Tropp 2014, Prop. 4.5). ℓ1 recovery
// from M Gaussian measurements flips from failing to succeeding at M/N = ψ(ρ).
export function psi(rho) {
  if (rho <= 0) return 0;
  if (rho >= 1) return 1;
  const f = (t) => rho * (1 + t * t) + 2 * (1 - rho) * ((1 + t * t) * Q(t) - t * phi(t));
  let a = 0, b = 8;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < 80; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return f((a + b) / 2);
}

// Logistic regression of success on δ by Newton's method (IRLS):
// P(success) = 1 / (1 + e^−(a + bδ)). Returns the 50% point and the
// 10–90% width, both in units of δ.
export function logisticFit(xs, ys) {
  let a = 0, b = 0;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  for (let it = 0; it < 60; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i] - mx, p = 1 / (1 + Math.exp(-(a + b * x))), w = Math.max(p * (1 - p), 1e-12);
      g0 += ys[i] - p; g1 += (ys[i] - p) * x;
      h00 += w; h01 += w * x; h11 += w * x * x;
    }
    // A small ridge keeps perfectly separated data from running off to ∞.
    h00 += 1e-6; h11 += 1e-6;
    const det = h00 * h11 - h01 * h01;
    const da = (h11 * g0 - h01 * g1) / det, db = (h00 * g1 - h01 * g0) / det;
    a += da; b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-10) break;
  }
  return { center: mx - a / b, width: (2 * Math.log(9)) / b, a, b };
}
