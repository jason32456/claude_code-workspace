export function ringArea(ring) {
  let sum = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

export function shapeArea(shape) {
  let total = 0;
  for (const region of shape) {
    total += Math.abs(ringArea(region.outer));
    for (const hole of region.holes) total -= Math.abs(ringArea(hole));
  }
  return total;
}

export function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Two filled pixels meeting only at a corner would make rings that touch at a
// point. Filling one of the empty pair joins them, so every ring is separate.
function withoutPinches(filled, pw, ph) {
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    for (let y = 0; y < ph - 1; y++) {
      for (let x = 0; x < pw - 1; x++) {
        const a = filled[y * pw + x];
        const b = filled[y * pw + x + 1];
        const c = filled[(y + 1) * pw + x];
        const d = filled[(y + 1) * pw + x + 1];
        if (a && d && !b && !c) {
          filled[y * pw + x + 1] = 1;
          changed = true;
        } else if (b && c && !a && !d) {
          filled[y * pw + x] = 1;
          changed = true;
        }
      }
    }
    if (!changed) return;
  }
}

export function padAndRepair(grid, w, h) {
  const pw = w + 2;
  const ph = h + 2;
  const filled = new Uint8Array(pw * ph);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (grid[y * w + x]) filled[(y + 1) * pw + x + 1] = 1;
  }
  withoutPinches(filled, pw, ph);
  return { filled, pw, ph };
}

// Pixel-edge boundary following. Interior lies to the right of each directed
// edge (y down), so outer rings run clockwise on screen and holes the other way.
function pixelLoops(filled, pw, ph) {
  const vw = pw + 1;
  const next = new Int32Array(vw * (ph + 1)).fill(-1);
  const at = (x, y) => (x < 0 || y < 0 || x >= pw || y >= ph ? 0 : filled[y * pw + x]);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      if (!filled[y * pw + x]) continue;
      if (!at(x, y - 1)) next[y * vw + x] = y * vw + x + 1;
      if (!at(x + 1, y)) next[y * vw + x + 1] = (y + 1) * vw + x + 1;
      if (!at(x, y + 1)) next[(y + 1) * vw + x + 1] = (y + 1) * vw + x;
      if (!at(x - 1, y)) next[(y + 1) * vw + x] = y * vw + x;
    }
  }
  const loops = [];
  for (let start = 0; start < next.length; start++) {
    if (next[start] < 0) continue;
    const lattice = [];
    let v = start;
    do {
      lattice.push(v);
      const following = next[v];
      next[v] = -1;
      v = following;
    } while (v !== start);
    const corners = [];
    for (let i = 0, n = lattice.length; i < n; i++) {
      const p = lattice[(i + n - 1) % n];
      const q = lattice[i];
      const r = lattice[(i + 1) % n];
      const inDir = q - p;
      const outDir = r - q;
      if (inDir !== outDir) corners.push([(q % vw) - 1, Math.floor(q / vw) - 1]);
    }
    loops.push(corners);
  }
  return loops;
}

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / Math.sqrt(len2);
}

function simplifyChain(points, first, last, tolerance, keep) {
  const stack = [[first, last]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let worst = -1;
    let worstDist = tolerance;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpendicularDistance(points[i % points.length], points[lo % points.length], points[hi % points.length]);
      if (d > worstDist) {
        worstDist = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep.add(worst % points.length);
      stack.push([lo, worst], [worst, hi]);
    }
  }
}

export function simplifyRing(ring, tolerance) {
  const n = ring.length;
  if (n <= 3 || tolerance <= 0) return ring.slice();
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const keep = new Set([0, far]);
  simplifyChain(ring, 0, far, tolerance, keep);
  simplifyChain(ring, far, n, tolerance, keep);
  return [...keep].sort((a, b) => a - b).map((i) => ring[i]);
}

function dedupe(ring) {
  const out = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}

function orient(ax, ay, bx, by, cx, cy) {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0;
}

function onSegment(ax, ay, bx, by, px, py) {
  return Math.min(ax, bx) - 1e-9 <= px && px <= Math.max(ax, bx) + 1e-9 && Math.min(ay, by) - 1e-9 <= py && py <= Math.max(ay, by) + 1e-9;
}

function segmentsTouch(s, t) {
  const o1 = orient(s.ax, s.ay, s.bx, s.by, t.ax, t.ay);
  const o2 = orient(s.ax, s.ay, s.bx, s.by, t.bx, t.by);
  const o3 = orient(t.ax, t.ay, t.bx, t.by, s.ax, s.ay);
  const o4 = orient(t.ax, t.ay, t.bx, t.by, s.bx, s.by);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(s.ax, s.ay, s.bx, s.by, t.ax, t.ay)) return true;
  if (o2 === 0 && onSegment(s.ax, s.ay, s.bx, s.by, t.bx, t.by)) return true;
  if (o3 === 0 && onSegment(t.ax, t.ay, t.bx, t.by, s.ax, s.ay)) return true;
  if (o4 === 0 && onSegment(t.ax, t.ay, t.bx, t.by, s.bx, s.by)) return true;
  return false;
}

