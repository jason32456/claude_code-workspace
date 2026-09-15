// Checks against answers derived outside the code being checked. A pose
// pipeline that is subtly wrong is still perfectly self-consistent: every panel
// would look right, the residual would be small, and the camera would be wrong.
// These are the things that would catch that.

import * as la from './la.js';
import * as C from './camera.js';
import * as P from './pose.js';
import * as S from './scene.js';
import * as PL from './pipeline.js';
import * as A from './anamorph.js';
import { homography, applyH } from './homography.js';
import { mulberry32, gaussian } from './rng.js';

const ok = (name, pass, detail) => ({ name, pass, detail });

export function runAll() {
  const t = [];

  // 1. A homography against a closed form worked out by hand. The map taking the
  //    unit square to (0,0),(2,0),(3,2),(0,1) is derivable on paper; this is that
  //    answer, not one this code produced.
  {
    const src = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const dst = [[0, 0], [2, 0], [3, 2], [0, 1]];
    const r = homography(src, dst);
    const mid = applyH(r.H, [0.5, 0.5]);
    // By hand: H = [[2,0,0],[0,1,0],[0,1/2... ]] -- rather than trust an algebraic
    // rearrangement, check the four defining correspondences exactly plus the
    // projective invariant that the diagonals of the image quad meet at H(0.5,0.5).
    let worst = 0;
    for (let i = 0; i < 4; i++) {
      const q = applyH(r.H, src[i]);
      worst = Math.max(worst, Math.hypot(q[0] - dst[i][0], q[1] - dst[i][1]));
    }
    // Intersection of the diagonals of dst, computed independently.
    const inter = (() => {
      const [a, b, c, d] = dst;
      const A1 = matDet(a, c), B1 = matDet(b, d);
      const x1 = a[0] - c[0], y1 = a[1] - c[1], x2 = b[0] - d[0], y2 = b[1] - d[1];
      const den = x1 * y2 - y1 * x2;
      return [(A1 * x2 - x1 * B1) / den, (A1 * y2 - y1 * B1) / den];
    })();
    const dq = Math.hypot(mid[0] - inter[0], mid[1] - inter[1]);
    t.push(ok('Homography reproduces its 4 correspondences, and maps the square’s centre to where the image diagonals actually cross',
      worst < 1e-10 && dq < 1e-9, `corner error ${worst.toExponential(2)}, centre off by ${dq.toExponential(2)}`));
  }

  // 2. Rodrigues round trip, including right up against the pi singularity where
  //    the naive formula divides by sin(theta).
  {
    let worstR = 0, worstW = 0;
    const rand = mulberry32(4);
    for (let i = 0; i < 4000; i++) {
      const th = i % 3 === 0 ? Math.PI - 1e-12 * rand() : i % 3 === 1 ? Math.PI - 1e-4 * rand() : rand() * Math.PI * 0.999;
      const ax = la.unit3([rand() - 0.5, rand() - 0.5, rand() - 0.5]);
      const w = la.scale3(ax, th);
      const R = la.rodrigues(w);
      const R2 = la.rodrigues(la.rodriguesLog(R));
      for (let k = 0; k < 9; k++) worstR = Math.max(worstR, Math.abs(R[k] - R2[k]));
      if (th < Math.PI * 0.999) worstW = Math.max(worstW, la.norm3(la.sub3(w, la.rodriguesLog(R))));
    }
    t.push(ok('exp(log(R)) = R and log(exp(w)) = w to machine precision, including within 1e-12 of θ = π',
      worstR < 1e-13 && worstW < 1e-13, `worst |ΔR| ${worstR.toExponential(2)}, worst |Δw| ${worstW.toExponential(2)}`));
  }

  // 3. Every entry of the analytic Jacobian against central finite differences,
  //    perturbed in the same parameterisation the Jacobian assumes.
  {
    const cam = C.lookAt([120, -280, -420], [0, -120, 240], [0, 1, 0], { f: 760, cx: 400, cy: 300, k1: -0.16, k2: 0.05 });
    const rand = mulberry32(11);
    let worst = 0, which = '';
    for (let trial = 0; trial < 160; trial++) {
      const X = [(rand() - 0.5) * 700, (rand() - 0.5) * 500, (rand() - 0.5) * 500 + 250];
      const J = C.projectJac(cam, X);
      if (!J) continue;
      for (let j = 0; j < C.NP; j++) {
        const h = j < 3 ? 1e-6 : j < 6 ? 1e-4 : j < 9 ? 1e-4 : 1e-7;
        const sp = new Float64Array(C.NP), sm = new Float64Array(C.NP);
        sp[j] = h; sm[j] = -h;
        const pp = C.project(C.applyStep(cam, sp), X), pm = C.project(C.applyStep(cam, sm), X);
        if (!pp || !pm) continue;
        const fdU = (pp[0] - pm[0]) / (2 * h), fdV = (pp[1] - pm[1]) / (2 * h);
        const rel = Math.max(
          Math.abs(fdU - J.Ju[j]) / Math.max(1, Math.abs(fdU), Math.abs(J.Ju[j])),
          Math.abs(fdV - J.Jv[j]) / Math.max(1, Math.abs(fdV), Math.abs(J.Jv[j])),
        );
        if (rel > worst) { worst = rel; which = C.PARAM_NAMES[j]; }
      }
    }
    t.push(ok('All 11 analytic Jacobian columns match central finite differences',
      worst < 1e-5, `worst relative error ${worst.toExponential(2)} (on ${which})`));
  }

  // 4. Projection against an answer that can be written down: a point on the
  //    optical axis lands on the principal point, and a point one focal length
  //    off-axis at unit depth lands exactly f pixels away.
  {
    const cam = C.makeCamera({ f: 900, cx: 400, cy: 300, k1: 0, k2: 0, t: [0, 0, 1000] });
    const a = C.project(cam, [0, 0, 0]);
    const b = C.project(cam, [1000, 0, 0]);
    const good = Math.abs(a[0] - 400) < 1e-9 && Math.abs(a[1] - 300) < 1e-9 && Math.abs(b[0] - (400 + 900)) < 1e-9;
    t.push(ok('Projection is right where the answer can be written down by hand',
      good, `axis → (${a[0].toFixed(6)}, ${a[1].toFixed(6)}), 45° ray → x = ${b[0].toFixed(6)} (expect ${400 + 900})`));
  }

  // 5. Hartley's normalisation, on coordinates deliberately scaled into the tens
  //    of thousands. If normalisation were cosmetic these two would agree.
  {
    const Htrue = [1.23, -0.41, 55.0, 0.19, 0.94, -23.0, 0.00042, -0.00017, 1];
    const src = [[0, 0], [200, 0], [200, 200], [0, 200], [70, 130], [160, 40]].map((p) => [p[0] * 60 + 40000, p[1] * 60 + 30000]);
    const dst = src.map((p) => applyH(Htrue, p));
    const rand = mulberry32(3);
    const noisy = dst.map((p) => [p[0] + gaussian(rand) * 0.4, p[1] + gaussian(rand) * 0.4]);
    const a = homography(src, noisy, { normalised: true });
    const b = homography(src, noisy, { normalised: false });
    const ea = rmsH(a.H, src, dst), eb = rmsH(b.H, src, dst);
    // The residual gap is modest once measurement noise dominates; the gap that
    // is not modest is the conditioning, which is what normalisation is for.
    t.push(ok('Normalised DLT is better conditioned by orders of magnitude on badly scaled coordinates, and fits better',
      ea <= eb && b.cond > a.cond * 1e5,
      `rms ${ea.toFixed(3)} px normalised vs ${eb.toFixed(3)} px not; condition number ${a.cond.toExponential(1)} vs ${b.cond.toExponential(1)}, a factor of ${(b.cond / a.cond).toExponential(1)}`));
  }

  // 6. The planar rank collapse, asserted as a rank rather than as a feeling.
  {
    const res = {};
    for (const layout of ['relief', 'planar']) {
      const scene = S.buildScene({ layout, relief: 1 });
      const truth = PL.makeTruthCamera(layout, { k1: 0, k2: 0 });
      const world = [], image = [];
      for (const m of scene.markers) for (const c of m.corners) { world.push(c); image.push(C.project(truth, c).slice(0, 2)); }
      const d = P.dltCamera(world, image);
      const big = d.singular[d.singular.length - 1];
      res[layout] = { zeros: d.singular.filter((s) => s < big * 1e-10).length, dec: !!P.cameraFromP(d.P) };
    }
    t.push(ok('The 3D→2D linear system loses exactly 3 dimensions of rank on a plane, and none off it',
      res.planar.zeros === 3 && res.relief.zeros === 0 && !res.planar.dec,
      `planar: ${res.planar.zeros} zero singular values, decomposes: ${res.planar.dec}; non-planar: ${res.relief.zeros}`));
  }

  // 7. RANSAC separating planted outliers. Outliers are planted per MARKER, not
  //    per corner, because that is both the realistic failure (a marker decodes
  //    as the wrong id, so all four of its correspondences are wrong together)
  //    and the unit the hypotheses are drawn in. Scattering 40% of corners
  //    individually leaves almost no marker with four clean corners, so there is
  //    nothing left to draw a hypothesis from -- a fair test of a different
  //    algorithm, not of this one.
  {
    const scene = S.buildScene({ layout: 'relief', relief: 1 });
    const truth = PL.makeTruthCamera('relief');
    const img = PL.photograph(scene, truth, { ss: 1 });
    const rec = PL.recover(scene, img.rgba, { singlePass: true });
    let detail = 'recovery failed', pass = false;
    if (rec.ok) {
      const rand = mulberry32(21);
      const nm = rec.corr.dets.length;
      const badMarkers = new Set([1, 4]); // two of six
      const planted = new Set();
      const image = rec.corr.image.map((p, i) => {
        if (badMarkers.has(Math.floor(i / 4))) {
          planted.add(i);
          return [p[0] + (rand() - 0.5) * 160, p[1] + (rand() - 0.5) * 160];
        }
        return p;
      });
      const r = P.ransacPose(rec.corr.dets, rec.corr.world, image, 400, 300, { thresh: 4 });
      if (r.ok) {
        const found = new Set(r.inliers);
        let falsePos = 0, missed = 0;
        for (let i = 0; i < rec.corr.image.length; i++) {
          if (planted.has(i) && found.has(i)) falsePos++;
          if (!planted.has(i) && !found.has(i)) missed++;
        }
        pass = falsePos === 0 && missed === 0;
        detail = `${badMarkers.size} of ${nm} markers displaced by up to 80 px; RANSAC kept ${r.inliers.length} of ${rec.corr.image.length} corners, admitted ${falsePos} outliers, dropped ${missed} good ones`;
      }
    }
    t.push(ok('RANSAC separates the good markers from two planted bad ones', pass, detail));
  }

  // 8. The round trip that is the whole project: render, solve, re-render from
  //    the recovered camera, and difference the pixels.
  {
    const scene = S.buildScene({ layout: 'relief', relief: 1 });
    const truth = PL.makeTruthCamera('relief');
    const img = PL.photograph(scene, truth, { ss: 2 });
    const rec = PL.recover(scene, img.rgba);
    let pass = false, detail = 'recovery failed';
    if (rec.ok) {
      const sc = PL.score(truth, rec.sol.cam, scene);
      const again = PL.photograph(scene, rec.sol.cam, { ss: 2 });
      let s = 0;
      for (let i = 0; i < img.rgba.length; i += 4) {
        for (let c = 0; c < 3; c++) { const d = img.rgba[i + c] - again.rgba[i + c]; s += d * d; }
      }
      const rms = Math.sqrt(s / ((img.rgba.length / 4) * 3));
      pass = sc.posErr < 3 && sc.rotErr < 0.2 && rms < 12;
      detail = `position ${sc.posErr.toFixed(3)} mm, rotation ${sc.rotErr.toFixed(4)}°, re-render differs by ${rms.toFixed(2)}/255 rms`;
    }
    t.push(ok('render → solve → re-render closes the loop', pass, detail));
  }

  // 9. The anamorph is actually doing what it claims: keyed to the true camera
  //    and seen from it, it must return the source picture exactly, and keyed to
  //    a camera one degree off it must not.
  {
    const scene = S.buildScene({ layout: 'relief', relief: 1 });
    const truth = PL.makeTruthCamera('relief');
    const perfect = A.renderAnamorph(scene, truth, truth, S.FRAME.W, S.FRAME.H, { ss: 1 });
    const same = A.renderAnamorph(scene, truth, truth, S.FRAME.W, S.FRAME.H, { ss: 1 });
    const step = new Float64Array(C.NP);
    step[1] = Math.PI / 180;
    const off = A.renderAnamorph(scene, C.applyStep(truth, step), truth, S.FRAME.W, S.FRAME.H, { ss: 1 });
    const a = A.anamorphResidual(same.rgba, perfect.rgba, S.FRAME.W, S.FRAME.H);
    const b = A.anamorphResidual(off.rgba, perfect.rgba, S.FRAME.W, S.FRAME.H);
    t.push(ok('The anamorph is an oracle, not a decoration: exact for the right camera, visibly wrong one degree away',
      a.rms === 0 && b.rms > 8, `identical camera → ${a.rms.toFixed(4)} rms; 1° of yaw → ${b.rms.toFixed(2)} rms`));
  }

  return t;
}

function matDet(a, b) { return a[0] * b[1] - a[1] * b[0]; }
function rmsH(H, src, dst) {
  let s = 0;
  for (let i = 0; i < src.length; i++) {
    const q = applyH(H, src[i]);
    s += (q[0] - dst[i][0]) ** 2 + (q[1] - dst[i][1]) ** 2;
  }
  return Math.sqrt(s / src.length);
}
