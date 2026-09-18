// Layered graph layout, left to right.
//
// A 12-state automaton drawn badly is unreadable, and these graphs have three
// features a generic force layout handles poorly: self-loops, back-edges (every
// star has one), and parallel edges between the same pair. So this is a small
// Sugiyama pipeline — rank by BFS, order within ranks by barycentre sweeps,
// then route each edge class deliberately.

const RANK_GAP = 130;
const ROW_GAP = 84;
const PAD = 48;

export const NODE_R = 21;

export function layout(nodes, edges, { start = 0, rankGap = RANK_GAP, rowGap = ROW_GAP } = {}) {
  const ids = nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const out = new Map(ids.map((id) => [id, []]));
  const inn = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (!out.has(e.from) || !inn.has(e.to)) continue;
    out.get(e.from).push(e.to);
    inn.get(e.to).push(e.from);
  }

  // --- rank: BFS from the start state, so distance from start reads as depth.
  const rank = new Map();
  rank.set(start, 0);
  const queue = [start];
  while (queue.length) {
    const q = queue.shift();
    for (const t of out.get(q) ?? []) {
      if (!rank.has(t)) { rank.set(t, rank.get(q) + 1); queue.push(t); }
    }
  }
  // Anything unreachable (a trap reached only by hidden edges) goes last.
  const maxRank = Math.max(0, ...rank.values());
  for (const id of ids) if (!rank.has(id)) rank.set(id, maxRank + 1);

  // --- order within each rank: barycentre sweeps, seeded by id for determinism.
  const layers = [];
  for (const id of ids) {
    const r = rank.get(id);
    (layers[r] ??= []).push(id);
  }
  for (const l of layers) if (l) l.sort((a, b) => a - b);

  const pos = new Map();
  const reindex = () => {
    for (const l of layers) if (l) l.forEach((id, i) => pos.set(id, i));
  };
  reindex();

  const barycentre = (id, neighbours) => {
    const ns = neighbours.filter((n) => pos.has(n) && n !== id);
    if (ns.length === 0) return pos.get(id);
    return ns.reduce((s, n) => s + pos.get(n), 0) / ns.length;
  };

  for (let sweep = 0; sweep < 4; sweep++) {
    const downward = sweep % 2 === 0;
    const order = downward
      ? [...layers.keys()]
      : [...layers.keys()].reverse();
    for (const r of order) {
      const layer = layers[r];
      if (!layer || layer.length < 2) continue;
      const weights = new Map(
        layer.map((id) => [id, barycentre(id, downward ? inn.get(id) : out.get(id))]),
      );
      layer.sort((a, b) => (weights.get(a) - weights.get(b)) || (a - b));
      reindex();
    }
  }

  // --- coordinates, each layer vertically centred against the tallest one.
  const tallest = Math.max(...layers.map((l) => (l ? l.length : 0)));
  const height = Math.max(1, tallest) * rowGap;
  const placed = new Map();
  layers.forEach((layer, r) => {
    if (!layer) return;
    const span = layer.length * rowGap;
    const top = (height - span) / 2;
    layer.forEach((id, i) => {
      placed.set(id, {
        x: PAD + r * rankGap,
        y: PAD + top + i * rowGap + rowGap / 2,
        rank: r,
        row: i,
      });
    });
  });

  const laidNodes = nodes.map((n) => ({ ...n, ...placed.get(n.id) }));

  // --- edges. Parallel pairs are fanned so labels never sit on top of one
  // another, and the three special classes get their own routing.
  const pairCount = new Map();
  for (const e of edges) {
    const k = `${e.from}>${e.to}`;
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }
  const pairSeen = new Map();

  const laidEdges = edges.map((e) => {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) return null;
    const k = `${e.from}>${e.to}`;
    const total = pairCount.get(k);
    const nth = pairSeen.get(k) ?? 0;
    pairSeen.set(k, nth + 1);
    const fan = total === 1 ? 0 : (nth - (total - 1) / 2) * 26;

    if (e.from === e.to) return { ...e, ...selfLoop(a, fan) };
    if (a.rank === b.rank) return { ...e, ...sameRank(a, b, fan) };
    if (b.rank < a.rank) return { ...e, ...backEdge(a, b, fan) };
    return { ...e, ...forwardEdge(a, b, fan) };
  }).filter(Boolean);

  const width = PAD * 2 + (layers.length - 1) * rankGap;
  return {
    nodes: laidNodes,
    edges: laidEdges,
    width: Math.max(width, 240),
    height: height + PAD * 2,
    ranks: layers.length,
  };
}

// Where a line from `from` toward `to` crosses the node circle.
function onRim(from, to, r = NODE_R) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * r, y: from.y + (dy / len) * r };
}

function forwardEdge(a, b, fan) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 - fan;
  const bend = { x: mx, y: my };
  const s = onRim(a, bend);
  const t = onRim(b, bend);
  // A straight run gets a straight line; anything fanned or off-row curves.
  if (fan === 0 && Math.abs(a.y - b.y) < 1) {
    return { path: `M ${s.x} ${s.y} L ${t.x} ${t.y}`, label: { x: mx, y: my - 8 }, kind: 'forward' };
  }
  return {
    path: `M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`,
    label: { x: mx, y: my - 8 },
    kind: 'forward',
  };
}

// Back-edges bow below the row so they never overlap the forward flow.
function backEdge(a, b, fan) {
  const drop = 46 + Math.abs(fan);
  const mx = (a.x + b.x) / 2;
  const my = Math.max(a.y, b.y) + drop;
  const s = onRim(a, { x: a.x, y: a.y + 1 });
  const t = onRim(b, { x: b.x, y: b.y + 1 });
  return {
    path: `M ${s.x} ${s.y} C ${a.x} ${my} ${b.x} ${my} ${t.x} ${t.y}`,
    label: { x: mx, y: my - 4 },
    kind: 'back',
  };
}

function sameRank(a, b, fan) {
  const bow = 40 + Math.abs(fan);
  const dir = b.y > a.y ? 1 : -1;
  const mx = a.x + bow;
  const my = (a.y + b.y) / 2;
  const s = onRim(a, { x: a.x + 1, y: a.y + dir });
  const t = onRim(b, { x: b.x + 1, y: b.y - dir });
  return {
    path: `M ${s.x} ${s.y} C ${mx} ${a.y} ${mx} ${b.y} ${t.x} ${t.y}`,
    label: { x: mx - 2, y: my },
    kind: 'same',
  };
}

function selfLoop(a, fan) {
  const r = NODE_R;
  const lift = 34 + Math.abs(fan);
  const sx = a.x - r * 0.55;
  const sy = a.y - r * 0.84;
  const tx = a.x + r * 0.55;
  const ty = a.y - r * 0.84;
  return {
    path: `M ${sx} ${sy} C ${a.x - lift} ${a.y - lift * 1.6} ${a.x + lift} ${a.y - lift * 1.6} ${tx} ${ty}`,
    label: { x: a.x, y: a.y - lift * 1.25 },
    kind: 'self',
  };
}
