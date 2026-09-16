// Closure. The structural joke, and a real theorem.
//
// "Is my cable knotted?" is NOT A WELL-POSED QUESTION. Knot type is an
// invariant of embeddings of the circle; an open arc in R^3 is always isotopic
// to a straight segment, so every open cable is unknotted and the question has
// the same answer for all of them. To get a non-trivial answer at all you must
// first CLOSE the arc, and the closure is a choice you are making, not a fact
// about the cable.
//
// Two conventions are standard in polymer physics and both ship here:
//
//   RADIAL      push each endpoint straight out from the centre of mass to a
//               far sphere, then join along that sphere.
//   DIRECTIONAL push both endpoints the same way, to a point at infinity in
//               direction u. Sweeping u gives a SPECTRUM rather than an answer.
//
// The long closing segments genuinely thread back past the tangle on their way
// out, and different directions thread differently. That is exactly why the
// spectrum is not always a single spike, and the disagreement rate between the
// two conventions is a number this app measures rather than assumes.

import { v3, sub, addv, mulv, dot, norm, cross, len, centroid, dist } from './geom.js';
import { mulberry32 } from './rng.js';

const TAU = Math.PI * 2;

function span(pts) {
  const c = centroid(pts);
  let r = 0;
  for (const p of pts) r = Math.max(r, dist(p, c));
  return { c, r };
}

// Push both ends radially outward from the centroid, then connect the two far
// points by an arc on the big sphere.
// `far` only has to put the closing path outside the tangle; it does not have
// to be enormous. It was 40x the specimen's span, which is topologically fine
// and visually useless: the diagram became two long spokes with the actual
// cable as a dot between them. A few times the span is safe and legible.
export function radialClosure(pts, far = 7, arcSteps = 20) {
  const n = pts.length;
  const { c, r } = span(pts);
  const R = far * Math.max(r, 1e-6);
  const d0 = norm(sub(pts[0], c));
  const d1 = norm(sub(pts[n - 1], c));
  const p0 = addv(c, mulv(d0, R));
  const p1 = addv(c, mulv(d1, R));

  // Great-circle arc from p1 back to p0 on the sphere of radius R.
  const arc = [];
  const a = norm(sub(p1, c)), b = norm(sub(p0, c));
  let axis = cross(a, b);
  if (len(axis) < 1e-9) {
    // Antipodal or identical: pick any perpendicular axis.
    const seed = Math.abs(a.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
    axis = norm(cross(a, seed));
  } else {
    axis = norm(axis);
  }
  const ang = Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
  for (let k = 1; k < arcSteps; k++) {
    const t = (k / arcSteps) * ang;
    const ct = Math.cos(t), st = Math.sin(t);
    const rot = addv(
      addv(mulv(a, ct), mulv(cross(axis, a), st)),
      mulv(axis, dot(axis, a) * (1 - ct)),
    );
    arc.push(addv(c, mulv(rot, R)));
  }

  return [...pts, p1, ...arc, p0];
}

// Push both ends to infinity in the same direction u.
export function directionalClosure(pts, u, far = 7) {
  const n = pts.length;
  const { r } = span(pts);
  const R = far * Math.max(r, 1e-6);
  const dir = norm(u);
  const p1 = addv(pts[n - 1], mulv(dir, R));
  const p0 = addv(pts[0], mulv(dir, R));
  return [...pts, p1, p0];
}

export function randomDirection(rand) {
  const z = 2 * rand() - 1;
  const th = TAU * rand();
  const s = Math.sqrt(Math.max(0, 1 - z * z));
  return v3(s * Math.cos(th), s * Math.sin(th), z);
}

// Deterministic, evenly spread directions (golden-angle spiral) so the spectrum
// is reproducible and not clumped.
export function spreadDirections(count) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const y = 1 - (2 * k + 1) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = k * 2.399963229728653;
    out.push(v3(r * Math.cos(th), y, r * Math.sin(th)));
  }
  return out;
}

// The knot spectrum of an OPEN cable: identify the closure for many directions
// and tally the results. `identify` is injected so this file stays free of any
// dependency on the invariant machinery.
export function directionalSpectrum(pts, identify, count = 40, far = 7) {
  const dirs = spreadDirections(count);
  const tally = new Map();
  const perDir = [];
  let failures = 0;
  for (const u of dirs) {
    let res;
    try {
      res = identify(directionalClosure(pts, u, far));
    } catch (e) {
      failures++;
      perDir.push({ u, name: null, error: e.message });
      continue;
    }
    perDir.push({ u, ...res });
    const key = res.name ?? `unidentified(det ${res.det}, n ${res.crossings})`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const entries = [...tally].sort((a, b) => b[1] - a[1]);
  const total = perDir.length - failures;
  return {
    tally: entries,
    perDir,
    failures,
    total,
    distinct: entries.length,
    dominant: entries[0] ?? null,
    // The number the premise lives or dies on: does the closure convention
    // change the answer?
    agreementFraction: total > 0 && entries[0] ? entries[0][1] / total : 0,
  };
}
