// Taking the camera back. Three routes, kept separate on purpose because the
// difference between them is the measurement:
//
//   dltCamera()      the textbook general method: one linear solve for the whole
//                    3x4 camera matrix from 3D-to-2D correspondences. Needs the
//                    points to span three dimensions, and says nothing about it
//                    when they do not.
//   poseFromH()      valid only on a plane, via a homography -- so it is exactly
//                    the case the general method cannot do.
//   refineLM()       Levenberg-Marquardt over pose, focal length, principal
//                    point and distortion together, from either seed.

import { mat, set, nullVector, mul33, t33, mv33, inverse33, det33, orthonormalise, unit3, cross3, norm3, solve, rodriguesLog } from './la.js';
import * as Cam from './camera.js';

const colsToMat = (a, b, c) => [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];

// --- the general linear method -----------------------------------------------

// P from 3D-to-2D correspondences. Returns the condition number too: on a planar
// configuration the design matrix loses rank, and that is the whole of claim 2.
export function dltCamera(world, image, { normalised = true } = {}) {
  const n = world.length;
  if (n < 6) return null;
  let W = world, I = image, Tw = null, Ti = null;
  if (normalised) {
    const a = normalise3(world), b = normalise2(image);
    W = a.out; I = b.out; Tw = a.T; Ti = b.T;
  }
  const A = mat(2 * n, 12);
  for (let i = 0; i < n; i++) {
    const [X, Y, Z] = W[i], [u, v] = I[i];
    set(A, 2 * i, 0, -X); set(A, 2 * i, 1, -Y); set(A, 2 * i, 2, -Z); set(A, 2 * i, 3, -1);
    set(A, 2 * i, 8, u * X); set(A, 2 * i, 9, u * Y); set(A, 2 * i, 10, u * Z); set(A, 2 * i, 11, u);
    set(A, 2 * i + 1, 4, -X); set(A, 2 * i + 1, 5, -Y); set(A, 2 * i + 1, 6, -Z); set(A, 2 * i + 1, 7, -1);
    set(A, 2 * i + 1, 8, v * X); set(A, 2 * i + 1, 9, v * Y); set(A, 2 * i + 1, 10, v * Z); set(A, 2 * i + 1, 11, v);
  }
  const { v: nv, cond, singular } = nullVector(A);
  let P = Array.from(nv);
  if (normalised) {
    // P = Ti^-1 * Pn * Tw
    const Tii = inverse33(Ti);
    const P3 = [[P[0], P[1], P[2], P[3]], [P[4], P[5], P[6], P[7]], [P[8], P[9], P[10], P[11]]];
    const M1 = [0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => Tii[r * 3] * P3[0][c] + Tii[r * 3 + 1] * P3[1][c] + Tii[r * 3 + 2] * P3[2][c]));
    const out = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += M1[r][k] * Tw[k * 4 + c];
      out.push(s);
    }
    P = out;
  }
  // The four smallest singular values tell you how close to rank-deficient this
  // is: a planar configuration kills four dimensions, not one.
  return { P, cond, singular, nullity: singular.filter((s) => s < singular[singular.length - 1] * 1e-8).length };
}

function normalise3(pts) {
  const n = pts.length;
  const m = [0, 0, 0];
  for (const p of pts) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }
  m[0] /= n; m[1] /= n; m[2] /= n;
  let md = 0;
  for (const p of pts) md += Math.hypot(p[0] - m[0], p[1] - m[1], p[2] - m[2]);
  md /= n;
  const s = md > 1e-12 ? Math.sqrt(3) / md : 1;
  const T = [s, 0, 0, -s * m[0], 0, s, 0, -s * m[1], 0, 0, s, -s * m[2], 0, 0, 0, 1];
  return { T, out: pts.map((p) => [(p[0] - m[0]) * s, (p[1] - m[1]) * s, (p[2] - m[2]) * s]) };
}

function normalise2(pts) {
  const n = pts.length;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p[0]; my += p[1]; }
  mx /= n; my /= n;
  let md = 0;
  for (const p of pts) md += Math.hypot(p[0] - mx, p[1] - my);
  md /= n;
  const s = md > 1e-12 ? Math.SQRT2 / md : 1;
  return { T: [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1], out: pts.map((p) => [(p[0] - mx) * s, (p[1] - my) * s]) };
}

