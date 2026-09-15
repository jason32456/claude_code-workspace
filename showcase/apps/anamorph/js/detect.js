// Finding the markers. The solver's whole input is an RGBA buffer; it never sees
// the scene, the camera, or where anything is meant to be.
//
//   grey -> Otsu threshold -> connected components -> outer contour ->
//   polygon approximation -> 4-gon filter -> unwarp -> read bits -> decode ->
//   sub-pixel corner refinement
//
// Nothing here is tuned against the answer. The one threshold that matters
// (Otsu's) is computed from the histogram rather than chosen.

import { homography, applyH } from './homography.js';
import { solve, matFrom } from './la.js';

export function greyscale(rgba, W, H) {
  const g = new Float32Array(W * H);
  for (let i = 0, o = 0; i < W * H; i++, o += 4) {
    g[i] = (0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]) / 255;
  }
  return g;
}

// Otsu: the threshold that maximises between-class variance. No parameter.
export function otsu(g) {
  const bins = 256, hist = new Float64Array(bins);
  for (let i = 0; i < g.length; i++) hist[Math.min(255, Math.max(0, Math.round(g[i] * 255)))]++;
  const total = g.length;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = -1, thr = 0;
  for (let i = 0; i < bins; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = i; }
  }
  return thr / 255;
}

// Label the dark regions. 4-connectivity, iterative flood fill (a recursive one
// blows the stack on a big blob).
export function components(g, W, H, thr) {
  const labels = new Int32Array(W * H).fill(-1);
  const stack = new Int32Array(W * H);
  const comps = [];
  for (let start = 0; start < W * H; start++) {
    if (labels[start] !== -1 || g[start] >= thr) continue;
    const id = comps.length;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = id;
    let n = 0, minx = W, maxx = -1, miny = H, maxy = -1, first = start;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % W, y = (p / W) | 0;
      n++;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) { miny = y; first = p; }
      if (y > maxy) maxy = y;
      if (x > 0 && labels[p - 1] === -1 && g[p - 1] < thr) { labels[p - 1] = id; stack[sp++] = p - 1; }
      if (x < W - 1 && labels[p + 1] === -1 && g[p + 1] < thr) { labels[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && labels[p - W] === -1 && g[p - W] < thr) { labels[p - W] = id; stack[sp++] = p - W; }
      if (y < H - 1 && labels[p + W] === -1 && g[p + W] < thr) { labels[p + W] = id; stack[sp++] = p + W; }
    }
    comps.push({ id, n, minx, maxx, miny, maxy, seed: first });
  }
  return { labels, comps };
}

// Moore-neighbour border following, clockwise in screen coordinates.
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export function traceContour(labels, W, H, seed, id) {
  const sx = seed % W, sy = (seed / W) | 0;
  let bx = sx, by = sy, px = sx - 1, py = sy;
  const out = [];
  const limit = 8 * (W + H) + 64;
  let steps = 0;
  do {
    out.push([bx, by]);
    let k = 0;
    for (let i = 0; i < 8; i++) if (bx + DIRS[i][0] === px && by + DIRS[i][1] === py) { k = i; break; }
    let found = false;
    for (let i = 1; i <= 8; i++) {
      const d = DIRS[(k + i) % 8];
      const nx = bx + d[0], ny = by + d[1];
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && labels[ny * W + nx] === id) {
        const dp = DIRS[(k + i - 1) % 8];
        px = bx + dp[0]; py = by + dp[1];
        bx = nx; by = ny;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (++steps > limit) break;
  } while (!(bx === sx && by === sy));
  return out;
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
}

function douglasPeucker(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let maxD = -1, idx = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  const left = douglasPeucker(pts.slice(0, idx + 1), eps);
  const right = douglasPeucker(pts.slice(idx), eps);
  return left.slice(0, -1).concat(right);
}

// Approximate a CLOSED contour. Split it at its two most extreme points first,
// or Douglas-Peucker on an arbitrary start point can hand back a corner as an
// endpoint and lose it.
export function approxQuad(contour, epsFrac = 0.035) {
  const n = contour.length;
  if (n < 12) return null;
  let cx = 0, cy = 0;
  for (const p of contour) { cx += p[0]; cy += p[1]; }
  cx /= n; cy /= n;
  let i0 = 0, d0 = -1;
  for (let i = 0; i < n; i++) { const d = Math.hypot(contour[i][0] - cx, contour[i][1] - cy); if (d > d0) { d0 = d; i0 = i; } }
  let i1 = 0, d1 = -1;
  for (let i = 0; i < n; i++) { const d = Math.hypot(contour[i][0] - contour[i0][0], contour[i][1] - contour[i0][1]); if (d > d1) { d1 = d; i1 = i; } }
  const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
  const arcA = contour.slice(lo, hi + 1);
  const arcB = contour.slice(hi).concat(contour.slice(0, lo + 1));
  let per = 0;
  for (let i = 0; i < n; i++) per += Math.hypot(contour[(i + 1) % n][0] - contour[i][0], contour[(i + 1) % n][1] - contour[i][1]);
  const eps = Math.max(1.0, epsFrac * per / 4);
  const a = douglasPeucker(arcA, eps), b = douglasPeucker(arcB, eps);
  const poly = a.slice(0, -1).concat(b.slice(0, -1));
  return { poly, perimeter: per };
}

function signedArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return a / 2;
}

