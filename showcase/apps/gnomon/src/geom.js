// 2D geometry on the wall plane. Everything the player collides with is a convex
// polygon produced here, so this file is the one place where "what you see" and
// "what you stand on" are allowed to be defined.

// Andrew's monotone chain. Points carry a `src` index so a hull vertex can be
// traced back to the caster vertex that made it — that link is how platform
// carry velocity stays exact under rotation.
export function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper); // counter-clockwise
}

export function polyCentroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) return { x: poly[0].x, y: poly[0].y, area: 0 };
  return { x: cx / (3 * a), y: cy / (3 * a), area: a / 2 };
}

export function pointInPoly(poly, x, y) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
  }
  return true;
}

// Circle vs CCW convex polygon. Returns the minimum translation vector plus the
// edge and parameter of the contact, which the caller needs to sample the
// polygon's own velocity at exactly that point.
export function circlePoly(cx, cy, r, poly) {
  const n = poly.length;
  if (n < 3) return null;

  let maxD = -Infinity, maxI = 0, maxT = 0;
  let inside = true;

  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1e-9;
    const nx = ey / len, ny = -ex / len; // outward for CCW winding
    const d = (cx - a.x) * nx + (cy - a.y) * ny;
    if (d > 0) inside = false;
    if (d > maxD) {
      maxD = d;
      maxI = i;
      maxT = Math.max(0, Math.min(1, ((cx - a.x) * ex + (cy - a.y) * ey) / (len * len)));
    }
  }

  if (inside) {
    const a = poly[maxI], b = poly[(maxI + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1e-9;
    return { nx: ey / len, ny: -ex / len, depth: r - maxD, edge: maxI, t: maxT };
  }

  // Outside: nearest point on the boundary decides.
  let best = Infinity, bx = 0, by = 0, bi = 0, bt = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y;
    const l2 = ex * ex + ey * ey || 1e-9;
    let t = ((cx - a.x) * ex + (cy - a.y) * ey) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + ex * t, py = a.y + ey * t;
    const d2 = (cx - px) * (cx - px) + (cy - py) * (cy - py);
    if (d2 < best) { best = d2; bx = px; by = py; bi = i; bt = t; }
  }
  const dist = Math.sqrt(best);
  if (dist >= r) return null;
  if (dist < 1e-6) {
    const a = poly[bi], b = poly[(bi + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1e-9;
    return { nx: ey / len, ny: -ex / len, depth: r, edge: bi, t: bt };
  }
  return { nx: (cx - bx) / dist, ny: (cy - by) / dist, depth: r - dist, edge: bi, t: bt };
}

// Signed area of the intersection is overkill for the seals; a sample grid over
// the target is cheaper, stable, and reads the same to the player.
export function makeSampleGrid(rect, cols, rows) {
  const pts = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      pts.push({
        x: rect.x + ((i + 0.5) / cols) * rect.w,
        y: rect.y + ((j + 0.5) / rows) * rect.h,
      });
    }
  }
  return pts;
}
