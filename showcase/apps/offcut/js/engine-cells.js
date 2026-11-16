function fail(message) {
  const err = new Error(message);
  err.code = 'self-intersecting';
  return err;
}

const xAt = (e, y) => (y === e.y0 ? e.x0 : y === e.y1 ? e.x1 : e.x0 + ((e.x1 - e.x0) * (y - e.y0)) / (e.y1 - e.y0));

// Trapezoids with horizontal parallel sides, one region at a time. Vertically
// adjacent slabs bounded by the same two polygon edges are fused.
function decomposeRegion(region) {
  const edges = [];
  const ys = new Set();
  let id = 0;
  for (const ring of [region.outer, ...region.holes]) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      ys.add(a[1]);
      if (a[1] === b[1]) continue;
      edges.push(a[1] < b[1] ? { x0: a[0], y0: a[1], x1: b[0], y1: b[1], id: id++ } : { x0: b[0], y0: b[1], x1: a[0], y1: a[1], id: id++ });
    }
  }
  const levels = [...ys].sort((p, q) => p - q);
  const cells = [];
  let open = new Map();
  for (let i = 0; i + 1 < levels.length; i++) {
    const yt = levels[i];
    const yb = levels[i + 1];
    const ym = (yt + yb) / 2;
    const active = [];
    for (const e of edges) if (e.y0 <= yt && e.y1 >= yb) active.push({ e, x: xAt(e, ym) });
    if (active.length % 2) throw fail('region has an odd number of edges in a slab');
    active.sort((p, q) => p.x - q.x || p.e.id - q.e.id);
    const next = new Map();
    for (let k = 0; k < active.length; k += 2) {
      const l = active[k].e;
      const r = active[k + 1].e;
      const key = l.id * 1e7 + r.id;
      const prev = open.get(key);
      if (prev) {
        prev.yb = yb;
        next.set(key, prev);
      } else {
        const cell = { l, r, yt, yb };
        cells.push(cell);
        next.set(key, cell);
      }
    }
    open = next;
  }
  return cells.map((c) => ({
    yt: c.yt,
    yb: c.yb,
    xtl: xAt(c.l, c.yt),
    xtr: xAt(c.r, c.yt),
    xbl: xAt(c.l, c.yb),
    xbr: xAt(c.r, c.yb),
  }));
}

const turn = (ring) => ring.map((p) => [-p[1], p[0]]);

// quarter: 0 slices with horizontal lines, 1 with vertical ones (the shape is
// turned a quarter first, so cells come back in that working frame).
export function decomposeShape(shape, quarter) {
  const regions = shape.regions
    .map((r) => (quarter ? { outer: turn(r.outer), holes: r.holes.map(turn) } : r))
    .map((r) => {
      let minX = Infinity;
      let minY = Infinity;
      for (const p of r.outer) {
        minX = Math.min(minX, p[0]);
        minY = Math.min(minY, p[1]);
      }
      return { r, minX, minY };
    })
    .sort((p, q) => p.minX - q.minX || p.minY - q.minY);
  const cells = [];
  for (const { r } of regions) for (const c of decomposeRegion(r)) cells.push(c);
  return cells;
}
