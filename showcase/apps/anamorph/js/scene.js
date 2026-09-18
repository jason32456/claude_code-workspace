// The scene. The world is Y-DOWN, the OpenCV convention: a camera looking along
// +Z with image v increasing downward is then an ordinary right-handed frame
// with determinant +1. Authoring with Y up instead would quietly make every
// camera a reflection, which is the sort of thing that still renders.
//
// Distances are millimetres.

import { markerTexel, CODEBOOK } from './markers.js';
import { cross3, unit3, sub3, symEig } from './la.js';

const EPS = 0.35; // lift decals off their surface so they do not z-fight

function quad(v0, v1, v2, v3, colour, opts = {}) {
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const shade = opts.tex ? opts.tex : () => colour;
  const V = [v0, v1, v2, v3];
  const t1 = { v: [V[0], V[1], V[2]], uv: [uv[0], uv[1], uv[2]], shadeColour: shade, paintable: opts.paintable !== false, kind: opts.kind || 'surface', marker: opts.marker };
  const t2 = { v: [V[0], V[2], V[3]], uv: [uv[0], uv[2], uv[3]], shadeColour: shade, paintable: opts.paintable !== false, kind: opts.kind || 'surface', marker: opts.marker };
  return [t1, t2];
}

function box(min, max, colour) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const P = {
    a: [x0, y0, z0], b: [x1, y0, z0], c: [x1, y1, z0], d: [x0, y1, z0],
    e: [x0, y0, z1], f: [x1, y0, z1], g: [x1, y1, z1], h: [x0, y1, z1],
  };
  const sh = (k) => [colour[0] * k, colour[1] * k, colour[2] * k];
  return [
    ...quad(P.a, P.b, P.c, P.d, sh(1.0)),   // -Z face
    ...quad(P.f, P.e, P.h, P.g, sh(0.9)),   // +Z face
    ...quad(P.e, P.a, P.d, P.h, sh(0.82)),  // -X face
    ...quad(P.b, P.f, P.g, P.c, sh(0.95)),  // +X face
    ...quad(P.e, P.f, P.b, P.a, sh(1.08)),  // top (y = y0, Y-down so this is up)
    ...quad(P.d, P.c, P.g, P.h, sh(0.7)),   // bottom
  ];
}

