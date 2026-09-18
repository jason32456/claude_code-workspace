import { OBSTACLE, FLUID } from './js/lbm.js';
import { SHAPES, paintCircle, obstacleExtent } from './js/shapes.js';
import { makeTunnel, coefficients, retune, refLength, U_IN, LES_TAU } from './js/tunnel.js';
import { FieldPainter, Smoke } from './js/render.js';
import { stripChart, polarChart, profileChart } from './js/charts.js';
import { TESTS } from './js/selftest.js';

const NX = 400, NY = 160;
const $ = (id) => document.getElementById(id);

const state = {
  shape: 'cylinder',
  re: 150,
  angle: 6,
  spf: 8,
  view: 'vorticity',
  smoke: true,
  paused: false,
  lat: null,
  size: 32,
  cdHist: [],
  clHist: [],
  worker: null,
  sweep: null,
  benchRunning: false,
  stepsPerSec: 0,
};

const HIST = 12000;

/* ------------------------------------------------------------- tunnel */

function build({ keepMask = null } = {}) {
  const t = makeTunnel({ nx: NX, ny: NY, shape: state.shape, re: state.re, angle: state.angle, keepMask });
  state.lat = t.lat;
  state.size = keepMask ? Math.max(4, obstacleExtent(t.lat).height || refLength(state.shape, NY)) : t.size;
  if (keepMask) retune(state.lat, state.re, state.size);
  state.cdHist.length = 0;
  state.clHist.length = 0;
  painter = new FieldPainter(state.lat);
  smoke = new Smoke(state.lat);
  updateStatic();
}

let painter, smoke;

function updateStatic() {
  $('p-grid').textContent = `${NX} × ${NY}`;
  $('p-u').textContent = U_IN.toFixed(2);
  // Reynolds number at which τ crosses the LES threshold for the current size.
  const reLes = 3 * U_IN * state.size / (LES_TAU - 0.5);
  $('p-les').textContent = Math.round(reLes / 10) * 10;
  $('g-cells').textContent = `${(NX * NY).toLocaleString()} cells`;
  $('aoa-wrap').style.display = SHAPES[state.shape]?.angle ? '' : 'none';
}

function reFromSlider(v) { return Math.round(20 * 100 ** (v / 1000)); }

/* ------------------------------------------------------------- stepping */

function stepSim(n) {
  const lat = state.lat;
  for (let s = 0; s < n; s++) {
    lat.advance();
    const c = coefficients(lat, state.size);
    state.cdHist.push(c.cd);
    state.clHist.push(c.cl);
    if (state.smoke) smoke.advance();
  }
  if (state.cdHist.length > HIST * 1.5) {
    state.cdHist.splice(0, state.cdHist.length - HIST);
    state.clHist.splice(0, state.clHist.length - HIST);
  }
}

// Strouhal from the upward zero crossings of the demeaned lift over the
// trailing window; needs at least three cycles to report anything.
function strouhal() {
  const h = state.clHist;
  const n = Math.min(h.length, HIST);
  if (n < 3000) return NaN;
  const start = h.length - n;
  let mean = 0;
  for (let j = start; j < h.length; j++) mean += h[j];
  mean /= n;
  let amp = 0;
  for (let j = start; j < h.length; j++) amp = Math.max(amp, Math.abs(h[j] - mean));
  if (amp < 0.02) return NaN;
  const crossings = [];
  for (let j = start + 1; j < h.length; j++) {
    if (h[j - 1] - mean < 0 && h[j] - mean >= 0) crossings.push(j);
  }
  if (crossings.length < 4) return NaN;
  // Shedding is periodic: the intervals between crossings must agree with
  // each other, or what is being timed is start-up noise.
  const gaps = [];
  for (let j = 2; j < crossings.length; j++) gaps.push(crossings[j] - crossings[j - 1]);
  const period = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const spread = Math.sqrt(gaps.reduce((a, g) => a + (g - period) ** 2, 0) / gaps.length) / period;
  if (period < 40 || spread > 0.2 || (h.length - crossings[1]) < 3 * period) return NaN;
  return state.size / (U_IN * period);
}

function meanTail(arr, n) {
  const start = Math.max(0, arr.length - n);
  if (arr.length === start) return NaN;
  let s = 0;
  for (let j = start; j < arr.length; j++) s += arr[j];
  return s / (arr.length - start);
}

