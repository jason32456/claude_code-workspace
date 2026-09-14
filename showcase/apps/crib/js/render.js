// SVG drawing. Everything here is generated from the live state — no asset
// files, and nothing is drawn that the engine did not compute.

import { N, chr, ord, Enigma } from './enigma.js';

const SVG = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

/* ------------------------------------------------------------- wiring ---- */

const COL = { pb: 150, r2: 300, r1: 450, r0: 600, ref: 750 };
const TOP = 30;
const ROW = 15.0;
const yOf = (i) => TOP + i * ROW;

/**
 * The scrambler as five stacked banks, with one keypress traced through it.
 *
 * The forward leg and the return leg are drawn in different colours, so the
 * fact that the path comes back through the same rotors — which is what makes
 * the machine reciprocal, and what guarantees it has no fixed points — is
 * visible rather than stated.
 */
export function drawWiring(svg, machine, traced) {
  clear(svg);

  const banks = [
    { x: COL.pb, label: 'plugboard' },
    { x: COL.r2, label: machine.rotorNames[2] + ' (fast)' },
    { x: COL.r1, label: machine.rotorNames[1] },
    { x: COL.r0, label: machine.rotorNames[0] },
    { x: COL.ref, label: 'reflector ' + machine.reflectorName },
  ];

  for (const b of banks) {
    svg.appendChild(el('text', { x: b.x, y: 14, 'text-anchor': 'middle',
      fill: '#6b7788', 'font-size': 10.5, 'font-family': 'ui-monospace, monospace' }));
    svg.lastChild.textContent = b.label;
    for (let i = 0; i < N; i++) {
      svg.appendChild(el('circle', { cx: b.x, cy: yOf(i), r: 2.4, fill: '#232c38' }));
    }
  }

  // Keyboard gutter, so the entry and exit letters can be read off directly.
  for (let i = 0; i < N; i++) {
    const t = el('text', { x: 46, y: yOf(i) + 3.6, 'text-anchor': 'middle',
      fill: '#4e596a', 'font-size': 10.5, 'font-family': 'ui-monospace, monospace' });
    t.textContent = chr(i);
    svg.appendChild(t);
  }
  const kb = el('text', { x: 46, y: 14, 'text-anchor': 'middle', fill: '#6b7788',
    'font-size': 10.5, 'font-family': 'ui-monospace, monospace' });
  kb.textContent = 'keys';
  svg.appendChild(kb);

  if (!traced) return;

  const seg = (x1, y1, x2, y2, stroke, width = 1.7, dash = null) => {
    const mx = (x1 + x2) / 2;
    const p = el('path', {
      d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`,
      fill: 'none', stroke, 'stroke-width': width, 'stroke-linecap': 'round',
    });
    if (dash) p.setAttribute('stroke-dasharray', dash);
    svg.appendChild(p);
    return p;
  };

  const F = '#3b82f6', R = '#c07d20';
  const p = traced.path;   // [key, plugOut, r2, r1, r0, refl, r0b, r1b, r2b, plugIn, lamp]

  seg(78, yOf(p[0]), COL.pb, yOf(p[1]), F);
  seg(COL.pb, yOf(p[1]), COL.r2, yOf(p[2]), F);
  seg(COL.r2, yOf(p[2]), COL.r1, yOf(p[3]), F);
  seg(COL.r1, yOf(p[3]), COL.r0, yOf(p[4]), F);
  seg(COL.r0, yOf(p[4]), COL.ref, yOf(p[5]), F);

  seg(COL.ref, yOf(p[5]), COL.r0, yOf(p[6]), R);
  seg(COL.r0, yOf(p[6]), COL.r1, yOf(p[7]), R);
  seg(COL.r1, yOf(p[7]), COL.r2, yOf(p[8]), R);
  seg(COL.r2, yOf(p[8]), COL.pb, yOf(p[9]), R);
  seg(COL.pb, yOf(p[9]), 78, yOf(p[10]), R);

  const dot = (x, y, fill) => svg.appendChild(el('circle', { cx: x, cy: y, r: 3.6, fill }));
  dot(78, yOf(p[0]), F);
  dot(78, yOf(p[10]), "#5fd0a0");

  const lab = (x, y, text, fill) => {
    const t = el('text', { x, y, 'text-anchor': 'middle', fill, 'font-size': 12.5,
      'font-family': 'ui-monospace, monospace', 'font-weight': 600 });
    t.textContent = text;
    svg.appendChild(t);
  };
  lab(78, yOf(p[0]) - 10, chr(p[0]), F);
  lab(78, yOf(p[10]) + 17, chr(p[10]), "#5fd0a0");

  const cap = el('text', { x: 450, y: 448, 'text-anchor': 'middle', fill: '#6b7788',
    'font-size': 11.5, 'font-family': 'ui-monospace, monospace' });
  cap.textContent = `${chr(p[0])} → ${chr(p[10])}   ·   out and back through the same rotors   ·   never ${chr(p[0])} → ${chr(p[0])}`;
  svg.appendChild(cap);
}

/** Trace one keypress without disturbing the caller's machine. */
export function tracePress(machine, letter) {
  const m = machine.clone();
  m.pos = [...machine.pos];
  m.step();

  const path = [];
  const c = ord(letter);
  path.push(c);
  let x = m.plug[c];
  path.push(x);

  for (let i = 2; i >= 0; i--) {
    const shift = m.pos[i] - m.rings[i];
    x = (m.data[i].fwd[(x + shift + N * 2) % N] - shift + N * 2) % N;
    path.push(x);
  }
  x = m.reflector[x];
  path.push(x);
  for (let i = 0; i < 3; i++) {
    const shift = m.pos[i] - m.rings[i];
    x = (m.data[i].rev[(x + shift + N * 2) % N] - shift + N * 2) % N;
    path.push(x);
  }
  path.push(m.plug[x]);
  path.push(m.plug[x]);
  return { path, out: chr(m.plug[x]) };
}

/* --------------------------------------------------------------- menu ---- */

/**
 * The constraint graph, laid out on a circle.
 *
 * Edges that lie on a cycle are drawn hot, because those are the only edges
 * that do any work: a tree edge propagates a hypothesis, a cycle edge can
 * contradict it.
 */
export function drawMenu(svg, menu, testReg) {
  clear(svg);
  const W = 640, H = 400, cx = W / 2, cy = H / 2;
  const verts = menu.vertices ?? [];
  if (!verts.length) {
    const t = el('text', { x: cx, y: cy, 'text-anchor': 'middle', fill: '#6b7788', 'font-size': 13 });
    t.textContent = 'No valid alignment selected.';
    svg.appendChild(t);
    return;
  }

  const R = Math.min(W, H) / 2 - 46;
  const pos = new Map();
  verts.forEach((v, i) => {
    const a = (i / verts.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(v, [cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  });

  const onCycle = cycleEdges(menu.edges);

  // Parallel edges between the same pair need different curvature.
  const seen = new Map();
  menu.edges.forEach((e, i) => {
    const key = Math.min(e.p, e.c) + ':' + Math.max(e.p, e.c);
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);

    const [x1, y1] = pos.get(e.p);
    const [x2, y2] = pos.get(e.c);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const bow = (k % 2 === 0 ? 1 : -1) * (18 + 20 * Math.floor(k / 2));
    const px = mx - (dy / len) * bow, py = my + (dx / len) * bow;

    const hot = onCycle.has(i);
    svg.appendChild(el('path', {
      d: `M${x1},${y1} Q${px},${py} ${x2},${y2}`,
      fill: 'none',
      stroke: hot ? '#c07d20' : '#2f3c4c',
      'stroke-width': hot ? 2.1 : 1.3,
    }));

    const t = el('text', {
      x: px, y: py + 3.5, 'text-anchor': 'middle',
      fill: hot ? '#d9a441' : '#55637a', 'font-size': 9.5,
      'font-family': 'ui-monospace, monospace',
    });
    t.textContent = e.t + 1;
    svg.appendChild(t);
  });

  for (const v of verts) {
    const [x, y] = pos.get(v);
    const isTest = v === testReg;
    svg.appendChild(el('circle', {
      cx: x, cy: y, r: isTest ? 15 : 12.5,
      fill: isTest ? '#2b2547' : '#1c242f',
      stroke: isTest ? '#8b7bd8' : '#3a4657',
      'stroke-width': isTest ? 2.2 : 1.3,
    }));
    const t = el('text', {
      x, y: y + 4.6, 'text-anchor': 'middle',
      fill: isTest ? '#cfc4ff' : '#dbe3ee',
      'font-size': 13, 'font-weight': 600, 'font-family': 'ui-monospace, monospace',
    });
    t.textContent = chr(v);
    svg.appendChild(t);
  }

  const legend = el('text', { x: 12, y: H - 10, fill: '#6b7788', 'font-size': 11,
    'font-family': 'ui-monospace, monospace' });
  legend.textContent = `amber = on a loop   ·   violet = test register   ·   numbers are scrambler offsets`;
  svg.appendChild(legend);
}

/** Which edges lie on at least one cycle: everything not a bridge of the graph. */
function cycleEdges(edges) {
  const parent = new Int32Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };

  const tree = new Set();
  const extra = [];
  edges.forEach((e, i) => {
    const a = find(e.p), b = find(e.c);
    if (a === b) extra.push(i);
    else { parent[a] = b; tree.add(i); }
  });
  if (!extra.length) return new Set();

  // Any edge on the tree path between the endpoints of a non-tree edge is on a
  // cycle too. Rebuild adjacency over tree edges and walk.
  const adj = new Map();
  for (const i of tree) {
    const e = edges[i];
    if (!adj.has(e.p)) adj.set(e.p, []);
    if (!adj.has(e.c)) adj.set(e.c, []);
    adj.get(e.p).push([e.c, i]);
    adj.get(e.c).push([e.p, i]);
  }

  const out = new Set(extra);
  for (const i of extra) {
    const { p, c } = edges[i];
    const prev = new Map([[p, null]]);
    const queue = [p];
    let found = false;
    while (queue.length && !found) {
      const v = queue.shift();
      for (const [w, ei] of adj.get(v) ?? []) {
        if (prev.has(w)) continue;
        prev.set(w, [v, ei]);
        if (w === c) { found = true; break; }
        queue.push(w);
      }
    }
    let cur = c;
    while (prev.get(cur)) { const [v, ei] = prev.get(cur); out.add(ei); cur = v; }
  }
  return out;
}

/* ----------------------------------------------------- diagonal board ---- */

/**
 * The 26 × 26 lattice of (cable, wire) claims.
 *
 * The diagonal is drawn because it is the whole idea: the board makes cell
 * (x, y) and cell (y, x) the same wire, so lighting one lights the other, and
 * a hypothesis propagates across the grid instead of down a single column.
 */
export function drawBoard(svg, live, testReg) {
  clear(svg);
  const S = 420, pad = 22, cell = (S - pad * 2) / N;

  svg.appendChild(el('rect', { x: pad, y: pad, width: cell * N, height: cell * N,
    fill: '#131922', stroke: '#232c38' }));

  for (let i = 0; i <= N; i++) {
    const p = pad + i * cell;
    svg.appendChild(el('line', { x1: p, y1: pad, x2: p, y2: pad + cell * N, stroke: '#1b222c', 'stroke-width': .6 }));
    svg.appendChild(el('line', { x1: pad, y1: p, x2: pad + cell * N, y2: p, stroke: '#1b222c', 'stroke-width': .6 }));
  }

  svg.appendChild(el('line', {
    x1: pad, y1: pad, x2: pad + cell * N, y2: pad + cell * N,
    stroke: '#3a4657', 'stroke-width': 1.2, 'stroke-dasharray': '3 3',
  }));

  if (live) {
    for (let v = 0; v < N; v++) {
      const mask = live[v] | 0;
      if (!mask) continue;
      for (let w = 0; w < N; w++) {
        if (!(mask & (1 << w))) continue;
        svg.appendChild(el('rect', {
          x: pad + w * cell + .6, y: pad + v * cell + .6,
          width: cell - 1.2, height: cell - 1.2,
          fill: v === testReg ? '#8b7bd8' : '#5fd0a0',
          opacity: v === testReg ? .95 : .62, rx: 1.5,
        }));
      }
    }
  }

  if (testReg != null) {
    svg.appendChild(el('rect', {
      x: pad - 1, y: pad + testReg * cell - 1, width: cell * N + 2, height: cell + 2,
      fill: 'none', stroke: '#8b7bd8', 'stroke-width': 1.4,
    }));
  }

  for (let i = 0; i < N; i++) {
    const a = el('text', { x: pad + i * cell + cell / 2, y: pad - 7, 'text-anchor': 'middle',
      fill: '#4e596a', 'font-size': 8, 'font-family': 'ui-monospace, monospace' });
    a.textContent = chr(i);
    svg.appendChild(a);
    const b = el('text', { x: pad - 7, y: pad + i * cell + cell / 2 + 3, 'text-anchor': 'middle',
      fill: '#4e596a', 'font-size': 8, 'font-family': 'ui-monospace, monospace' });
    b.textContent = chr(i);
    svg.appendChild(b);
  }
}

export { Enigma };
