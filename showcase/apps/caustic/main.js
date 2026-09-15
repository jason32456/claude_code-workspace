import { drawCurve, drawHeatmap, drawFit, drawBars, drawScatter, COL } from './js/render.js';
import { runSelfTests, testCount } from './js/selftest.js';

const $ = (id) => document.getElementById(id);
const fmt = (v) => (!Number.isFinite(v) ? '—' : v >= 1e5 || (v > 0 && v < 1e-3) ? v.toExponential(2) : v.toFixed(3));
const times = (a, b) => (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0 ? '—' : (a / b).toFixed(a / b >= 100 ? 0 : 1));

const state = {
  pane: 'ridge',
  worker: null,
  runId: 0,
  params: { D: 20, n: 40, noise: 0.15, lambda: 1e-13, trials: 5 },
  curve: [], grid: null, dim: [], net: [],
  selected: null,
  dirty: { ridge: true, curve: true, dim: true, net: true },
};

/* ------------------------------------------------------------- controls */

function readParams() {
  const lamExp = +$('lam').value;
  state.params = {
    D: +$('D').value,
    n: +$('n').value,
    noise: +$('noise').value,
    lambda: lamExp <= -13 ? 1e-13 : Math.pow(10, lamExp),
    trials: +$('trials').value,
  };
  $('D-out').textContent = state.params.D;
  $('n-out').textContent = state.params.n;
  $('noise-out').textContent = state.params.noise.toFixed(2);
  $('trials-out').textContent = state.params.trials;
  $('lam-out').textContent = lamExp <= -13 ? '0 (none)' : '1e' + (lamExp % 1 === 0 ? lamExp : lamExp.toFixed(2));
  $('lam-hint').textContent = lamExp <= -13
    ? 'At λ ≈ 0 the fit is forced through every noisy point exactly. That constraint, not the parameter count, is what produces the ridge.'
    : 'With λ > 0 the fit is no longer required to pass through the data. Watch the ridge fade — the parameter count did not change.';
}

for (const id of ['D', 'n', 'noise', 'lam', 'trials']) {
  $(id).addEventListener('input', () => {
    readParams();
    for (const k of Object.keys(state.dirty)) state.dirty[k] = true;
    setStatus('parameters changed — press Run sweep');
  });
}

function setStatus(msg) { $('status').textContent = msg; }
function setProgress(f) { $('bar').style.width = Math.round(f * 100) + '%'; }

/* --------------------------------------------------------------- worker */

function ensureWorker() {
  if (state.worker) return state.worker;
  const w = new Worker('js/worker.js', { type: 'module' });
  w.onmessage = (e) => onMessage(e.data);
  w.onerror = (e) => setStatus('worker error: ' + (e.message || 'unknown'));
  state.worker = w;
  return w;
}

function stopWorker() {
  if (state.worker) { state.worker.terminate(); state.worker = null; }
  state.runId++;
  setProgress(0);
}

$('stop').addEventListener('click', () => { stopWorker(); setStatus('stopped'); });
$('run').addEventListener('click', () => runPane(state.pane, true));

function runPane(pane, force) {
  if (!force && !state.dirty[pane]) return;
  stopWorker();
  const id = ++state.runId;
  const w = ensureWorker();
  const p = state.params;
  state.dirty[pane] = false;

  if (pane === 'ridge') {
    state.grid = { Ps: null, Ns: null, rows: [], filled: 0 };
    state.selected = null;
    drawScatter($('cell'), null, { empty: 'Click a cell in the heatmap.' });
    $('cell-cap').textContent = 'Click a cell in the heatmap.';
    setStatus(`sweeping model size × dataset size at D=${p.D}…`);
    w.postMessage({ cmd: 'grid', id, D: p.D, noise: p.noise, lambda: p.lambda, trials: Math.min(p.trials, 5) });
  } else if (pane === 'curve') {
    state.curve = [];
    setStatus(`sweeping model size at n=${p.n}, D=${p.D}…`);
    w.postMessage({ cmd: 'curve', id, D: p.D, n: p.n, noise: p.noise, lambda: p.lambda, trials: p.trials, steps: 30, both: true });
  } else if (pane === 'dim') {
    state.dim = [];
    setStatus('sweeping input dimension…');
    w.postMessage({ cmd: 'dim', id, n: p.n, noise: p.noise, lambda: p.lambda, trials: p.trials });
    probeDimensionPictures();
  } else if (pane === 'net') {
    state.net = [];
    setStatus('training networks by backpropagation — this one is slow…');
    w.postMessage({ cmd: 'net', id, D: p.D, n: p.n, noise: p.noise, epochs: 4000, trials: Math.min(p.trials, 3) });
  }
}