function isConvex(p) {
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], c = p[(i + 2) % p.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

function bilinear(g, W, H, x, y) {
  if (x < 0) x = 0; if (y < 0) y = 0;
  if (x > W - 1.001) x = W - 1.001;
  if (y > H - 1.001) y = H - 1.001;
  const ix = x | 0, iy = y | 0, tx = x - ix, ty = y - iy;
  const a = g[iy * W + ix], b = g[iy * W + ix + 1], c = g[(iy + 1) * W + ix], d = g[(iy + 1) * W + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

// Sub-pixel corners by fitting the four edges rather than refining the corners.
// Along each edge, scan across it and find where the intensity crosses the
// midpoint between its own local dark and light levels; fit a line through those
// crossings by total least squares; intersect adjacent lines. An edge has
// hundreds of pixels of evidence where a corner has a handful, which is why this
// beats refining the corner directly.
export function refineCorners(quad, g, W, H, opts = {}) {
  const samples = opts.samples || 16, reach = opts.reach || 4.0;
  // A marker's edges are straight in the world and straight in an undistorted
  // image, but CURVED in the pixels a real lens produces. Fitting a straight
  // line to a curve biases every corner outward. When the lens is known, the
  // crossings are lifted into undistorted coordinates, fitted there, and the
  // intersection pushed back through the lens.
  const lens = opts.lens || null;
  const fwd = lens ? ((p) => lens.undistort(p[0], p[1])) : ((p) => p);
  const back = lens ? ((p) => lens.distort(p[0], p[1])) : ((p) => p);
  const lines = [];
  for (let e = 0; e < 4; e++) {
    const a = quad[e], b = quad[(e + 1) % 4];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const L = Math.hypot(ex, ey);
    if (L < 8) return null;
    const nx = -ey / L, ny = ex / L;
    const pts = [];
    for (let s = 0; s < samples; s++) {
      const t = 0.18 + (0.64 * s) / (samples - 1);
      const mx = a[0] + ex * t, my = a[1] + ey * t;
      let lo = Infinity, hi = -Infinity;
      const N = 33;
      const prof = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const d = -reach + (2 * reach * i) / (N - 1);
        const v = bilinear(g, W, H, mx + nx * d, my + ny * d);
        prof[i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo < 0.12) continue; // no real edge here
      const mid = (lo + hi) / 2;
      let cross = null;
      for (let i = 0; i + 1 < N; i++) {
        if ((prof[i] - mid) * (prof[i + 1] - mid) <= 0 && prof[i] !== prof[i + 1]) {
          const f = (mid - prof[i]) / (prof[i + 1] - prof[i]);
          const d0 = -reach + (2 * reach * i) / (N - 1), d1 = -reach + (2 * reach * (i + 1)) / (N - 1);
          const d = d0 + f * (d1 - d0);
          if (cross === null || Math.abs(d) < Math.abs(cross)) cross = d;
        }
      }
      if (cross === null) continue;
      pts.push(fwd([mx + nx * cross, my + ny * cross]));
    }
    if (pts.length < 5) return null;
    // Total least squares line: the eigenvector of the scatter matrix with the
    // smaller eigenvalue is the normal.
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p[0]; sy += p[1]; }
    sx /= pts.length; sy /= pts.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of pts) { const dx = p[0] - sx, dy = p[1] - sy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const dirx = Math.cos(th), diry = Math.sin(th);
    lines.push({ px: sx, py: sy, nx: -diry, ny: dirx, n: pts.length });
  }
  const out = [];
  for (let i = 0; i < 4; i++) {
    const l1 = lines[(i + 3) % 4], l2 = lines[i];
    const A = matFrom(2, 2, [l1.nx, l1.ny, l2.nx, l2.ny]);
    const b = [l1.nx * l1.px + l1.ny * l1.py, l2.nx * l2.px + l2.ny * l2.py];
    const x = solve(A, b);
    if (!x) return null;
    out.push(back([x[0], x[1]]));
  }
  return out;
}

// Read the 6x6 block through the homography that maps the detected quad to a
// canonical square, and decode it.
export function readBits(quad, g, W, H, opts = {}) {
  // The quad IS the outer edge of the black border, which is the 6x6 block.
  // The map from marker coordinates to the image is a homography only in
  // undistorted coordinates, so the grid is laid out there and each sample point
  // is then pushed back through the lens. Sampling straight off a homography
  // fitted to distorted corners walks nearly a whole cell out of place near the
  // edges of a wide frame -- which reads as bit errors, not as a lens problem.
  const lens = opts.lens || null;
  const fwd = lens ? ((p) => lens.undistort(p[0], p[1])) : ((p) => p);
  const back = lens ? ((p) => lens.distort(p[0], p[1])) : ((p) => p);
  const dst = [[0, 0], [6, 0], [6, 6], [0, 6]];
  const r = homography(dst, quad.map(fwd));
  if (!r) return null;
  const cell = (cx, cy) => {
    let s = 0, n = 0;
    for (let sy = 0; sy < 3; sy++) {
      for (let sx = 0; sx < 3; sx++) {
        const q = applyH(r.H, [cx + 0.3 + sx * 0.2, cy + 0.3 + sy * 0.2]);
        if (!q) continue;
        const p = back(q);
        s += bilinear(g, W, H, p[0], p[1]);
        n++;
      }
    }
    return n ? s / n : 1;
  };
  // Grade the border against the payload rather than a fixed level: the
  // threshold is the midpoint of what this particular marker actually shows.
  const vals = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) vals.push(cell(x, y));
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 0.10) return null;
  const mid = (lo + hi) / 2;
  let borderDark = 0, borderTotal = 0;
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      if (x === 0 || y === 0 || x === 5 || y === 5) { borderTotal++; if (vals[y * 6 + x] < mid) borderDark++; }
    }
  }
  if (borderDark < borderTotal - 2) return null; // not a bordered marker
  const bits = [];
  for (let y = 1; y <= 4; y++) for (let x = 1; x <= 4; x++) bits.push(vals[y * 6 + x] < mid ? 0 : 1);
  return { bits, contrast: hi - lo, borderDark, borderTotal };
}

