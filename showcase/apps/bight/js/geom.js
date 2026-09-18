// Vector helpers and the two geometric predicates the whole app rests on:
// where two projected segments cross, and how close two segments are in 3D.

export const v3 = (x, y, z) => ({ x, y, z });
export const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const addv = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const mulv = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => v3(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const dist = (a, b) => len(sub(a, b));
export function norm(a) {
  const l = len(a);
  return l === 0 ? v3(0, 0, 0) : mulv(a, 1 / l);
}

// Rotate a about a unit axis k by angle th (Rodrigues).
export function rotateAbout(a, k, th) {
  const c = Math.cos(th), s = Math.sin(th);
  return addv(
    addv(mulv(a, c), mulv(cross(k, a), s)),
    mulv(k, dot(k, a) * (1 - c)),
  );
}

// An orthonormal frame with w as its third axis, used to build projections.
export function frame(w) {
  const wn = norm(w);
  const seed = Math.abs(wn.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
  const u = norm(sub(seed, mulv(wn, dot(seed, wn))));
  const v = cross(wn, u);
  return { u, v, w: wn };
}

// Crossing of two planar segments p->p2 and q->q2.
//
// Returns one of three things, and the three-way distinction is the whole
// point: 'none' (they genuinely miss), a crossing, or 'ambiguous'.
//
// A crossing whose parameter sits within `margin` of an endpoint is AMBIGUOUS,
// not absent. Collapsing those two cases is a silent-wrong-answer bug rather
// than a rounding issue: the caller minimises crossing number over projection
// directions, so a direction where a real crossing gets quietly dropped looks
// like a BETTER diagram and gets selected on purpose. That is how a 7_1 curve
// came back reading as 5_1 with a perfectly self-consistent polynomial. An
// ambiguous crossing must therefore reject the entire projection and force a
// re-projection, which is what makes the diagram generic.
export const PARAM_MARGIN = 1e-5;
export const PARALLEL_REL = 1e-7;

export function segCross2D(p, p2, q, q2, margin = PARAM_MARGIN) {
  const r = { x: p2.x - p.x, y: p2.y - p.y };
  const s = { x: q2.x - q.x, y: q2.y - q.y };
  const den = r.x * s.y - r.y * s.x;
  const lr = Math.hypot(r.x, r.y), ls = Math.hypot(s.x, s.y);
  if (lr === 0 || ls === 0) return { ambiguous: true };
  // Near-parallel. Only a degeneracy if they are also close together; two
  // parallel edges far apart simply do not cross.
  if (Math.abs(den) < PARALLEL_REL * lr * ls) {
    const d = pointSegDist2D(p, q, q2);
    const d2 = pointSegDist2D(p2, q, q2);
    const close = Math.min(d, d2) < 1e-6 * Math.max(lr, ls);
    return close ? { ambiguous: true } : { none: true };
  }
  const qp = { x: q.x - p.x, y: q.y - p.y };
  const t = (qp.x * s.y - qp.y * s.x) / den;
  const u = (qp.x * r.y - qp.y * r.x) / den;
  const outside = t < -margin || t > 1 + margin || u < -margin || u > 1 + margin;
  if (outside) return { none: true };
  // Inside the enlarged box but within a margin of any endpoint: ambiguous.
  if (t < margin || t > 1 - margin || u < margin || u > 1 - margin) {
    return { ambiguous: true };
  }
  return { t, u, den };
}

function pointSegDist2D(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

// Closest distance between 3D segments p0->p1 and q0->q1. Used as the
// strand-passage veto: if this ever drops below the cable radius the move is
// rejected, because a cable cannot pass through itself.
export function segSegDist(p0, p1, q0, q1) {
  const d1 = sub(p1, p0), d2 = sub(q1, q0), r = sub(p0, q0);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  const EPS = 1e-12;
  if (a <= EPS && e <= EPS) return len(r);
  if (a <= EPS) {
    s = 0; t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      t = 0; s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const cp = addv(p0, mulv(d1, s));
  const cq = addv(q0, mulv(d2, t));
  return dist(cp, cq);
}

// Total turning, a cheap shape statistic reported alongside the topology so a
// viewer can see that "looks tangled" and "is knotted" are different axes.
export function totalTurning(pts) {
  const n = pts.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = sub(pts[(i + 1) % n], pts[i]);
    const b = sub(pts[(i + 2) % n], pts[(i + 1) % n]);
    const la = len(a), lb = len(b);
    if (la === 0 || lb === 0) continue;
    sum += Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (la * lb))));
  }
  return sum;
}

export function centroid(pts) {
  let c = v3(0, 0, 0);
  for (const p of pts) c = addv(c, p);
  return mulv(c, 1 / pts.length);
}

export function radiusOfGyration(pts) {
  const c = centroid(pts);
  let s = 0;
  for (const p of pts) s += dot(sub(p, c), sub(p, c));
  return Math.sqrt(s / pts.length);
}

