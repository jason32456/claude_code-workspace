import { h } from './dom.js';
import { REASONS } from './schedule.js';
import { clock, dur } from './time.js';

const ROW = 30;
const SUB = 16;
const AXIS = 30;

// Heat colour for an oven temperature: amber at 140 °C to deep red at 250 °C.
export function heat(temp) {
  const k = Math.max(0, Math.min(1, (temp - 140) / 110));
  const hue = 42 - k * 38, light = 58 - k * 12;
  return `hsl(${hue} 88% ${light}%)`;
}

export function renderTimeline(host, menu, p, { onPick, tip, nowMin }) {
  host.replaceChildren();
  if (!p.items.length) {
    host.append(h('div', { class: 'empty' }, h('p', {}, 'No dishes yet.'), h('p', { class: 'muted small' }, 'Add one from the menu on the left, or load a preset.')));
    return;
  }
  const narrow = host.clientWidth < 640;
  const LABEL = narrow ? 108 : 156;
  const t0 = Math.floor((p.stats.start - 5) / 15) * 15;
  const t1 = Math.ceil((p.stats.end + 5) / 15) * 15;
  const avail = Math.max(320, host.clientWidth - LABEL - 16);
  const ppm = Math.max(2.2, avail / (t1 - t0));
  const X = (t) => LABEL + (t - t0) * ppm;
  const W = X(t1) + 12;
  const serveMin = menu.serveMin;

  // Lanes inside each dish, in case custom dependencies let two steps overlap.
  const rows = [];
  for (const d of menu.dishes) {
    const its = p.items.filter((i) => i.dish === d.id);
    if (!its.length) continue;
    const lanes = [];
    for (const it of its) {
      let k = lanes.findIndex((e) => e <= it.start);
      if (k < 0) { k = lanes.length; lanes.push(-Infinity); }
      lanes[k] = it.end;
      it._lane = k;
    }
    rows.push({ dish: d, its, lanes: lanes.length });
  }
  const dishH = rows.reduce((n, r) => n + r.lanes * ROW + 6, 0);
  const cookRows = p.stats.cooks.length;
  const burnerRows = Math.max(1, p.burnerLanes);
  const ovenRows = p.ovens.length;
  const resTop = AXIS + dishH + 22;
  const Htotal = resTop + cookRows * 22 + 8 + burnerRows * 10 + 18 + ovenRows * 30 + 18;

  const svg = h('svg:svg', { class: 'gantt', width: W, height: Htotal, viewBox: `0 0 ${W} ${Htotal}`, role: 'img', 'aria-label': 'Cooking timeline' });
  svg.append(h('svg:defs', {},
    h('svg:pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      h('svg:rect', { width: 6, height: 6, fill: 'var(--bar-bg)' }),
      h('svg:line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'currentColor', 'stroke-width': 2.2, opacity: 0.55 })),
  ));

  // Axis + grid
  const grid = h('svg:g', { class: 'grid' });
  for (let t = t0; t <= t1; t += 15) {
    const major = ((serveMin + t) % 60 + 60) % 60 === 0;
    grid.append(h('svg:line', { x1: X(t), x2: X(t), y1: AXIS - 6, y2: Htotal - 10, class: major ? 'major' : 'minor' }));
    if (major || ppm * 15 >= 44) grid.append(h('svg:text', { x: X(t), y: AXIS - 12, class: 'tick' + (major ? ' major' : ''), 'text-anchor': 'middle' }, clock(serveMin + t)));
  }
  svg.append(grid);

  // Serve markers (one per course)
  const courses = [...new Set(p.items.filter((i) => i.final).map((i) => i.offset))];
  if (!courses.includes(0)) courses.push(0);
  for (const c of courses) {
    svg.append(h('svg:line', { x1: X(c), x2: X(c), y1: AXIS - 4, y2: Htotal - 10, class: 'serve-line' }));
    svg.append(h('svg:text', { x: X(c) + 4, y: Htotal - 4, class: 'serve-label' }, c === 0 ? `Serve ${clock(serveMin)}` : `${c > 0 ? '+' : '−'}${Math.abs(c)} ${clock(serveMin + c)}`));
  }

  // Dish rows
  let y = AXIS;
  rows.forEach((r, ri) => {
    const color = `var(--d${r.dish.color % 8})`;
    const g = h('svg:g', { class: 'dish-row', style: { color } });
    if (ri % 2 === 0) g.append(h('svg:rect', { x: 0, y: y - 2, width: W, height: r.lanes * ROW + 4, class: 'zebra' }));
    g.append(h('svg:circle', { cx: 14, cy: y + ROW / 2, r: 5, fill: color }));
    g.append(h('svg:text', { x: 26, y: y + ROW / 2 + 4, class: 'row-label' }, trim(r.dish.name, narrow ? 11 : 18)));
    for (const it of r.its) {
      const yy = y + it._lane * ROW + 4;
      const bh = ROW - 8;
      const bx = X(it.start), bw = Math.max(2, (it.end - it.start) * ppm);
      const bar = h('svg:g', { class: 'bar' + (it.late ? ' late' : '') + (it.impossible ? ' impossible' : ''), tabindex: 0, 'data-step': it.id });
      bar.append(h('svg:rect', { x: bx, y: yy, width: bw, height: bh, rx: 4, fill: 'url(#hatch)', class: 'passive' }));
      if (it.handsEnd > it.start) bar.append(h('svg:rect', { x: bx, y: yy, width: Math.max(2, (it.handsEnd - it.start) * ppm), height: bh, rx: 4, fill: color, class: 'hands' }));
      bar.append(h('svg:rect', { x: bx, y: yy, width: bw, height: bh, rx: 4, class: 'outline' }));
      const label = it.label + (it.equip === 'oven' ? ` · ${it.temp}°` : '');
      const fit = Math.floor((bw - 8) / 6.4);
      if (fit >= 4) bar.append(h('svg:text', { x: bx + 5, y: yy + bh / 2 + 4, class: 'bar-label' + ((it.handsEnd - it.start) * ppm > bw * 0.6 ? ' on-color' : '') }, trim(label, fit)));
      if (it.late) bar.append(h('svg:text', { x: bx + bw + 3, y: yy + bh / 2 + 4, class: 'late-badge' }, `+${it.late}`));
      bar.addEventListener('pointerenter', (e) => tip.show(e, tipFor(it, serveMin)));
      bar.addEventListener('pointermove', (e) => tip.move(e));
      bar.addEventListener('pointerleave', () => tip.hide());
      bar.addEventListener('click', () => onPick(it.id));
      bar.addEventListener('keydown', (e) => { if (e.key === 'Enter') onPick(it.id); });
      g.append(bar);
    }
    svg.append(g);
    y += r.lanes * ROW + 6;
  });

  // Resource lanes
  y = resTop;
  svg.append(h('svg:text', { x: 10, y: y - 6, class: 'section' }, 'RESOURCES'));
  svg.append(h('svg:line', { x1: 0, x2: W, y1: y - 18, y2: y - 18, class: 'sep' }));
  const dishColor = new Map(menu.dishes.map((d) => [d.id, `var(--d${d.color % 8})`]));
  p.stats.cooks.forEach((c, k) => {
    svg.append(h('svg:text', { x: 10, y: y + 13, class: 'res-label' }, `Cook ${k + 1}`));
    svg.append(h('svg:rect', { x: X(t0), y: y + 3, width: X(t1) - X(t0), height: 14, rx: 3, class: 'lane' }));
    for (const it of p.items) if (it.cook === k && it.handsEnd > it.start) {
      svg.append(h('svg:rect', { x: X(it.start), y: y + 3, width: Math.max(1.5, (it.handsEnd - it.start) * ppm - 0.5), height: 14, rx: 2, fill: dishColor.get(it.dish) }));
    }
    y += 22;
  });
  y += 4;
  svg.append(h('svg:text', { x: 10, y: y + 4 + burnerRows * 5, class: 'res-label' }, `Burners (${menu.kitchen.burners})`));
  for (let k = 0; k < burnerRows; k++) svg.append(h('svg:rect', { x: X(t0), y: y + k * 10, width: X(t1) - X(t0), height: 8, rx: 2, class: 'lane' }));
  for (const it of p.items) if (it.equip === 'burner' && it.burner != null) {
    svg.append(h('svg:rect', { x: X(it.start), y: y + it.burner * 10, width: Math.max(1.5, (it.end - it.start) * ppm - 0.5), height: 8, rx: 2, fill: dishColor.get(it.dish) }));
  }
  y += burnerRows * 10 + 14;
  p.ovens.forEach((o, k) => {
    const name = menu.kitchen.ovens[k]?.name || `Oven ${k + 1}`;
    svg.append(h('svg:text', { x: 10, y: y + 16, class: 'res-label' }, trim(name, narrow ? 11 : 16)));
    svg.append(h('svg:rect', { x: X(t0), y: y + 4, width: X(t1) - X(t0), height: 18, rx: 3, class: 'lane' }));
    for (const ph of o.preheats) {
      const x0 = X(ph.at), x1 = X(ph.ready);
      const yb = y + 22, yt = y + 4;
      const from = ph.from <= 25 ? yb : yt + 6;
      svg.append(h('svg:polygon', { points: `${x0},${yb} ${x0},${ph.kind === 'heat' ? from : yt} ${x1},${ph.kind === 'heat' ? yt : yt + 6} ${x1},${yb}`, fill: heat(ph.to), opacity: 0.5 }));
    }
    for (const b of o.blocks) {
      const bx = X(b.start), bw = (b.end - b.start) * ppm;
      svg.append(h('svg:rect', { x: bx, y: y + 4, width: bw, height: 18, rx: 3, fill: heat(b.temp) }));
      if (bw > 34) svg.append(h('svg:text', { x: bx + 5, y: y + 17, class: 'oven-label' }, `${b.temp}°`));
    }
    y += 30;
  });

  if (nowMin != null && nowMin >= t0 && nowMin <= t1) {
    svg.append(h('svg:line', { x1: X(nowMin), x2: X(nowMin), y1: AXIS - 8, y2: Htotal - 10, class: 'now-line' }));
    svg.append(h('svg:text', { x: X(nowMin), y: AXIS - 1, class: 'now-label', 'text-anchor': 'middle' }, 'now'));
  }

  const legend = h('div', { class: 'legend small muted' },
    h('span', {}, h('i', { class: 'sw solid' }), 'hands-on'),
    h('span', {}, h('i', { class: 'sw hatch' }), 'passive — walk away'),
    h('span', {}, h('i', { class: 'sw late' }), 'held too long'),
    h('span', { class: 'grow' }),
    h('span', {}, 'Click a bar to edit its step'));
  host.append(legend, h('div', { class: 'gantt-scroll' }, svg));
}

function trim(s, n) { return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; }

export function tipFor(it, serveMin) {
  const rows = [
    h('div', { class: 'tip-title' }, it.dishName),
    h('div', {}, it.label),
    h('div', { class: 'muted' }, `${clock(serveMin + it.start)} → ${clock(serveMin + it.end)} · ${dur(it.end - it.start)}`),
    h('div', { class: 'muted' }, it.hands ? `${it.hands === it.end - it.start ? 'Hands-on throughout' : `Hands-on for the first ${dur(it.hands)}`}${it.cook >= 0 ? ` · cook ${it.cook + 1}` : ''}` : 'No attention needed'),
  ];
  if (it.equip === 'burner') rows.push(h('div', { class: 'muted' }, 'On a burner'));
  if (it.equip === 'oven') rows.push(h('div', { class: 'muted' }, `Oven ${it.oven + 1} at ${it.temp} °C, ${it.slots} slot${it.slots > 1 ? 's' : ''}`));
  rows.push(h('div', { class: 'muted' }, it.final ? `Can wait ${dur(it.hold)} before serving` : `Can wait ${dur(it.hold)} for the next step`));
  if (it.late) rows.push(h('div', { class: 'tip-bad' }, `Waits ${dur(it.late)} too long — ${REASONS[it.blocked] || 'the kitchen was full'}`));
  if (it.impossible) rows.push(h('div', { class: 'tip-bad' }, `Can’t be done: ${REASONS[it.impossible]}`));
  return rows;
}
