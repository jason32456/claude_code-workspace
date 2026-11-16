// Independent audit of dissect(): none of the engine's geometry routines are used.
import { dissect } from '../js/engine.js';

const failures = [];
const fail = (name, msg) => failures.push(`${name}: ${msg}`);

const area = (r) => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};
const apply = (m, p) => [m[0] * p[0] - m[1] * p[1] + m[2], m[1] * p[0] + m[0] * p[1] + m[3]];
const bbox = (r) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of r) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return [x0, y0, x1, y1];
};

function isConvex(r, tol) {
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n], c = r[(i + 2) % n];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cr < -tol) return false;
  }
  return true;
}

function intersectArea(P, Q) {
  let out = P;
  for (let i = 0; i < Q.length && out.length; i++) {
    const a = Q[i], b = Q[(i + 1) % Q.length];
    const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const next = [];
    for (let k = 0; k < out.length; k++) {
      const p = out[k], q = out[(k + 1) % out.length];
      const sp = side(p), sq = side(q);
      if (sp >= 0) next.push(p);
      if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
        const t = sp / (sp - sq);
        next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    out = next;
  }
  return out.length >= 3 ? Math.abs(area(out)) : 0;
}

function overlapSum(rings) {
  const items = rings.map((r) => ({ r, b: bbox(r) })).sort((p, q) => p.b[0] - q.b[0]);
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length && items[j].b[0] < items[i].b[2]; j++) {
      const p = items[i].b, q = items[j].b;
      if (q[1] >= p[3] || p[1] >= q[3]) continue;
      total += intersectArea(items[i].r, items[j].r);
    }
  }
  return total;
}

function inShape(shape, pt, tol) {
  let inside = false;
  let nearEdge = false;
  for (const reg of shape) {
    let ins = 0;
    for (const ring of [reg.outer, ...reg.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(a[0] + t * dx - pt[0], a[1] + t * dy - pt[1]) <= tol) nearEdge = true;
        if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < a[0] + ((pt[1] - a[1]) / (b[1] - a[1])) * dx) ins ^= 1;
      }
    }
    if (ins) inside = true;
  }
  return inside || nearEdge;
}

function samples(r) {
  const c = r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
  const pts = [c];
  for (const p of r) for (const t of [0.5, 0.95]) pts.push([c[0] + t * (p[0] - c[0]), c[1] + t * (p[1] - c[1])]);
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    pts.push([c[0] + 0.95 * ((a[0] + b[0]) / 2 - c[0]), c[1] + 0.95 * ((a[1] + b[1]) / 2 - c[1])]);
  }
  return pts;
}

function shapeArea(shape) {
  let s = 0;
  for (const r of shape) s += Math.abs(area(r.outer)) - r.holes.reduce((t, h) => t + Math.abs(area(h)), 0);
  return s;
}