// RQ decomposition of the left 3x3 block: M = K R, K upper triangular with a
// positive diagonal, R a rotation. Three Givens rotations, then a sign fix.
export function rq3(M) {
  // Post-multiply by three Givens rotations, each chosen to zero one sub-diagonal
  // entry without disturbing the ones already zeroed.
  const g = (a, b) => { const d = Math.hypot(a, b) || 1; return [b / d, -a / d]; }; // [c, s] with a*c + b*s = 0
  let A = M.slice();

  // zero A[2][1]
  let [c, s] = g(A[7], A[8]);
  const Qx = [1, 0, 0, 0, c, -s, 0, s, c];
  A = mul33(A, Qx);
  // zero A[2][0], leaving column 1 alone
  [c, s] = g(A[6], A[8]);
  const Qy = [c, 0, -s, 0, 1, 0, s, 0, c];
  A = mul33(A, Qy);
  // zero A[1][0], leaving row 2 alone
  [c, s] = g(A[3], A[4]);
  const Qz = [c, -s, 0, s, c, 0, 0, 0, 1];
  A = mul33(A, Qz);

  let K = A;
  let R = t33(mul33(mul33(Qx, Qy), Qz));
  // Push the sign of each diagonal entry of K into the matching row of R, which
  // leaves the product K*R unchanged.
  const D = [Math.sign(K[0]) || 1, Math.sign(K[4]) || 1, Math.sign(K[8]) || 1];
  K = [K[0] * D[0], K[1] * D[1], K[2] * D[2], K[3] * D[0], K[4] * D[1], K[5] * D[2], K[6] * D[0], K[7] * D[1], K[8] * D[2]];
  R = [R[0] * D[0], R[1] * D[0], R[2] * D[0], R[3] * D[1], R[4] * D[1], R[5] * D[1], R[6] * D[2], R[7] * D[2], R[8] * D[2]];
  // A reflection would still satisfy M = K R; negating both keeps the product.
  if (det33(R) < 0) { R = R.map((x) => -x); K = K.map((x) => -x); }
  return { K, R };
}

// Camera from a decomposed P, if it decomposes to something physical at all.
export function cameraFromP(P) {
  const M = [P[0], P[1], P[2], P[4], P[5], P[6], P[8], P[9], P[10]];
  if (Math.abs(det33(M)) < 1e-18) return null;
  const { K, R } = rq3(M);
  const s = K[8];
  if (Math.abs(s) < 1e-18) return null;
  const Kn = K.map((x) => x / s);
  const Mi = inverse33(M);
  if (!Mi) return null;
  const p4 = [P[3], P[7], P[11]];
  const centre = mv33(Mi, p4).map((x) => -x);
  const t = mv33(R, centre).map((x) => -x);
  const cam = Cam.makeCamera({ f: (Kn[0] + Kn[4]) / 2, cx: Kn[2], cy: Kn[5], k1: 0, k2: 0, t });
  cam.R = R;
  cam.rvec = rodriguesLog(R);
  return { cam, K: Kn, skew: Kn[1], aspect: Kn[4] / Kn[0] };
}

// --- the planar route ---------------------------------------------------------

// Pose of a plane from the homography that maps its own millimetre coordinates
// into the image, given the intrinsics.
export function poseFromH(H, f, cx, cy) {
  const Ki = [1 / f, 0, -cx / f, 0, 1 / f, -cy / f, 0, 0, 1];
  const B = mul33(Ki, H);
  const b1 = [B[0], B[3], B[6]], b2 = [B[1], B[4], B[7]], b3 = [B[2], B[5], B[8]];
  const n1 = norm3(b1), n2 = norm3(b2);
  if (n1 < 1e-15 || n2 < 1e-15) return null;
  let lam = 2 / (n1 + n2);
  let r1 = b1.map((x) => x * lam), r2 = b2.map((x) => x * lam), t = b3.map((x) => x * lam);
  if (t[2] < 0) { r1 = r1.map((x) => -x); r2 = r2.map((x) => -x); t = t.map((x) => -x); }
  const r3 = cross3(r1, r2);
  const R = orthonormalise(colsToMat(r1, r2, r3));
  if (det33(R) < 0) return null;
  return { R, t };
}

// The marker's own frame in the world: columns right, down, normal.
export function markerFrame(m) {
  return { Rm: colsToMat(m.right, m.down, unit3(cross3(m.right, m.down))), O: m.origin };
}

// Convert a plane pose (expressed in that marker's local millimetre frame) into
// a world-to-camera pose.
export function planePoseToWorld(planePose, m) {
  const { Rm, O } = markerFrame(m);
  const Rcw = mul33(planePose.R, t33(Rm));
  const RO = mv33(Rcw, O);
  return { R: Rcw, t: [planePose.t[0] - RO[0], planePose.t[1] - RO[1], planePose.t[2] - RO[2]] };
}

// --- residuals ----------------------------------------------------------------

export function reprojResiduals(cam, world, image) {
  const r = new Float64Array(world.length * 2);
  let bad = 0;
  for (let i = 0; i < world.length; i++) {
    const p = Cam.project(cam, world[i]);
    if (!p) { r[2 * i] = 1e6; r[2 * i + 1] = 1e6; bad++; continue; }
    r[2 * i] = p[0] - image[i][0];
    r[2 * i + 1] = p[1] - image[i][1];
  }
  return { r, bad };
}

