export const IDENTITY = [1, 0, 0, 0];

export const translation = (dx, dy) => [1, 0, dx, dy];

export const applyPose = (m, p) => [m[0] * p[0] - m[1] * p[1] + m[2], m[1] * p[0] + m[0] * p[1] + m[3]];

// composePoses(a, b) applies b first, then a.
export function composePoses(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1],
    a[1] * b[0] + a[0] * b[1],
    a[0] * b[2] - a[1] * b[3] + a[2],
    a[1] * b[2] + a[0] * b[3] + a[3],
  ];
}

export function invertPose(m) {
  return [m[0], -m[1], -m[0] * m[2] - m[1] * m[3], m[1] * m[2] - m[0] * m[3]];
}

export function normalizePose(m) {
  const r = Math.hypot(m[0], m[1]);
  return [m[0] / r, m[1] / r, m[2], m[3]];
}

export const transformRing = (m, ring) => ring.map((p) => applyPose(m, p));

export function signedArea(poly) {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function bounds(points, box = [Infinity, Infinity, -Infinity, -Infinity]) {
  for (const p of points) {
    if (p[0] < box[0]) box[0] = p[0];
    if (p[1] < box[1]) box[1] = p[1];
    if (p[0] > box[2]) box[2] = p[0];
    if (p[1] > box[3]) box[3] = p[1];
  }
  return box;
}

// Splits a convex polygon by the line through (px,py) with normal (nx,ny).
// Vertices within eps of the line count as on it and belong to both sides.
export function splitByLine(poly, px, py, nx, ny, eps) {
  const n = poly.length;
  const d = new Array(n);
  let hasPos = false;
  let hasNeg = false;
  for (let i = 0; i < n; i++) {
    const v = (poly[i][0] - px) * nx + (poly[i][1] - py) * ny;
    d[i] = v;
    if (v > eps) hasPos = true;
    else if (v < -eps) hasNeg = true;
  }
  if (!hasNeg) return { pos: poly, neg: null };
  if (!hasPos) return { pos: null, neg: poly };
  const pos = [];
  const neg = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const di = d[i];
    const dj = d[j];
    const si = di > eps ? 1 : di < -eps ? -1 : 0;
    const sj = dj > eps ? 1 : dj < -eps ? -1 : 0;
    if (si >= 0) pos.push(poly[i]);
    if (si <= 0) neg.push(poly[i]);
    if (si * sj < 0) {
      const t = di / (di - dj);
      const q = [poly[i][0] + t * (poly[j][0] - poly[i][0]), poly[i][1] + t * (poly[j][1] - poly[i][1])];
      pos.push(q);
      neg.push(q);
    }
  }
  return { pos, neg };
}

export function clipConvex(subject, clip, eps) {
  const sign = signedArea(clip) >= 0 ? 1 : -1;
  let out = subject;
  const m = clip.length;
  for (let i = 0; i < m && out; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % m];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    if (len === 0) continue;
    const { pos } = splitByLine(out, a[0], a[1], (-ey * sign) / len, (ex * sign) / len, eps);
    out = pos && pos.length >= 3 ? pos : null;
  }
  return out;
}

// Drops duplicate and collinear vertices; null when nothing with area is left.
export function tidyRing(ring, eps) {
  let pts = ring.slice();
  let changed = true;
  while (changed && pts.length >= 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length >= 3; ) {
      const n = pts.length;
      const prev = pts[(i + n - 1) % n];
      const cur = pts[i];
      const next = pts[(i + 1) % n];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const len = Math.hypot(dx, dy);
      const dup = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) <= eps;
      const off = len > eps ? Math.abs(dx * (cur[1] - prev[1]) - dy * (cur[0] - prev[0])) / len : Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      if (dup || off <= eps) {
        pts.splice(i, 1);
        changed = true;
      } else i++;
    }
  }
  if (pts.length < 3 || signedArea(pts) <= 0) return null;
  return pts;
}
