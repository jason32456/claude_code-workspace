// The measurements. Each one returns numbers, and the page quotes those numbers
// rather than any written into the copy. Where a measurement contradicted what
// this project set out to show, the experiment still runs and the result still
// prints.

import * as S from './scene.js';
import * as C from './camera.js';
import * as P from './pose.js';
import * as PL from './pipeline.js';
import * as A from './anamorph.js';
import { norm3, sub3, rodriguesLog as la_log } from './la.js';
import { mulberry32, gaussian } from './rng.js';

const { W, H } = S.FRAME;

// --- claim 2: the plane the general method cannot solve ------------------------

export function planarDegeneracy() {
  const out = {};
  for (const layout of ['relief', 'planar']) {
    const scene = S.buildScene({ layout, relief: 1 });
    // Exact pinhole correspondences: this is a question about rank, and mixing
    // in lens distortion would confuse "cannot be solved" with "was solved with
    // the wrong model".
    const truth = PL.makeTruthCamera(layout, { k1: 0, k2: 0 });
    const world = [], image = [];
    for (const m of scene.markers) for (const c of m.corners) { world.push(c); image.push(C.project(truth, c).slice(0, 2)); }

    const d = P.dltCamera(world, image);
    const big = d.singular[d.singular.length - 1];
    const zeros = d.singular.filter((s) => s < big * 1e-10).length;
    const dec = P.cameraFromP(d.P);
    const dlt = dec ? { ok: true, ...PL.score(truth, dec.cam, scene), f: dec.cam.f } : { ok: false };

    // The planar route on the identical correspondences.
    const img = PL.photograph(scene, truth);
    const rec = PL.recover(scene, img.rgba);
    const hom = rec.ok ? { ok: true, ...PL.score(truth, rec.sol.cam, scene), f: rec.sol.cam.f } : { ok: false };

    out[layout] = { singular: d.singular, zeros, cond: d.cond, dlt, hom, trueF: truth.f, n: world.length };
  }
  return out;
}

// --- claim 3: how much relief does it take to see focal length? ---------------

// Hold f at a series of values, refine everything else, and record the residual.
// A flat curve means the image cannot tell you f; a curve with a sharp minimum
// means it can.
export function focalCurve(scene, rgba, truthF, opts = {}) {
  const rec = PL.recover(scene, rgba, opts);
  if (!rec.ok) return null;
  const { world, image, dets } = rec.corr;
  const lo = opts.lo ?? 0.55, hi = opts.hi ?? 1.9, steps = opts.steps ?? 30;
  const cx = S.FRAME.W / 2, cy = S.FRAME.H / 2;
  const pts = [];
  const mask = [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1]; // everything except f

  for (let i = 0; i <= steps; i++) {
    const f = truthF * (lo * Math.pow(hi / lo, i / steps));
    // Seed from the plane pose THIS f implies, rather than from the recovered
    // camera. On a degenerate configuration the recovered camera is arbitrary,
    // and seeding every point of the curve from it measures how far the
    // optimiser can crawl rather than how well each focal length fits.
    let seed = null, bestMed = Infinity;
    for (const d of dets) {
      if (!d.H) continue;
      const pp = P.poseFromH(d.H, f, cx, cy);
      if (!pp) continue;
      const wp = P.planePoseToWorld(pp, d.marker);
      const cam = C.makeCamera({ t: wp.t, f, cx, cy, k1: 0, k2: 0 });
      cam.R = wp.R;
      cam.rvec = la_log(wp.R);
      const med = P.medianError(cam, world, image);
      if (med < bestMed) { bestMed = med; seed = cam; }
    }
    if (!seed) continue;
    const r = P.refineLM(seed, world, image, { ...opts, mask });
    pts.push({ f, rms: r.rms, dist: norm3(sub3(C.centre(r.cam), [0, -170, 250])) });
  }
  if (!pts.length) return null;

  let best = pts[0];
  for (const p of pts) if (p.rms < best.rms) best = p;
  // How wide is the valley? The span of f over which the residual stays within
  // 1.5x of its best value, as a fraction of the true f.
  const lim = best.rms * 1.5;
  let fLo = Infinity, fHi = -Infinity;
  for (const p of pts) if (p.rms <= lim) { fLo = Math.min(fLo, p.f); fHi = Math.max(fHi, p.f); }
  return { pts, best, valley: (fHi - fLo) / truthF, fLo, fHi, truthF, recovered: rec.sol.cam.f };
}

