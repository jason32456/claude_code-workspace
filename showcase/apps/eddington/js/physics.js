// Null geodesics of the Schwarzschild metric.
//
// Geometric units throughout: G = c = M = 1, so every length is in units of the
// hole's mass. The horizon sits at r = 2 and the photon sphere at r = 3.
//
// A photon's path is planar (the metric is spherically symmetric), so the whole
// of light bending reduces to one second-order ODE in the orbit angle phi:
//
//     d2u/dphi2 = 3u^2 - u,        u = 1/r
//
// The 3u^2 is the entire difference between Einstein and Newton. Delete it and
// every deflection on the bench halves, the photon sphere disappears, and the
// shadow with it.

export const R_H = 2;                       // event horizon
export const R_PH = 3;                      // photon sphere
export const B_CRIT = 3 * Math.sqrt(3);     // 5.196152422706632, shadow edge
export const ISCO = 6;

// Bozza's strong-deflection limit: alpha(b) -> -ln(b/b_c - 1) + ln(216(7-4sqrt3)) - pi.
export const SDL_C = Math.log(216 * (7 - 4 * Math.sqrt(3)));   // 2.7415...

// One RK4 step of (u, w=du/dphi). Written open-coded: this is the inner loop of
// every pixel in the renderer and survives no abstraction.
export function rk4(u, w, h) {
  const a1 = 3 * u * u - u;
  const u2 = u + 0.5 * h * w, w2 = w + 0.5 * h * a1;
  const a2 = 3 * u2 * u2 - u2;
  const u3 = u + 0.5 * h * w2, w3 = w + 0.5 * h * a2;
  const a3 = 3 * u3 * u3 - u3;
  const u4 = u + h * w3, w4 = w + h * a3;
  const a4 = 3 * u4 * u4 - u4;
  return [
    u + (h / 6) * (w + 2 * w2 + 2 * w3 + w4),
    w + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4),
  ];
}

// (du/dphi)^2 = 1/b^2 - u^2 + 2u^3. Conserved along the trajectory, which is how
// the bench grades the integrator without a reference solution.
export function invariant(u, w) { return w * w + u * u - 2 * u * u * u; }

