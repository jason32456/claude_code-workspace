// Benchmarks against answers the solver did not produce: closed forms for
// channel flows, Ghia's cavity table, the Schäfer–Turek cylinder, Roshko's
// shedding law. Each returns { name, expected, measured, pass, detail }.
// Every test builds its own lattice; nothing here touches the tunnel.

import { Lattice, equilibrium, viscosity, tauFor, CX, CY, W, WALL, OBSTACLE, FLUID, BC_INLET_OUTLET } from './lbm.js';
import { fillCircle } from './shapes.js';

const fmt = (v, d = 4) => (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(2) : v.toFixed(d));

// Ghia, Ghia & Shin (1982), Table I, Re = 100: u along the vertical line
// through the cavity centre, y measured from the bottom, lid at y = 1.
export const GHIA_RE100 = [
  [1.0000, 1.00000], [0.9766, 0.84123], [0.9688, 0.78871], [0.9609, 0.73722],
  [0.9531, 0.68717], [0.8516, 0.23151], [0.7344, 0.00332], [0.6172, -0.13641],
  [0.5000, -0.20581], [0.4531, -0.21090], [0.2813, -0.15662], [0.1719, -0.10150],
  [0.1016, -0.06434], [0.0703, -0.04775], [0.0625, -0.04192], [0.0547, -0.03717],
  [0.0000, 0.00000],
];

export function testMoments() {
  let worst = 0;
  for (const [rho, ux, uy] of [[1, 0, 0], [1.2, 0.1, -0.05], [0.8, -0.08, 0.12]]) {
    let m0 = 0, mx = 0, my = 0;
    for (let i = 0; i < 9; i++) {
      const e = equilibrium(i, rho, ux, uy);
      m0 += e; mx += CX[i] * e; my += CY[i] * e;
    }
    worst = Math.max(worst, Math.abs(m0 - rho), Math.abs(mx - rho * ux), Math.abs(my - rho * uy));
  }
  // Weights sum to one and are isotropic to fourth order: Σ w c_x c_x = cs².
  let ws = 0, cxx = 0, cxy = 0;
  for (let i = 0; i < 9; i++) { ws += W[i]; cxx += W[i] * CX[i] * CX[i]; cxy += W[i] * CX[i] * CY[i]; }
  worst = Math.max(worst, Math.abs(ws - 1), Math.abs(cxx - 1 / 3), Math.abs(cxy));
  return {
    name: 'Equilibrium moments',
    oracle: 'Σfᵢᵉᵠ = ρ, Σcᵢfᵢᵉᵠ = ρu, Σwᵢcᵢcᵢ = cs² by construction',
    expected: '0', measured: worst.toExponential(1), pass: worst < 1e-12,
    detail: 'Density, momentum and the second moment of the equilibrium recovered from the nine populations.',
  };
}

export function testMass(progress) {
  const lat = new Lattice(48, 32, { tau: 0.7 });
  // A sealed box with a blob of momentum in it; nothing may leave.
  fillCircle(lat, 24, 16, 6, WALL);
  lat.finalizeMask();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) {
    const k = y * 48 + x;
    if (lat.mask[k]) continue;
    const ux = 0.05 * Math.sin(2 * Math.PI * y / 32), uy = 0.03 * Math.cos(2 * Math.PI * x / 48);
    for (let i = 0; i < 9; i++) lat.f[i][k] = equilibrium(i, 1 + 0.02 * Math.sin(2 * Math.PI * x / 48), ux, uy);
  }
  const m0 = lat.totalMass();
  for (let s = 0; s < 20; s++) { lat.run(100); progress?.(s / 20); }
  const drift = Math.abs(lat.totalMass() - m0) / m0;
  return {
    name: 'Mass conservation',
    oracle: 'closed periodic box with a solid in it, 2,000 steps',
    expected: '< 1e-7 relative (single-precision populations)', measured: drift.toExponential(2), pass: drift < 1e-7,
    detail: 'Collision conserves mass exactly and bounce-back returns every population it receives, so the total can only change through a bug.',
  };
}

