// Contract-shaped stand-in for the real engine. The pieces do not really tile
// the shapes; they exist to exercise rotation, many pieces and key frames whose
// boxes differ wildly in size.

function ringArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

function areaOf(shape) {
  return shape.reduce((t, r) => t + Math.abs(ringArea(r.outer)) - r.holes.reduce((u, h) => u + Math.abs(ringArea(h)), 0), 0);
}

function boundsOf(shape) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of shape) {
    for (const [x, y] of r.outer) {
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
    }
  }
  return b;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scaleShape(shape, k) {
  const [x0, y0, x1, y1] = boundsOf(shape);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const f = ([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k];
  return shape.map((r) => ({ outer: r.outer.map(f), holes: r.holes.map((h) => h.map(f)) }));
}

function makePieces(W, H, cols, rows) {
  const cw = W / cols;
  const ch = H / rows;
  const rings = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw;
      const y = r * ch;
      const quad = [[x, y], [x + cw, y], [x + cw, y + ch], [x, y + ch]];
      if ((r * cols + c) % 3 === 0) rings.push([quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]);
      else rings.push(quad);
    }
  }
  return rings;
}

function centroid(ring) {
  return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
}

const LAYOUTS = {
  shape: { spread: 1.02, spin: () => 0, jitter: 0 },
  rects: { spread: 1.5, spin: (r) => (r() - 0.5) * 1.2, jitter: 0.25 },
  bars: { spread: 1.25, spin: (r, i) => (i % 2 ? Math.PI / 2 : 0) + (r() - 0.5) * 0.3, jitter: 0.1 },
};

function layoutPoses(pieces, kind, seed, target) {
  const { spread, spin, jitter } = LAYOUTS[kind];
  const rand = rng(seed);
  const n = pieces.length;
  const radius = Math.max(...pieces.map((p) => Math.max(...p.ring.map(([x, y]) => Math.hypot(x - p.g[0], y - p.g[1])))));
  const aspect = (target[2] - target[0]) / (target[3] - target[1] || 1);
  const cols = Math.max(2, Math.ceil(Math.sqrt(n * aspect)));
  const rows = Math.ceil(n / cols);
  const pitchX = Math.max(((target[2] - target[0]) / cols) * spread, radius * 2.1);
  const pitchY = Math.max(((target[3] - target[1]) / rows) * spread, radius * 2.1);
  const order = pieces.map((_, i) => i).sort((p, q) => rand() - 0.5 || p - q);
  const poses = new Array(n);
  order.forEach((id, slot) => {
    const piece = pieces[id];
    const theta = kind === 'shape' ? rand() * Math.PI * 2 : spin(rand, slot);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const X = target[0] + (slot % cols) * pitchX + pitchX / 2 + (rand() - 0.5) * jitter * radius;
    const Y = target[1] + Math.floor(slot / cols) * pitchY + pitchY / 2 + (rand() - 0.5) * jitter * radius;
    poses[id] = [c, s, X - (c * piece.g[0] - s * piece.g[1]), Y - (s * piece.g[0] + c * piece.g[1])];
  });
  return poses;
}

function boxOf(pieces, poses) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  pieces.forEach((piece, i) => {
    const [c, s, tx, ty] = poses[i];
    for (const [x, y] of piece.ring) {
      const X = c * x - s * y + tx;
      const Y = s * x + c * y + ty;
      box[0] = Math.min(box[0], X);
      box[1] = Math.min(box[1], Y);
      box[2] = Math.max(box[2], X);
      box[3] = Math.max(box[3], Y);
    }
  });
  return box;
}

export function dissect(shapeA, shapeB, options = {}) {
  const started = Date.now();
  if (!shapeA?.length || !shapeB?.length) throw Object.assign(new Error('A shape is empty.'), { code: 'empty' });
  const area = areaOf(shapeA);
  const areaB = areaOf(shapeB);
  if (!(area > 1e-9) || !(areaB > 1e-9)) throw Object.assign(new Error('A shape has no area.'), { code: 'degenerate' });
  const scaleB = Math.sqrt(area / areaB);
  const bShape = scaleShape(shapeB, scaleB);

  const aspect = options.ribbonAspect ?? 12;
  const width = Math.sqrt(area * aspect);
  const height = area / width;
  const base = makePieces(width, height, options.cols ?? 24, options.rows ?? 2).map((ring) => ({ ring, g: centroid(ring), area: Math.abs(ringArea(ring)) }));
  const kinds = ['shape', 'rects', 'bars'];
  const aBox = boundsOf(shapeA);
  const bBox = boundsOf(bShape);
  const targets = {
    a: [aBox, [aBox[0], aBox[1], aBox[0] + (aBox[2] - aBox[0]) * 1.7, aBox[1] + (aBox[3] - aBox[1]) * 1.7], [0, 0, width * 0.45, height * 14]],
    b: [bBox, [bBox[0], bBox[1], bBox[0] + (bBox[2] - bBox[0]) * 1.4, bBox[1] + (bBox[3] - bBox[1]) * 1.4], [0, 0, width * 0.7, height * 9]],
  };
  const posesA = kinds.map((k, i) => layoutPoses(base, k, 11 + i, targets.a[i]));
  const posesB = kinds.map((k, i) => layoutPoses(base, k, 101 + i, targets.b[i]));

  const cellsA = 9;
  const cellsB = 11;
  const pieces = base.map((p, id) => ({
    id,
    ring: p.ring,
    area: p.area,
    cellA: id % cellsA,
    cellB: (id * 7) % cellsB,
    a: posesA.map((set) => set[id]),
    b: posesB.map((set) => set[id]),
  }));
  const summary = (shape, poses, cells) => ({
    shape,
    cells,
    poses: kinds.map((key, i) => ({ key, box: boxOf(base, poses[i]) })),
  });
  return {
    area,
    scaleB,
    ribbon: { width, height, box: [0, 0, width, height] },
    a: summary(shapeA, posesA, cellsA),
    b: summary(bShape, posesB, cellsB),
    pieces,
    audit: {
      pieces: pieces.length,
      areaError: Math.abs(pieces.reduce((s, p) => s + p.area, 0) - area) / area,
      smallestArea: Math.min(...pieces.map((p) => p.area)),
      ms: Date.now() - started,
    },
  };
}
