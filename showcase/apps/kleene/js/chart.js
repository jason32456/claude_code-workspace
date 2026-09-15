// Growth chart: instructions executed vs subject length, two series, log y.
//
// One y-axis on purpose — both series measure the same quantity in the same
// unit, which is the only thing that makes the comparison legitimate. A log
// scale because the whole point is that one series is exponential and the
// other is linear; on a linear scale the flat one would be invisible.

import { el } from './render.js';

export const SERIES = {
  backtrack: { color: '#c07d20', label: 'Backtracking VM' },
  thompson: { color: '#3b82f6', label: 'Thompson simulation' },
};

const M = { top: 40, right: 108, bottom: 44, left: 62 };
const W = 760;
const H = 300;

export function renderLegend(host) {
  host.replaceChildren();
  for (const s of Object.values(SERIES)) {
    const span = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.background = s.color;
    span.append(swatch, document.createTextNode(s.label));
    host.append(span);
  }
}

// Nice log ticks: 1, 10, 100, ... covering the data range.
function logTicks(min, max) {
  const lo = Math.floor(Math.log10(Math.max(1, min)));
  const hi = Math.ceil(Math.log10(Math.max(10, max)));
  const out = [];
  for (let e = lo; e <= hi; e++) out.push(10 ** e);
  return out;
}

const fmt = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
};