export function testPoiseuille(progress) {
  const H = 32, nx = 16, ny = H + 2, g = 1e-6, tau = 0.8;
  const lat = new Lattice(nx, ny, { tau, gx: g });
  for (let x = 0; x < nx; x++) { lat.mask[x] = WALL; lat.mask[(ny - 1) * nx + x] = WALL; }
  lat.finalizeMask();
  const nu = viscosity(tau);
  // Walls sit halfway between the solid and fluid cell centres, so the
  // channel spans exactly H cells and the profile is u = g·y(H−y)/2ν with y
  // measured from the wall at the fluid cell's face.
  const total = 30;
  for (let s = 0; s < total; s++) { lat.run(2000); progress?.(s / total); }
  let worst = 0, umax = 0;
  const profile = [];
  for (let y = 1; y <= H; y++) {
    const yy = y - 0.5;
    const exact = g * yy * (H - yy) / (2 * nu);
    const got = lat.ux[y * nx + 8];
    profile.push([got, exact]);
    umax = Math.max(umax, exact);
    worst = Math.max(worst, Math.abs(got - exact));
  }
  const rel = worst / umax;
  return {
    name: 'Poiseuille flow',
    oracle: 'u(y) = g·y(H−y) / 2ν, exact parabola',
    expected: 'max error < 1 % of centreline', measured: (100 * rel).toFixed(3) + ' %', pass: rel < 0.01,
    detail: `Body-forced channel, ${H} cells wide, τ = ${tau}. Guo forcing with halfway bounce-back reproduces the parabola to second order.`,
    profile,
  };
}

export function testCouette(progress) {
  const H = 32, nx = 16, ny = H + 2, U = 0.05, tau = 0.8;
  const lat = new Lattice(nx, ny, { tau, wallU: [U, 0], wallY0: ny - 1, wallY1: ny - 1 });
  for (let x = 0; x < nx; x++) { lat.mask[x] = WALL; lat.mask[(ny - 1) * nx + x] = WALL; }
  lat.finalizeMask();
  const total = 30;
  for (let s = 0; s < total; s++) { lat.run(2000); progress?.(s / total); }
  let worst = 0;
  const profile = [];
  for (let y = 1; y <= H; y++) {
    const exact = U * (y - 0.5) / H;
    const got = lat.ux[y * nx + 8];
    profile.push([got, exact]);
    worst = Math.max(worst, Math.abs(got - exact));
  }
  const rel = worst / U;
  return {
    name: 'Couette flow',
    oracle: 'u(y) = U·y/H, linear shear between a fixed and a moving wall',
    expected: 'max error < 1 % of wall speed', measured: (100 * rel).toFixed(3) + ' %', pass: rel < 0.01,
    detail: 'Checks the moving-wall bounce-back term, which the lid-driven cavity depends on.',
    profile,
  };
}

export function testCavity(progress) {
  const L = 64, U = 0.1, re = 100;
  const nx = L + 2, ny = L + 2;
  const tau = tauFor(re, U, L);
  const lat = new Lattice(nx, ny, { tau, wallU: [U, 0], wallY0: ny - 1, wallY1: ny - 1 });
  for (let x = 0; x < nx; x++) { lat.mask[x] = WALL; lat.mask[(ny - 1) * nx + x] = WALL; }
  for (let y = 0; y < ny; y++) { lat.mask[y * nx] = WALL; lat.mask[y * nx + nx - 1] = WALL; }
  lat.finalizeMask();
  const centre = [];
  const sample = () => {
    centre.length = 0;
    const xc = Math.floor(nx / 2);
    for (let y = 1; y <= L; y++) centre.push(0.5 * (lat.ux[y * nx + xc - 1] + lat.ux[y * nx + xc]));
  };
  let prev = null, iter = 0;
  const maxIter = 40;
  for (; iter < maxIter; iter++) {
    lat.run(2000);
    sample();
    progress?.(iter / maxIter);
    if (prev) {
      let d = 0;
      for (let j = 0; j < centre.length; j++) d = Math.max(d, Math.abs(centre[j] - prev[j]));
      if (d < 2e-6) break;
    }
    prev = centre.slice();
  }
  // Interpolate the lattice profile at Ghia's y positions (fluid cell y has
  // its centre at (y − 0.5)/L from the bottom wall).
  const at = (yy) => {
    const p = yy * L + 0.5 - 1;
    const j = Math.max(0, Math.min(L - 2, Math.floor(p)));
    const t = Math.max(0, Math.min(1, p - j));
    return centre[j] * (1 - t) + centre[j + 1] * t;
  };
  let ss = 0, n = 0;
  const rows = [];
  for (const [yy, ug] of GHIA_RE100) {
    let got;
    if (yy >= 1) got = 1; else if (yy <= 0) got = 0; else got = at(yy) / U;
    rows.push([yy, ug, got]);
    if (yy > 0 && yy < 1) { ss += (got - ug) ** 2; n++; }
  }
  const rms = Math.sqrt(ss / n);
  return {
    name: 'Lid-driven cavity, Re = 100',
    oracle: 'Ghia, Ghia & Shin (1982), Table I: u on the vertical centreline',
    expected: 'RMS deviation < 0.02 (in units of lid speed)', measured: rms.toFixed(4), pass: rms < 0.02,
    detail: `${L}×${L} cavity, τ = ${tau.toFixed(3)}, converged after ${lat.step.toLocaleString()} steps. Ghia used a 129×129 grid.`,
    rows,
  };
}