export function medianError(cam, world, image) {
  const e = [];
  for (let i = 0; i < world.length; i++) {
    const p = Cam.project(cam, world[i]);
    e.push(p ? Math.hypot(p[0] - image[i][0], p[1] - image[i][1]) : 1e6);
  }
  e.sort((a, b) => a - b);
  return e.length ? e[e.length >> 1] : Infinity;
}

export function rms(cam, world, image) {
  const { r } = reprojResiduals(cam, world, image);
  let s = 0;
  for (let i = 0; i < r.length; i++) s += r[i] * r[i];
  return Math.sqrt(s / (r.length / 2));
}

// --- Levenberg-Marquardt ------------------------------------------------------

export function refineLM(cam0, world, image, opts = {}) {
  const mask = opts.mask || [1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1]; // pose + f + k1,k2
  const free = [];
  for (let j = 0; j < Cam.NP; j++) if (mask[j]) free.push(j);
  const nf = free.length;
  const maxIter = opts.maxIter || 80;

  let cam = Cam.clone(cam0);
  let lambda = opts.lambda0 ?? 1e-3;
  let cost = sumSq(reprojResiduals(cam, world, image).r);
  const trace = [{ iter: 0, rms: Math.sqrt(cost / world.length), lambda }];

  for (let it = 0; it < maxIter; it++) {
    const JtJ = mat(nf, nf);
    const Jtr = new Float64Array(nf);
    let ok = true;
    for (let i = 0; i < world.length; i++) {
      const J = Cam.projectJac(cam, world[i]);
      if (!J) { ok = false; break; }
      const ru = J.u - image[i][0], rv = J.v - image[i][1];
      for (let a = 0; a < nf; a++) {
        const ja = free[a];
        Jtr[a] += J.Ju[ja] * ru + J.Jv[ja] * rv;
        for (let b = a; b < nf; b++) {
          const jb = free[b];
          const val = J.Ju[ja] * J.Ju[jb] + J.Jv[ja] * J.Jv[jb];
          JtJ.d[a * nf + b] += val;
          if (a !== b) JtJ.d[b * nf + a] += val;
        }
      }
    }
    if (!ok) break;

    let applied = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const A = mat(nf, nf);
      A.d.set(JtJ.d);
      // Marquardt's scaling: damp each parameter in proportion to its own
      // curvature, so millimetres, pixels and radians are not forced onto one
      // scale by a single additive lambda.
      for (let a = 0; a < nf; a++) A.d[a * nf + a] += lambda * Math.max(JtJ.d[a * nf + a], 1e-12);
      const dx = solve(A, Array.from(Jtr, (x) => -x));
      if (!dx) { lambda *= 10; continue; }
      const step = new Float64Array(Cam.NP);
      for (let a = 0; a < nf; a++) step[free[a]] = dx[a];
      const cand = Cam.applyStep(cam, step);
      if (cand.f <= 1) { lambda *= 10; continue; }
      const c2 = sumSq(reprojResiduals(cand, world, image).r);
      if (c2 < cost) {
        const rel = (cost - c2) / Math.max(cost, 1e-300);
        cam = cand; cost = c2; lambda = Math.max(lambda * 0.33, 1e-12);
        applied = true;
        trace.push({ iter: it + 1, rms: Math.sqrt(cost / world.length), lambda });
        if (rel < 1e-12) return { cam, rms: Math.sqrt(cost / world.length), iters: it + 1, trace, converged: true };
        break;
      }
      lambda *= 10;
      if (lambda > 1e14) return { cam, rms: Math.sqrt(cost / world.length), iters: it + 1, trace, converged: true };
    }
    if (!applied) break;
  }
  return { cam, rms: Math.sqrt(cost / world.length), iters: trace.length - 1, trace, converged: false };
}

function sumSq(r) { let s = 0; for (let i = 0; i < r.length; i++) s += r[i] * r[i]; return s; }

// --- seeding ------------------------------------------------------------------