// A marker is an 8x8-cell decal. The corners the detector actually finds are the
// outer corners of the BLACK BORDER, at uv 1/8 and 7/8 -- not the corners of the
// quad -- so ground truth has to be stated there too.
export function markerQuad(m) {
  const { origin, right, down, size } = m;
  const at = (u, v) => [
    origin[0] + right[0] * u * size + down[0] * v * size,
    origin[1] + right[1] * u * size + down[1] * v * size,
    origin[2] + right[2] * u * size + down[2] * v * size,
  ];
  return [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
}

export function markerBorderCorners(m) {
  const { origin, right, down, size } = m;
  const a = 1 / 8, b = 7 / 8;
  const at = (u, v) => [
    origin[0] + right[0] * u * size + down[0] * v * size,
    origin[1] + right[1] * u * size + down[1] * v * size,
    origin[2] + right[2] * u * size + down[2] * v * size,
  ];
  return [at(a, a), at(b, a), at(b, b), at(a, b)];
}

function markerTris(m) {
  const [v0, v1, v2, v3] = markerQuad(m);
  const tex = (u, v) => { const g = markerTexel(m.id, u, v); return [g, g, g]; };
  return quad(v0, v1, v2, v3, [1, 1, 1], { tex, kind: 'marker', marker: m, paintable: true });
}

// Each layout gets its own viewpoint, chosen so that every marker is fully
// inside the frame with margin at every setting the experiments sweep. A camera
// that clips a marker is not measuring what the experiment thinks it is.
export const VIEWS = {
  relief: { eye: [240, -460, -460], target: [0, -240, 200], f: 800 },
  steps: { eye: [200, -660, -580], target: [0, -80, 400], f: 840 },
  planar: { eye: [-80, -520, -650], target: [0, -140, 200], f: 920 },
  grid: { eye: [-40, -560, -620], target: [0, -120, 260], f: 860 },
  slant: { eye: [0, -250, -650], target: [0, -250, 250], f: 820 },
  clustered: { eye: [-80, -520, -650], target: [0, -140, 200], f: 920 },
};

export const FRAME = { W: 800, H: 600 };

// --- layouts -----------------------------------------------------------------
// `relief` is the depth range the markers span. Driving it to zero puts every
// marker on one plane, which is the configuration claim 2 is about.

export function buildScene({ layout = 'relief', relief = 1.0, markerCount = 6, slantDeg = 0 } = {}) {
  const tris = [];
  const markers = [];

  const FLOOR = 0, BACK = 660, LEFT = -470, RIGHT = 470, TOP = -660;

  // Room
  tris.push(...quad([LEFT, FLOOR, -900], [RIGHT, FLOOR, -900], [RIGHT, FLOOR, BACK], [LEFT, FLOOR, BACK], [0.30, 0.31, 0.34]));
  tris.push(...quad([LEFT, TOP, BACK], [RIGHT, TOP, BACK], [RIGHT, FLOOR, BACK], [LEFT, FLOOR, BACK], [0.38, 0.39, 0.43]));
  tris.push(...quad([LEFT, TOP, -900], [LEFT, TOP, BACK], [LEFT, FLOOR, BACK], [LEFT, FLOOR, -900], [0.26, 0.27, 0.30]));
  tris.push(...quad([RIGHT, TOP, BACK], [RIGHT, TOP, -900], [RIGHT, FLOOR, -900], [RIGHT, FLOOR, BACK], [0.26, 0.27, 0.30]));
  tris.push(...quad([LEFT, TOP, BACK], [RIGHT, TOP, BACK], [RIGHT, TOP, -900], [LEFT, TOP, -900], [0.22, 0.23, 0.26]));

  const S = 172; // marker edge, mm

  if (layout === 'planar' || layout === 'clustered') {
    // Every marker flat on the floor. `planar` spreads them across the frame,
    // `clustered` crams the same count into one corner -- claim 2 and claim 5
    // respectively, and the only difference between them is where they sit.
    const spread = layout === 'planar';
    const pitchX = spread ? 272 : 150, pitchZ = spread ? 250 : 136;
    const x0 = spread ? -318 : -290, z0 = spread ? 70 : 150;
    const sz = spread ? S : S * 0.72;
    for (let i = 0; i < markerCount; i++) {
      const r = Math.floor(i / 3), c = i % 3;
      markers.push({
        id: i, origin: [x0 + c * pitchX, FLOOR - EPS, z0 + r * pitchZ],
        right: [1, 0, 0], down: [0, 0, 1], size: sz, surface: 'floor',
      });
    }
  } else if (layout === 'slant') {
    // A single planar target facing the camera, tilted about the vertical axis
    // by `slantDeg`. At zero it is fronto-parallel: every marker lies at the
    // same depth, square in the image. This is the configuration claim 3 sweeps.
    const th = (slantDeg * Math.PI) / 180;
    const ct = Math.cos(th), st = Math.sin(th);
    // right is rotated about world Y (vertical, since Y is down); down is not.
    const right = [-ct, 0, st];
    const down = [0, 1, 0];
    const centre = [0, -250, 250];
    const sz = 150, gapU = 190, gapV = 190;
    for (let i = 0; i < Math.min(markerCount, 6); i++) {
      const r = Math.floor(i / 3), c = i % 3;
      const u = (c - 1) * gapU - sz / 2, vv = (r - 0.5) * gapV - sz / 2;
      markers.push({
        id: i,
        origin: [
          centre[0] + right[0] * u + down[0] * vv,
          centre[1] + right[1] * u + down[1] * vv,
          centre[2] + right[2] * u + down[2] * vv,
        ],
        right, down, size: sz, surface: 'target',
      });
    }
  } else if (layout === 'grid') {
    // Twelve markers on the floor in a 4x3 grid covering the frame. Claim 5 uses
    // this one image twice, choosing a spread subset and a clustered subset from
    // the SAME twelve, so count, size, noise, camera and pixels are all held
    // fixed and the only thing that varies is where in the frame the chosen
    // markers sit.
    const sz = 118, pitchX = 196, pitchZ = 190;
    for (let i = 0; i < Math.min(markerCount, 12); i++) {
      const r = Math.floor(i / 4), c = i % 4;
      markers.push({
        id: i, origin: [-352 + c * pitchX, FLOOR - EPS, 90 + r * pitchZ],
        right: [1, 0, 0], down: [0, 0, 1], size: sz, surface: 'floor',
      });
    }
  } else if (layout === 'steps') {
    // Six markers parallel to the floor, each lifted out of it by `relief` times
    // its own fixed height, on a pedestal. At relief = 0 they are exactly
    // coplanar; at relief = 1 they span a few hundred millimetres of depth. This
    // is the layout claim 3 sweeps, because it varies the one quantity in
    // question and nothing else.
    const H = [0, 70, 150, 240, 330, 420];
    for (let i = 0; i < Math.min(markerCount, 6); i++) {
      const r = Math.floor(i / 3), c = i % 3;
      const x = -330 + c * 300, z = 90 + r * 250;
      const h = H[i] * relief;
      if (h > 4) {
        tris.push(...box([x - 6, FLOOR - h, z - 6], [x + S + 6, FLOOR, z + S + 6], [0.33, 0.35, 0.40]));
      }
      markers.push({
        id: i, origin: [x, FLOOR - h - EPS, z],
        right: [1, 0, 0], down: [0, 0, 1], size: S, surface: 'step',
      });
    }
  } else {
    // The demo scene: markers on the floor, both walls, and the faces and top of
    // three boxes, so the configuration has genuine relief and four distinct
    // surface orientations.
    const k = relief;
    const boxes = [
      { min: [-390, FLOOR - 210 * k, 300], max: [-165, FLOOR, 510], col: [0.52, 0.42, 0.36] },
      { min: [60, FLOOR - 95 * k, 140], max: [330, FLOOR, 380], col: [0.35, 0.45, 0.52] },
      { min: [-110, FLOOR - 340 * k, 460], max: [120, FLOOR, 630], col: [0.44, 0.40, 0.52] },
    ];
    for (const b of boxes) if (k > 0.02) tris.push(...box(b.min, b.max, b.col));

    const faceY = (b, frac) => b.min[1] + (b.max[1] - b.min[1]) * frac;
    const cand = [
      { origin: [-330, FLOOR - EPS, 60], right: [1, 0, 0], down: [0, 0, 1], size: S, surface: 'floor' },
      { origin: [170, FLOOR - 320 * k - S, BACK - EPS], right: [1, 0, 0], down: [0, 1, 0], size: S, surface: 'wall' },
      { origin: [LEFT + EPS, FLOOR - 250 * k - S, 250], right: [0, 0, 1], down: [0, 1, 0], size: S, surface: 'leftwall' },
      { origin: [-375, faceY(boxes[0], 0.06), 300 - EPS], right: [1, 0, 0], down: [0, 1, 0], size: S * 0.92, surface: 'box' },
      { origin: [110, boxes[1].min[1] - EPS, 175], right: [1, 0, 0], down: [0, 0, 1], size: S * 0.85, surface: 'boxtop' },
      { origin: [-88, faceY(boxes[2], 0.08), 460 - EPS], right: [1, 0, 0], down: [0, 1, 0], size: S * 0.92, surface: 'box' },
      { origin: [330, FLOOR - EPS, 120], right: [1, 0, 0], down: [0, 0, 1], size: S * 0.85, surface: 'floor' },
      { origin: [-430, FLOOR - 200 * k - S * 0.85, BACK - EPS], right: [1, 0, 0], down: [0, 1, 0], size: S * 0.85, surface: 'wall' },
      { origin: [-180, FLOOR - EPS, 150], right: [1, 0, 0], down: [0, 0, 1], size: S * 0.8, surface: 'floor' },
      { origin: [LEFT + EPS, FLOOR - 90 * k - S * 0.8, 430], right: [0, 0, 1], down: [0, 1, 0], size: S * 0.8, surface: 'leftwall' },
    ];
    for (let i = 0; i < Math.min(markerCount, cand.length, CODEBOOK.length); i++) {
      markers.push({ id: i, ...cand[i] });
    }
  }

  // Every marker must face the room, not the wall it is glued to. A marker whose
  // right x down points away from the viewer projects with the opposite corner
  // winding from one that faces it, and a mirrored bit grid matches no ROTATION
  // of any code in the book -- so it silently fails to decode, or worse, decodes
  // as something else. Flipping `right` and sliding the origin along it leaves
  // the marker's footprint in the world exactly where it was and reverses only
  // the winding.
  const eye = (VIEWS[layout] || VIEWS.relief).eye;
  for (const m of markers) {
    const n = unit3(cross3(m.right, m.down));
    const centre = [
      m.origin[0] + (m.right[0] + m.down[0]) * m.size / 2,
      m.origin[1] + (m.right[1] + m.down[1]) * m.size / 2,
      m.origin[2] + (m.right[2] + m.down[2]) * m.size / 2,
    ];
    const toEye = sub3(eye, centre);
    if (n[0] * toEye[0] + n[1] * toEye[1] + n[2] * toEye[2] < 0) {
      m.origin = [m.origin[0] + m.right[0] * m.size, m.origin[1] + m.right[1] * m.size, m.origin[2] + m.right[2] * m.size];
      m.right = [-m.right[0], -m.right[1], -m.right[2]];
    }
    m.normal = unit3(cross3(m.right, m.down));
    m.corners = markerBorderCorners(m);
    tris.push(...markerTris(m));
  }

  // Scene vertices the solver never sees a correspondence for. Reprojection
  // error on these is the number that actually says whether the camera is right.
  const holdout = [];
  for (const t of tris) if (t.kind !== 'marker') for (const v of t.v) holdout.push(v);
  const dedup = [];
  for (const v of holdout) {
    if (!dedup.some((w) => Math.abs(w[0] - v[0]) < 1e-6 && Math.abs(w[1] - v[1]) < 1e-6 && Math.abs(w[2] - v[2]) < 1e-6)) dedup.push(v);
  }

  return { tris, markers, holdout: dedup, layout, relief };
}

// The depth range the markers actually span, in mm -- the quantity claim 3
// sweeps. Measured off the marker corners rather than assumed from `relief`.
export function markerDepthSpread(scene, cam) {
  let lo = Infinity, hi = -Infinity;
  for (const m of scene.markers) {
    for (const c of m.corners) {
      const z = cam.R[6] * c[0] + cam.R[7] * c[1] + cam.R[8] * c[2] + cam.t[2];
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
  }
  return hi - lo;
}


// How far from coplanar are the marker corners, in millimetres? Measured as the
// RMS distance to the best-fit plane, so a flat target reads exactly zero. This
// is what "relief" has to mean for claim 3 -- the spread of depth in the camera
// frame is not the same thing, because a flat floor seen at a slant has plenty
// of depth spread and no relief at all.
export function planarity(scene) {
  const pts = [];
  for (const m of scene.markers) for (const c of m.corners) pts.push(c);
  const n = pts.length;
  if (n < 4) return 0;
  const mu = [0, 0, 0];
  for (const p of pts) { mu[0] += p[0] / n; mu[1] += p[1] / n; mu[2] += p[2] / n; }
  // Smallest eigenvector of the scatter matrix is the plane normal.
  const S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const d = [p[0] - mu[0], p[1] - mu[1], p[2] - mu[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i * 3 + j] += d[i] * d[j];
  }
  const { vectors } = symEig({ m: 3, n: 3, d: Float64Array.from(S) });
  const nrm = vectors[0];
  let s = 0;
  for (const p of pts) {
    const d = (p[0] - mu[0]) * nrm[0] + (p[1] - mu[1]) * nrm[1] + (p[2] - mu[2]) * nrm[2];
    s += d * d;
  }
  return Math.sqrt(s / n);
}
