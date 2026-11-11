import { s, h } from './dom.js';

const CHAR_W = 7.2;
const PILL_H = 26;

function diagram(cycle, nameOf, colourOf) {
  const n = cycle.length;
  const widths = cycle.map((id) => Math.min(130, nameOf(id).length * CHAR_W + 22));
  const avg = widths.reduce((a, b) => a + b, 0) / n;
  const r = n === 1 ? 0 : Math.max(n === 2 ? 70 : 80, ((avg + 16) * n) / (2 * Math.PI) * 1.1);
  const pad = 80;
  const size = 2 * r + 2 * pad;
  const c = size / 2;
  const pts = cycle.map((_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  });
  const trim = (p, q, w) => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const t = Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? PILL_H / 2 / Math.abs(dy) : Infinity) + 0.015;
    return { x: p.x + dx * t, y: p.y + dy * t };
  };
  const edges = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = pts[i];
    const b = pts[j];
    const start = trim(a, b, widths[i]);
    const end = trim(b, a, widths[j] + 6);
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const bulge = n === 2 ? 28 : len * 0.08;
    const cx = mx + (-(end.y - start.y) / len) * bulge;
    const cy = my + ((end.x - start.x) / len) * bulge;
    edges.push(s('path', { d: `M${start.x} ${start.y} Q${cx} ${cy} ${end.x} ${end.y}`, class: 'edge', 'marker-end': 'url(#arrow)' }));
  }
  const nodes = cycle.map((id, i) =>
    s(
      'g',
      { class: 'node', style: { '--hh': colourOf(id) } },
      s('rect', { x: pts[i].x - widths[i] / 2, y: pts[i].y - PILL_H / 2, width: widths[i], height: PILL_H, rx: PILL_H / 2 }),
      s('text', { x: pts[i].x, y: pts[i].y, 'text-anchor': 'middle', 'dominant-baseline': 'central', text: nameOf(id) })
    )
  );
  const label = `Loop of ${n}: ${cycle.map(nameOf).join(' gives to ')} gives to ${nameOf(cycle[0])}`;
  return s(
    'svg',
    { viewBox: `0 0 ${size} ${size}`, class: 'loop-svg', role: 'img', 'aria-label': label, style: { 'max-width': `${Math.max(300, Math.min(size, 760))}px` } },
    s(
      'defs',
      null,
      s('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0L10 5L0 10z', class: 'arrowhead' }))
    ),
    edges,
    nodes
  );
}

export function loopsView(cycles, nameOf, colourOf) {
  return h(
    'div',
    { class: 'loops' },
    cycles.map((cycle, i) =>
      h(
        'figure',
        { class: 'loop' },
        diagram(cycle, nameOf, colourOf),
        h('figcaption', { text: cycles.length > 1 ? `Loop ${i + 1}: ${cycle.length} people` : `One loop through all ${cycle.length} people` })
      )
    )
  );
}