function checkResult(name, r) {
  const A = r.area;
  const scale = Math.sqrt(A);
  const rigid = (m) => Math.abs(m[0] * m[0] + m[1] * m[1] - 1) < 1e-9 && m.every(Number.isFinite);
  let sum = 0;
  for (const p of r.pieces) {
    if (!p.ring.every((v) => v.every(Number.isFinite))) return fail(name, `NaN in piece ${p.id}`);
    if (p.ring.length < 3) fail(name, `piece ${p.id} has ${p.ring.length} vertices`);
    const ar = area(p.ring);
    if (!(ar > 0)) fail(name, `piece ${p.id} non-positive area`);
    if (Math.abs(ar - p.area) > 1e-9 * Math.max(ar, A * 1e-6)) fail(name, `piece ${p.id} area mismatch`);
    if (!isConvex(p.ring, 1e-9 * scale * scale)) fail(name, `piece ${p.id} not convex`);
    sum += ar;
    for (const m of [...p.a, ...p.b]) if (!rigid(m)) fail(name, `piece ${p.id} pose not rigid`);
  }
  if (Math.abs(sum - A) / A > 1e-9) fail(name, `area sum off by ${Math.abs(sum - A) / A}`);
  if (Math.abs(shapeArea(r.a.shape) - A) / A > 1e-9) fail(name, 'a.shape area differs');
  if (Math.abs(shapeArea(r.b.shape) - A) / A > 1e-9) fail(name, 'b.shape area differs');
  const { width, height } = r.ribbon;
  if (Math.abs(width * height - A) / A > 1e-9) fail(name, 'ribbon area differs');
  const tol = 1e-9 * scale;
  for (const p of r.pieces) for (const v of p.ring) if (v[0] < -tol || v[0] > width + tol || v[1] < -tol || v[1] > height + tol) { fail(name, `piece ${p.id} outside ribbon`); break; }

  const frames = [['a', 0], ['a', 1], ['a', 2], null, ['b', 2], ['b', 1], ['b', 0]];
  frames.forEach((f, fi) => {
    const rings = r.pieces.map((p) => (f ? p[f[0]][f[1]] && p.ring.map((v) => apply(p[f[0]][f[1]], v)) : p.ring));
    for (const [k, ring] of rings.entries()) if (area(ring) <= 0) { fail(name, `frame ${fi} piece ${k} reflected or collapsed`); break; }
    const ov = overlapSum(rings);
    if (ov > 1e-7 * A) fail(name, `frame ${fi} overlap ${ov / A}`);
    if (f && f[1] > 0) {
      const box = r[f[0]].poses[f[1]].box;
      const real = bbox(rings.flat());
      if (real.some((v, i) => Math.abs(v - box[i]) > 1e-9 * scale)) fail(name, `frame ${fi} box mismatch`);
    }
    if (f && f[1] === 0) {
      const shape = r[f[0]].shape;
      let bad = 0;
      for (const ring of rings) for (const pt of samples(ring)) if (!inShape(shape, pt, 1e-9 * scale)) bad++;
      if (bad) fail(name, `frame ${fi}: ${bad} sample points outside the shape`);
    }
    if (f && f[1] === 1) {
      const groups = new Map();
      r.pieces.forEach((p, i) => {
        const c = f[0] === 'a' ? p.cellA : p.cellB;
        if (!groups.has(c)) groups.set(c, []);
        groups.get(c).push(rings[i]);
      });
      for (const [c, rs] of groups) {
        const b = bbox(rs.flat());
        const bArea = (b[2] - b[0]) * (b[3] - b[1]);
        const s = rs.reduce((t, x) => t + area(x), 0);
        if (Math.abs(bArea - s) > 1e-9 * A) { fail(name, `${f[0]} cell ${c} is not one rectangle (${s} vs ${bArea})`); break; }
      }
    }
  });
}

function runCase(name, a, b, rows, opts) {
  let r;
  try {
    r = dissect(a, b, opts);
  } catch (e) {
    fail(name, `threw ${e.code || ''} ${e.message}`);
    return null;
  }
  const t = performance.now();
  const before = failures.length;
  checkResult(name, r);
  const again = dissect(a, b, opts);
  const strip = (x) => JSON.stringify({ ...x, audit: { ...x.audit, ms: 0 } });
  if (strip(r) !== strip(again)) fail(name, 'not deterministic');
  rows.push({ name, cellsA: r.a.cells, cellsB: r.b.cells, pieces: r.pieces.length, areaError: r.audit.areaError, ms: +r.audit.ms.toFixed(1), ok: failures.length === before, check: Math.round(performance.now() - t) });
  return r;
}

