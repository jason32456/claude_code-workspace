// Geometry -> knot diagram. This is the hinge of the whole app: one object
// extracted from coordinates, handed to two algorithms racing for opposite
// verdicts.
//
// A closed polygon is projected along a direction, every pair of non-adjacent
// edges is tested for a planar crossing, and depth decides over/under. From
// that we get:
//
//   - the crossing list, each with a SIGN read off the geometry
//   - the 4-valent graph: 2n arcs, each joining two crossing-ends
//   - the two smoothings at each crossing, in planar cyclic order
//
// Nothing here is a convention I typed in. The over/under relation and the
// cyclic order around a crossing both come from the coordinates, which is why
// published Jones polynomials can serve as an oracle for this code rather than
// merely agreeing with my own choice of PD convention.

import { sub, cross, dot, norm, frame, segCross2D, v3 } from './geom.js';

// Project to 2D plus a depth. Depth is along the view direction; larger depth
// means nearer the viewer, so the strand with larger depth is the over-strand.
export function project(pts, dir) {
  const { u, v, w } = frame(dir);
  return pts.map((p) => ({
    x: dot(p, u),
    y: dot(p, v),
    z: dot(p, w),
  }));
}

// All proper crossings of the projected polygon. Adjacent edges share a vertex
// and are skipped; everything else must cross transversally or not at all.
//
// Returns null -- meaning "reproject, this direction is not generic" -- on ANY
// ambiguity: a crossing near a vertex, two strands at indistinguishable depth,
// or near-parallel overlapping edges. Never silently drops a crossing.
function rawCrossings(flat) {
  const n = flat.length;
  const out = [];
  // Depth margin scaled to the curve, so the test means the same thing
  // regardless of how big the tangle is.
  let zMin = Infinity, zMax = -Infinity;
  for (const p of flat) { if (p.z < zMin) zMin = p.z; if (p.z > zMax) zMax = p.z; }
  const zSpan = Math.max(zMax - zMin, 1e-12);
  const depthMargin = 1e-7 * zSpan;

  for (let i = 0; i < n; i++) {
    const a0 = flat[i], a1 = flat[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // skip edges sharing a vertex
      if (j === (i + 1) % n || i === (j + 1) % n) continue;
      const b0 = flat[j], b1 = flat[(j + 1) % n];
      const hit = segCross2D(a0, a1, b0, b1);
      if (hit.none) continue;
      if (hit.ambiguous) return null;
      const za = a0.z + (a1.z - a0.z) * hit.t;
      const zb = b0.z + (b1.z - b0.z) * hit.u;
      if (Math.abs(za - zb) < depthMargin) return null;
      out.push({
        i, j, t: hit.t, u: hit.u,
        x: a0.x + (a1.x - a0.x) * hit.t,
        y: a0.y + (a1.y - a0.y) * hit.t,
        za, zb,
      });
    }
  }
  return out;
}

