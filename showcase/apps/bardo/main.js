// UI. All the real work is in js/; this draws it and gets out of the way.

import { DOCTRINES, compile } from './js/doctrine.js';
import { value, renewalRewardLimit, expectedYears } from './js/valuation.js';
import { classify, expectedLives } from './js/graph.js';
import { flow, monteCarlo } from './js/simulate.js';
import { meanLife } from './js/mortality.js';
import * as E from './js/experiments.js';
import { runAll } from './js/selftest.js';

const $ = (s) => document.querySelector(s);

const STATION_COLOURS = ['#8a6a4a', '#b0743c', '#d9a14a', '#c96a3c', '#6b8fae', '#9d7fb8'];
const LIB_COLOUR = '#6fae8e';

const state = { key: 'wheel', start: 0, delta: 0.02, sigma: null, benefit: 1, model: null };

// Delta slider is logarithmic: the interesting behaviour is all between 1e-6
// and 1e-1, and a linear slider would spend 95% of its travel in the boring end.
const deltaFromSlider = (v) => {
  if (v <= 0) return 0;
  return Math.pow(10, -6 + (v / 100) * 5);
};
const sliderFromDelta = (d) => (d <= 0 ? 0 : Math.round(((Math.log10(d) + 6) / 5) * 100));

const fmt = (x, sig = 5) => {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) return x.toExponential(sig - 1);
  return x.toPrecision(sig).replace(/\.?0+$/, '');
};
const money = (x) => (Number.isFinite(x) ? x.toExponential(4) : '—');

function colourOf(model, i) {
  if (i === model.liberationIndex) return LIB_COLOUR;
  return STATION_COLOURS[i % STATION_COLOURS.length];
}

// --- model plumbing -----------------------------------------------------------

function rebuild() {
  const base = DOCTRINES[state.key];
  const spec = state.sigma === null ? base : { ...base, sigma: state.sigma };
  state.model = compile(spec);
  if (state.start >= state.model.n) state.start = 0;
}

function currentValue() {
  return value(state.model, state.delta, state.benefit);
}

// --- panel 1: the schedule ----------------------------------------------------

function drawSchedule() {
  const m = state.model;
  const v = currentValue();
  const cls = classify(m);
  const { lives } = expectedLives(m);
  const s = state.start;

  $('#schedule-doctrine').textContent =
    `${m.spec.name} — issued at ${m.names[s]}, δ = ${state.delta === 0 ? '0' : state.delta.toExponential(2)}, benefit ${state.benefit}`;

  $('#q-premium').textContent = fmt(v.premium[s], 6);
  $('#q-apv').textContent = money(v.apv[s]);
  $('#q-annuity').textContent = money(v.annuityAPV[s]);
  $('#q-lives').textContent = lives && lives.has(s) ? fmt(lives.get(s), 4) : '∞';
  const years = expectedYears(m);
  $('#q-term').textContent = years && years.has(s) ? fmt(years.get(s), 5) : '∞';
  $('#q-rho').textContent = v.rho.toFixed(8);
  $('#q-maxd').textContent = v.maxD.toFixed(8);

  const el = $('#verdict');
  el.className = 'verdict ' + cls.verdict;
  const labels = {
    absorbing: 'PRICED — finite at every δ, including δ = 0',
    recurrent: 'PRICED — finite for δ > 0, divergent only in the limit',
    mixed: 'PRICED — mixed at δ = 0: some stations sealed',
  };
  const notes = {
    absorbing: `Liberation is reached almost surely from all ${cls.nCycle} stations, so the expected number of lives is finite and the present value survives even undiscounted.`,
    recurrent: `No station reaches liberation. The policy still prices, because ρ(DP) ≤ maxᵢ dᵢ < 1 — discounting alone bounds it, with no reference to the doctrine's structure. Only at exactly δ = 0 does the present value diverge.`,
    mixed: `${cls.nFinite} of ${cls.nCycle} stations reach liberation almost surely; ${cls.nCycle - cls.nFinite} cannot, and diverge at δ = 0. The split is decided by graph reachability, not by any number.`,
  };
  $('#verdict-label').textContent = labels[cls.verdict];
  $('#verdict-note').textContent = notes[cls.verdict];

  $('#stamp-rho').innerHTML = `ρ = ${v.rho.toFixed(5)}`;

  $('#v-delta').textContent = state.delta === 0 ? '0' : state.delta.toExponential(2);
  $('#v-sigma').textContent = (state.sigma ?? m.spec.sigma).toFixed(2);
  $('#v-benefit').textContent = state.benefit;
  $('#delta-note').textContent =
    state.delta === 0 ? 'Undiscounted — the only place insurability splits' : `${(state.delta * 100).toFixed(4)}% per year`;
}