// Returns the indices of rings that cross or touch themselves or each other.
export function tangledRings(rings) {
  const segs = [];
  rings.forEach((ring, r) => {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % n];
      segs.push({ ring: r, index: i, n, ax, ay, bx, by, lo: Math.min(ax, bx), hi: Math.max(ax, bx), ylo: Math.min(ay, by), yhi: Math.max(ay, by) });
    }
  });
  segs.sort((p, q) => p.lo - q.lo);
  const bad = new Set();
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    for (let j = i + 1; j < segs.length && segs[j].lo <= s.hi + 1e-9; j++) {
      const t = segs[j];
      if (t.ylo > s.yhi + 1e-9 || s.ylo > t.yhi + 1e-9) continue;
      if (s.ring === t.ring) {
        const gap = Math.abs(s.index - t.index);
        if (gap === 1 || gap === s.n - 1) {
          const [first, second] = (s.index + 1) % s.n === t.index ? [s, t] : [t, s];
          const shared = [first.bx, first.by];
          const sOther = [first.ax, first.ay];
          const tOther = [second.bx, second.by];
          const cross = (sOther[0] - shared[0]) * (tOther[1] - shared[1]) - (sOther[1] - shared[1]) * (tOther[0] - shared[0]);
          const dot = (sOther[0] - shared[0]) * (tOther[0] - shared[0]) + (sOther[1] - shared[1]) * (tOther[1] - shared[1]);
          if (Math.abs(cross) < 1e-9 && dot > 0) bad.add(s.ring);
          continue;
        }
      }
      if (segmentsTouch(s, t)) {
        bad.add(s.ring);
        bad.add(t.ring);
      }
    }
  }
  return bad;
}

function simplifyAll(loops, tolerances) {
  return loops.map((loop, i) => {
    let tol = tolerances[i];
    let ring = dedupe(simplifyRing(loop, tol));
    while (ring.length < 3 && tol > 0) {
      tol = tol < 0.2 ? 0 : tol / 2;
      ring = dedupe(simplifyRing(loop, tol));
    }
    return ring;
  });
}

/**
 * Pure tracer: a w×h grid of 0/1 (or alpha) values becomes a contract Shape.
 * options.tolerance is the Douglas-Peucker distance in pixels.
 */
export function traceGrid(grid, w, h, options = {}) {
  const tolerance = options.tolerance ?? 3;
  const minArea = options.minArea ?? 16;
  const threshold = options.threshold ?? 0;
  const binary = threshold > 0 ? Uint8Array.from(grid, (v) => (v > threshold ? 1 : 0)) : grid;
  const { filled, pw, ph } = padAndRepair(binary, w, h);

  const loops = pixelLoops(filled, pw, ph).filter((loop) => Math.abs(ringArea(loop)) >= minArea && loop.length >= 4);
  if (!loops.length) return [];

  const tolerances = loops.map(() => tolerance);
  let rings = simplifyAll(loops, tolerances);
  for (let attempt = 0; attempt < 12; attempt++) {
    const bad = tangledRings(rings);
    if (!bad.size) break;
    for (const i of bad) tolerances[i] = attempt >= 10 || tolerances[i] < 0.3 ? 0 : tolerances[i] / 2;
    rings = simplifyAll(loops, tolerances);
  }

  const outers = [];
  const holes = [];
  rings.forEach((ring, i) => {
    if (ring.length < 3 || Math.abs(ringArea(ring)) < 1e-6) return;
    (ringArea(loops[i]) > 0 ? outers : holes).push(ring);
  });

  const regions = outers.map((outer) => ({ outer, holes: [] }));
  const outerSize = regions.map((r) => Math.abs(ringArea(r.outer)));
  for (const hole of holes) {
    let best = -1;
    for (let i = 0; i < regions.length; i++) {
      if (!pointInRing(hole[0][0], hole[0][1], regions[i].outer)) continue;
      if (best < 0 || outerSize[i] < outerSize[best]) best = i;
    }
    if (best >= 0) regions[best].holes.push(hole);
  }
  return regions;
}

export function translateShape(shape, dx, dy) {
  const move = (ring) => ring.map(([x, y]) => [x + dx, y + dy]);
  return shape.map((r) => ({ outer: move(r.outer), holes: r.holes.map(move) }));
}

export function shapeBounds(shape) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of shape) {
    for (const [x, y] of r.outer) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

export function shapeVertexCount(shape) {
  return shape.reduce((n, r) => n + r.outer.length + r.holes.reduce((m, h) => m + h.length, 0), 0);
}