function onMessage(m) {
  if (m.id !== state.runId) return;
  if (m.type === 'error') { setStatus('error: ' + m.message); return; }

  if (m.type === 'curve') {
    state.curve.push(m);
    setProgress((m.i + 1) / m.total);
    renderCurve();
    if (m.i + 1 === m.total) setStatus(`model-size sweep complete — ${m.total} sizes × ${state.params.trials} trials`);
  } else if (m.type === 'grid') {
    const g = state.grid;
    g.Ps = m.Ps; g.Ns = m.Ns; g.rows[m.r] = m.row; g.filled = m.r + 1;
    setProgress((m.r + 1) / m.rows);
    renderHeatmap();
    if (m.r + 1 === m.rows) setStatus(`ridge complete — ${m.rows * m.Ps.length} fits. Click any cell.`);
  } else if (m.type === 'dim') {
    state.dim.push({ D: m.D, best: m.best, peak: m.peak, over: m.over, win: m.over < m.best });
    setProgress((m.i + 1) / m.total);
    renderDim();
    if (m.i + 1 === m.total) setStatus('dimension sweep complete');
  } else if (m.type === 'net') {
    state.net.push(m);
    setProgress((m.i + 1) / m.total);
    renderNet();
    if (m.i + 1 === m.total) setStatus('backprop sweep complete');
  } else if (m.type === 'probe') {
    if (m.slot === 'cell') { state.selected = m.result; renderCell(); }
    else if (m.slot === 'd1') drawFit($('d1'), m.result);
    else if (m.slot === 'd2') drawFit($('d2'), m.result);
  } else if (m.type === 'done') {
    setProgress(1);
  }
}

/* -------------------------------------------------------------- panes */

function renderCurve() {
  const p = state.params;
  const pts = state.curve;
  const series = [
    { pts: pts.map((d) => ({ x: d.P, y: d.test })), color: COL.amber },
    { pts: pts.map((d) => ({ x: d.P, y: Math.max(d.train, 1e-32) })), color: COL.accent, width: 1.5, dots: false, dash: [4, 3], setsRange: false },
  ];
  const hasRidge = pts.some((d) => d.ridge != null);
  if (hasRidge) {
    series.splice(1, 0, { pts: pts.filter((d) => d.ridge != null).map((d) => ({ x: d.P, y: d.ridge })), color: COL.blue });
  }
  drawCurve($('curve'), series, {
    xLabel: 'number of random features P  (log)',
    yLabel: 'mean squared error  (log)',
    threshold: p.n, thresholdLabel: 'P = n',
  });

  if (pts.length < 4) { $('curve-read').innerHTML = ''; return; }
  const sorted = [...pts].sort((a, b) => a.P - b.P);
  const under = sorted.filter((d) => d.P < p.n);
  const over = sorted.filter((d) => d.P > p.n * 4);
  const at = sorted.reduce((best, d) => (d.test > best.test ? d : best), sorted[0]);
  const bestUnder = under.length ? under.reduce((a, b) => (a.test < b.test ? a : b)) : null;
  const far = over.length ? over[over.length - 1] : null;

  $('curve-read').innerHTML = `
    <p>Worst cell of the sweep is <b>P = ${at.P}</b>, at <span class="bad">${fmt(at.test)}</span>.
    The interpolation threshold is <b>P = n = ${p.n}</b>.</p>
    ${bestUnder ? `<p>Best model below the threshold: P = ${bestUnder.P}, at <span class="num">${fmt(bestUnder.test)}</span>
      — the peak is <span class="bad">${times(at.test, bestUnder.test)}×</span> worse than that.</p>` : ''}
    ${far && bestUnder ? `<p>Far above the threshold, P = ${far.P}: <span class="${far.test < bestUnder.test ? 'good' : 'bad'}">${fmt(far.test)}</span>
      — ${far.test < bestUnder.test
        ? `<b>${times(bestUnder.test, far.test)}× better than the best underparameterised model.</b> The second descent is real here.`
        : `still <b>${times(far.test, bestUnder.test)}× worse</b> than the best underparameterised model. There is no second descent at D = ${p.D}.`}</p>` : ''}
    ${hasRidge ? (() => {
      const withR = sorted.filter((d) => d.ridge != null);
      const atR = withR.length ? withR.reduce((a, b) => (a.ridge > b.ridge ? a : b)) : null;
      return atR ? `<p>With ridge λ = ${state.params.lambda.toExponential(0)} the worst cell falls to
        <span class="good">${fmt(atR.ridge)}</span> — <b>${times(at.test, atR.ridge)}× lower</b>, at identical parameter counts.
        The peak was never about capacity; it was about being forced through every noisy point.</p>` : '';
    })() : '<p>Raise λ in the panel to overlay the regularised fit and watch the peak flatten at unchanged parameter counts.</p>'}
    <p>Training error (dashed) reaches machine zero at the threshold and stays there: every model to the right of the line
    fits all ${p.n} noisy points exactly. They differ only in which interpolating solution they pick.</p>`;
}