// Smallest positive root of 1/b^2 - u^2 + 2u^3 = 0: the closest approach of a
// ray that comes in from infinity. Exists only for b > B_CRIT.
export function turningPoint(b) {
  const f = (u) => 1 / (b * b) - u * u + 2 * u * u * u;
  let lo = 0, hi = 1 / 3;
  if (f(hi) > 0) return NaN;              // captured: no turning point
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// Total bending of a ray that comes in from infinity with impact parameter b.
// Integrated outward from the turning point, where du/dphi = 0 exactly, so the
// usual 1/sqrt singularity of the radial form never appears.
export function deflection(b, h = 2e-4) {
  const ut = turningPoint(b);
  if (!(ut > 0)) return Infinity;
  let u = ut, w = 0, phi = 0;
  // Bending left uncollected beyond radius r is about M b u^2, so how small u
  // has to get before the flat asymptote takes over depends on b.
  const uStop = Math.min(1e-7, Math.sqrt(1e-13 / b));
  for (let i = 0; i < 4_000_000; i++) {
    // Cap the step so u cannot be walked straight through zero. Without this the
    // last step's overshoot, not RK4's truncation, sets the error, and the
    // method measures as second order on the bench.
    const step = Math.min(h / (1 + 6 * u), (0.3 * u) / Math.abs(w));
    const [un, wn] = rk4(u, w, -step);     // integrate backwards in phi: u falls
    if (!(un > uStop)) break;
    u = un; w = wn; phi -= step;
    if (u > 0.5) return Infinity;
  }
  // Outbound in decreasing phi with u = A sin(phi - phi_asym): the remaining
  // sweep is atan2(u, w), which needs no knowledge of A.
  const half = -phi + Math.atan2(u, w);
  return 2 * half - Math.PI;
}

export function deflectionSDL(b) {
  return -Math.log(b / B_CRIT - 1) + SDL_C - Math.PI;
}

// Trace a ray backwards from a static camera at r0. cosPsi/sinPsi give the ray's
// direction in the camera's own orthonormal frame (psi measured from straight
// out); e1z/e2z are the z-components of the photon plane's basis, which is all
// the 3D the planar ODE needs in order to find the equatorial disk.
export function traceRay(r0, cosPsi, sinPsi, e1z, e2z, opt) {
  const rIn = opt.rIn, rOut = opt.rOut, disk = opt.disk !== false;
  const hBase = opt.hBase ?? 0.03;
  const uEsc = 1 / (opt.rEsc ?? 800);
  const maxSteps = opt.maxSteps ?? 12000;

  const u0 = 1 / r0;
  const f0 = Math.sqrt(1 - 2 * u0);
  if (sinPsi < 1e-12) return { kind: 'capture', b: 0, steps: 0 };
  const b = r0 * sinPsi / f0;               // b = L/E, the conserved one
  let u = u0;
  let w = -u0 * cosPsi * f0 / sinPsi;       // du/dphi; positive means inbound
  let phi = 0;
  let z = r0 * e1z;
  const planar = Math.abs(e1z) < 1e-9 && Math.abs(e2z) < 1e-9;

  for (let s = 0; s < maxSteps; s++) {
    const h = hBase / (1 + 10 * u);
    const [un, wn] = rk4(u, w, h);
    const phin = phi + h;
    // u crossing zero on the outbound branch is escape, not capture. Missing
    // this is not a rounding error: the step in u is ~h/b, so whether a ray
    // lands inside the escape window depends on b, and mislabelling paints
    // concentric false arcs across the whole sky.
    if (un <= 0) {
      if (w < 0) return { kind: 'sky', phiInf: phi + Math.atan2(u, -w), b, steps: s };
      return { kind: 'capture', b, steps: s };
    }
    if (un >= 0.5) return { kind: 'capture', b, steps: s };

    if (disk) {
      const rn = 1 / un;
      if (planar) {
        // The photon plane *is* the disk plane: the ray runs along the surface.
        if (rn <= rOut && rn >= rIn) return { kind: 'disk', r: rn, phi: phin, b, steps: s };
      } else {
        const zn = rn * (Math.cos(phin) * e1z + Math.sin(phin) * e2z);
        if (z === 0 || z * zn < 0) {
          const hit = refineCrossing(u, w, phi, h, e1z, e2z, z);
          if (hit && hit.r >= rIn && hit.r <= rOut) {
            return { kind: 'disk', r: hit.r, phi: hit.phi, b, steps: s };
          }
        }
        z = zn;
      }
    }

    u = un; w = wn; phi = phin;
    // Outbound and far away: hand the rest to the flat-space asymptote. With
    // u = A sin(phi_inf - phi) exactly in flat space, the remaining sweep is
    // atan2(u, -w), which needs no knowledge of A and so stays accurate however
    // early we stop.
    if (u < uEsc && w < 0) {
      return { kind: 'sky', phiInf: phi + Math.atan2(u, -w), b, steps: s };
    }
  }
  return { kind: 'capture', b, steps: maxSteps };   // spiralling; treat as swallowed
}

// Walk the last step again in 16 substeps and interpolate to the sign change of
// z. Linear interpolation is enough: the substep is ~2e-3 rad of orbit.
function refineCrossing(u, w, phi, h, e1z, e2z, z0) {
  const n = 16, hs = h / n;
  let cu = u, cw = w, cp = phi, cz = z0;
  for (let i = 0; i < n; i++) {
    const [nu, nw] = rk4(cu, cw, hs);
    const np = cp + hs, nr = 1 / nu;
    const nz = nr * (Math.cos(np) * e1z + Math.sin(np) * e2z);
    if (cz === 0 || cz * nz < 0) {
      const t = cz === 0 ? 0 : cz / (cz - nz);
      const ph = cp + t * hs;
      const rh = 1 / (cu + t * (nu - cu));
      return { phi: ph, r: rh };
    }
    cu = nu; cw = nw; cp = np; cz = nz;
  }
  return null;
}

// Total redshift g = nu_obs / nu_emit for a disk element on a circular orbit at
// r_e, seen by a static camera at r_o. bz is the photon's axial angular momentum
// per unit energy, signed: it carries the whole Doppler shift.
//
//   g = [1/sqrt(1-2/r_o)] * sqrt(1-3/r_e) / (1 - Omega*bz)
//
// sqrt(1-3/r_e) is the orbiting emitter's time dilation (gravity plus its own
// motion), 1/(1-Omega*bz) is the line-of-sight Doppler factor.
export function redshiftFactor(rEmit, bz, rObs) {
  const omega = Math.pow(rEmit, -1.5);
  return Math.sqrt(1 - 3 / rEmit) / ((1 - omega * bz) * Math.sqrt(1 - 2 / rObs));
}

// Shakura-Sunyaev thin-disk flux: F ~ r^-3 (1 - sqrt(rIn/r)). Zero at the inner
// edge, so the disk fades out rather than ending in a bright rim.
export function diskFlux(r, rIn) {
  return Math.pow(r, -3) * (1 - Math.sqrt(rIn / r));
}

// Angular radius of the shadow for a static observer at r. sin(alpha) = b_c
// sqrt(1-2/r)/r; at r = 3 it is exactly 1, so the dark patch fills half the sky.
export function shadowAngle(r) {
  const s = B_CRIT * Math.sqrt(1 - 2 / r) / r;
  return s >= 1 ? Math.PI / 2 : Math.asin(s);
}

// The critical geodesic, b = 3sqrt(3) M, has a closed form:
//
//     u(phi) = -1/6 + (1/2) tanh^2(phi/2)
//
// Substituting it into u'' = 3u^2 - u satisfies the equation identically, so it
// is an exact solution of the same ODE the renderer integrates, and it grades
// the stepper without any reference integration. It also settles the photon
// sphere's instability without linearising anything: 1/3 - u = (1/2)sech^2(phi/2)
// -> 2e^(-phi), one e-folding per radian, exactly.
export function criticalOrbit(phi) {
  const t = Math.tanh(phi / 2);
  return -1 / 6 + 0.5 * t * t;
}