export function renderChart(host, points, { capped = null } = {}) {
  host.replaceChildren();
  if (!points.length) {
    host.append(Object.assign(document.createElement('p'), {
      className: 'empty', textContent: 'no data',
    }));
    return;
  }

  const values = points.flatMap((p) => [p.backtrack, p.thompson]).filter((v) => v > 0);
  const yMin = 1;
  const yMax = Math.max(10, ...values);
  const ticks = logTicks(yMin, yMax);
  const yTop = ticks[ticks.length - 1];

  const xs = points.map((p) => p.n);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);

  const px = (n) => M.left + ((n - xMin) / Math.max(1, xMax - xMin)) * (W - M.left - M.right);
  const py = (v) => {
    const t = Math.log10(Math.max(1, v)) / Math.log10(yTop);
    return H - M.bottom - t * (H - M.top - M.bottom);
  };

  const svg = el('svg', {
    class: 'chart',
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label':
      `Instructions executed against subject length. The backtracking VM grows ` +
      `exponentially, reaching ${fmt(points[points.length - 1].backtrack)} at length ` +
      `${xMax}; the Thompson simulation grows linearly, reaching ` +
      `${fmt(points[points.length - 1].thompson)}.`,
  });

  // --- recessive grid and axes
  const grid = el('g');
  for (const t of ticks) {
    const y = py(t);
    grid.append(el('line', { x1: M.left, y1: y, x2: W - M.right, y2: y, class: 'grid-line' }));
    grid.append(el('text', {
      x: M.left - 10, y: y + 4, class: 'axis-text', 'text-anchor': 'end',
    }, [fmt(t)]));
  }
  grid.append(el('line', {
    x1: M.left, y1: H - M.bottom, x2: W - M.right, y2: H - M.bottom, class: 'axis-line',
  }));

  const step = Math.max(1, Math.round((xMax - xMin) / 8));
  for (let n = xMin; n <= xMax; n += step) {
    grid.append(el('text', {
      x: px(n), y: H - M.bottom + 18, class: 'axis-text', 'text-anchor': 'middle',
    }, [String(n)]));
  }
  grid.append(el('text', {
    x: M.left + (W - M.left - M.right) / 2, y: H - 6, class: 'axis-title',
    'text-anchor': 'middle',
  }, ['subject length']));
  // The y-axis title sits above the plot rather than beside it, so it can
  // never collide with the topmost tick label.
  grid.append(el('text', {
    x: 2, y: 14, class: 'axis-title', 'text-anchor': 'start',
  }, ['instructions executed']));
  svg.append(grid);

  // --- series
  for (const key of ['thompson', 'backtrack']) {
    const s = SERIES[key];
    const pts = points.map((p) => [px(p.n), py(p[key])]);
    svg.append(el('path', {
      d: pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' '),
      class: 'series-line',
      stroke: s.color,
    }));
    // Markers only where they read — every third point plus the last.
    points.forEach((p, i) => {
      if (i % 3 !== 0 && i !== points.length - 1) return;
      svg.append(el('circle', {
        cx: px(p.n), cy: py(p[key]), r: 4.5, fill: s.color, class: 'series-dot',
      }));
    });
    // Direct label at the series end, so identity never rests on colour alone.
    const last = points[points.length - 1];
    svg.append(el('text', {
      x: px(last.n) + 12,
      y: py(last[key]) + 4,
      class: 'series-label',
      fill: s.color,
    }, [key === 'backtrack' ? 'backtracking' : 'Thompson']));
  }

  if (capped != null) {
    const y = py(capped);
    svg.append(el('line', {
      x1: M.left, y1: y, x2: W - M.right, y2: y,
      class: 'grid-line cap-marker', stroke: '#e5484d',
    }));
    svg.append(el('text', {
      x: M.left + 6, y: y + 15, class: 'axis-text', 'text-anchor': 'start',
      fill: '#e5484d',
    }, ['step budget — flat points here gave up rather than finished']));
  }

  // --- crosshair + tooltip
  const hover = el('g', { style: 'display:none' });
  const vline = el('line', { y1: M.top, y2: H - M.bottom, class: 'crosshair' });
  hover.append(vline);
  svg.append(hover);

  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  host.append(svg, tip);

  const move = (ev) => {
    const rect = svg.getBoundingClientRect();
    const scale = W / rect.width;
    const x = (ev.clientX - rect.left) * scale;
    let best = points[0];
    for (const p of points) if (Math.abs(px(p.n) - x) < Math.abs(px(best.n) - x)) best = p;

    vline.setAttribute('x1', px(best.n));
    vline.setAttribute('x2', px(best.n));
    hover.style.display = '';

    tip.replaceChildren();
    const head = document.createElement('div');
    head.innerHTML = `<span class="k">length</span> ${best.n}`;
    tip.append(head);
    for (const key of ['backtrack', 'thompson']) {
      const row = document.createElement('div');
      row.className = 'row';
      const i = document.createElement('i');
      i.style.background = SERIES[key].color;
      row.append(i, document.createTextNode(
        `${best[key].toLocaleString()}${key === 'backtrack' && best.capped ? ' (gave up)' : ''}`,
      ));
      tip.append(row);
    }
    tip.hidden = false;
    const hostRect = host.getBoundingClientRect();
    const left = (px(best.n) / scale) + 14;
    tip.style.left = `${Math.min(left, hostRect.width - tip.offsetWidth - 6)}px`;
    tip.style.top = `${Math.max(4, (py(best.backtrack) / scale) - 10)}px`;
  };

  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', () => {
    hover.style.display = 'none';
    tip.hidden = true;
  });

  // --- table view, so the numbers are reachable without reading the picture
  const details = document.createElement('details');
  details.className = 'chart-table';
  const summary = document.createElement('summary');
  summary.textContent = 'Show as a table';
  details.append(summary);
  const table = document.createElement('table');
  table.innerHTML =
    '<thead><tr><th>Length</th><th>Backtracking</th><th>Thompson</th><th>Ratio</th></tr></thead>'
    + `<tbody>${points.map((p) => `<tr><td>${p.n}</td><td>${p.backtrack.toLocaleString()}`
      + `${p.capped ? '+' : ''}</td><td>${p.thompson.toLocaleString()}</td>`
      + `<td>${Math.round(p.backtrack / Math.max(1, p.thompson)).toLocaleString()}x</td></tr>`).join('')}</tbody>`;
  details.append(table);
  host.append(details);
}