/* ------------------------------------------------------------- drawing */

const tunnel = $('tunnel');
const tctx = tunnel.getContext('2d');
const scale = { vort: 0.2 * U_IN, speed: 1.7 * U_IN, press: 1.2 * U_IN * U_IN };

function draw() {
  const field = painter.paint(state.view, scale);
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(field, 0, 0, tunnel.width, tunnel.height);
  if (state.smoke) smoke.draw(tctx, tunnel.width / NX, tunnel.height / NY);
}

const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');

function updateGauges() {
  const lat = state.lat;
  $('g-re').textContent = state.re.toLocaleString();
  $('g-cd').textContent = fmt(meanTail(state.cdHist, 200), 3);
  $('g-cl').textContent = fmt(meanTail(state.clHist, 200), 3);
  $('g-st').textContent = fmt(strouhal(), 3);
  $('g-tau').textContent = lat.tau.toFixed(4);
  const les = lat.smagorinsky > 0;
  $('g-les').textContent = les ? `LES on · τ_eff ≤ ${lat.tauEffMax.toFixed(3)}` : 'BGK, no LES';
  $('g-tau').parentElement.classList.toggle('les', les);
  $('g-t').textContent = (lat.step * U_IN / state.size).toFixed(1);
  $('g-sps').textContent = state.stepsPerSec ? Math.round(state.stepsPerSec).toLocaleString() : '—';
  $('hud-right').textContent = `${SHAPES[state.shape].label} · L = ${state.size} cells · step ${lat.step.toLocaleString()}`;
}

let frame = 0;
let lastT = performance.now(), stepsSince = 0;

