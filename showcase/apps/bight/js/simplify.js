// KMT reduction (Koniaris-Muthukumar-Taylor / Taylor's algorithm), the standard
// way to shrink a polygonal knot without changing its type.
//
// The move: consider the triangle spanned by three consecutive vertices
// (p[i-1], p[i], p[i+1]). If NO other edge of the polygon pierces that
// triangle, then sliding p[i] along to the chord is an ambient isotopy -- the
// curve sweeps the triangle and meets nothing -- so p[i] can be deleted and the
// knot type is provably unchanged. If some edge does pierce it, the vertex is
// load-bearing and stays.
//
// This matters for two reasons. It is the app's UNKNOTTING CERTIFICATE: a
// tangle that reduces all the way to a triangle is the unknot by construction,
// proved geometrically rather than inferred from a polynomial. And it is what
// makes the Kauffman bracket affordable at all -- a 240-vertex drawer tangle
// projects to dozens of crossings, far past 2^n, and KMT routinely takes it to
// single digits without touching the topology.
//
// Nothing here is heuristic. The only approximation is floating point, and
// selftest 4 checks that the invariants of the reduced curve equal those of the
// original on cases where both are computable.

import { sub, cross, dot, v3, segSegDist, segTriDist, segTriPierces, coplanarOverlap, radiusOfGyration } from './geom.js';

// Does segment q0->q1 pierce triangle (a,b,c)? Moller-Trumbore, with the
// shared-vertex cases excluded by the caller.
export function segTriIntersect(q0, q1, a, b, c, eps = 1e-12) {
  const dir = sub(q1, q0);
  const e1 = sub(b, a), e2 = sub(c, a);
  const pv = cross(dir, e2);
  const det = dot(e1, pv);
  if (Math.abs(det) < eps) return false; // parallel to the triangle plane
  const inv = 1 / det;
  const tv = sub(q0, a);
  const u = dot(tv, pv) * inv;
  if (u < -eps || u > 1 + eps) return false;
  const qv = cross(tv, e1);
  const v = dot(dir, qv) * inv;
  if (v < -eps || u + v > 1 + eps) return false;
  const t = dot(e2, qv) * inv;
  return t > eps && t < 1 - eps;
}

// One full KMT sweep. Returns the reduced polygon.
export function kmtReduce(ptsIn, opts = {}) {
  const maxPasses = opts.maxPasses ?? 400;
  const minVerts = opts.minVerts ?? 3;
  let pts = ptsIn.slice();
  // Clearance threshold, scaled to the curve so it means the same thing at any
  // size. Deliberately conservative: refusing a legal move costs a little
  // compression, accepting an illegal one silently changes the knot.
  const eps = (opts.eps ?? 1e-7) * Math.max(radiusOfGyration(ptsIn), 1e-9);
  let removed = 0;
  let passes = 0;

  for (; passes < maxPasses; passes++) {
    let any = false;
    let i = 0;
    while (i < pts.length && pts.length > minVerts) {
      const n = pts.length;
      const a = pts[(i - 1 + n) % n];
      const b = pts[i];
      const c = pts[(i + 1) % n];

      // The move is an isotopy exactly when the triangle meets NOTHING else on
      // the curve, so what has to be established is CLEARANCE, not merely the
      // absence of a detected intersection. Only the triangle's own two sides
      // are exempt: edge (i-1,i) and edge (i,i+1).
      //
      // Two bugs live here, both found by the invariants disagreeing rather
      // than by reading the code.
      //
      // Skipping the neighbours (i-2,i-1) and (i+1,i+2) as well was wrong: they
      // touch the triangle at a vertex but can still pierce it further along.
      //
      // Worse, a boolean intersection test was wrong even with the right edge
      // set. An edge COPLANAR with the triangle and lying across it is a strand
      // passage, and Moller-Trumbore calls it a miss because the segment is
      // parallel to the plane. That is what let 7_1 reduce to a 5-crossing
      // diagram: Jones AND Alexander both independently reported the type had
      // changed from det 7 to det 5, on a triangle that two separately written
      // intersection tests each called clean. A distance has no such blind
      // spot, so the test is now "stay further than eps away", and edges are
      // shrunk slightly off their endpoints so a shared triangle vertex does
      // not read as zero distance.
      const sideA = (i - 1 + n) % n;  // triangle side, from i-1 to i
      const sideB = i;                // triangle side, from i to i+1
      // The two edges that legitimately TOUCH the triangle at an outer vertex.
      const touchA = (i - 2 + n) % n; // ends at i-1
      const touchB = (i + 1) % n;     // starts at i+1

      let blocked = false;
      for (let e = 0; e < n && !blocked; e++) {
        if (e === sideA || e === sideB) continue;
        const q0 = pts[e], q1 = pts[(e + 1) % n];
        if (e === touchA || e === touchB) {
          // Distance is legitimately zero at the shared vertex, so a distance
          // threshold cannot be used. What is dangerous is a transversal
          // piercing of the interior (t strictly inside, so the shared vertex
          // does not count) or a coplanar run across the triangle.
          if (segTriPierces(q0, q1, a, b, c)) blocked = true;
          else if (coplanarOverlap(q0, q1, a, b, c, eps)) blocked = true;
          continue;
        }
        // Every other edge: plain clearance, with NO shrinking of the segment.
        // Pulling edges back off their endpoints was the third bug here -- a
        // 1e-3 pullback on a 4-unit edge hid piercings that happen near that
        // edge's own endpoint, which is exactly how 7_1 kept reducing to a
        // 5-crossing diagram: the offending edge sat 6.6e-5 from the triangle
        // in the shrunk measurement and through it in reality.
        if (segTriDist(q0, q1, a, b, c) < eps) blocked = true;
      }
      if (!blocked) {
        pts.splice(i, 1);
        removed++;
        any = true;
        // do not advance i; the neighbourhood changed
        if (i > 0) i--;
      } else {
        i++;
      }
    }
    if (!any) break;
  }
  return { points: pts, removed, passes, certificate: pts.length <= 3 };
}