// Distance from a point to a triangle: project onto the plane, and if the
// projection falls outside, fall back to the nearest of the three edges.
export function pointTriDist(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const n = cross(ab, ac);
  const nl2 = dot(n, n);
  if (nl2 < 1e-30) {
    // Degenerate triangle: it is a segment.
    return Math.min(
      pointSegDist3(p, a, b), pointSegDist3(p, b, c), pointSegDist3(p, a, c),
    );
  }
  // Barycentric coordinates of the in-plane projection.
  const d = dot(ap, n) / nl2;
  const proj = sub(p, mulv(n, d));
  const pa = sub(proj, a);
  const d00 = dot(ab, ab), d01 = dot(ab, ac), d11 = dot(ac, ac);
  const d20 = dot(pa, ab), d21 = dot(pa, ac);
  const den = d00 * d11 - d01 * d01;
  const v = (d11 * d20 - d01 * d21) / den;
  const w = (d00 * d21 - d01 * d20) / den;
  const u = 1 - v - w;
  // d is dot(ap,n)/|n|^2, so the perpendicular distance is |d| * |n|.
  if (u >= 0 && v >= 0 && w >= 0) return Math.abs(d) * Math.sqrt(nl2);
  return Math.min(
    pointSegDist3(p, a, b), pointSegDist3(p, b, c), pointSegDist3(p, a, c),
  );
}

export function pointSegDist3(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 === 0) return dist(p, a);
  let t = dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, addv(a, mulv(ab, t)));
}

// Minimum distance between segment q0->q1 and triangle (a,b,c). Exact by the
// standard decomposition: either the segment meets the triangle (0), or the
// closest pair involves a segment endpoint against the triangle, or the segment
// against one of the triangle's three edges.
//
// This replaces a pure intersection test in the KMT reducer. A boolean
// "does it pierce" misses the case that actually broke the reducer: an edge
// COPLANAR with the triangle, lying across the swept region. Moller-Trumbore
// reports no intersection there (the segment is parallel to the plane, so the
// determinant vanishes), and a straddle test misses it too because both
// endpoints are on the same side of the plane -- namely on it. A distance,
// unlike a boolean, cannot have that blind spot.
export function segTriDist(q0, q1, a, b, c) {
  // The transversal case: a segment through the triangle's INTERIOR has both
  // endpoints far from the triangle and never approaches any of its edges, so
  // the distance terms below are all positive while the true distance is zero.
  // Leaving this out made the reducer unknot everything.
  if (segTriPierces(q0, q1, a, b, c)) return 0;
  // Everything else. A COPLANAR segment lying across the triangle is caught
  // here rather than above: it enters and leaves through the triangle's edges,
  // so its distance to one of them is zero. One coplanar and wholly inside is
  // caught by the endpoint terms.
  return Math.min(
    pointTriDist(q0, a, b, c),
    pointTriDist(q1, a, b, c),
    segSegDist(q0, q1, a, b),
    segSegDist(q0, q1, b, c),
    segSegDist(q0, q1, a, c),
  );
}

// Moller-Trumbore. Only the transversal case; coplanar segments return false
// here by design and are handled by the distance terms in segTriDist.
export function segTriPierces(q0, q1, a, b, c, eps = 1e-12) {
  const dir = sub(q1, q0);
  const e1 = sub(b, a), e2 = sub(c, a);
  const pv = cross(dir, e2);
  const det = dot(e1, pv);
  if (Math.abs(det) < eps) return false;
  const inv = 1 / det;
  const tv = sub(q0, a);
  const u = dot(tv, pv) * inv;
  if (u < 0 || u > 1) return false;
  const qv = cross(tv, e1);
  const v = dot(dir, qv) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = dot(e2, qv) * inv;
  return t > 0 && t < 1;
}

// Does a COPLANAR segment overlap the triangle over a positive length?
//
// This is the case no intersection test sees. A segment lying in the triangle's
// plane never "pierces" it -- Moller-Trumbore's determinant vanishes -- but a
// strand lying across the region a KMT move sweeps is a strand passage all the
// same. Handled by projecting into the plane and clipping the segment against
// the triangle's three half-planes.
export function coplanarOverlap(q0, q1, a, b, c, tol) {
  const n = cross(sub(b, a), sub(c, a));
  const nl = len(n);
  if (nl < 1e-30) return false;
  const un = mulv(n, 1 / nl);
  const s0 = dot(sub(q0, a), un), s1 = dot(sub(q1, a), un);
  if (Math.abs(s0) > tol || Math.abs(s1) > tol) return false;

  // 2D frame in the triangle's plane.
  const ex = norm(sub(b, a));
  const ey = cross(un, ex);
  const to2 = (p) => ({ x: dot(sub(p, a), ex), y: dot(sub(p, a), ey) });
  const A = to2(a), Bp = to2(b), C = to2(c);
  const P = to2(q0), Q = to2(q1);

  // Clip segment P->Q to the triangle by its three edges, keeping the side the
  // opposite vertex is on.
  let t0 = 0, t1 = 1;
  const dx = Q.x - P.x, dy = Q.y - P.y;
  const edges = [[A, Bp, C], [Bp, C, A], [C, A, Bp]];
  for (const [u, v, w] of edges) {
    const ex2 = v.x - u.x, ey2 = v.y - u.y;
    // inward normal points toward w
    let nx = -ey2, ny = ex2;
    if ((w.x - u.x) * nx + (w.y - u.y) * ny < 0) { nx = -nx; ny = -ny; }
    const dOrigin = (P.x - u.x) * nx + (P.y - u.y) * ny;
    const dDir = dx * nx + dy * ny;
    if (Math.abs(dDir) < 1e-300) {
      if (dOrigin < 0) return false;
      continue;
    }
    const t = -dOrigin / dDir;
    if (dDir > 0) { if (t > t0) t0 = t; } else { if (t < t1) t1 = t; }
    if (t0 > t1) return false;
  }
  const overlapLen = Math.hypot(dx, dy) * (t1 - t0);
  return overlapLen > tol;
}
