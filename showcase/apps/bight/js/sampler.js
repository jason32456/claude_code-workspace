// Tangle generation. Two models, because the app's whole point is that they
// are not the same kind of object.
//
// A CLOSED cable is a loop, and a loop has a knot type.
// An OPEN cable is an arc, and an arc has NO knot type -- every open curve in
// R^3 is isotopic to a straight segment. That is not a technicality being
// pedantic about earbuds; it is why the app has to choose a closure before it
// can answer, and why the choice can change the answer.
//
// Both samplers move by edge-length-preserving rotations with a self-contact
// veto, so the cable behaves like a cable: fixed length, cannot pass through
// itself. Confinement to a sphere is the drawer, and it is what makes knots
// likely -- an unconfined random walk is mostly unknotted.

import { v3, sub, addv, mulv, dot, norm, cross, rotateAbout, segSegDist, dist, centroid } from './geom.js';
import { mulberry32 } from './rng.js';

const TAU = Math.PI * 2;

function randomUnit(rand) {
  const z = 2 * rand() - 1;
  const th = TAU * rand();
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return v3(r * Math.cos(th), r * Math.sin(th), z);
}

// Smallest distance from the edges in `touched` to every edge not adjacent to
// them. Only the moved edges are re-checked, which is what keeps the sampler
// affordable.
function clearanceOf(pts, touched, closed) {
  const n = pts.length;
  const lastEdge = closed ? n - 1 : n - 2;
  let best = Infinity;
  for (const e of touched) {
    if (e < 0 || e > lastEdge) continue;
    const a0 = pts[e], a1 = pts[(e + 1) % n];
    for (let f = 0; f <= lastEdge; f++) {
      if (f === e) continue;
      if ((f + 1) % n === e || (e + 1) % n === f) continue;
      const d = segSegDist(a0, a1, pts[f], pts[(f + 1) % n]);
      if (d < best) best = d;
    }
  }
  return best;
}

function insideBall(pts, R) {
  for (const p of pts) if (dot(p, p) > R * R) return false;
  return true;
}

// A closed equilateral polygon, crumpled. Crankshaft moves rotate the chain
// between two vertices about the axis joining them, which preserves every edge
// length and the closure exactly -- so the cable never stretches.
export function closedTangle(opts = {}) {
  const n = opts.n ?? 64;
  const seed = opts.seed ?? 1;
  const moves = opts.moves ?? 900;
  const thickness = opts.thickness ?? 0.32;
  const maxSpan = opts.maxSpan ?? 16;
  const rand = mulberry32(seed);

  // Start as a regular polygon of unit edges.
  const edge = 1;
  const R0 = edge / (2 * Math.sin(Math.PI / n));
  let pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    pts.push(v3(R0 * Math.cos(a), R0 * Math.sin(a), 0));
  }

  // Confinement is ANNEALED from the loop's own natural radius down to the
  // target, because a drawer does not teleport around a cable -- it squeezes
  // one. Starting at the target instead was a bug with a very clear signature:
  // the initial circle of radius R0 already violated any interesting
  // confinement, so every single move was rejected, the accept rate was
  // exactly 0%, and 240 "tangles" were all the pristine circle they started
  // as. Which of course measured 0% knotted.
  const target = (opts.confine ?? 0.34) * R0;
  const squeezeUntil = Math.floor(moves * 0.6);
  let accepted = 0, rejected = 0;

  for (let m = 0; m < moves; m++) {
    const f = Math.min(1, m / Math.max(1, squeezeUntil));
    const confine = R0 * 1.02 + (target - R0 * 1.02) * f;
    const i = Math.floor(rand() * n);
    // Span is capped so the clearance re-check stays O(maxSpan * n) rather than
    // O(n^2) per move. Long cables are what actually knot, and an uncapped span
    // makes them unaffordable to sample; a large rotation is also almost always
    // rejected under confinement, so the cap costs little mixing.
    const span = 2 + Math.floor(rand() * Math.min(maxSpan, n - 3));
    const j = (i + span) % n;
    const axis = norm(sub(pts[j], pts[i]));
    if (dot(axis, axis) === 0) { rejected++; continue; }
    const th = (rand() * 2 - 1) * Math.PI;

    const idx = [];
    for (let k = (i + 1) % n; k !== j; k = (k + 1) % n) idx.push(k);
    if (idx.length === 0) { rejected++; continue; }

    const saved = idx.map((k) => pts[k]);
    for (const k of idx) {
      const rel = sub(pts[k], pts[i]);
      pts[k] = addv(pts[i], rotateAbout(rel, axis, th));
    }
    const touched = idx.map((k) => (k - 1 + n) % n).concat(idx);
    if (!insideBall(pts, confine) || clearanceOf(pts, touched, true) < thickness) {
      idx.forEach((k, q) => { pts[k] = saved[q]; });
      rejected++;
    } else {
      accepted++;
    }
  }
  return { points: pts, accepted, rejected, n, thickness, confine: target, R0 };
}

// An OPEN cable. Pivot moves rotate the whole tail about a vertex, again
// preserving every edge length.
export function openCable(opts = {}) {
  const n = opts.n ?? 60;
  const seed = opts.seed ?? 1;
  const moves = opts.moves ?? 900;
  const thickness = opts.thickness ?? 0.32;
  const rand = mulberry32(seed);

  // Start straight: a cable laid out flat.
  let pts = [];
  for (let i = 0; i < n; i++) pts.push(v3(i - (n - 1) / 2, 0, 0));

  // Same annealing, same reason. A straight cable of n unit edges has
  // half-extent (n-1)/2, so any tight drawer rejects it on move one.
  const half = (n - 1) / 2;
  const target = (opts.confine ?? 0.30) * half;
  const squeezeUntil = Math.floor(moves * 0.6);
  let accepted = 0, rejected = 0;

  for (let m = 0; m < moves; m++) {
    const f = Math.min(1, m / Math.max(1, squeezeUntil));
    const confine = half * 1.02 + (target - half * 1.02) * f;
    const k = 1 + Math.floor(rand() * (n - 2));
    const axis = randomUnit(rand);
    const th = (rand() * 2 - 1) * Math.PI;
    const tail = rand() < 0.5;
    const idx = [];
    if (tail) { for (let q = k + 1; q < n; q++) idx.push(q); }
    else { for (let q = 0; q < k; q++) idx.push(q); }
    if (idx.length === 0) { rejected++; continue; }

    const saved = idx.map((q) => pts[q]);
    for (const q of idx) {
      pts[q] = addv(pts[k], rotateAbout(sub(pts[q], pts[k]), axis, th));
    }
    // Recentre so confinement is about the cable, not the origin.
    const c = centroid(pts);
    const shifted = pts.map((p) => sub(p, c));
    const touched = idx.map((q) => q - 1).concat(idx);
    if (!insideBall(shifted, confine) || clearanceOf(pts, touched, false) < thickness) {
      idx.forEach((q, t) => { pts[q] = saved[t]; });
      rejected++;
    } else {
      accepted++;
      pts = shifted;
    }
  }
  return { points: pts, accepted, rejected, n, thickness, confine: target, half };
}

// Contour length, reported so the UI can say how long the cable is in units of
// its own thickness -- the parameter that actually governs how often a cable
// knots.
export function contourLength(pts, closed) {
  let s = 0;
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) s += dist(pts[i], pts[(i + 1) % n]);
  return s;
}
