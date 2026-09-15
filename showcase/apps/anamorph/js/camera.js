// The camera: a pinhole with one focal length, a principal point and two radial
// distortion coefficients, plus a pose. Everything the solver is trying to take
// back lives in this object, and the renderer is the only other thing that sees
// the true one.

import { rodrigues, rodriguesLog, mv33, t33, scale3 } from './la.js';

export const PARAM_NAMES = ['rx', 'ry', 'rz', 'tx', 'ty', 'tz', 'f', 'cx', 'cy', 'k1', 'k2'];
export const NP = 11;

export function makeCamera({ rvec = [0, 0, 0], t = [0, 0, 0], f = 800, cx = 320, cy = 240, k1 = 0, k2 = 0 }) {
  return { rvec: rvec.slice(), t: t.slice(), f, cx, cy, k1, k2, R: rodrigues(rvec) };
}

export function refreshR(cam) { cam.R = rodrigues(cam.rvec); return cam; }

export function clone(cam) {
  return { rvec: cam.rvec.slice(), t: cam.t.slice(), f: cam.f, cx: cam.cx, cy: cam.cy, k1: cam.k1, k2: cam.k2, R: cam.R.slice() };
}

// Camera centre in world coordinates: the point that projects nowhere.
export function centre(cam) {
  const Rt = t33(cam.R);
  return scale3(mv33(Rt, cam.t), -1);
}

// World point to camera frame.
export function toCam(cam, X) {
  const p = mv33(cam.R, X);
  return [p[0] + cam.t[0], p[1] + cam.t[1], p[2] + cam.t[2]];
}

// The forward model. Returns null for points at or behind the pinhole rather
// than letting a negative depth project to a plausible-looking pixel.
export function project(cam, X) {
  const Xc = toCam(cam, X);
  if (Xc[2] <= 1e-9) return null;
  return projectCam(cam, Xc);
}

export function projectCam(cam, Xc) {
  const x = Xc[0] / Xc[2], y = Xc[1] / Xc[2];
  const r2 = x * x + y * y;
  const d = 1 + cam.k1 * r2 + cam.k2 * r2 * r2;
  return [cam.f * x * d + cam.cx, cam.f * y * d + cam.cy, Xc[2]];
}

// Undo the radial distortion of a measured pixel, by fixed-point iteration on
// the forward model. There is no closed form; this converges in a handful of
// steps for the coefficient range the scene uses.
export function undistort(cam, u, v) {
  const x0 = (u - cam.cx) / cam.f, y0 = (v - cam.cy) / cam.f;
  let x = x0, y = y0;
  for (let i = 0; i < 20; i++) {
    const r2 = x * x + y * y;
    const d = 1 + cam.k1 * r2 + cam.k2 * r2 * r2;
    const nx = x0 / d, ny = y0 / d;
    if (Math.abs(nx - x) < 1e-13 && Math.abs(ny - y) < 1e-13) { x = nx; y = ny; break; }
    x = nx; y = ny;
  }
  return [x, y];
}

// Analytic Jacobian of [u, v] with respect to the 11-vector, using a LEFT
// perturbation for the rotation: the update is R <- exp(delta) R, so the
// rotation block is -skew(R X) and there is no Rodrigues derivative to get
// wrong. The finite-difference self-test perturbs the same way, or it would be
// checking a different function.
export function projectJac(cam, X, mask) {
  const RX = mv33(cam.R, X);
  const Xc = [RX[0] + cam.t[0], RX[1] + cam.t[1], RX[2] + cam.t[2]];
  const Z = Xc[2];
  if (Z <= 1e-9) return null;
  const x = Xc[0] / Z, y = Xc[1] / Z;
  const r2 = x * x + y * y;
  const d = 1 + cam.k1 * r2 + cam.k2 * r2 * r2;
  const dd = (cam.k1 + 2 * cam.k2 * r2) * 2; // d(d)/d(r2) * 2, so d(d)/dx = dd * x

  // d[u,v] / d[x,y]
  const du_dx = cam.f * (d + x * dd * x), du_dy = cam.f * (x * dd * y);
  const dv_dx = cam.f * (y * dd * x), dv_dy = cam.f * (d + y * dd * y);

  // d[x,y] / dXc
  const iZ = 1 / Z;
  const dx_dXc = [iZ, 0, -Xc[0] * iZ * iZ];
  const dy_dXc = [0, iZ, -Xc[1] * iZ * iZ];

  // d[u,v] / dXc
  const du_dXc = [
    du_dx * dx_dXc[0] + du_dy * dy_dXc[0],
    du_dx * dx_dXc[1] + du_dy * dy_dXc[1],
    du_dx * dx_dXc[2] + du_dy * dy_dXc[2],
  ];
  const dv_dXc = [
    dv_dx * dx_dXc[0] + dv_dy * dy_dXc[0],
    dv_dx * dx_dXc[1] + dv_dy * dy_dXc[1],
    dv_dx * dx_dXc[2] + dv_dy * dy_dXc[2],
  ];

  // dXc/d(delta) = -skew(RX)
  const [a, b, c] = RX;
  const S = [0, c, -b, -c, 0, a, b, -a, 0]; // -skew(RX), row-major

  const Ju = new Float64Array(NP), Jv = new Float64Array(NP);
  for (let j = 0; j < 3; j++) {
    Ju[j] = du_dXc[0] * S[j] + du_dXc[1] * S[3 + j] + du_dXc[2] * S[6 + j];
    Jv[j] = dv_dXc[0] * S[j] + dv_dXc[1] * S[3 + j] + dv_dXc[2] * S[6 + j];
  }
  for (let j = 0; j < 3; j++) { Ju[3 + j] = du_dXc[j]; Jv[3 + j] = dv_dXc[j]; }
  Ju[6] = x * d;        Jv[6] = y * d;         // f
  Ju[7] = 1;            Jv[7] = 0;             // cx
  Ju[8] = 0;            Jv[8] = 1;             // cy
  Ju[9] = cam.f * x * r2;       Jv[9] = cam.f * y * r2;        // k1
  Ju[10] = cam.f * x * r2 * r2; Jv[10] = cam.f * y * r2 * r2;  // k2

  if (mask) for (let j = 0; j < NP; j++) if (!mask[j]) { Ju[j] = 0; Jv[j] = 0; }
  return { u: cam.f * x * d + cam.cx, v: cam.f * y * d + cam.cy, Ju, Jv, Z };
}

