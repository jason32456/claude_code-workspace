// The anamorph, which is this project's oracle.
//
// Paint every surface point X with the colour the source picture has at
// project(KEY, X). Then look at the result through camera VIEW. The composition
// is the identity exactly when VIEW = KEY, so the picture reassembles from that
// one viewpoint and from nowhere else.
//
// The point is what this makes checkable. A pose is normally graded by a
// reprojection number that a viewer has to take on trust. Here the grader is the
// picture: a camera that is wrong by a fraction of a degree produces a visible
// smear, and nobody has to be told what a millimetre of translation error means.

import { project } from './camera.js';
import { sourceImage, sampleSource, SOURCE_W, SOURCE_H } from './source.js';
import { render } from './raster.js';

// The card occupies the middle of the key camera's frame, so its border sits
// inside the scene rather than running off the edge of every surface.
const INSET = 0.045;

export function makePaint(keyCam, W, H) {
  const img = sourceImage();
  const ox = W * INSET, oy = H * INSET;
  const sw = W * (1 - 2 * INSET), sh = H * (1 - 2 * INSET);
  return (x, y, z, rgb) => {
    const p = project(keyCam, [x, y, z]);
    if (!p) return false;
    const u = ((p[0] - ox) / sw) * (SOURCE_W - 1);
    const v = ((p[1] - oy) / sh) * (SOURCE_H - 1);
    return sampleSource(img, u, v, rgb);
  };
}

// Render the scene painted for `keyCam`, seen from `viewCam`.
export function renderAnamorph(scene, keyCam, viewCam, W, H, opts = {}) {
  return render(scene, viewCam, W, H, { ...opts, paint: makePaint(keyCam, W, H) });
}

// How far off is the reassembled picture? Compared against the render that a
// perfect recovery would give -- the same scene painted for the true camera and
// seen from it -- so this measures pose error alone and not which surfaces
// happen to be covered.
export function anamorphResidual(a, b, W, H) {
  let s = 0, n = 0, worst = 0;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    for (let c = 0; c < 3; c++) {
      const d = a[o + c] - b[o + c];
      s += d * d;
      if (Math.abs(d) > worst) worst = Math.abs(d);
    }
    n += 3;
  }
  return { rms: Math.sqrt(s / n), worst };
}