// Focal length and distance trade off against each other, so there is nothing to
// bootstrap a plane pose with. Rather than guess, sweep the focal length: for
// each candidate f, take the pose each marker's own homography implies and score
// it against EVERY correspondence, not just that marker's four. The best pair
// (marker, f) seeds the refinement.
//
// The curve this sweep produces is also the measurement claim 3 is about, so it
// is returned rather than thrown away.
export function seedByFocalSweep(dets, world, image, cx, cy, opts = {}) {
  const fMin = opts.fMin ?? 120, fMax = opts.fMax ?? 9000, steps = opts.steps ?? 96;
  const curve = [];
  let best = null;
  for (let i = 0; i <= steps; i++) {
    const f = fMin * Math.pow(fMax / fMin, i / steps);
    let bestAtF = null;
    for (const d of dets) {
      if (!d.H) continue;
      const pp = poseFromH(d.H, f, cx, cy);
      if (!pp) continue;
      const wp = planePoseToWorld(pp, d.marker);
      const cam = Cam.makeCamera({ t: wp.t, f, cx, cy, k1: 0, k2: 0 });
      cam.R = wp.R;
      cam.rvec = rodriguesLog(wp.R);
      // Score by the MEDIAN per-point error, not the RMS. A squared mean lets a
      // third of bad correspondences drag the seed anywhere; the median does not
      // move until more than half of them are wrong, which is the whole point of
      // seeding a robust fit with something robust.
      const e = medianError(cam, world, image);
      if (!bestAtF || e < bestAtF.med) bestAtF = { med: e, rms: rms(cam, world, image), cam, markerId: d.marker.id };
    }
    if (!bestAtF) continue;
    curve.push({ f, rms: bestAtF.rms, med: bestAtF.med });
    if (!best || bestAtF.med < best.med) best = { ...bestAtF, f };
  }
  return { seed: best, curve };
}

// --- RANSAC -------------------------------------------------------------------

// Each marker is a 4-point hypothesis. Sampling whole markers rather than
// individual points is the right unit here: four corners of one square are the
// smallest set that determines a plane pose at all.
export function ransacPose(dets, world, image, cx, cy, opts = {}) {
  const thresh = opts.thresh ?? 3.0;
  const sweep = seedByFocalSweep(dets, world, image, cx, cy, opts);
  if (!sweep.seed) return { ok: false, reason: 'no marker produced a usable plane pose' };

  // One marker is a weak global hypothesis: a 172 mm square 900 mm away pins the
  // camera only loosely, and extrapolating that pose to a marker half a metre
  // away misses by tens of pixels even when both markers are perfect. So a raw
  // hypothesis cannot be scored at the final threshold -- it would reject
  // everything, including the truth.
  //
  // Instead each hypothesis is locally optimised before it is judged: gather at a
  // generous gate, refine, tighten, repeat. The gate has to start wider than the
  // hypothesis error and end tighter than the outliers.
  const GATES = opts.gates || [40, 12, thresh];
  let best = null;

  for (const d of dets) {
    if (!d.H) continue;
    const pp = poseFromH(d.H, sweep.seed.f, cx, cy);
    if (!pp) continue;
    const wp = planePoseToWorld(pp, d.marker);
    let cam = Cam.makeCamera({ t: wp.t, f: sweep.seed.f, cx, cy, k1: 0, k2: 0 });
    cam.R = wp.R;
    cam.rvec = rodriguesLog(wp.R);

    let inliers = [];
    for (const gate of GATES) {
      inliers = [];
      for (let i = 0; i < world.length; i++) {
        const p = Cam.project(cam, world[i]);
        if (!p) continue;
        if (Math.hypot(p[0] - image[i][0], p[1] - image[i][1]) < gate) inliers.push(i);
      }
      if (inliers.length < 8) break; // fewer than two markers is not a pose
      const r = refineLM(cam, inliers.map((i) => world[i]), inliers.map((i) => image[i]), opts);
      cam = r.cam;
    }
    // Final gate, against the refined camera.
    inliers = [];
    for (let i = 0; i < world.length; i++) {
      const p = Cam.project(cam, world[i]);
      if (!p) continue;
      if (Math.hypot(p[0] - image[i][0], p[1] - image[i][1]) < thresh) inliers.push(i);
    }
    if (!best || inliers.length > best.inliers.length) best = { cam, inliers, markerId: d.marker.id };
  }
  if (!best || best.inliers.length < 8) return { ok: false, reason: 'no hypothesis kept enough correspondences to fix a pose' };
  return { ok: true, ...best, sweep, thresh };
}

// The whole recovery, from correspondences to a refined camera.
export function solveCamera(dets, world, image, cx, cy, opts = {}) {
  const r = ransacPose(dets, world, image, cx, cy, opts);
  if (!r.ok) return r;
  // Refine on the inlier set, then re-score against everything: refining on a
  // set chosen for agreeing with the seed and then reporting error on that same
  // set would flatter the result.
  const wi = r.inliers.map((i) => world[i]), ii = r.inliers.map((i) => image[i]);
  const useSet = r.inliers.length >= 8 ? { w: wi, i: ii } : { w: world, i: image };
  const ref = refineLM(r.cam, useSet.w, useSet.i, opts);
  return {
    ok: true,
    cam: ref.cam,
    rmsInliers: ref.rms,
    rmsAll: rms(ref.cam, world, image),
    inliers: r.inliers,
    seedMarker: r.markerId,
    sweep: r.sweep,
    lm: { iters: ref.iters, trace: ref.trace, converged: ref.converged },
  };
}