function loop(now) {
  if (!state.paused) {
    stepSim(state.spf);
    stepsSince += state.spf;
  }
  if (now - lastT > 500) {
    if (!state.paused) state.stepsPerSec = stepsSince * 1000 / (now - lastT);
    stepsSince = 0; lastT = now;
  }
  draw();
  if (frame % 2 === 0) {
    updateGauges();
    stripChart($('strip'), [
      { values: state.cdHist, color: '#f0a030', label: 'Cd' },
      { values: state.clHist, color: '#5fb8d0', label: 'Cl' },
    ], { n: 4000, y0: 0, xLabel: 'last 4,000 steps' });
  }
  frame++;
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------- painting */

let painting = false, erasing = false;

function latticePoint(ev) {
  const r = tunnel.getBoundingClientRect();
  return [(ev.clientX - r.left) / r.width * NX, (ev.clientY - r.top) / r.height * NY];
}

function paintAt(ev) {
  const [x, y] = latticePoint(ev);
  if (x < 4 || x > NX - 6) return;
  paintCircle(state.lat, x, y, 3.2, erasing);
  if (state.shape !== 'custom') {
    state.shape = 'custom';
    $('shape').value = 'custom';
    updateStatic();
  }
  state.lat.finalizeMask();
  const ext = obstacleExtent(state.lat);
  state.size = Math.max(4, ext.height || 4);
  retune(state.lat, state.re, state.size);
}

tunnel.addEventListener('pointerdown', (ev) => {
  painting = true;
  erasing = ev.shiftKey || ev.button === 2;
  tunnel.setPointerCapture(ev.pointerId);
  paintAt(ev);
});
tunnel.addEventListener('pointermove', (ev) => { if (painting) paintAt(ev); });
tunnel.addEventListener('pointerup', () => { painting = false; });
tunnel.addEventListener('contextmenu', (ev) => ev.preventDefault());

/* ------------------------------------------------------------- controls */

const shapeSel = $('shape');
for (const [id, s] of Object.entries(SHAPES)) {
  const o = document.createElement('option');
  o.value = id; o.textContent = s.label;
  shapeSel.appendChild(o);
}
shapeSel.value = state.shape;
shapeSel.addEventListener('change', () => {
  state.shape = shapeSel.value;
  if (state.shape === 'custom') { state.lat.clearObstacle(); state.lat.finalizeMask(); state.size = refLength('custom', NY); updateStatic(); return; }
  build();
});

$('view').addEventListener('change', (ev) => { state.view = ev.target.value; });
$('restart').addEventListener('click', () => build(state.shape === 'custom' ? { keepMask: state.lat.mask } : {}));
$('clear').addEventListener('click', () => { state.lat.clearObstacle(); state.lat.finalizeMask(); });

const reSlider = $('re');
reSlider.addEventListener('input', () => {
  state.re = reFromSlider(+reSlider.value);
  $('re-out').textContent = state.re.toLocaleString();
  retune(state.lat, state.re, state.size);
});
$('re-out').textContent = state.re.toLocaleString();

const aoa = $('aoa');
aoa.addEventListener('input', () => {
  state.angle = +aoa.value;
  $('aoa-out').textContent = `${state.angle}°`;
});
aoa.addEventListener('change', () => build());

const spf = $('spf');
spf.addEventListener('input', () => { state.spf = +spf.value; $('spf-out').textContent = state.spf; });
$('smoke').addEventListener('change', (ev) => { state.smoke = ev.target.checked; if (!state.smoke) smoke.clear(); });
$('pause').addEventListener('change', (ev) => { state.paused = ev.target.checked; });

/* ------------------------------------------------------------- worker */

function ensureWorker() {
  if (state.worker) return state.worker;
  const w = new Worker('js/worker.js', { type: 'module' });
  w.onmessage = (ev) => {
    const m = ev.data;
    switch (m.type) {
      case 'test-start': renderTest(m.id, { running: true }); break;
      case 'test-progress': setProgress(m.id, m.frac); break;
      case 'test-done': renderTest(m.id, { result: m.result }); break;
      case 'bench-done': benchDone(); break;
      case 'sweep-start': markSweep(m.angle, { running: true }); break;
      case 'sweep-progress': markSweep(m.angle, { running: true, frac: m.frac }); break;
      case 'sweep-point': markSweep(m.point.alpha, { point: m.point }); break;
      case 'sweep-done': sweepDone(); break;
      default: break;
    }
  };
  state.worker = w;
  return w;
}

/* ------------------------------------------------------------- sweep */

const SWEEP_ANGLES = [-4, 0, 4, 8, 12, 16, 20, 24];

function startSweep() {
  const shape = SHAPES[state.shape]?.angle ? state.shape : 'airfoil';
  state.sweep = { shape, re: state.re, points: SWEEP_ANGLES.map((a) => ({ alpha: a, done: false })), token: Date.now() };
  $('sweep').disabled = true;
  $('sweep-stat').textContent = `${SHAPES[shape].label} at Re ${state.re.toLocaleString()} · 0 / ${SWEEP_ANGLES.length}`;
  drawPolar();
  ensureWorker().postMessage({ type: 'sweep', shape, re: state.re, angles: SWEEP_ANGLES, token: state.sweep.token });
}

function markSweep(angle, { running = false, point = null, frac = 0 }) {
  const sw = state.sweep;
  if (!sw) return;
  const p = sw.points.find((q) => q.alpha === angle);
  if (!p) return;
  if (point) { Object.assign(p, point, { done: true, running: false }); }
  else { p.running = running; p.frac = frac; }
  const done = sw.points.filter((q) => q.done).length;
  const cur = sw.points.find((q) => q.running);
  $('sweep-stat').textContent = `${SHAPES[sw.shape].label} at Re ${sw.re.toLocaleString()} · ${done} / ${sw.points.length}` + (cur ? ` · α = ${cur.alpha}° ${Math.round((cur.frac || 0) * 100)}%` : '');
  drawPolar();
}

function drawPolar() {
  const sw = state.sweep;
  polarChart($('polar'), sw ? sw.points : SWEEP_ANGLES.map((a) => ({ alpha: a, done: false })), {
    title: sw ? `${SHAPES[sw.shape].label} · Re ${sw.re.toLocaleString()} · 240 × 96 lattice` : 'no sweep yet',
  });
}

function sweepDone() {
  $('sweep').disabled = false;
  const sw = state.sweep;
  const best = sw.points.reduce((a, b) => (b.cl > a.cl ? b : a));
  const glide = sw.points.reduce((a, b) => (b.cl / b.cd > a.cl / a.cd ? b : a));
  $('sweep-stat').textContent = `${SHAPES[sw.shape].label} at Re ${sw.re.toLocaleString()} · Cl ${best.cl.toFixed(2)} at ${best.alpha}° and still rising · best L/D ${(glide.cl / glide.cd).toFixed(2)} at ${glide.alpha}°`;
  drawPolar();
  document.dispatchEvent(new CustomEvent('wake:sweep-done'));
}

$('sweep').addEventListener('click', startSweep);

/* ------------------------------------------------------------- bench */

const testList = $('tests');
const testEls = new Map();

function renderTestShell() {
  testList.innerHTML = '';
  testEls.clear();
  for (const t of TESTS) {
    const li = document.createElement('li');
    li.className = 'test';
    li.innerHTML = `<span class="mark">○</span><div class="head"><strong></strong><span class="oracle"></span></div><div class="detail"></div><div class="meas"><span class="exp"></span><span class="got">—</span></div><div class="bar"><i></i></div>`;
    testList.appendChild(li);
    testEls.set(t.id, li);
    const stub = { moments: 'Equilibrium moments', mass: 'Mass conservation', poiseuille: 'Poiseuille flow', couette: 'Couette flow', cavity: 'Lid-driven cavity, Re = 100', schafer: 'Cylinder in a channel, Re = 20', strouhal: 'Vortex shedding, Re = 150' };
    li.querySelector('strong').textContent = stub[t.id] || t.id;
    li.querySelector('.detail').textContent = 'not run yet';
  }
}

function setProgress(id, frac) {
  const li = testEls.get(id);
  if (li) li.querySelector('.bar i').style.width = `${Math.round(frac * 100)}%`;
}

function renderTest(id, { running = false, result = null }) {
  const li = testEls.get(id);
  if (!li) return;
  li.classList.toggle('running', running);
  if (running) { li.querySelector('.mark').textContent = '◐'; li.querySelector('.detail').textContent = 'running…'; return; }
  if (!result) return;
  li.classList.remove('running');
  li.classList.add(result.pass ? 'pass' : 'fail');
  li.querySelector('.mark').textContent = result.pass ? '✔' : '✘';
  li.querySelector('strong').textContent = result.name;
  li.querySelector('.oracle').textContent = result.oracle;
  li.querySelector('.detail').textContent = `${result.detail} (${(result.ms / 1000).toFixed(1)} s)`;
  li.querySelector('.exp').textContent = `expected ${result.expected}`;
  li.querySelector('.got').textContent = `measured ${result.measured}`;
  const bar = li.querySelector('.bar');
  if (result.profile || result.rows) {
    const plot = document.createElement('div');
    plot.className = 'plot';
    const c = document.createElement('canvas');
    c.width = 320; c.height = 200;
    plot.appendChild(c);
    bar.replaceWith(plot);
    profileChart(c, {
      profile: result.profile || null,
      rows: result.rows || null,
      xLabel: result.rows ? 'u / U_lid on the vertical centreline' : 'u along the channel',
      yLabel: 'y',
    });
  } else {
    bar.remove();
  }
}

function startBench() {
  if (state.benchRunning) return;
  state.benchRunning = true;
  $('run-bench').disabled = true;
  $('bench-stat').textContent = 'running in a worker…';
  renderTestShell();
  ensureWorker().postMessage({ type: 'bench' });
}

function benchDone() {
  state.benchRunning = false;
  $('run-bench').disabled = false;
  const rows = [...testEls.values()];
  const passed = rows.filter((li) => li.classList.contains('pass')).length;
  $('bench-stat').textContent = `${passed} of ${rows.length} passed`;
  document.dispatchEvent(new CustomEvent('wake:bench-done'));
}

$('run-bench').addEventListener('click', startBench);

/* ------------------------------------------------------------- boot */

build();
renderTestShell();
drawPolar();
requestAnimationFrame(loop);

// Hooks for scripted runs (screenshots, smoke tests): step the tunnel without
// waiting for frames, and kick off the worker jobs.
window.wake = {
  state,
  run(steps) { const t0 = performance.now(); stepSim(steps); state.stepsPerSec = steps * 1000 / (performance.now() - t0); draw(); updateGauges(); },
  setShape(shape, angle) { state.shape = shape; shapeSel.value = shape; if (angle !== undefined) { state.angle = angle; aoa.value = angle; $('aoa-out').textContent = `${angle}°`; } build(); },
  setRe(re) { state.re = re; reSlider.value = Math.round(1000 * Math.log(re / 20) / Math.log(100)); $('re-out').textContent = re.toLocaleString(); retune(state.lat, re, state.size); },
  setView(v) { state.view = v; $('view').value = v; },
  startBench,
  startSweep,
  strouhal,
};