// ---------- shapes ----------
const poly = (...pts) => [{ outer: pts, holes: [] }];
const rect = (x, y, w, h) => poly([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
const rectRing = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const move = (shape, dx, dy, k = 1) => shape.map((r) => ({ outer: r.outer.map((p) => [p[0] * k + dx, p[1] * k + dy]), holes: r.holes.map((h) => h.map((p) => [p[0] * k + dx, p[1] * k + dy])) }));
const shear = (shape, s) => shape.map((r) => ({ outer: r.outer.map((p) => [p[0] + s * (7 - p[1]), p[1]]), holes: r.holes.map((h) => h.map((p) => [p[0] + s * (7 - p[1]), p[1]])) }));

function star(n, inner, outer) {
  const pts = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const rr = i % 2 ? inner : outer;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return poly(...pts);
}
const cross = () => poly([1, 0], [2, 0], [2, 1], [3, 1], [3, 2], [2, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 1], [1, 1]);

const glyphs = {
  H: [{ outer: [[0, 0], [1.5, 0], [1.5, 2.75], [3.5, 2.75], [3.5, 0], [5, 0], [5, 7], [3.5, 7], [3.5, 4.25], [1.5, 4.25], [1.5, 7], [0, 7]], holes: [] }],
  E: [{ outer: [[0, 0], [5, 0], [5, 1.5], [1.5, 1.5], [1.5, 2.75], [4.5, 2.75], [4.5, 4.25], [1.5, 4.25], [1.5, 5.5], [5, 5.5], [5, 7], [0, 7]], holes: [] }],
  L: [{ outer: [[0, 0], [1.5, 0], [1.5, 5.5], [5, 5.5], [5, 7], [0, 7]], holes: [] }],
  T: [{ outer: [[0, 0], [5, 0], [5, 1.5], [3.25, 1.5], [3.25, 7], [1.75, 7], [1.75, 1.5], [0, 1.5]], holes: [] }],
  O: [{ outer: rectRing(0, 0, 5, 7), holes: [[[1.5, 1.5], [1.5, 5.5], [3.5, 5.5], [3.5, 1.5]]] }],
  A: [{ outer: [[0, 7], [1.9, 0], [3.1, 0], [5, 7], [3.5, 7], [3.2, 5.6], [1.8, 5.6], [1.5, 7]], holes: [[[2.5, 2.4], [2.2, 4.3], [2.8, 4.3]]] }],
  I: [{ outer: rectRing(0, 0, 1.5, 7), holes: [] }],
};
const word = (text, slant = 0) => {
  let x = 0;
  const regions = [];
  for (const ch of text) {
    const g = move(glyphs[ch], x, 0);
    regions.push(...(slant ? shear(g, slant) : g));
    x += ch === 'I' ? 2.5 : 6.5;
  }
  return regions;
};

function blob(n, r, noise) {
  const R = rng(n);
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = (r * 100) * (1 + 0.3 * Math.sin(3 * a) + noise * (R() - 0.5));
    return [rr * Math.cos(a), rr * Math.sin(a)];
  });
  return poly(...pts);
}
function grid(n) {
  const out = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push(...rect(i * 3, j * 3 + (i % 2) * 0.5, 2 + (j % 3) * 0.2, 2));
  return out;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomStar(rand, withHole) {
  const n = 5 + Math.floor(rand() * 14);
  const angles = Array.from({ length: n }, (_, i) => ((i + 0.1 + 0.8 * rand()) * Math.PI * 2) / n);
  const rmin = 0.35 + rand() * 0.3;
  const pts = angles.map((a) => {
    const rr = rmin + rand() * (1 - rmin);
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  });
  const shape = [{ outer: pts, holes: [] }];
  if (withHole) {
    const m = 3 + Math.floor(rand() * 4);
    const hr = rmin * 0.3 * (0.4 + 0.6 * rand());
    const hole = Array.from({ length: m }, (_, i) => {
      const a = (-Math.PI * 2 * i) / m;
      const rr = hr * (0.6 + 0.4 * rand());
      return [Math.cos(a) * rr, Math.sin(a) * rr];
    });
    shape[0].holes.push(hole);
  }
  return shape;
}

// ---------- suite ----------
const rows = [];
const pairs = [
  ['square - long rect', rect(0, 0, 2, 2), rect(0, 0, 40, 0.1)],
  ['worked example', rect(0, 0, 2, 2), rect(0, 0, 4, 1)],
  ['square - triangle', rect(0, 0, 3, 3), poly([0, 0], [6, 0], [2, 3])],
  ['star - cross', move(star(5, 0.4, 1), 0, 0, 10), move(cross(), 0, 0, 3)],
  ['L - T', poly([0, 0], [2, 0], [2, 4], [6, 4], [6, 6], [0, 6]), poly([0, 0], [7, 0], [7, 2], [4.5, 2], [4.5, 8], [2.5, 8], [2.5, 2], [0, 2]).map((r) => r)],
  ['ring - square', [{ outer: rectRing(0, 0, 10, 10), holes: [[[3, 3], [3, 7], [7, 7], [7, 3]]] }], rect(0, 0, 5, 5)],
  ['two regions - one', [...rect(0, 0, 3, 3), ...rect(5, 0, 2, 4)], poly([0, 0], [5, 1], [4, 6], [0, 5])],
  ['HELLO - TOTAL', word('HELLO'), word('TOTAL')],
  ['HELLO - HAIL (slanted)', word('HELLO', 0.12), word('HAIL')],
  ['AT - IO', word('AT'), word('IO')],
  ['tiny scale', move(word('HELLO'), 0, 0, 1e-4), move(word('TOTAL'), 0, 0, 1e-4)],
  ['huge scale', move(word('HELLO'), 1e6, 1e6, 1e3), move(word('TOTAL'), -5e5, 2e5, 1e3)],
  ['offset coords', move(word('HE'), 1999, 1999, 1), move(rect(0, 0, 9, 9), -2000, 3)],
  ['thin sliver', poly([0, 0], [100, 0], [100, 0.01], [0, 0.03]), rect(0, 0, 5, 5)],
  ['near-horizontal edge', poly([0, 0], [100, 0.001], [100, 30], [0, 30]), poly([0, 0], [30, 0], [60, 10], [30, 40], [0, 20])],
  ['near-collinear noise', poly([0, 0], [10, 1e-7], [20, 0], [20, 10], [10, 10 + 1e-7], [0, 10]), rect(0, 0, 14, 14)],
  ['tiny notch', poly([0, 0], [10, 0], [10, 10], [5.001, 10], [5, 9.99], [4.999, 10], [0, 10]), rect(0, 0, 20, 5)],
  ['noisy blob 300 pts', blob(300, 1, 0.01), blob(250, 1.5, 0.02)],
  ['unit coords words', move(word('HELLO'), 0, 0, 0.1), move(word('TOTAL'), 0, 0, 0.1)],
  ['grid of 36 regions', grid(6), poly([0, 0], [30, 0], [30, 2], [0, 2])],
  ['ring of rings', [{ outer: rectRing(0, 0, 20, 20), holes: [[[2, 2], [2, 18], [18, 18], [18, 2]]] }, ...rect(5, 5, 10, 10)], blob(120, 1, 0)],
];
for (const [name, a, b] of pairs) runCase(name, a, b, rows);

const R = rng(20240229);
for (let i = 0; i < 220; i++) {
  const withHoleA = R() < 0.35;
  const withHoleB = R() < 0.35;
  const sA = move(randomStar(R, withHoleA), R() * 50, R() * 50, 1 + R() * 300);
  const sB = move(randomStar(R, withHoleB), R() * 50, R() * 50, 1 + R() * 300);
  runCase(`random ${i}`, sA, sB, rows, i % 5 === 0 ? { ribbonAspect: 3 + R() * 40 } : undefined);
}

// ---------- error codes ----------
const expectCode = (name, code, a, b) => {
  try {
    dissect(a, b);
    fail(name, `expected ${code}, got no error`);
  } catch (e) {
    if (e.code !== code) fail(name, `expected ${code}, got ${e.code}: ${e.message}`);
  }
};
const sq = rect(0, 0, 1, 1);
expectCode('empty A', 'empty', [], sq);
expectCode('empty B', 'empty', sq, []);
expectCode('collinear', 'degenerate', poly([0, 0], [1, 1], [2, 2]), sq);
expectCode('zero ring', 'degenerate', poly([1, 1], [1, 1], [1, 1]), sq);
expectCode('bow-tie', 'self-intersecting', poly([0, 0], [2, 2], [2, 0], [0, 2]), sq);
expectCode('self-cross B', 'self-intersecting', sq, poly([0, 0], [4, 0], [4, 4], [2, -1], [1, 4]));

// ---------- report ----------
const named = rows.filter((r) => !r.name.startsWith('random '));
const random = rows.filter((r) => r.name.startsWith('random '));
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('case', 26) + pad('cellsA', 8) + pad('cellsB', 8) + pad('pieces', 8) + pad('areaError', 12) + pad('ms', 8) + 'result');
for (const r of named) console.log(pad(r.name, 26) + pad(r.cellsA, 8) + pad(r.cellsB, 8) + pad(r.pieces, 8) + pad(r.areaError.toExponential(1), 12) + pad(r.ms, 8) + (r.ok ? 'ok' : 'FAIL'));
if (random.length) {
  const maxOf = (k) => Math.max(...random.map((r) => r[k]));
  const mean = random.reduce((s, r) => s + r.pieces, 0) / random.length;
  console.log(`random x${random.length}`.padEnd(26) + pad('', 16) + pad(`${Math.round(mean)} avg`, 8) + pad(`max ${maxOf('areaError').toExponential(1)}`, 12) + pad(`max ${maxOf('ms')}`, 8) + (random.every((r) => r.ok) ? 'ok' : 'FAIL') + `   (max pieces ${maxOf('pieces')})`);
}
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of failures.slice(0, 40)) console.log('  ' + f);
  process.exit(1);
}
console.log('\nall checks passed');
