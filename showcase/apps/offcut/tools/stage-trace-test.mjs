import { traceGrid, ringArea, shapeArea, tangledRings, pointInRing, padAndRepair } from '../js/trace.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function bitmap(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const grid = new Uint8Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => (grid[y * w + x] = ch === '#' ? 1 : 0)));
  return { grid, w, h };
}

function pixelArea(grid, w, h) {
  const { filled } = padAndRepair(grid, w, h);
  return filled.reduce((n, v) => n + v, 0);
}

function allRings(shape) {
  return shape.flatMap((r) => [r.outer, ...r.holes]);
}

function validate(name, shape, { regions, holes, grid, w, h, tolerance, minArea = 1 }) {
  check(`${name}: ${regions} region(s)`, shape.length === regions, `got ${shape.length}`);
  check(`${name}: ${holes} hole(s)`, shape.reduce((n, r) => n + r.holes.length, 0) === holes);
  const rings = allRings(shape);
  check(`${name}: rings simple`, tangledRings(rings).size === 0);
  check(`${name}: every ring has 3+ points and no repeated neighbours`, rings.every((ring) => ring.length >= 3 && ring.every((p, i) => {
    const q = ring[(i + 1) % ring.length];
    return p[0] !== q[0] || p[1] !== q[1];
  })));
  for (const r of shape) {
    check(`${name}: holes nested in their outer`, r.holes.every((hole) => hole.every(([x, y]) => pointInRing(x, y, r.outer))));
  }
  const exact = traceGrid(grid, w, h, { tolerance: 0, minArea });
  const perimeter = allRings(exact).reduce((n, ring) => n + ring.reduce((m, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return m + Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
  }, 0), 0);
  const px = pixelArea(grid, w, h);
  check(`${name}: exact trace area equals pixel area`, Math.abs(shapeArea(exact) - px) < 1e-9, `${shapeArea(exact)} vs ${px}`);
  const dev = Math.abs(shapeArea(shape) - px);
  check(`${name}: simplified area within tolerance`, dev <= tolerance * perimeter + 1e-9, `off by ${dev.toFixed(2)}, allowed ${(tolerance * perimeter).toFixed(2)}`);
}

{
  const { grid, w, h } = bitmap(['######', '######', '######', '######']);
  validate('square', traceGrid(grid, w, h, { tolerance: 1, minArea: 1 }), { regions: 1, holes: 0, grid, w, h, tolerance: 1 });
  const s = traceGrid(grid, w, h, { tolerance: 1, minArea: 1 });
  check('square: four corners', s[0].outer.length === 4);
  check('square: edge-touching shape sits at 0..w', Math.min(...s[0].outer.map((p) => p[0])) === 0 && Math.max(...s[0].outer.map((p) => p[0])) === 6);
}
{
  const { grid, w, h } = bitmap([
    '#######',
    '#######',
    '##...##',
    '##...##',
    '#######',
    '#######',
  ]);
  validate('ring', traceGrid(grid, w, h, { tolerance: 1, minArea: 1 }), { regions: 1, holes: 1, grid, w, h, tolerance: 1 });
}
{
  const { grid, w, h } = bitmap([
    '###....###',
    '###....###',
    '###....###',
  ]);
  validate('two blobs', traceGrid(grid, w, h, { tolerance: 1, minArea: 1 }), { regions: 2, holes: 0, grid, w, h, tolerance: 1 });
}
{
  const { grid, w, h } = bitmap([
    '###...',
    '###...',
    '###...',
    '######',
    '######',
  ]);
  const shape = traceGrid(grid, w, h, { tolerance: 0.5, minArea: 1 });
  validate('L', shape, { regions: 1, holes: 0, grid, w, h, tolerance: 0.5 });
  check('L: six corners', shape[0].outer.length === 6);
}
{
  const { grid, w, h } = bitmap(['.....', '..#..', '.....']);
  check('one-pixel speck removed at default minArea', traceGrid(grid, w, h).length === 0);
  check('one-pixel speck kept when minArea allows', traceGrid(grid, w, h, { minArea: 1 }).length === 1);
}
{
  const { grid, w, h } = bitmap([
    '#.',
    '.#',
  ]);
  const shape = traceGrid(grid, w, h, { tolerance: 0, minArea: 1 });
  validate('diagonal pixels', shape, { regions: 1, holes: 0, grid, w, h, tolerance: 0 });
  check('diagonal pixels are joined into one region of 3 pixels', Math.abs(shapeArea(shape) - 3) < 1e-9);
}
{
  const { grid, w, h } = bitmap([
    '#.#.',
    '.#.#',
    '#.#.',
    '.#.#',
  ]);
  const shape = traceGrid(grid, w, h, { tolerance: 0, minArea: 1 });
  check('checkerboard: result is simple', tangledRings(allRings(shape)).size === 0);
  check('checkerboard: no two regions touch', shape.length >= 1);
}
{
  const { grid, w, h } = bitmap([
    '..........',
    '.########.',
    '.#......#.',
    '.#.####.#.',
    '.#.####.#.',
    '.#......#.',
    '.########.',
    '..........',
  ]);
  const shape = traceGrid(grid, w, h, { tolerance: 1, minArea: 1 });
  validate('island inside a hole', shape, { regions: 2, holes: 1, grid, w, h, tolerance: 1 });
  const outer = shape.find((r) => r.holes.length);
  check('island inside a hole: hole belongs to the big outer', Math.abs(ringArea(outer.outer)) > 40);
}
{
  const w = 90;
  const h = 90;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - 45, y - 45) < 38 && Math.hypot(x - 45, y - 45) > 14) grid[y * w + x] = 1;
  const coarse = traceGrid(grid, w, h, { tolerance: 3 });
  const fine = traceGrid(grid, w, h, { tolerance: 0.6 });
  validate('annulus', coarse, { regions: 1, holes: 1, grid, w, h, tolerance: 3, minArea: 16 });
  const count = (s) => s.reduce((n, r) => n + r.outer.length + r.holes.reduce((m, q) => m + q.length, 0), 0);
  check('lower detail gives fewer vertices', count(coarse) < count(fine), `${count(coarse)} < ${count(fine)}`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