// Schäfer & Turek (1996), benchmark 2D-1: cylinder D = 0.1 in a 2.2 × 0.41
// channel, parabolic inflow U_max = 0.3, Re = U_mean·D/ν = 20. The reference
// cylinder sits 0.005 (5 % of D) below the centreline, which on this grid is
// less than one cell; it is placed on the centreline here, so the lift is
// zero by symmetry and only the drag is compared.
export function testSchaferTurek(progress, opts = {}) {
  const D = opts.D ?? 12;
  const H = Math.round(4.1 * D) | 1;         // odd, so the centreline is a row of cells
  const Dl = H / 4.1;                        // diameter in cells, exact ratio to the channel
  const L = Math.round(22 * D);
  const nx = L, ny = H + 2;
  const uMean = 0.05, uMax = 1.5 * uMean;
  const tau = tauFor(20, uMean, Dl);
  const inlet = (y) => {
    const yy = y - 0.5;                     // distance from the lower wall face
    if (yy < 0 || yy > H) return [0, 0];
    return [4 * uMax * yy * (H - yy) / (H * H), 0];
  };
  const lat = new Lattice(nx, ny, { tau, bcX: BC_INLET_OUTLET, outlet: 'neep', inletProfile: inlet });
  for (let x = 0; x < nx; x++) { lat.mask[x] = WALL; lat.mask[(ny - 1) * nx + x] = WALL; }
  fillCircle(lat, 2 * Dl, 1 + H / 2, Dl / 2);
  lat.finalizeMask();
  lat.primeWithInlet();
  let cells = 0;
  for (let k = 0; k < lat.n; k++) if (lat.mask[k] === OBSTACLE) cells++;
  const q = 0.5 * uMean * uMean * Dl;
  const warm = Math.round(1.5 * L / uMean), avg = 2000;
  const chunk = 500;
  const total = warm + avg;
  let done = 0;
  for (let s = 0; s < warm; s += chunk) { lat.run(chunk); done += chunk; progress?.(done / total); }
  let cd = 0, cl = 0;
  for (let s = 0; s < avg; s++) {
    lat.advance();
    cd += lat.forceX / q; cl += lat.forceY / q;
    if (s % chunk === 0) { done += chunk; progress?.(done / total); }
  }
  cd /= avg; cl /= avg;
  const err = Math.abs(cd - 5.58) / 5.58;
  return {
    name: 'Cylinder in a channel, Re = 20',
    oracle: 'Schäfer & Turek (1996) 2D-1: Cd 5.57–5.59',
    expected: 'Cd within 3 % of 5.58', measured: `Cd ${cd.toFixed(3)} (${(100 * (cd - 5.58) / 5.58).toFixed(1)} %), Cl ${cl.toExponential(1)}`, pass: err < 0.03,
    detail: `${Dl.toFixed(1)} cells across the cylinder (${cells} solid cells), ${nx}×${ny} lattice, τ = ${tau.toFixed(3)}, averaged over the last ${avg.toLocaleString()} of ${lat.step.toLocaleString()} steps. The reference used several hundred cells across the cylinder. With a staircase wall the answer depends on how the circle happens to rasterise: other diameters on this same code land between 0 % and 8 % high, and the trend with resolution is not monotone.`,
    cd, cl,
  };
}