// Apply a step in the same parameterisation the Jacobian assumes.
export function applyStep(cam, step) {
  const dR = rodrigues([step[0], step[1], step[2]]);
  const R = [
    dR[0] * cam.R[0] + dR[1] * cam.R[3] + dR[2] * cam.R[6],
    dR[0] * cam.R[1] + dR[1] * cam.R[4] + dR[2] * cam.R[7],
    dR[0] * cam.R[2] + dR[1] * cam.R[5] + dR[2] * cam.R[8],
    dR[3] * cam.R[0] + dR[4] * cam.R[3] + dR[5] * cam.R[6],
    dR[3] * cam.R[1] + dR[4] * cam.R[4] + dR[5] * cam.R[7],
    dR[3] * cam.R[2] + dR[4] * cam.R[5] + dR[5] * cam.R[8],
    dR[6] * cam.R[0] + dR[7] * cam.R[3] + dR[8] * cam.R[6],
    dR[6] * cam.R[1] + dR[7] * cam.R[4] + dR[8] * cam.R[7],
    dR[6] * cam.R[2] + dR[7] * cam.R[5] + dR[8] * cam.R[8],
  ];
  const out = clone(cam);
  out.R = R;
  out.rvec = rodriguesLog(R);
  out.t = [cam.t[0] + step[3], cam.t[1] + step[4], cam.t[2] + step[5]];
  out.f = cam.f + step[6];
  out.cx = cam.cx + step[7];
  out.cy = cam.cy + step[8];
  out.k1 = cam.k1 + step[9];
  out.k2 = cam.k2 + step[10];
  return out;
}

// Build a camera that looks at `target` from `eye`, with `up` roughly upward.
export function lookAt(eye, target, up = [0, 1, 0], intr = {}) {
  const f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]);
  const z = [f[0] / fl, f[1] / fl, f[2] / fl];
  let xr = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  const xl = Math.hypot(xr[0], xr[1], xr[2]);
  xr = [xr[0] / xl, xr[1] / xl, xr[2] / xl];
  const yr = [z[1] * xr[2] - z[2] * xr[1], z[2] * xr[0] - z[0] * xr[2], z[0] * xr[1] - z[1] * xr[0]];
  // Rows of R are the camera axes in world coordinates.
  const R = [xr[0], xr[1], xr[2], yr[0], yr[1], yr[2], z[0], z[1], z[2]];
  const t = [
    -(R[0] * eye[0] + R[1] * eye[1] + R[2] * eye[2]),
    -(R[3] * eye[0] + R[4] * eye[1] + R[5] * eye[2]),
    -(R[6] * eye[0] + R[7] * eye[1] + R[8] * eye[2]),
  ];
  const cam = makeCamera({ t, ...intr });
  cam.R = R;
  cam.rvec = rodriguesLog(R);
  return cam;
}

// Angle in degrees between two rotations: the magnitude of log(Ra^T Rb).
export function rotationErrorDeg(Ra, Rb) {
  const RtR = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    RtR.push(Ra[i] * Rb[j] + Ra[3 + i] * Rb[3 + j] + Ra[6 + i] * Rb[6 + j]);
  }
  const tr = Math.min(3, Math.max(-1, RtR[0] + RtR[4] + RtR[8]));
  return Math.acos((tr - 1) / 2) * 180 / Math.PI;
}

// Normalised undistorted coordinates -> pixel. The forward half of the lens,
// exposed on its own because the detector needs to bend straight lines the same
// way the renderer did.
export function distortNorm(cam, x, y) {
  const r2 = x * x + y * y;
  const d = 1 + cam.k1 * r2 + cam.k2 * r2 * r2;
  return [cam.f * x * d + cam.cx, cam.f * y * d + cam.cy];
}

// A lens object for the detector: the pair of maps, and nothing else. Passing
// k1 = k2 = 0 makes it the identity up to a similarity, which is what the first
// pass uses before any distortion is known.
export function lensOf(cam) {
  return {
    undistort: (u, v) => undistort(cam, u, v),
    distort: (x, y) => distortNorm(cam, x, y),
    k1: cam.k1, k2: cam.k2,
  };
}