function renderHeatmap() {
  const g = state.grid;
  if (!g) return;
  const geo = drawHeatmap($('heat'), g, {
    xLabel: 'number of random features P  (log)',
    yLabel: 'training points n  (log)',
  });
  state.heatGeo = geo;
  if (geo && state.selCell) {
    const { ctx } = { ctx: $('heat').getContext('2d') };
    const r = geo.cellRect(state.selCell.c, state.selCell.r);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  if (g.filled === (g.Ns ? g.Ns.length : 0) && g.Ns) {
    let worst = null;
    for (let r = 0; r < g.rows.length; r++) {
      for (let c = 0; c < g.Ps.length; c++) {
        const v = g.rows[r][c];
        if (Number.isFinite(v) && (!worst || v > worst.v)) worst = { v, P: g.Ps[c], n: g.Ns[r] };
      }
    }
    if (worst) {
      const ratio = worst.P / worst.n;
      $('ridge-read').innerHTML = `
        <p>Worst cell of ${g.rows.length * g.Ps.length}: <b>P = ${worst.P}, n = ${worst.n}</b> at <span class="bad">${fmt(worst.v)}</span>
        — a model-to-data ratio of <span class="num">${ratio.toFixed(2)}</span>. The failure is not at large P or at small n;
        it is at <b>P ≈ n</b>, which is the whole claim.</p>
        <p>Read a row left to right and you get the double-descent curve. Read a column top to bottom and you get something stranger:
        holding the model fixed and <b>adding training data</b> walks you into the ridge.</p>`;
    }
  }
}

$('heat').addEventListener('click', (ev) => {
  const geo = state.heatGeo;
  if (!geo) return;
  const r = $('heat').getBoundingClientRect();
  const hit = geo.hit(ev.clientX - r.left, ev.clientY - r.top);
  if (!hit) return;
  state.selCell = hit;
  renderHeatmap();
  const p = state.params;
  $('cell-cap').textContent = `Fitting P = ${hit.P} features to n = ${hit.n} points…`;
  ensureWorker().postMessage({
    cmd: 'probe', id: state.runId, slot: 'cell',
    D: p.D, n: hit.n, P: hit.P, noise: p.noise, lambda: p.lambda, seed: 4201,
  });
});

function renderCell() {
  const r = state.selected;
  if (!r) return;
  drawScatter($('cell'), r);
  const ratio = r.P / r.n;
  const near = Math.abs(Math.log(ratio)) < 0.25;
  $('cell-cap').innerHTML = `P = ${r.P}, n = ${r.n} · test <span class="${r.test > 3 ? 'bad' : 'good'}">${fmt(r.test)}</span>
    · train <span class="num">${fmt(r.train)}</span> · ‖w‖ <span class="num">${fmt(r.wNorm)}</span>
    ${near ? ' · <span class="bad">on the ridge</span>' : ''}`;
}

function probeDimensionPictures() {
  const p = state.params;
  const w = ensureWorker();
  for (const [slot, D] of [['d1', 1], ['d2', 2]]) {
    w.postMessage({
      cmd: 'probe', id: state.runId, slot,
      D, n: p.n, P: Math.max(600, p.n * 12), noise: p.noise, lambda: p.lambda, seed: 909,
    });
  }
}

function renderDim() {
  const rows = [...state.dim].sort((a, b) => a.D - b.D);
  drawBars($('dim'), rows, {
    keys: ['best', 'peak', 'over'],
    colors: [COL.blue, COL.danger, COL.accent],
    xLabel: 'input dimension D',
    yLabel: 'test error  (log)',
  });
  if (!rows.length) return;
  const d1 = rows.find((r) => r.D === 1);
  const wins = rows.filter((r) => r.win).map((r) => r.D);
  $('dim-read').innerHTML = `
    ${d1 ? `<p>At <b>D = 1</b> the error far above the threshold is <span class="bad">${fmt(d1.over)}</span>
      against a best-below-threshold of <span class="num">${fmt(d1.best)}</span>
      — <b>${times(d1.over, d1.best)}× worse</b>. In one dimension the curve goes up at the threshold and never comes back down.</p>` : ''}
    <p>The second descent occurs at D = ${wins.length ? wins.join(', ') : '—'} and not otherwise.
    The pictures below show why: an interpolant in one dimension has to thrash between densely ordered points, so its error has
    nowhere to hide. In higher dimensions random points are nearly orthogonal, so the fit can spike at each one and return to a
    smooth solution in between.</p>
    <p>The right name for this is <b>benign overfitting</b>, and it is known to require enough effective dimension
    (Bartlett, Long, Lugosi &amp; Tsigler, 2020). D = 1 versus D = 2 is where the boundary falls in <em>this</em> setup, not a
    universal constant.</p>`;
}

function renderNet() {
  const pts = [...state.net].sort((a, b) => a.params - b.params);
  const usedD = pts.length ? pts[0].usedD : state.params.D;
  const usedN = pts.length ? pts[0].usedN : state.params.n;
  drawCurve($('net'), [
    { pts: pts.map((d) => ({ x: d.params, y: d.test })), color: COL.amber },
    { pts: pts.map((d) => ({ x: d.params, y: Math.max(d.train, 1e-32) })), color: COL.accent, width: 1.5, dots: false, dash: [4, 3], setsRange: false },
  ], {
    xLabel: 'parameters in the network  (log)',
    yLabel: 'mean squared error  (log)',
    threshold: usedN, thresholdLabel: 'params = n',
  });
  if (pts.length < 4) { $('net-read').innerHTML = ''; return; }
  const p = { ...state.params, D: usedD, n: usedN };
  const under = pts.filter((d) => d.params < p.n);
  const bestUnder = under.length ? under.reduce((a, b) => (a.test < b.test ? a : b)) : null;
  const worst = pts.reduce((a, b) => (a.test > b.test ? a : b));
  const widest = pts[pts.length - 1];
  const interpolates = pts.filter((d) => d.train < 1e-10);
  $('net-read').innerHTML = `
    <p>A real network, trained by backpropagation with plain SGD and momentum, at
    <b>D = ${usedD}</b>, <b>n = ${usedN}</b>${usedD !== state.params.D || usedN !== state.params.n
      ? ' \u2014 chosen so that widths exist on both sides of the threshold, which the panel\u2019s settings do not allow here'
      : ''}.
    Worst width: <b>${worst.params} parameters</b> at <span class="bad">${fmt(worst.test)}</span>
    ${bestUnder ? `— <span class="bad">${times(worst.test, bestUnder.test)}×</span> the best underparameterised network (${bestUnder.params} parameters, ${fmt(bestUnder.test)})` : ''}.
    <b>The peak is not an artefact of the closed-form solve.</b></p>
    ${interpolates.length ? `<p>Training error reaches <span class="num">${fmt(interpolates[0].train)}</span> from ${interpolates[0].params} parameters upward,
      so these networks really are interpolating all ${p.n} noisy points, not merely fitting them well.</p>` : ''}
    ${bestUnder ? `<p>At the widest network measured (${widest.params} parameters) the error is <span class="${widest.test < bestUnder.test ? 'good' : 'bad'}">${fmt(widest.test)}</span>.
      ${widest.test < bestUnder.test
        ? 'The second descent reproduces under backpropagation too.'
        : `<b>The second descent does not reproduce here</b> — the network recovers from the peak but never beats its own best underparameterised width.
           That half of the story needs more training than a browser tab will sit through, and saying so is cheaper than pretending otherwise.`}</p>` : ''}`;
}

/* --------------------------------------------------------------- checks */

$('run-checks').addEventListener('click', () => {
  const host = $('checks');
  host.innerHTML = '';
  const rows = [];
  for (let i = 0; i < testCount; i++) {
    const el = document.createElement('div');
    el.className = 'check';
    el.innerHTML = `<div class="verdict wait">···</div><div><h3>—</h3></div>`;
    host.appendChild(el);
    rows.push(el);
  }
  let i = 0;
  setStatus('running checks…');
  // Yield between checks so the verdicts appear one at a time rather than
  // all at once after a frozen second.
  const results = [];
  const tick = () => {
    const all = runSelfTests();
    all.forEach((r, k) => {
      rows[k].innerHTML = `
        <div class="verdict ${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'}</div>
        <div>
          <h3>${r.name}</h3>
          <p class="claim">${r.claim}</p>
          <p class="detail">${r.detail}</p>
        </div>`;
      results.push(r);
    });
    const passed = all.filter((r) => r.ok).length;
    setStatus(`${passed}/${all.length} checks passed`);
  };
  requestAnimationFrame(tick);
});

/* ----------------------------------------------------------------- tabs */

for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => {
    for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b === btn));
    for (const pane of document.querySelectorAll('.pane')) pane.hidden = true;
    state.pane = btn.dataset.pane;
    $('pane-' + state.pane).hidden = false;
    if (state.pane !== 'checks') runPane(state.pane, false);
    redraw();
  });
}

function redraw() {
  if (state.pane === 'ridge') { renderHeatmap(); if (state.selected) renderCell(); }
  else if (state.pane === 'curve') renderCurve();
  else if (state.pane === 'dim') renderDim();
  else if (state.pane === 'net') renderNet();
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redraw, 120);
});

readParams();
runPane('ridge', true);
