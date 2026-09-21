import { rk4, invariant, traceRay, deflection, turningPoint, redshiftFactor,
         shadowAngle, criticalOrbit, B_CRIT } from '../physics.js';
import { camera } from '../shade.js';
import { table, deg } from './util.js';

const EPI = Math.exp(-Math.PI);

// Closed-form root of 2u^3 - u^2 + 1/b^2 = 0 by the trigonometric method, so the
// bisection solver is graded by an algorithm it shares no code with.
function turningPointClosedForm(b) {
  const p = -1 / 12, q = 1 / (2 * b * b) - 1 / 108;
  const m = 2 * Math.sqrt(-p / 3);
  const arg = (3 * q) / (p * m);
  if (Math.abs(arg) > 1) return NaN;
  const th = Math.acos(arg) / 3;
  const roots = [0, 1, 2].map((k) => m * Math.cos(th - (2 * Math.PI * k) / 3) + 1 / 6);
  return Math.min(...roots.filter((u) => u > 0));
}

function ringRatio() {
  const bFor = (a) => {
    let lo = B_CRIT, hi = 40;
    for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (deflection(m, 1e-3) > a) lo = m; else hi = m; }
    return 0.5 * (lo + hi);
  };
  const b5 = bFor(5 * Math.PI), b6 = bFor(6 * Math.PI);
  return (b6 - B_CRIT) / (b5 - B_CRIT);
}

function instability(pure) {
  const d0 = 1e-9, h = 2e-5;
  let u = 1 / 3 + d0, w = pure ? d0 : 0, phi = 0;
  for (let i = 0; i < Math.round(8 / h); i++) { [u, w] = rk4(u, w, h); phi += h; }
  return { rate: Math.log((u - 1 / 3) / d0) / phi, phi };
}

function conservationDrift() {
  const r0 = 30, b = 5.25;
  const sinPsi = b * Math.sqrt(1 - 2 / r0) / r0;
  const u0 = 1 / r0, f0 = Math.sqrt(1 - 2 / r0);
  let u = u0, w = u0 * Math.sqrt(1 - sinPsi * sinPsi) * f0 / sinPsi, worst = 0;
  const target = 1 / (b * b);
  for (let i = 0; i < 300000; i++) {
    const h = 0.01 / (1 + 10 * u);
    [u, w] = rk4(u, w, h);
    if (u <= 0 || u >= 0.5) break;
    worst = Math.max(worst, Math.abs(invariant(u, w) - target) / target);
  }
  return worst;
}

// Graded on the critical geodesic, which has a closed form. Measuring the order
// through deflection() instead measures the stopping rule, not the stepper.
function rk4Order() {
  const PHI = 4;
  const errs = [0.025, 0.0125, 0.00625].map((h) => {
    let u = -1 / 6, w = 0;
    const n = Math.round(PHI / h);
    for (let i = 0; i < n; i++) [u, w] = rk4(u, w, h);
    return Math.abs(u - criticalOrbit(PHI));
  });
  return { order: Math.log2(errs[1] / errs[2]), err: errs[2] };
}

function shadowEdge(r0) {
  const f0 = Math.sqrt(1 - 2 / r0);
  const cap = (t) => traceRay(r0, Math.cos(Math.PI - t), Math.sin(Math.PI - t), 0, 1,
    { disk: false, hBase: 0.01, rEsc: 2000, maxSteps: 80000 }).kind === 'capture';
  let lo = 1e-7, hi = Math.PI / 2;
  for (let i = 0; i < 64; i++) { const m = 0.5 * (lo + hi); if (cap(m)) lo = m; else hi = m; }
  return r0 * Math.sin(Math.PI - 0.5 * (lo + hi)) / f0;
}

// g from the covariant formula against g assembled out of two textbook pieces:
// gravitational redshift between r and r_obs, then the special-relativistic
// Doppler factor of an emitter moving at the local orbital speed.
function redshiftDecomposition() {
  let worst = 0;
  for (let i = 0; i < 4000; i++) {
    const r = 3.2 + 60 * Math.pow(Math.random(), 2);
    const rO = 200 + 3000 * Math.random();
    const bMax = r / Math.sqrt(1 - 2 / r);
    const b = (Math.random() * 2 - 1) * bMax;
    const covariant = redshiftFactor(r, b, rO);
    const v = Math.sqrt(1 / r) / Math.sqrt(1 - 2 / r);          // static-frame orbital speed
    const sinPsi = b * Math.sqrt(1 - 2 / r) / r;                // photon's tangential fraction
    const gamma = 1 / Math.sqrt(1 - v * v);
    const assembled = (Math.sqrt(1 - 2 / r) / Math.sqrt(1 - 2 / rO)) / (gamma * (1 - v * sinPsi));
    worst = Math.max(worst, Math.abs(covariant / assembled - 1));
  }
  return worst;
}