// Roshko (1954): St = 0.212 (1 − 21.2/Re) for a cylinder in free stream,
// valid roughly for 50 < Re < 150. Here the cylinder sits in a channel with
// periodic top and bottom, so blockage raises the frequency a little.
export function testStrouhal(progress, opts = {}) {
  const D = opts.D ?? 12, re = opts.re ?? 150;
  const nx = 20 * D, ny = 10 * D;
  const U = 0.08;
  const tau = tauFor(re, U, D);
  const lat = new Lattice(nx, ny, { tau, bcX: BC_INLET_OUTLET, inletProfile: () => [U, 0] });
  fillCircle(lat, 5 * D, ny / 2, D / 2);
  lat.finalizeMask();
  lat.primeWithInlet();
  // A nudge across the stream so the wake does not sit on the symmetric
  // solution for thousands of steps before it notices it is unstable.
  for (let k = 0; k < lat.n; k++) {
    if (lat.mask[k]) continue;
    const x = k % nx, y = (k / nx) | 0;
    const uy = 0.02 * U * Math.sin(2 * Math.PI * y / ny) * Math.exp(-((x - 5 * D) ** 2) / (4 * D * D));
    for (let i = 0; i < 9; i++) lat.f[i][k] = equilibrium(i, 1, U, uy);
  }
  const q = 0.5 * U * U * D;
  const warm = Math.round(60 * D / U);   // 60 convective times to reach the limit cycle
  const chunk = 500;
  const totalChunks = Math.ceil(warm / chunk) + 40;
  let c = 0;
  for (let s = 0; s < warm; s += chunk, c++) { lat.run(chunk); progress?.(c / totalChunks); }
  // Time the lift signal by its upward zero crossings after removing the mean.
  const cl = [];
  const need = 12;
  let crossings = [], t = 0;
  const window = [];
  while (crossings.length < need && t < 40 * chunk) {
    lat.advance();
    const v = -lat.forceY / q;
    cl.push(v);
    window.push(v);
    if (window.length > 4000) window.shift();
    t++;
    if (t % chunk === 0) progress?.((++c) / totalChunks);
    if (cl.length > 200) {
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const a = cl[cl.length - 2] - mean, b = v - mean;
      if (a < 0 && b >= 0) crossings.push(lat.step);
    }
  }
  let st = NaN, amp = 0;
  if (crossings.length >= 3) {
    const period = (crossings[crossings.length - 1] - crossings[1]) / (crossings.length - 2);
    st = D / (U * period);
    const tail = cl.slice(-Math.round(period * 2));
    amp = 0.5 * (Math.max(...tail) - Math.min(...tail));
  }
  const roshko = 0.212 * (1 - 21.2 / re);
  const err = Math.abs(st - roshko) / roshko;
  return {
    name: `Vortex shedding, Re = ${re}`,
    oracle: `Roshko (1954): St = 0.212 (1 − 21.2/Re) = ${roshko.toFixed(4)}`,
    expected: 'within 10 %', measured: Number.isFinite(st) ? `St ${st.toFixed(4)}, Cl amplitude ${amp.toFixed(3)}` : 'no periodic shedding found', pass: err < 0.10,
    detail: `${D} cells across, ${nx}×${ny} periodic channel (10 % blockage), τ = ${tau.toFixed(3)}, ${crossings.length} lift cycles timed after ${warm.toLocaleString()} warm-up steps. Blockage is expected to push the frequency above the free-stream value, so the measured number should sit a few percent high.`,
    st, roshko,
  };
}

export const TESTS = [
  { id: 'moments', run: testMoments, cost: 0 },
  { id: 'mass', run: testMass, cost: 1 },
  { id: 'poiseuille', run: testPoiseuille, cost: 2 },
  { id: 'couette', run: testCouette, cost: 2 },
  { id: 'cavity', run: testCavity, cost: 10 },
  { id: 'schafer', run: testSchaferTurek, cost: 25 },
  { id: 'strouhal', run: testStrouhal, cost: 25 },
];
