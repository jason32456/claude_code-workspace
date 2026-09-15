// Scene -> photograph -> correspondences -> camera. The one path everything on
// the page goes through, so the demo and the experiments cannot drift apart.

import * as S from './scene.js';
import * as C from './camera.js';
import * as R from './raster.js';
import * as D from './detect.js';
import * as M from './markers.js';
import * as P from './pose.js';
import { homography } from './homography.js';
import { norm3, sub3 } from './la.js';
import { mulberry32, gaussian } from './rng.js';

export const MARKER_LOCAL = [[0, 0], [1, 0], [1, 1], [0, 1]];

export function makeTruthCamera(layout, over = {}) {
  const v = S.VIEWS[layout] || S.VIEWS.relief;
  return C.lookAt(v.eye, v.target, [0, 1, 0], {
    f: over.f ?? v.f,
    cx: over.cx ?? S.FRAME.W / 2,
    cy: over.cy ?? S.FRAME.H / 2,
    k1: over.k1 ?? -0.14,
    k2: over.k2 ?? 0.03,
  });
}

export function photograph(scene, cam, opts = {}) {
  return R.render(scene, cam, S.FRAME.W, S.FRAME.H, { ss: opts.ss ?? 2 });
}

// Pair detected image corners with the world points they correspond to, and
// build each marker's own local->image homography for the plane-pose seed.
export function correspondences(res, scene, noise = 0, seed = 1) {
  const rand = mulberry32(seed);
  const world = [], image = [], dets = [];
  for (const d of res.markers) {
    const m = scene.markers.find((x) => x.id === d.id);
    if (!m) continue;
    const quad = noise > 0
      ? d.quad.map((p) => [p[0] + gaussian(rand) * noise, p[1] + gaussian(rand) * noise])
      : d.quad;
    // The marker's border corners in its own millimetres, matching the world
    // corners markerBorderCorners() returns.
    const side = m.size * 0.75;
    const local = MARKER_LOCAL.map(([u, v]) => [u * side, v * side]);
    const Hm = homography([0, 1, 2, 3].map((j) => local[(4 - d.rot + j) % 4]), quad);
    for (let j = 0; j < 4; j++) {
      world.push(m.corners[(4 - d.rot + j) % 4]);
      image.push(quad[j]);
    }
    dets.push({ marker: m, H: Hm ? Hm.H : null, det: d, quad });
  }
  return { world, image, dets };
}

// The full recovery. Pass 1 runs blind; pass 2 re-reads the markers knowing the
// lens the first pass recovered.
export function recover(scene, rgba, opts = {}) {
  const { W, H } = S.FRAME;
  const cx = W / 2, cy = H / 2;
  const blind = C.lensOf(C.makeCamera({ f: W, cx, cy, k1: 0, k2: 0 }));
  const res1 = D.detectMarkers(rgba, W, H, M.decode, { lens: blind });
  const c1 = correspondences(res1, scene, opts.noise || 0, opts.seed || 1);
  if (c1.world.length < 8) return { ok: false, reason: `only ${c1.world.length / 4} markers found; the pose needs at least two`, res: res1 };
  const sol1 = P.solveCamera(c1.dets, c1.world, c1.image, cx, cy, opts);
  if (!sol1.ok) return { ...sol1, res: res1 };

  if (opts.singlePass) return { ok: true, res: res1, corr: c1, sol: sol1, pass1: { res: res1, corr: c1, sol: sol1 }, passes: 1 };

  const res2 = D.detectMarkers(rgba, W, H, M.decode, { lens: C.lensOf(sol1.cam) });
  const c2 = correspondences(res2, scene, opts.noise || 0, opts.seed || 1);
  let sol2 = sol1, used = { res: res1, corr: c1 };
  if (c2.world.length >= 8) {
    const s = P.solveCamera(c2.dets, c2.world, c2.image, cx, cy, opts);
    if (s.ok) { sol2 = s; used = { res: res2, corr: c2 }; }
  }
  return { ok: true, res: used.res, corr: used.corr, sol: sol2, pass1: { res: res1, corr: c1, sol: sol1 }, passes: 2 };
}

// Everything the page reports about how good a recovery is. Ground truth goes in
// here and nowhere upstream.
export function score(truth, est, scene) {
  const cT = C.centre(truth), cE = C.centre(est);
  const posErr = norm3(sub3(cT, cE));
  const rotErr = C.rotationErrorDeg(truth.R, est.R);
  let s = 0, n = 0;
  for (const X of scene.holdout) {
    const a = C.project(truth, X), b = C.project(est, X);
    if (!a || !b) continue;
    if (a[0] < 0 || a[0] > S.FRAME.W || a[1] < 0 || a[1] > S.FRAME.H) continue;
    s += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2; n++;
  }
  return {
    posErr, rotErr,
    fErr: est.f - truth.f,
    fErrPct: (100 * (est.f - truth.f)) / truth.f,
    k1Err: est.k1 - truth.k1,
    holdoutRms: n ? Math.sqrt(s / n) : NaN,
    holdoutN: n,
    distance: norm3(sub3(cT, [0, -170, 250])),
  };
}
