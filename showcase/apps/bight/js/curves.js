// Standard knots as actual closed curves in R^3. Every fixture in this app is
// geometry, never a hand-typed PD code, so no crossing-sign or cyclic-order
// convention is ever asserted by hand — it is read off coordinates. That is
// what lets the published Jones polynomials act as a real oracle instead of a
// check on my own bookkeeping.

import { v3, rotateAbout, norm } from './geom.js';

const TAU = Math.PI * 2;

function sample(f, n) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(f((i / n) * TAU));
  return pts;
}

// Written out plainly rather than through a generic torus formula, because the
// generic version is easy to get subtly wrong and these are the app's oracles.
function torus(p, q, R = 2.2, r = 1.0) {
  return (s) => {
    const u = p * s;        // around the tube's long way
    const w = q * s;        // around the meridian
    const rad = R + r * Math.cos(w);
    return v3(rad * Math.cos(u), rad * Math.sin(u), -r * Math.sin(w));
  };
}

const CURVES = {
  unknot: {
    name: 'Unknot',
    label: '0₁',
    f: (t) => v3(2.4 * Math.cos(t), 2.4 * Math.sin(t), 0.35 * Math.sin(3 * t)),
    n: 96,
  },
  trefoil: {
    name: 'Trefoil (right)',
    label: '3₁',
    // The classic (2,3) torus knot.
    f: torus(2, 3),
    n: 144,
  },
  trefoilL: {
    name: 'Trefoil (left)',
    label: '3₁*',
    // Mirror image: negate one coordinate. Jones must distinguish this from
    // the right-handed one; Alexander provably cannot.
    f: (t) => { const p = torus(2, 3)(t); return v3(p.x, p.y, -p.z); },
    n: 144,
  },
  figure8: {
    name: 'Figure-eight',
    label: '4₁',
    // Standard parametrisation of 4_1, the simplest amphichiral knot.
    f: (t) => v3(
      (2 + Math.cos(2 * t)) * Math.cos(3 * t),
      (2 + Math.cos(2 * t)) * Math.sin(3 * t),
      1.6 * Math.sin(4 * t),
    ),
    n: 192,
  },
  cinquefoil: {
    name: 'Cinquefoil',
    label: '5₁',
    f: torus(2, 5, 2.2, 0.85),
    n: 220,
  },
  sevenOne: {
    name: '(2,7) torus',
    label: '7₁',
    f: torus(2, 7, 2.3, 0.8),
    n: 280,
  },
  granny: {
    name: 'Trefoil, loose',
    label: '3₁',
    // Same knot type as trefoil, a deliberately different embedding. Used to
    // check that the invariants care about topology and not about coordinates.
    f: (t) => {
      const p = torus(2, 3, 2.6, 1.3)(t);
      return v3(p.x + 0.5 * Math.sin(5 * t), p.y + 0.4 * Math.cos(4 * t), p.z + 0.6 * Math.sin(2 * t));
    },
    n: 200,
  },
};

export function curveIds() {
  return Object.keys(CURVES);
}

export function curveInfo(id) {
  const c = CURVES[id];
  return { id, name: c.name, label: c.label };
}

export function buildCurve(id, scaleN = 1) {
  const c = CURVES[id];
  if (!c) throw new Error(`unknown curve ${id}`);
  const n = Math.max(24, Math.round(c.n * scaleN));
  return sample(c.f, n);
}

// Resample a closed polygon to equal-length edges, which is what the tangle
// sampler and the relaxer both assume. A cable has a fixed length.
export function resampleEqual(pts, n) {
  const m = pts.length;
  const seg = [];
  let total = 0;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % m];
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    seg.push(d); total += d;
  }
  const step = total / n;
  const out = [];
  let i = 0, carry = 0;
  for (let k = 0; k < n; k++) {
    let want = step;
    if (k === 0) { out.push(pts[0]); continue; }
    for (;;) {
      const remain = seg[i] - carry;
      if (remain > want || i === m - 1 && want <= remain) {
        carry += want;
        const a = pts[i], b = pts[(i + 1) % m];
        const f = seg[i] === 0 ? 0 : carry / seg[i];
        out.push(v3(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f));
        break;
      }
      want -= remain;
      i = (i + 1) % m;
      carry = 0;
      if (i === 0) { out.push(pts[0]); break; }
    }
  }
  return out.slice(0, n);
}