// In nearly flat geometry the brightest limb must be the one whose orbital
// velocity points at the camera. Nothing but a sign error could break this, and
// a sign error here is invisible in every other number on the bench.
function beamingSign() {
  const r0 = 1200, incDeg = 60, fov = 14, rIn = 120, rOut = 132;
  const cam = camera(r0, incDeg);
  const t = Math.tan(fov * Math.PI / 360);
  let best = null, worst = null;
  for (let j = 0; j < 46; j++) for (let i = 0; i < 74; i++) {
    const px = ((i + 0.5) / 74) * 2 - 1, py = 1 - ((j + 0.5) / 46) * 2;
    const sx = px * t * (74 / 46), sy = py * t;
    let d = [cam.fwd[0] + sx * cam.right[0] + sy * cam.up[0],
             cam.fwd[1] + sx * cam.right[1] + sy * cam.up[1],
             cam.fwd[2] + sx * cam.right[2] + sy * cam.up[2]];
    const dn = Math.hypot(...d); d = d.map((v) => v / dn);
    const cosPsi = d[0] * cam.e1[0] + d[1] * cam.e1[1] + d[2] * cam.e1[2];
    const perp = [d[0] - cosPsi * cam.e1[0], d[1] - cosPsi * cam.e1[1], d[2] - cosPsi * cam.e1[2]];
    const sinPsi = Math.hypot(...perp);
    if (sinPsi < 1e-12) continue;
    const e2 = perp.map((v) => v / sinPsi);
    const nz = cam.e1[0] * e2[1] - cam.e1[1] * e2[0];
    const res = traceRay(r0, cosPsi, sinPsi, cam.e1[2], e2[2],
      { rIn, rOut, disk: true, hBase: 0.03, rEsc: 6000, maxSteps: 20000 });
    if (res.kind !== 'disk') continue;
    const g = redshiftFactor(res.r, -res.b * nz, r0);
    const c = Math.cos(res.phi), s = Math.sin(res.phi);
    const X = [res.r * (c * cam.e1[0] + s * e2[0]), res.r * (c * cam.e1[1] + s * e2[1]), res.r * (c * cam.e1[2] + s * e2[2])];
    const vel = [-X[1], X[0], 0];                                    // prograde, Omega z-hat x X
    const P = cam.e1.map((v) => v * r0);
    const los = [P[0] - X[0], P[1] - X[1], P[2] - X[2]];
    const proj = (vel[0] * los[0] + vel[1] * los[1] + vel[2] * los[2]) / (Math.hypot(...vel) * Math.hypot(...los));
    if (!best || g > best.g) best = { g, proj };
    if (!worst || g < worst.g) worst = { g, proj };
  }
  return { best, worst };
}