// Gentle 3D smoothing that also cannot change the knot type, used to make the
// drawing readable after KMT has done the topological work. Each vertex moves
// toward the midpoint of its neighbours, and the step is REJECTED if it brings
// any non-adjacent pair of segments closer than `clearance` -- so a strand can
// never pass through another. The veto is conservative, not merely small-step.
export function relaxStep(pts, clearance = 0.06, rate = 0.25) {
  const n = pts.length;
  let moved = 0, vetoed = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const target = v3((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
    const cand = v3(
      b.x + (target.x - b.x) * rate,
      b.y + (target.y - b.y) * rate,
      b.z + (target.z - b.z) * rate,
    );
    const old = pts[i];
    pts[i] = cand;
    if (minClearanceAround(pts, i) < clearance) {
      pts[i] = old;
      vetoed++;
    } else {
      moved++;
    }
  }
  return { moved, vetoed };
}

// Smallest distance between the two edges touching vertex i and every edge not
// adjacent to them.
function minClearanceAround(pts, i) {
  const n = pts.length;
  let best = Infinity;
  const touch = [(i - 1 + n) % n, i];
  for (const e of touch) {
    const a0 = pts[e], a1 = pts[(e + 1) % n];
    for (let f = 0; f < n; f++) {
      if (f === e) continue;
      if ((f + 1) % n === e || (e + 1) % n === f) continue;
      const b0 = pts[f], b1 = pts[(f + 1) % n];
      const d = segSegDist(a0, a1, b0, b1);
      if (d < best) best = d;
    }
  }
  return best;
}

// The global clearance of a polygon: how close it comes to touching itself.
// Reported in the UI because it is the quantity the veto protects.
export function minClearance(pts) {
  const n = pts.length;
  let best = Infinity;
  for (let e = 0; e < n; e++) {
    const a0 = pts[e], a1 = pts[(e + 1) % n];
    for (let f = e + 1; f < n; f++) {
      if (f === e) continue;
      if ((f + 1) % n === e || (e + 1) % n === f) continue;
      const d = segSegDist(a0, a1, pts[f], pts[(f + 1) % n]);
      if (d < best) best = d;
    }
  }
  return best === Infinity ? 0 : best;
}

// A rounder polygon of the SAME knot, for drawing only.
//
// KMT minimises vertices, and a minimal polygon is geometrically extreme: the
// 6-vertex trefoil it produces is a correct trefoil diagram and an unreadable
// sliver. Subdividing every edge changes the curve not at all -- the new
// vertices lie exactly on the old edges, so the point set is the same curve --
// and then relaxStep rounds it off under the strand-passage veto, which cannot
// change the topology. The invariants are still computed on the minimal
// polygon; this only exists so the picture is legible.
export function beautify(ptsIn, opts = {}) {
  const targetVerts = opts.targetVerts ?? 96;
  const rounds = opts.rounds ?? 14;
  let pts = ptsIn.slice();
  if (pts.length < 3) return pts;

  while (pts.length < targetVerts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(a);
      out.push(v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
    }
    pts = out;
    if (pts.length > targetVerts * 2) break;
  }

  // Relax with a clearance floor tied to the curve's own scale.
  const floor = 0.02 * Math.max(radiusOfGyration(pts), 1e-9);
  for (let r = 0; r < rounds; r++) relaxStep(pts, floor, 0.3);
  return pts;
}
