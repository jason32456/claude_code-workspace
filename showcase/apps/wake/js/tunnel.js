// Tunnel construction shared by the page and the worker: same lattice, same
// obstacle placement, same choice of τ, so a polar point computed in the
// background is the same experiment the tunnel would run.

import { Lattice, tauFor, BC_INLET_OUTLET, equilibrium } from './lbm.js';
import { placeShape, obstacleExtent, SHAPES } from './shapes.js';

export const U_IN = 0.08;
export const LES_TAU = 0.55;   // below this τ the Smagorinsky term is switched on
export const CS = 0.1;

// Reference lengths in cells for each shape at a given tunnel height.
export function refLength(shape, ny) {
  switch (shape) {
    case 'cylinder': return Math.round(ny / 5);
    case 'square': return Math.round(ny / 6);
    case 'airfoil': case 'symmetric': return Math.round(ny * 0.4);
    case 'plate': return Math.round(ny * 0.35);
    case 'ellipse': return Math.round(ny * 0.4);
    default: return Math.round(ny / 5);
  }
}

export function makeTunnel({ nx, ny, shape, re, angle = 0, keepMask = null }) {
  const size = refLength(shape, ny);
  const tau = tauFor(re, U_IN, size);
  const lat = new Lattice(nx, ny, {
    tau,
    smagorinsky: tau < LES_TAU ? CS : 0,
    bcX: BC_INLET_OUTLET,
    inletProfile: () => [U_IN, 0],
  });
  if (keepMask) {
    lat.mask.set(keepMask);
    lat.finalizeMask();
  } else {
    placeShape(lat, shape, { cx: nx * 0.28, cy: ny / 2, size, angle });
  }
  lat.primeWithInlet();
  // A gentle transverse nudge breaks the symmetry so a wake that is unstable
  // starts shedding within a few convective times instead of hundreds.
  const cx = nx * 0.28;
  for (let k = 0; k < lat.n; k++) {
    if (lat.mask[k]) continue;
    const x = k % nx, y = (k / nx) | 0;
    const uy = 0.03 * U_IN * Math.sin(2 * Math.PI * y / ny) * Math.exp(-((x - cx) ** 2) / (size * size));
    for (let i = 0; i < 9; i++) lat.f[i][k] = equilibrium(i, 1, U_IN, uy);
  }
  return { lat, size, tau, re };
}

// Coefficients from the momentum-exchange force, referenced to the inlet speed
// and the shape's reference length. Lattice y runs down the screen, so lift
// (up on screen) is minus forceY.
export function coefficients(lat, size) {
  const q = 0.5 * U_IN * U_IN * size;
  return { cd: lat.forceX / q, cl: -lat.forceY / q };
}

// Retune τ for a new Reynolds number without disturbing the flow.
export function retune(lat, re, size) {
  lat.tau = tauFor(re, U_IN, size);
  lat.smagorinsky = lat.tau < LES_TAU ? CS : 0;
  return lat.tau;
}

// One point of the lift polar: run to a limit cycle, then average.
export function polarPoint({ shape, re, angle, nx = 240, ny = 96, warm = 3500, measure = 2500, progress }) {
  const { lat, size } = makeTunnel({ nx, ny, shape, re, angle });
  const chunk = 250;
  let done = 0;
  const total = warm + measure;
  for (let s = 0; s < warm; s += chunk) { lat.run(chunk); done += chunk; progress?.(done / total); }
  let cd = 0, cl = 0, clMin = Infinity, clMax = -Infinity;
  for (let s = 0; s < measure; s++) {
    lat.advance();
    const c = coefficients(lat, size);
    cd += c.cd; cl += c.cl;
    if (c.cl < clMin) clMin = c.cl; if (c.cl > clMax) clMax = c.cl;
    if (s % chunk === 0) { done += chunk; progress?.(done / total); }
  }
  return { alpha: angle, cd: cd / measure, cl: cl / measure, clMin, clMax, size, steps: lat.step, tau: lat.tau };
}

export { SHAPES, obstacleExtent };