// The whole detector. In: pixels. Out: which markers are where, to sub-pixel
// precision, with a reason attached to everything it threw away.
export function detectMarkers(rgba, W, H, decode, opts = {}) {
  const g = greyscale(rgba, W, H);
  const thr = opts.threshold ?? otsu(g);
  const { labels, comps } = components(g, W, H, thr);
  const minArea = opts.minArea ?? Math.max(120, W * H * 0.00035);
  const found = [];
  const rejected = [];

  for (const c of comps) {
    const w = c.maxx - c.minx + 1, h = c.maxy - c.miny + 1;
    if (c.n < minArea) { rejected.push({ c, why: 'too small' }); continue; }
    if (c.minx <= 0 || c.miny <= 0 || c.maxx >= W - 1 || c.maxy >= H - 1) { rejected.push({ c, why: 'clipped by the frame' }); continue; }
    const contour = traceContour(labels, W, H, c.seed, c.id);
    if (contour.length < 16) { rejected.push({ c, why: 'contour too short' }); continue; }
    const ap = approxQuad(contour, opts.epsFrac);
    if (!ap || ap.poly.length !== 4) { rejected.push({ c, why: `not a quadrilateral (${ap ? ap.poly.length : 0} sides)`, contour }); continue; }
    let quad = ap.poly.map((p) => [p[0], p[1]]);
    if (!isConvex(quad)) { rejected.push({ c, why: 'not convex', contour }); continue; }
    // Wind every quad the way an outward-facing marker's own corner order
    // projects. Measured, not assumed: with the world Y-down and the image v
    // down, the marker's [ (a,a), (b,a), (b,b), (a,b) ] order comes out
    // NEGATIVE, and the border tracer produces the opposite. Get this backwards
    // and every bit grid is mirrored, which matches no rotation of any code.
    if (signedArea(quad) > 0) quad = [quad[0], quad[3], quad[2], quad[1]];
    const area = Math.abs(signedArea(quad));
    if (area < minArea) { rejected.push({ c, why: 'quad too small', contour }); continue; }

    const refined = refineCorners(quad, g, W, H, opts) || quad;
    const read = readBits(refined, g, W, H, opts);
    if (!read) { rejected.push({ c, why: 'no readable bit grid', contour, quad: refined }); continue; }
    const dec = decode(read.bits);
    if (!dec) { rejected.push({ c, why: 'bits match no code in the book', contour, quad: refined }); continue; }
    found.push({
      id: dec.id, rot: dec.rot, bitErrors: dec.err,
      quad: refined, rawQuad: quad, contour, area,
      contrast: read.contrast, bits: read.bits,
    });
  }
  return { markers: found, rejected, threshold: thr, componentCount: comps.length };
}

// Line up detected image corners with the world corners they correspond to.
// `rot` says how many quarter-turns the observed grid is from the canonical one,
// and the corner ordering has to be turned back by the same amount or the pose
// comes out rotated by a right angle with a perfectly healthy residual.
export function orderedCorners(det, worldCorners) {
  const out = [];
  for (let j = 0; j < 4; j++) {
    out.push({ world: worldCorners[(4 - det.rot + j) % 4], image: det.quad[j] });
  }
  return out;
}
