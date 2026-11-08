import { h } from './dom.js';
import { format } from './money.js';

const W = 640, H = 460;

// People on an ellipse, debts as curved arrows whose width follows the amount.
// Swapping edge sets fades the old arrows out and draws the new ones in.
export function drawGraph(svg, { members, balance, edges, base, focus, onPick }) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const n = members.length;
  const cx = W / 2, cy = H / 2 + 6;
  const rx = n <= 2 ? 170 : 230, ry = n <= 2 ? 0.01 : 160;
  const pos = {};
  members.forEach((m, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    pos[m.id] = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
  const max = Math.max(1, ...edges.map((e) => e.amount));

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = h('svg:defs', {},
      h('svg:marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 2.8, markerHeight: 2.8, orient: 'auto-start-reverse', markerUnits: 'strokeWidth' },
        h('svg:path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrowhead' })));
    svg.append(defs);
  }
  let layer = svg.querySelector('g.edges');
  const old = layer;
  layer = h('svg:g', { class: 'edges' });
  if (old) {
    old.classList.add('leaving');
    old.setAttribute('class', 'edges leaving');
    setTimeout(() => old.remove(), 380);
    svg.insertBefore(layer, old.nextSibling);
  } else svg.append(layer);

  const nodeR = 25;
  edges.forEach((e, k) => {
    const p = pos[e.from], q = pos[e.to];
    if (!p || !q) return;
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const bend = Math.min(60, len * 0.18);
    const mx = (p.x + q.x) / 2 - uy * bend, my = (p.y + q.y) / 2 + ux * bend;
    const sw = 1.6 + 8 * Math.sqrt(e.amount / max);
    const pad = nodeR + 3;
    const sx = p.x + ux * pad - uy * 6, sy = p.y + uy * pad + ux * 6;
    const ex = q.x - ux * (pad + sw * 0.9) - uy * 6, ey = q.y - uy * (pad + sw * 0.9) + ux * 6;
    const d = `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
    const dim = focus && e.from !== focus && e.to !== focus;
    const quiet = edges.length > 8 && !(focus && !dim);
    const g = h('svg:g', { class: 'edge' + (dim ? ' dim' : '') + (focus && !dim ? ' hot' : '') + (quiet ? ' quiet' : ''), style: { '--i': k } });
    const path = h('svg:path', { d, 'stroke-width': sw.toFixed(2), 'marker-end': 'url(#arrow)', class: 'flow' });
    const lx = 0.25 * sx + 0.5 * mx + 0.25 * ex, ly = 0.25 * sy + 0.5 * my + 0.25 * ey;
    const label = format(e.amount, base);
    const tw = label.length * 7.1 + 14;
    g.append(path, h('svg:g', { class: 'tag', transform: `translate(${lx.toFixed(1)},${ly.toFixed(1)})` },
      h('svg:rect', { x: -tw / 2, y: -11, width: tw, height: 22, rx: 11 }),
      h('svg:text', { 'text-anchor': 'middle', y: 4.5 }, label)));
    layer.append(g);
    const L = path.getTotalLength ? path.getTotalLength() : 300;
    path.style.strokeDasharray = `${L} ${L}`;
    path.style.strokeDashoffset = L;
    requestAnimationFrame(() => requestAnimationFrame(() => { path.style.strokeDashoffset = 0; }));
  });

  let nodes = svg.querySelector('g.nodes');
  if (nodes) nodes.remove();
  nodes = h('svg:g', { class: 'nodes' });
  for (const m of members) {
    const { x, y } = pos[m.id];
    const b = balance[m.id] || 0;
    const below = y >= cy - 1;
    const ny = below ? y + nodeR + 18 : y - nodeR - 22;
    nodes.append(h('svg:g', {
      class: 'node' + (focus === m.id ? ' focus' : ''), tabindex: 0, role: 'button',
      'aria-label': `${m.name}, ${b >= 0 ? 'is owed' : 'owes'} ${format(Math.abs(b), base)}`,
      onclick: () => onPick?.(m.id),
      onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick?.(m.id); } },
    },
      h('svg:circle', { cx: x, cy: y, r: nodeR + 5, class: 'halo', style: { stroke: m.color } }),
      h('svg:circle', { cx: x, cy: y, r: nodeR, style: { fill: m.color } }),
      h('svg:text', { x, y: y + 6, 'text-anchor': 'middle', class: 'initial' }, initials(m.name)),
      h('svg:text', { x, y: ny, 'text-anchor': 'middle', class: 'name' }, m.name),
      h('svg:text', { x, y: ny + 16, 'text-anchor': 'middle', class: 'bal ' + (b > 0 ? 'pos' : b < 0 ? 'neg' : 'zero') },
        b === 0 ? 'square' : format(b, base, { sign: true }))));
  }
  svg.append(nodes);
}

export const initials = (name) => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : [...parts[0]].slice(0, 2).join('')).toUpperCase();
};