export function run() {
  const t0 = performance.now();
  const rows = [];
  const add = (name, graded, measured, expected, pass, note = '') =>
    rows.push([name, graded, measured, expected,
      `<span class="${pass ? 'good' : 'bad'}">${pass ? 'pass' : 'FAIL'}</span>`, note]);

  const uPh = 1 / 3;
  add('circular photon orbit', 'u&Prime; = 3u² − u = 0 at u = 1/3',
    Math.abs(3 * uPh * uPh - uPh).toExponential(2), '0', Math.abs(3 * uPh * uPh - uPh) < 1e-16,
    'r = 3M, algebra, no integration');

  const drift = conservationDrift();
  add('first integral holds', 'w² + u² − 2u³ = 1/b², never used by the stepper',
    drift.toExponential(2), '0', drift < 1e-9, 'worst drift over a ray that orbits before escaping');

  const ord = rk4Order();
  add('integrator order', 'the exact critical geodesic −1/6 + ½tanh²(φ/2)',
    ord.order.toFixed(3), '4', Math.abs(ord.order - 4) < 0.15,
    `absolute error ${ord.err.toExponential(1)} in u after 4 radians`);

  let uSep = -1 / 6, wSep = 0;
  for (let i = 0; i < 600000; i++) [uSep, wSep] = rk4(uSep, wSep, 2e-5);
  const sepErr = Math.abs((1 / 3 - uSep) / (2 * Math.exp(-12)) - 1);
  add('approach to the photon sphere', '1/3 − u → 2e^(−φ), from the closed form',
    (1 / 3 - uSep).toExponential(6), (2 * Math.exp(-12)).toExponential(6), sepErr < 1e-4,
    'the e-folding per radian, with nothing linearised');

  const tp = [5.3, 6, 10, 100].map((b) => Math.abs(turningPoint(b) / turningPointClosedForm(b) - 1));
  const tpw = Math.max(...tp);
  add('closest approach', 'trigonometric cubic root, a separate algorithm',
    tpw.toExponential(2), '0', tpw < 1e-12, 'bisection vs closed form, b = 5.3 … 100 M');

  const a4 = deflection(1e4, 5e-4) * 1e4;
  const s4 = 4 + (15 * Math.PI) / (4 * 1e4);
  add('weak-field deflection', '4M/b + 15πM²/4b², the post-Newtonian series',
    a4.toFixed(8), s4.toFixed(8), Math.abs(a4 / s4 - 1) < 1e-6, `${((a4 / s4 - 1) * 1e6).toFixed(2)} ppm at b = 10⁴ M`);

  // Grading this against a flat 2 fails, and the failure is physics rather than
  // a bug: at finite b the second-order term is still there, worth 29 ppm here.
  const ratioEN = deflection(1e5, 5e-4) / (2 * Math.atan(1e-5));
  const ratioSeries = 2 * (1 + (15 * Math.PI) / (16 * 1e5)) / (1 - 1 / (3e10));
  add('Einstein ÷ Newton', '2(1 + 15πM/16b), not a flat 2',
    ratioEN.toFixed(9), ratioSeries.toFixed(9), Math.abs(ratioEN / ratioSeries - 1) < 1e-7,
    `the bare factor of two is ${((ratioEN / 2 - 1) * 1e6).toFixed(1)} ppm out at b = 10⁵ M, correctly`);

  const bMeas = shadowEdge(100);
  add('shadow edge', '3√3 M = 5.196152422706632, from the geometry of the metric',
    bMeas.toFixed(12), B_CRIT.toFixed(12), Math.abs(bMeas / B_CRIT - 1) < 1e-8,
    `bisected on the camera's viewing angle, ${(bMeas / B_CRIT - 1).toExponential(1)}`);

  const a90 = deg(shadowAngle(3));
  add('shadow at the photon sphere', 'sin α = 3√3·√(1−2/3)/3 = 1 exactly',
    a90.toFixed(6) + '°', '90°', Math.abs(a90 - 90) < 1e-9, 'half the sky is dark at r = 3M');

  const rr = ringRatio();
  add('photon ring spacing', 'e^(−π) from δ&Prime; = δ at the photon sphere',
    rr.toFixed(8), EPI.toFixed(8), Math.abs(rr / EPI - 1) < 2e-3,
    `${((rr / EPI - 1) * 1e6).toFixed(0)} ppm at n = 6, still converging`);

  const pure = instability(true);
  add('instability, growing mode', 'exactly 1 e-folding per radian, for any mass',
    pure.rate.toFixed(8), '1', Math.abs(pure.rate - 1) < 1e-5, 'δ′ = δ seeds the growing mode alone');

  const nv = instability(false);
  const lncosh = Math.log(Math.cosh(nv.phi)) / nv.phi;
  add('instability, δ′ = 0 seed', 'ln(cosh φ)/φ — NOT 1',
    nv.rate.toFixed(6), lncosh.toFixed(6), Math.abs(nv.rate / lncosh - 1) < 1e-6,
    `half growing, half decaying mode; the naive expectation of 1 is ${((1 - lncosh) * 100).toFixed(1)} % out`);

  const rd = redshiftDecomposition();
  add('redshift decomposition', 'gravitational shift × special-relativistic Doppler',
    rd.toExponential(2), '0', rd < 1e-12, '4,000 random emitters and photons, equatorial');

  const bs = beamingSign();
  const ok = bs.best.proj > 0.5 && bs.worst.proj < -0.5;
  add('which limb is bright', 'the one whose velocity points at the camera',
    `${bs.best.proj.toFixed(3)} / ${bs.worst.proj.toFixed(3)}`, '&gt; 0 / &lt; 0', ok,
    'v·n̂ at the brightest and faintest hits, nearly flat geometry');

  document.getElementById('checks-out').innerHTML =
    table(['check', 'graded against', 'measured', 'expected', '', 'note'], rows) +
    `<p class="tight">${rows.filter((r) => r[4].includes('pass')).length} of ${rows.length} passing, ${((performance.now() - t0) / 1000).toFixed(2)} s.</p>`;
}
