import { signedArea } from './engine-geom.js';

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function cleanRing(raw, tol) {
  if (!Array.isArray(raw)) throw fail('degenerate', 'ring is not an array');
  let pts = raw.map((p) => {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw fail('degenerate', 'non-finite coordinate');
    return [p[0], p[1]];
  });
  let changed = true;
  while (changed && pts.length >= 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length >= 3; ) {
      const n = pts.length;
      const prev = pts[(i + n - 1) % n];
      const cur = pts[i];
      const next = pts[(i + 1) % n];
      const dup = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) <= tol;
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const len = Math.hypot(dx, dy);
      const off = len > tol ? Math.abs(dx * (cur[1] - prev[1]) - dy * (cur[0] - prev[0])) / len : Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      if (dup || off <= tol) {
        pts.splice(i, 1);
        changed = true;
      } else i++;
    }
  }
  return pts.length >= 3 ? pts : null;
}

function crossing(a, b, c, d, tol) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const cdx = d[0] - c[0];
  const cdy = d[1] - c[1];
  const lab = Math.hypot(abx, aby);
  const lcd = Math.hypot(cdx, cdy);
  const side = (px, py, qx, qy, l, r) => ((qx) * (r[1] - py) - (qy) * (r[0] - px)) / l;
  const o1 = side(a[0], a[1], abx, aby, lab, c);
  const o2 = side(a[0], a[1], abx, aby, lab, d);
  const o3 = side(c[0], c[1], cdx, cdy, lcd, a);
  const o4 = side(c[0], c[1], cdx, cdy, lcd, b);
  return ((o1 > tol && o2 < -tol) || (o1 < -tol && o2 > tol)) && ((o3 > tol && o4 < -tol) || (o3 < -tol && o4 > tol));
}

function assertSimple(regions, tol) {
  const edges = [];
  for (const r of regions) {
    for (const ring of [r.outer, ...r.holes]) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % n];
        edges.push({ a, b, ring, i, n, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]) });
      }
    }
  }
  edges.sort((p, q) => p.x0 - q.x0);
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    for (let j = i + 1; j < edges.length && edges[j].x0 <= e.x1 + tol; j++) {
      const f = edges[j];
      if (e.ring === f.ring) {
        const gap = Math.abs(e.i - f.i);
        if (gap === 1 || gap === e.n - 1) continue;
      }
      if (Math.min(e.a[1], e.b[1]) > Math.max(f.a[1], f.b[1]) + tol || Math.max(e.a[1], e.b[1]) < Math.min(f.a[1], f.b[1]) - tol) continue;
      if (crossing(e.a, e.b, f.a, f.b, tol)) throw fail('self-intersecting', 'shape crosses itself');
    }
  }
}

export function ringCentroid(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    const w = p[0] * q[1] - q[0] * p[1];
    a += w;
    cx += (p[0] + q[0]) * w;
    cy += (p[1] + q[1]) * w;
  }
  return { area: a / 2, x: cx / (3 * a), y: cy / (3 * a) };
}

export function cleanShape(shape) {
  if (!Array.isArray(shape) || shape.length === 0) throw fail('empty', 'shape has no regions');
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of shape) {
    if (!r || !Array.isArray(r.outer)) throw fail('degenerate', 'region without outer ring');
    for (const p of r.outer) {
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw fail('degenerate', 'non-finite coordinate');
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  if (!(diag > 0)) throw fail('degenerate', 'shape has no extent');
  const tol = 1e-9 * diag;

  const regions = [];
  for (const r of shape) {
    let outer = cleanRing(r.outer, tol);
    if (!outer || Math.abs(signedArea(outer)) <= 1e-12 * diag * diag) continue;
    if (signedArea(outer) < 0) outer = outer.reverse();
    const holes = [];
    for (const h of r.holes || []) {
      let ring = cleanRing(h, tol);
      if (!ring || Math.abs(signedArea(ring)) <= 1e-12 * diag * diag) continue;
      if (signedArea(ring) > 0) ring = ring.reverse();
      holes.push(ring);
    }
    regions.push({ outer, holes });
  }
  if (!regions.length) throw fail('degenerate', 'shape has zero area');
  assertSimple(regions, tol);

  let area = 0;
  let cx = 0;
  let cy = 0;
  for (const r of regions) {
    for (const ring of [r.outer, ...r.holes]) {
      const c = ringCentroid(ring);
      area += c.area;
      cx += c.area * c.x;
      cy += c.area * c.y;
    }
  }
  if (!(area > 1e-12 * diag * diag)) throw fail('degenerate', 'shape has zero area');
  return { regions, area, centroid: [cx / area, cy / area] };
}

export function scaleShape(shape, k, about) {
  const f = (p) => [about[0] + k * (p[0] - about[0]), about[1] + k * (p[1] - about[1])];
  return {
    regions: shape.regions.map((r) => ({ outer: r.outer.map(f), holes: r.holes.map((h) => h.map(f)) })),
    area: shape.area * k * k,
    centroid: shape.centroid,
  };
}

export const toShape = (clean) => clean.regions.map((r) => ({ outer: r.outer.map((p) => [p[0], p[1]]), holes: r.holes.map((h) => h.map((p) => [p[0], p[1]])) }));