// --- panel 2: matrix + stations ----------------------------------------------

function drawMatrix() {
  const cv = $('#matrix'), ctx = cv.getContext('2d');
  const m = state.model, N = m.N;
  const cls = classify(m);
  ctx.clearRect(0, 0, cv.width, cv.height);

  const padL = 112, padT = 96, cell = Math.min(52, (cv.width - padL - 24) / N, (cv.height - padT - 30) / N);
  const grid = cell * N;

  ctx.font = '11px ui-monospace, monospace';

  // column labels, rotated
  for (let j = 0; j < N; j++) {
    ctx.save();
    ctx.translate(padL + j * cell + cell / 2, padT - 10);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = j === m.liberationIndex ? LIB_COLOUR : '#a89880';
    ctx.fillText(m.names[j], 0, 0);
    ctx.restore();
  }

  for (let i = 0; i < N; i++) {
    // row label
    ctx.textAlign = 'right';
    ctx.fillStyle = i === m.liberationIndex ? LIB_COLOUR
      : cls.finiteAtZero[i] ? '#a89880' : '#c96a3c';
    ctx.fillText(m.names[i], padL - 10, padT + i * cell + cell / 2 + 4);

    for (let j = 0; j < N; j++) {
      const p = m.P[i][j];
      const x = padL + j * cell, y = padT + i * cell;
      // Gamma-compressed so that small but non-zero probabilities stay visible;
      // a linear ramp hides everything below about 0.1.
      const a = p <= 0 ? 0 : Math.pow(p, 0.45);
      ctx.fillStyle = '#100d0a';
      ctx.fillRect(x, y, cell - 1, cell - 1);
      if (p > 0) {
        ctx.fillStyle = j === m.liberationIndex
          ? `rgba(111,174,142,${0.12 + 0.88 * a})`
          : `rgba(217,161,74,${0.1 + 0.9 * a})`;
        ctx.fillRect(x, y, cell - 1, cell - 1);
      }
      if (p >= 0.095) {
        ctx.fillStyle = a > 0.62 ? '#16130f' : '#f0e8dc';
        ctx.textAlign = 'center';
        ctx.font = '10px ui-monospace, monospace';
        // Strip the leading zero to keep the cell readable, but not from 1.00 —
        // the absorbing self-loop is exactly 1 and must not print as ".00".
        const label = p >= 0.995 ? '1' : p.toFixed(2).slice(1);
        ctx.fillText(label, x + cell / 2 - 0.5, y + cell / 2 + 3.5);
        ctx.font = '11px ui-monospace, monospace';
      }
    }
  }

  // absorbing marker
  ctx.strokeStyle = LIB_COLOUR;
  ctx.lineWidth = 1.5;
  const L = m.liberationIndex;
  ctx.strokeRect(padL + L * cell - 1.5, padT - 1.5, cell + 1, grid + 1);

  ctx.fillStyle = '#7a6b58';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('next station →', padL, padT + grid + 20);
  ctx.save();
  ctx.translate(20, padT + grid / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('← station at death', 0, 0);
  ctx.restore();
}

function drawStations() {
  const m = state.model;
  const cls = classify(m);
  const v = currentValue();
  const rows = [
    '<tr><th></th><th>Station</th><th class="n">E[T]</th><th class="n">d&#7522;</th><th class="n">APV</th><th class="n">Premium</th></tr>',
  ];
  for (let i = 0; i < m.N; i++) {
    const isLib = i === m.liberationIndex;
    const klass = isLib ? 'lib' : cls.finiteAtZero[i] ? '' : 'sealed';
    rows.push(
      `<tr class="${klass}">` +
      `<td><span class="swatch" style="background:${colourOf(m, i)}"></span></td>` +
      `<td>${m.names[i]}${klass === 'sealed' ? ' <small>sealed</small>' : ''}</td>` +
      `<td class="n">${isLib ? '—' : meanLife(m.laws[i]).toFixed(1)}</td>` +
      `<td class="n">${isLib ? '—' : v.d[i].toFixed(4)}</td>` +
      `<td class="n">${isLib ? '0' : money(v.apv[i])}</td>` +
      `<td class="n">${isLib ? '—' : fmt(v.premium[i], 4)}</td>` +
      `</tr>`
    );
  }
  $('#stations').innerHTML = rows.join('');

  const parts = [];
  for (const c of cls.classes) {
    const names = c.members.map((s) => m.names[s]).join(', ');
    const kind = c.isLiberation ? 'lib' : c.closed ? 'trap' : '';
    const tag = c.isLiberation ? 'absorbing' : c.closed ? 'closed — no exit' : 'transient';
    parts.push(`<span class="cls ${kind}"><b>{${names}}</b> — ${tag}</span>`);
  }
  $('#classify').innerHTML =
    `<div style="color:#a89880;margin-bottom:4px">Strongly connected components, by Tarjan:</div>` +
    parts.join('') +
    `<span class="cls">Finite at <code>δ = 0</code>: <b>${cls.nFinite} of ${cls.nCycle}</b> stations` +
    (cls.sealedStates.length
      ? ` — sealed: <b>${cls.sealedStates.map((s) => m.names[s]).join(', ')}</b>`
      : '') +
    `</span>`;
}

// --- panel 3: cohort flow -----------------------------------------------------

function drawFlow() {
  const cv = $('#flow'), ctx = cv.getContext('2d');
  const m = state.model, N = m.N;
  const depth = 26;
  const grid = flow(m, state.start, depth, 6000);
  ctx.clearRect(0, 0, cv.width, cv.height);

  const padL = 52, padR = 16, padT = 14, padB = 34;
  const W = cv.width - padL - padR, H = cv.height - padT - padB;
  const step = W / (depth - 1);

  // Stacked area: liberation drawn last so it reads as the layer that eats the
  // others, which is what it does.
  const order = [];
  for (let i = 0; i < N; i++) if (i !== m.liberationIndex) order.push(i);
  order.push(m.liberationIndex);

  const base = new Float64Array(depth);
  for (const i of order) {
    ctx.beginPath();
    for (let k = 0; k < depth; k++) {
      const x = padL + k * step, y = padT + H - base[k] * H;
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    for (let k = depth - 1; k >= 0; k--) {
      const x = padL + k * step;
      const y = padT + H - (base[k] + grid[k][i]) * H;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = colourOf(m, i);
    ctx.globalAlpha = i === m.liberationIndex ? 0.85 : 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
    for (let k = 0; k < depth; k++) base[k] += grid[k][i];
  }

  ctx.strokeStyle = '#463a2b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + H); ctx.lineTo(padL + W, padT + H);
  ctx.stroke();

  ctx.fillStyle = '#7a6b58';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'right';
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.fillText(`${(f * 100).toFixed(0)}%`, padL - 8, padT + H - f * H + 4);
  }
  ctx.textAlign = 'center';
  for (let k = 0; k < depth; k += 5) {
    ctx.fillText(String(k + 1), padL + k * step, padT + H + 20);
  }
  ctx.fillText('life number', padL + W / 2, padT + H + 32);
  ctx.textAlign = 'left';
  ctx.fillText(`released from ${m.names[state.start]}`, padL + 6, padT + 14);

  $('#flow-legend').innerHTML = order
    .map((i) => `<span><i style="background:${colourOf(m, i)}"></i>${m.names[i]}</span>`)
    .join('');
}

// --- shared chart helper ------------------------------------------------------

function axes(ctx, box, opts) {
  const { x, y, w, h } = box;
  ctx.strokeStyle = '#463a2b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.lineTo(x + w, y + h);
  ctx.stroke();
  ctx.fillStyle = '#7a6b58';
  ctx.font = '11px ui-monospace, monospace';
  if (opts.xLabel) {
    ctx.textAlign = 'center';
    ctx.fillText(opts.xLabel, x + w / 2, y + h + 32);
  }
}

// --- panel 4: the delta sweep -------------------------------------------------

function drawSweep() {
  const cv = $('#sweep'), ctx = cv.getContext('2d');
  const sw = E.discountSweep(state.model);
  ctx.clearRect(0, 0, cv.width, cv.height);

  const padL = 72, padR = 210, padT = 20, padB = 50;
  const W = cv.width - padL - padR, H = cv.height - padT - padB;
  const box = { x: padL, y: padT, w: W, h: H };

  const xs = sw.rows.map((r) => Math.log10(r.delta));
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const sx = (lx) => padL + ((lx - xMin) / (xMax - xMin)) * W;

  const all = sw.rows.flatMap((r) => [r.apv, r.annuity, r.premium]).filter((v) => v > 0);
  const yMin = Math.log10(Math.min(...all)), yMax = Math.log10(Math.max(...all));
  const pad = (yMax - yMin) * 0.06;
  const sy = (v) => padT + H - ((Math.log10(v) - yMin + pad) / (yMax - yMin + 2 * pad)) * H;

  // decade gridlines
  ctx.strokeStyle = '#241e17';
  ctx.setLineDash([2, 4]);
  for (let e = Math.ceil(yMin); e <= Math.floor(yMax); e++) {
    const y = sy(Math.pow(10, e));
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke();
    ctx.fillStyle = '#5e5145';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`1e${e}`, padL - 8, y + 3.5);
  }
  ctx.setLineDash([]);

  const series = [
    { key: 'apv', colour: '#c96a3c', label: 'APV of benefits', width: 2.5 },
    { key: 'annuity', colour: '#6b8fae', label: 'APV of premium annuity', width: 2.5 },
    { key: 'premium', colour: '#d9a14a', label: 'Level premium = ratio', width: 3.2 },
  ];

  for (const s of series) {
    ctx.beginPath();
    sw.rows.forEach((r, i) => {
      const x = sx(xs[i]), y = sy(r[s.key]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = s.colour;
    ctx.lineWidth = s.width;
    ctx.stroke();
    sw.rows.forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(sx(xs[i]), sy(r[s.key]), 3, 0, 7);
      ctx.fillStyle = s.colour;
      ctx.fill();
    });
  }

  // the renewal-reward limit, as a target the premium curve must land on
  if (sw.limit) {
    const y = sy(sw.limit);
    ctx.strokeStyle = '#6fae8e';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#6fae8e';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`renewal–reward limit  b/Σνᵢmᵢ = ${sw.limit.toExponential(5)}`, padL + 8, y - 8);
  }

  axes(ctx, box, { xLabel: 'force of interest δ  (log scale, increasing →)' });
  ctx.fillStyle = '#7a6b58';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (const r of sw.rows) {
    ctx.fillText(r.delta.toExponential(0), sx(Math.log10(r.delta)), padT + H + 18);
  }

  // legend
  let ly = padT + 16;
  for (const s of series) {
    ctx.fillStyle = s.colour;
    ctx.fillRect(padL + W + 18, ly - 8, 20, 3.5);
    ctx.fillStyle = '#f0e8dc';
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(s.label, padL + W + 44, ly - 1);
    ly += 24;
  }
  ly += 6;
  ctx.fillStyle = '#a89880';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(`APV × ${sw.apvGrowth.toFixed(0)}`, padL + W + 18, ly); ly += 17;
  ctx.fillText(`annuity × ${sw.annuityGrowth.toFixed(0)}`, padL + W + 18, ly); ly += 17;
  ctx.fillStyle = '#d9a14a';
  ctx.fillText(`premium × ${sw.premiumDrift.toFixed(3)}`, padL + W + 18, ly);

  return sw;
}

// --- panel 5: doctrine comparison ---------------------------------------------

function drawCompare() {
  const cv = $('#compare'), ctx = cv.getContext('2d');
  const cmp = E.doctrineComparison(1e-5);
  ctx.clearRect(0, 0, cv.width, cv.height);

  const gap = 76;
  const halfW = (cv.width - gap - 64) / 2;
  const padT = 40, padB = 62;
  const H = cv.height - padT - padB;

  const drawGroup = (x0, vals, colour, title, unit) => {
    const lo = Math.log10(Math.min(...vals)), hi = Math.log10(Math.max(...vals));
    const span = Math.max(hi - lo, 0.4);
    const barW = halfW / (vals.length * 1.6);
    ctx.fillStyle = '#f0e8dc';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, x0, 22);
    ctx.fillStyle = '#7a6b58';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(unit, x0, 37);

    vals.forEach((v, i) => {
      const frac = (Math.log10(v) - lo + span * 0.12) / (span * 1.12);
      const h = Math.max(3, frac * H);
      const x = x0 + i * (halfW / vals.length) + (halfW / vals.length - barW) / 2;
      const y = padT + H - h;
      ctx.fillStyle = colour;
      ctx.globalAlpha = cmp.entries[i].key === 'terminal' ? 0.55 : 0.92;
      ctx.fillRect(x, y, barW, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f0e8dc';
      ctx.font = '10.5px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(v.toExponential(2), x + barW / 2, y - 7);
      ctx.fillStyle = '#a89880';
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.save();
      ctx.translate(x + barW / 2, padT + H + 14);
      ctx.rotate(0.32);
      ctx.textAlign = 'left';
      ctx.fillText(cmp.entries[i].name, 0, 0);
      ctx.restore();
    });
    ctx.strokeStyle = '#463a2b';
    ctx.beginPath();
    ctx.moveTo(x0 - 6, padT + H); ctx.lineTo(x0 + halfW, padT + H);
    ctx.stroke();
  };

  drawGroup(40, cmp.entries.map((e) => e.apv), '#c96a3c',
    `APV of benefits — spans ${cmp.apvSpread.toFixed(0)}×`, 'log-scaled bars');
  drawGroup(40 + halfW + gap, cmp.entries.map((e) => e.premium), '#d9a14a',
    `Level premium — spans ${cmp.premiumSpread.toFixed(1)}×`, 'log-scaled bars, same five doctrines');

  // the convexity bound, drawn across the premium group
  const x0 = 40 + halfW + gap;
  const prems = cmp.entries.map((e) => e.premium);
  const lo = Math.log10(Math.min(...prems)), hi = Math.log10(Math.max(...prems));
  const span = Math.max(hi - lo, 0.4);
  const toY = (v) => padT + H - ((Math.log10(v) - lo + span * 0.12) / (span * 1.12)) * H;
  ctx.strokeStyle = '#6fae8e';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.4;
  for (const b of [cmp.bound.lo, cmp.bound.hi]) {
    const y = toY(b);
    if (y > padT - 10 && y < padT + H + 10) {
      ctx.beginPath(); ctx.moveTo(x0 - 6, y); ctx.lineTo(x0 + halfW, y); ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#6fae8e';
  ctx.font = '10.5px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`1/min m = ${cmp.bound.hi.toExponential(2)}`, x0 - 4, toY(cmp.bound.hi) - 6);
  ctx.fillText(`1/max m = ${cmp.bound.lo.toExponential(2)}`, x0 - 4, toY(cmp.bound.lo) + 14);

  return cmp;
}

// --- panel 6: dispersion ------------------------------------------------------

function drawDispersion() {
  const cv = $('#disp'), ctx = cv.getContext('2d');
  const d = E.dispersionSweep(state.key === 'terminal' ? 'wheel' : state.key, 0.02);
  ctx.clearRect(0, 0, cv.width, cv.height);

  const padL = 74, padR = 20, padT = 22, padB = 44;
  const W = cv.width - padL - padR, H = cv.height - padT - padB;
  const xs = d.rows.map((r) => r.sigma);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const vals = d.rows.map((r) => r.premium);
  const vMin = Math.min(...vals), vMax = Math.max(...vals);
  const pad = (vMax - vMin) * 0.18 || 1e-6;
  const sx = (s) => padL + ((s - xMin) / (xMax - xMin)) * W;
  const sy = (v) => padT + H - ((v - vMin + pad) / (vMax - vMin + 2 * pad)) * H;

  ctx.strokeStyle = '#241e17';
  ctx.setLineDash([2, 4]);
  for (let i = 0; i <= 4; i++) {
    const y = padT + (H * i) / 4;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.beginPath();
  d.rows.forEach((r, i) => {
    const x = sx(r.sigma), y = sy(r.premium);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#d9a14a';
  ctx.lineWidth = 2.6;
  ctx.stroke();

  d.rows.forEach((r, i) => {
    ctx.beginPath();
    ctx.arc(sx(r.sigma), sy(r.premium), i === 0 ? 5 : 3.5, 0, 7);
    // The non-monotone first point is marked rather than smoothed away.
    ctx.fillStyle = i === 0 && d.nonMonotoneAtLow ? '#c96a3c' : '#d9a14a';
    ctx.fill();
  });

  ctx.fillStyle = '#7a6b58';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = vMin - pad + ((vMax - vMin + 2 * pad) * (4 - i)) / 4;
    ctx.fillText(v.toExponential(3), padL - 8, padT + (H * i) / 4 + 4);
  }
  ctx.textAlign = 'center';
  for (const r of d.rows) ctx.fillText(r.sigma.toFixed(2), sx(r.sigma), padT + H + 18);
  ctx.fillText('dispersion σ', padL + W / 2, padT + H + 36);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#a89880';
  ctx.fillText(`premium at δ = 0.02`, padL + 6, padT + 12);

  $('#disp-table').innerHTML =
    '<tr><th>σ</th><th class="n">Premium</th><th class="n">Limit</th><th class="n">Mean cycle</th></tr>' +
    d.rows.map((r, i) =>
      `<tr><td>${r.sigma.toFixed(2)}${i === 0 && d.nonMonotoneAtLow ? ' <small style="color:#c96a3c">↑</small>' : ''}</td>` +
      `<td class="n">${r.premium.toExponential(4)}</td>` +
      `<td class="n">${r.limit ? r.limit.toExponential(4) : '—'}</td>` +
      `<td class="n">${r.meanCycle ? r.meanCycle.toFixed(1) : '—'}</td></tr>`
    ).join('');

  return d;
}

// --- panel 7: oracles ---------------------------------------------------------

function drawOracles() {
  const o = E.oracleAgreement(state.model, Math.max(state.delta, 1e-4), 30000);
  const cards = [];

  cards.push(`
    <div class="oracle">
      <h3>1 · Linear solve</h3>
      <p class="how">Two dense Gauss–Jordan solves sharing one matrix, (I − DP)x = c, with discount factors from Simpson quadrature.</p>
      <div class="val">${o.analyticPremium.toExponential(6)}</div>
      <div class="delta">APV ${o.analyticAPV.toExponential(5)}</div>
    </div>`);

  const sigOK = o.apvSigmas < 4;
  cards.push(`
    <div class="oracle">
      <h3>2 · Trajectory simulation</h3>
      <p class="how">${o.paths.toLocaleString()} seeded soul-trajectories, lifetimes by Newton inverse-CDF. No matrix, no solve, no quadrature.</p>
      <div class="val">${o.simulatedPremium.toExponential(6)}</div>
      <div class="delta${sigOK ? '' : ' bad'}">APV agrees to ${o.apvSigmas.toFixed(2)}σ · premium ${(o.premiumRelErr * 100).toFixed(3)}%</div>
    </div>`);

  if (o.renewalLimit) {
    const rel = Math.abs(o.analyticPremium - o.renewalLimit) / o.renewalLimit;
    cards.push(`
      <div class="oracle">
        <h3>3 · Renewal–reward limit</h3>
        <p class="how">b/Σνᵢmᵢ with ν from power iteration on the jump chain. The δ→0 target; no linear algebra shared with route 1.</p>
        <div class="val">${o.renewalLimit.toExponential(6)}</div>
        <div class="delta">${rel < 0.05 ? 'within' : 'off by'} ${(rel * 100).toFixed(2)}% at this δ</div>
      </div>`);
  } else {
    cards.push(`
      <div class="oracle na">
        <h3>3 · Renewal–reward limit</h3>
        <p class="how">Only defined for a doctrine that cycles forever. This one reaches liberation almost surely, so there is no long-run claim rate to take.</p>
        <div class="val">not applicable</div>
        <div class="delta">${(o.liberatedFraction * 100).toFixed(1)}% of simulated souls liberated</div>
      </div>`);
  }

  cards.push(`
    <div class="oracle">
      <h3>Mean lives observed</h3>
      <p class="how">Simulated claim count per policy, at δ = ${o.delta.toExponential(1)}. What the desk is actually underwriting.</p>
      <div class="val">${o.meanLives.toFixed(2)} <small>lives</small></div>
      <div class="delta">${(o.liberatedFraction * 100).toFixed(1)}% liberated before truncation</div>
    </div>`);

  $('#oracles').innerHTML = cards.join('');
}

// --- findings -----------------------------------------------------------------

function writeFindings(sw, cmp, disp) {
  const v = currentValue();
  const m = state.model;
  const cls = classify(m);
  const s = state.start;

  // Found by noticing that two rows of the schedule were always the same
  // number. A station that never exits is alive continuously and forever, so
  // its discounted exposure is the whole integral, independent of everything.
  if (!cls.finiteAtZero[s] && state.delta > 0) {
    $('#f-identity').hidden = false;
    $('#f-identity').innerHTML =
      `<b>An exact identity, found by accident.</b> Two rows of this schedule kept printing the same number. ` +
      `A soul that never exits the cycle is alive continuously and forever, so its total discounted exposure is ` +
      `<code>∫₀<sup>∞</sup>e<sup>−δt</sup>dt = 1/δ</code> — <em>exactly</em>, and independent of the doctrine, the mortality laws ` +
      `and the dispersion. Here <code>ā = ${v.annuityAPV[s].toExponential(8)}</code> against <code>1/δ = ${(1 / state.delta).toExponential(8)}</code>. ` +
      `It follows that for any station with no exit the premium is simply <code>δ × APV</code> — so on the log plot below the gold ` +
      `curve is the orange one with the δ divided straight back out: <code>${(state.delta * v.apv[s]).toExponential(6)}</code> against a solved ` +
      `<code>${v.premium[s].toExponential(6)}</code>. Check 15 asserts it to 1 part in 10⁹.`;
  } else {
    $('#f-identity').hidden = true;
  }
  $('#f-withdrawn').innerHTML =
    `<b>The verdict this app was built to deliver does not exist.</b> Bardo was designed to stamp ` +
    `<span class="kill">UNINSURABLE — premium diverges</span> on doctrines with no escape. That cannot happen. ` +
    `<code>D</code> is diagonal with <code>dᵢ = E[e<sup>−δTᵢ</sup>] &lt; 1</code> strictly, and <code>P</code> is row-stochastic, so ` +
    `<code>ρ(DP) ≤ ‖DP‖∞ = maxᵢ dᵢ &lt; 1</code> — a bound that never mentions the doctrine at all. Here that reads ` +
    `<code>${v.rho.toFixed(8)} ≤ ${v.maxD.toFixed(8)}</code>. Every doctrine is insurable at every positive discount rate, ` +
    `and the banner was excluded by two lines of algebra. Check 6 asserts the refutation against power iteration.`;

  $('#f-converge').innerHTML =
    `Across this sweep the APV of benefits grows <b>${sw.apvGrowth.toFixed(0)}×</b> and the premium annuity grows ` +
    `<b>${sw.annuityGrowth.toFixed(0)}×</b>, while the level premium — their quotient — moves by a factor of ` +
    `<b>${sw.premiumDrift.toFixed(3)}</b>. Benefits are paid at every death and premiums are collected during every life, ` +
    `so a policy of unbounded term has an unbounded stream of both, and the equivalence principle divides one by the other. ` +
    (sw.limit
      ? `The quotient lands on <code>b/Σνᵢmᵢ = ${sw.limit.toExponential(6)}</code>, reached independently by power iteration. `
      : `This doctrine reaches liberation almost surely, so both legs stay finite even undiscounted. `) +
    `<b>Eternity is affordable because you pay for it forever.</b>`;

  $('#f-bound').innerHTML =
    `Present values span <b>${cmp.apvSpread.toFixed(0)}×</b> across these five doctrines. Premiums span ` +
    `<b>${cmp.premiumSpread.toFixed(1)}×</b> — the doctrine's influence compressed by a factor of about ` +
    `<b>${cmp.compression.toFixed(0)}</b>. And it cannot do better than that: the limit is ` +
    `<code>Σνᵢbᵢ / Σνᵢmᵢ</code>, whose denominator is a <em>convex combination</em> of the per-station mean lifetimes, so ` +
    `<code>π∞ ∈ [1/max m, 1/min m] = [${cmp.bound.lo.toExponential(2)}, ${cmp.bound.hi.toExponential(2)}]</code> ` +
    `for <em>every</em> doctrine expressible here — ${cmp.boundHolds ? 'and all five land inside it' : 'and something has escaped it, which is a bug'}. ` +
    `The mortality tables choose the interval; the cosmology only chooses a point inside. ` +
    `<span class="kill">Withdrawn:</span> the drafted claim that doctrines price "within a few percent" — the four ` +
    `multi-life doctrines actually spread by <b>${((cmp.multiPremiumSpread - 1) * 100).toFixed(0)}%</b>. The bound is the real result, because it is a proof.`;

  const first = disp.rows[0], last = disp.rows[disp.rows.length - 1];
  $('#f-disp').innerHTML =
    `Measured, dispersion <b>${disp.direction}</b> the premium: <code>${first.premium.toExponential(4)} → ${last.premium.toExponential(4)}</code> ` +
    `as <code>σ</code> goes ${first.sigma} → ${last.sigma}. The mechanism is not the Jensen effect the claim was drafted around — ` +
    `dispersion spreads the stationary distribution toward the long-lived upper stations, lengthening the mean cycle, and the ` +
    `premium is inversely proportional to it. ` +
    (disp.nonMonotoneAtLow
      ? `There is also a genuinely non-monotone point at <code>σ = ${first.sigma}</code>, marked in red, which prices <em>above</em> its neighbour. It ships as found.`
      : `Monotone across the whole range.`);
}

// --- checks -------------------------------------------------------------------

function drawChecks() {
  const t0 = performance.now();
  const res = runAll();
  const ms = performance.now() - t0;
  const nPass = res.filter((r) => r.pass).length;
  $('#checks').innerHTML =
    res.map((r, i) => `
      <div class="check ${r.pass ? 'pass' : 'fail'}">
        <div class="idx">${i + 1}</div>
        <div class="mark">${r.pass ? 'PASS' : 'FAIL'}</div>
        <div>
          <div class="name">${r.name}</div>
          <div class="detail">${r.detail}</div>
        </div>
      </div>`).join('') +
    `<div class="check-summary"><b class="${nPass === res.length ? '' : 'bad'}">${nPass}/${res.length}</b> passed in ${ms.toFixed(0)} ms</div>`;
  return ms;
}

// --- wiring -------------------------------------------------------------------

function renderFast() {
  drawSchedule();
  drawMatrix();
  drawStations();
  drawFlow();
  const sw = drawSweep();
  const cmp = drawCompare();
  const disp = drawDispersion();
  writeFindings(sw, cmp, disp);
  drawOracles();
}

function populate() {
  $('#doctrine').innerHTML = Object.values(DOCTRINES)
    .map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
  $('#doctrine').value = state.key;
  refreshStarts();
}

function refreshStarts() {
  const m = state.model;
  $('#start').innerHTML = m.spec.states
    .map((s, i) => `<option value="${i}">${s}</option>`).join('');
  $('#start').value = String(state.start);
}

function init() {
  rebuild();
  populate();

  $('#doctrine').addEventListener('change', (e) => {
    state.key = e.target.value;
    state.sigma = null;
    state.start = 0;
    rebuild();
    refreshStarts();
    $('#sigma').value = String(Math.round(state.model.spec.sigma * 100));
    renderFast();
  });

  $('#start').addEventListener('change', (e) => {
    state.start = Number(e.target.value);
    renderFast();
  });

  $('#delta').addEventListener('input', (e) => {
    state.delta = deltaFromSlider(Number(e.target.value));
    renderFast();
  });

  $('#sigma').addEventListener('input', (e) => {
    state.sigma = Number(e.target.value) / 100;
    rebuild();
    renderFast();
  });

  $('#benefit').addEventListener('input', (e) => {
    state.benefit = Number(e.target.value);
    renderFast();
  });

  $('#delta').value = String(sliderFromDelta(state.delta));
  $('#sigma').value = String(Math.round(state.model.spec.sigma * 100));

  renderFast();

  // Checks last: they run a lot of Monte Carlo and would otherwise delay the
  // first paint of the thing people came to look at.
  requestAnimationFrame(() => setTimeout(() => {
    const ms = drawChecks();
    const n = document.querySelectorAll('.check').length;
    $('#foot-timing').textContent = `${n} checks in ${ms.toFixed(0)} ms · all solves in-page, single-threaded`;
  }, 0));
}

init();