export function reliefSweep(reliefs = [0, 0.12, 0.25, 0.5, 0.75, 1.0], opts = {}) {
  const rows = [];
  for (const relief of reliefs) {
    const scene = S.buildScene({ layout: 'steps', relief });
    const truth = PL.makeTruthCamera('steps');
    const img = PL.photograph(scene, truth);
    const spread = S.markerDepthSpread(scene, truth);
    const fc = focalCurve(scene, img.rgba, truth.f, opts);
    if (!fc) { rows.push({ relief, spread, failed: true }); continue; }
    const rec = PL.recover(scene, img.rgba, opts);
    rows.push({
      relief, spread,
      valley: fc.valley, fErrPct: (100 * (fc.recovered - truth.f)) / truth.f,
      curve: fc.pts, best: fc.best, truthF: truth.f,
      score: rec.ok ? PL.score(truth, rec.sol.cam, scene) : null,
    });
  }
  return rows;
}

// --- claim 4: two extra parameters that always help, and can hurt -------------

// Render a TRUE pinhole -- no distortion at all -- then fit with the distortion
// coefficients free and pinned. Free coefficients have two degrees of freedom to
// absorb corner noise that is not radial, so the residual must fall. The
// question is what happens to the pose.
export function distortionOverfit({ sigmas = [0, 0.25, 0.5, 1.0, 2.0], trials = 9 } = {}) {
  const scene = S.buildScene({ layout: 'relief', relief: 1 });
  const truth = PL.makeTruthCamera('relief', { k1: 0, k2: 0 });
  const img = PL.photograph(scene, truth);
  const base = PL.recover(scene, img.rgba, { singlePass: true });
  if (!base.ok) return null;
  const rows = [];
  for (const sigma of sigmas) {
    const acc = { free: { pos: [], rot: [], rms: [] }, pinned: { pos: [], rot: [], rms: [] } };
    for (let t = 0; t < trials; t++) {
      const rand = mulberry32(1000 + t * 77 + Math.round(sigma * 1000));
      const image = base.corr.image.map((p) => [p[0] + gaussian(rand) * sigma, p[1] + gaussian(rand) * sigma]);
      const world = base.corr.world;
      for (const [name, mask] of [
        ['free', [1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1]],
        ['pinned', [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0]],
      ]) {
        const seed = C.clone(base.sol.cam);
        seed.k1 = 0; seed.k2 = 0;
        const r = P.refineLM(seed, world, image, { mask });
        const sc = PL.score(truth, r.cam, scene);
        acc[name].pos.push(sc.posErr);
        acc[name].rot.push(sc.rotErr);
        acc[name].rms.push(r.rms);
      }
    }
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[(s.length / 2) | 0]; };
    rows.push({
      sigma,
      free: { pos: med(acc.free.pos), rot: med(acc.free.rot), rms: med(acc.free.rms) },
      pinned: { pos: med(acc.pinned.pos), rot: med(acc.pinned.rot), rms: med(acc.pinned.rms) },
    });
  }
  return rows;
}

// --- claim 5: spread against count --------------------------------------------