// Build the diagram. Tries a few jittered view directions so a degenerate
// projection (a crossing exactly on a vertex, two strands at equal depth)
// becomes a retry rather than a wrong answer.
export function buildDiagram(pts, dir = v3(0.3, 0.17, 1), seedJitter = 0) {
  let flat = null, raw = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const d = attempt === 0 && seedJitter === 0
      ? dir
      : v3(
        dir.x + 0.037 * Math.sin(attempt * 2.7 + seedJitter),
        dir.y + 0.041 * Math.cos(attempt * 3.1 + seedJitter),
        dir.z + 0.013 * Math.sin(attempt * 1.3 + seedJitter),
      );
    flat = project(pts, d);
    raw = rawCrossings(flat);
    if (raw !== null) break;
    raw = null;
  }
  if (raw === null) throw new Error('could not find a generic projection');

  const n = pts.length;

  // Order crossings along the curve: each edge may carry several, sorted by
  // parameter. Walking this gives the sequence of crossing-visits, which is
  // what turns the crossing list into a graph.
  const perEdge = Array.from({ length: n }, () => []);
  raw.forEach((c, idx) => {
    perEdge[c.i].push({ idx, param: c.t, role: 'i' });
    perEdge[c.j].push({ idx, param: c.u, role: 'j' });
  });
  for (const list of perEdge) list.sort((a, b) => a.param - b.param);

  // The walk: a flat sequence of visits, two per crossing.
  const visits = [];
  for (let e = 0; e < n; e++) {
    for (const hit of perEdge[e]) visits.push({ crossing: hit.idx, role: hit.role, edge: e, param: hit.param });
  }

  const m = raw.length;
  if (m === 0) {
    return { crossings: [], arcs: [], nArcs: 0, writhe: 0, flat, visits: [], points: pts };
  }

  // Each crossing gets four ends. Ends 0 and 2 are the strand that passes
  // UNDER (0 = incoming, 2 = outgoing); ends 1 and 3 are the OVER strand
  // (1 = incoming, 3 = outgoing). Which geometric strand is which is decided
  // by depth, not by me.
  const crossings = raw.map((c, idx) => {
    const overIsI = c.za > c.zb;
    const flatDirI = dirOfEdge(flat, c.i);
    const flatDirJ = dirOfEdge(flat, c.j);
    const overDir = overIsI ? flatDirI : flatDirJ;
    const underDir = overIsI ? flatDirJ : flatDirI;
    // Crossing sign, by the right-hand rule: +1 when rotating the UNDER-strand
    // direction counterclockwise brings it onto the over-strand, i.e. when
    // (under, over) is a positively oriented basis of the plane.
    //
    // The order of the two arguments here is not a free choice. It has to agree
    // with the A/B smoothing convention in jones.js, because the Jones
    // normalisation (-A^3)^(-w) only lands on exponents divisible by 4 when the
    // writhe and the bracket come from the same handedness. Taking (over,under)
    // instead gave the trefoil bracket A^7 - A^3 - A^-5 alongside writhe +3,
    // which is inconsistent -- that bracket belongs to writhe -3 -- and the
    // divisibility check in laurent.quarter threw rather than rounding. With
    // this order the trefoil returns the published V = -t^-4 + t^-3 + t^-1.
    const sign = (underDir.x * overDir.y - underDir.y * overDir.x) > 0 ? 1 : -1;
    return {
      id: idx,
      x: c.x, y: c.y,
      overEdge: overIsI ? c.i : c.j,
      underEdge: overIsI ? c.j : c.i,
      overIsI,
      sign,
      overDir, underDir,
      ends: [null, null, null, null],
    };
  });

  // Walk the curve and connect ends into arcs. Along the walk, leaving one
  // crossing-end and arriving at the next defines one arc of the 4-valent
  // graph. There are exactly 2n such arcs for n crossings.
  const V = visits.length; // == 2m
  const endIndex = (cIdx, role) => {
    const c = crossings[cIdx];
    const isOver = (role === 'i') === c.overIsI;
    return isOver ? 'over' : 'under';
  };

  // First pass: assign each visit its incoming and outgoing end slot.
  for (let k = 0; k < V; k++) {
    const vis = visits[k];
    const kind = endIndex(vis.crossing, vis.role);
    vis.kind = kind;
    vis.inSlot = kind === 'under' ? 0 : 1;
    vis.outSlot = kind === 'under' ? 2 : 3;
  }

  // Second pass: arcs join outSlot of visit k to inSlot of visit k+1.
  const arcs = [];
  for (let k = 0; k < V; k++) {
    const a = visits[k], b = visits[(k + 1) % V];
    const arcId = arcs.length;
    arcs.push({
      id: arcId,
      from: { crossing: a.crossing, slot: a.outSlot },
      to: { crossing: b.crossing, slot: b.inSlot },
    });
    crossings[a.crossing].ends[a.outSlot] = arcId;
    crossings[b.crossing].ends[b.inSlot] = arcId;
  }

  const writhe = crossings.reduce((s, c) => s + c.sign, 0);

  return { crossings, arcs, nArcs: arcs.length, writhe, flat, visits, points: pts };
}

function dirOfEdge(flat, e) {
  const n = flat.length;
  const a = flat[e], b = flat[(e + 1) % n];
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

// The planar cyclic order of the four ends around a crossing, counterclockwise.
// Needed by the Kauffman bracket to know which pair of ends each smoothing
// joins. Computed from the actual in-plane directions of the four ends.
export function cyclicOrder(c) {
  // Outgoing ends point along their strand direction; incoming ends point
  // backwards along it.
  const dirs = [
    { slot: 0, d: { x: -c.underDir.x, y: -c.underDir.y } }, // under-in
    { slot: 1, d: { x: -c.overDir.x, y: -c.overDir.y } },   // over-in
    { slot: 2, d: { x: c.underDir.x, y: c.underDir.y } },   // under-out
    { slot: 3, d: { x: c.overDir.x, y: c.overDir.y } },     // over-out
  ];
  dirs.forEach((e) => { e.ang = Math.atan2(e.d.y, e.d.x); });
  dirs.sort((a, b) => a.ang - b.ang);
  return dirs.map((e) => e.slot);
}

export function crossingCount(d) {
  return d.crossings.length;
}

// Crossing number depends on the projection, and KMT minimises VERTICES rather
// than crossings -- a taut 9-gon can project to more crossings than the smooth
// 192-gon it came from. Since the bracket costs 2^n, the direction is worth
// searching: this samples directions on the sphere and keeps the diagram with
// the fewest crossings. It is also the honest quantity to report, because the
// crossing number of a knot is a minimum over diagrams, not a property of one.
export function bestDiagram(pts, tries = 64) {
  let best = null, bestArea = -1;
  // Among projections TIED at the minimum crossing number, prefer the most
  // face-on one -- largest projected bounding-box area. A grazing view can hit
  // the minimum while squashing the diagram into a sliver, which is correct and
  // unreadable.
  const areaOf = (flat) => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const p of flat) {
      if (p.x < a) a = p.x; if (p.x > b) b = p.x;
      if (p.y < c) c = p.y; if (p.y > d) d = p.y;
    }
    return (b - a) * (d - c);
  };
  for (let k = 0; k < tries; k++) {
    // Deterministic low-discrepancy directions (golden-angle spiral) so the
    // same curve always yields the same diagram.
    const y = 1 - (2 * k + 1) / tries;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = k * 2.399963229728653;
    const dir = v3(r * Math.cos(th), y, r * Math.sin(th));
    let d;
    try { d = buildDiagram(pts, dir, k * 0.7); } catch (e) { continue; }
    const area = areaOf(d.flat);
    if (best === null
      || d.crossings.length < best.crossings.length
      || (d.crossings.length === best.crossings.length && area > bestArea)) {
      best = d;
      bestArea = area;
    }
  }
  if (best === null) throw new Error('no generic projection found in any direction');
  return best;
}