// One image, twelve markers, two subsets of the SAME six-marker size: one spread
// across the frame, one packed into a corner. Everything else is identical --
// the pixels, the marker size, the noise realisation, the camera.
export function spreadVsCount({ sigma = 0.6, trials = 15 } = {}) {
  const scene = S.buildScene({ layout: 'grid', markerCount: 12 });
  const truth = PL.makeTruthCamera('grid');
  const img = PL.photograph(scene, truth);
  const base = PL.recover(scene, img.rgba, { singlePass: true });
  if (!base.ok) return null;

  // Group the correspondences by marker, in the order recover() produced them.
  const groups = base.corr.dets.map((d, i) => ({ id: d.marker.id, idx: [0, 1, 2, 3].map((j) => i * 4 + j) }));
  const byId = new Map(groups.map((g) => [g.id, g]));
  const pick = (ids) => ids.filter((i) => byId.has(i)).flatMap((i) => byId.get(i).idx);

  // Grid is 4 wide, 3 tall: ids 0..3 top row, 4..7 middle, 8..11 bottom.
  const SETS = {
    spread: [0, 3, 5, 6, 8, 11],   // corners plus two centre markers
    clustered: [0, 1, 4, 5, 8, 9], // the left half, packed together
    all12: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };

  const coverage = (idx) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const i of idx) {
      const p = base.corr.image[i];
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    return ((x1 - x0) * (y1 - y0)) / (W * H);
  };

  const out = {};
  for (const [name, ids] of Object.entries(SETS)) {
    const idx = pick(ids);
    if (idx.length < 8) { out[name] = { failed: true }; continue; }
    const pos = [], rot = [], rmsv = [];
    for (let t = 0; t < trials; t++) {
      const rand = mulberry32(5000 + t * 131);
      const image = base.corr.image.map((p) => [p[0] + gaussian(rand) * sigma, p[1] + gaussian(rand) * sigma]);
      const w = idx.map((i) => base.corr.world[i]), im = idx.map((i) => image[i]);
      const r = P.refineLM(C.clone(base.sol.cam), w, im, {});
      const sc = PL.score(truth, r.cam, scene);
      pos.push(sc.posErr); rot.push(sc.rotErr); rmsv.push(r.rms);
    }
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[(s.length / 2) | 0]; };
    out[name] = { markers: ids.length, points: idx.length, coverage: coverage(idx), pos: med(pos), rot: med(rot), rms: med(rmsv) };
  }
  return out;
}

// --- calibrating the oracle ---------------------------------------------------

// How wrong does the camera have to be before the picture visibly fails? Nudge
// the recovered camera by a known amount and measure what the anamorph does.
export function anamorphSensitivity(scene, truth, est, angles = [0, 0.05, 0.1, 0.25, 0.5, 1, 2]) {
  const perfect = A.renderAnamorph(scene, truth, truth, W, H, { ss: 1 });
  const rows = [];
  for (const deg of angles) {
    const step = new Float64Array(C.NP);
    step[1] = (deg * Math.PI) / 180;
    const nudged = deg === 0 ? est : C.applyStep(est, step);
    const got = A.renderAnamorph(scene, nudged, truth, W, H, { ss: 1 });
    const res = A.anamorphResidual(got.rgba, perfect.rgba, W, H);
    rows.push({ deg, rms: res.rms, worst: res.worst });
  }
  return rows;
}

// The revised claim 3. This project set out to show that focal length and
// distance trade off on a plane and that SCENE RELIEF is what breaks the tie.
// The relief sweep says otherwise: f comes back equally well at every relief
// setting, including exactly zero. The reason is that those markers lie on the
// floor and are seen at a steep angle, and a slanted plane already determines f
// on its own -- one homography gives two constraints on the intrinsics, and they
// are only degenerate when the plane is square-on to the camera.
//
// So the controlling variable is the SLANT of the target, not the depth of the
// scene. This sweeps it.
export function slantSweep(slants = [0, 2, 5, 10, 20, 35, 50], opts = {}) {
  const rows = [];
  for (const slantDeg of slants) {
    const scene = S.buildScene({ layout: 'slant', slantDeg });
    const truth = PL.makeTruthCamera('slant');
    const img = PL.photograph(scene, truth);
    const fc = focalCurve(scene, img.rgba, truth.f, { ...opts, lo: 0.62, hi: 1.9, steps: 30 });
    const rec = PL.recover(scene, img.rgba, opts);
    rows.push({
      slantDeg,
      planarity: S.planarity(scene),
      valley: fc ? fc.valley : NaN,
      curve: fc ? fc.pts : [],
      truthF: truth.f,
      fErrPct: rec.ok ? (100 * (rec.sol.cam.f - truth.f)) / truth.f : NaN,
      score: rec.ok ? PL.score(truth, rec.sol.cam, scene) : null,
    });
  }
  return rows;
}
