import { makeCamera } from './js/sensing.js';
import { SCENES, renderScene } from './js/scenes.js';
import { psi } from './js/theory.js';
import { TESTS } from './js/bench.js';

const SIDE = 128, N = SIDE * SIDE;
const $ = (id) => document.getElementById(id);
const fmtInt = (v) => v.toLocaleString('en-US');

const state = {
  sceneId: 'stilllife',
  scene: null,
  frac: 0.1,
  mode: 'multilevel',
  method: 'tv',
  noise: 0,
  seed: 1,
  iters: 300,
  cam: null,
  y: null,
  token: 0,
  anim: 0,
};

/* ----------------------------------------------------------- drawing */

const COLORS = { safelight: '#ff5d52', cyan: '#6cc6d6', ink: '#ece6e1', dim: '#a39a96', dimmer: '#736a68', line: '#2e292f' };

function drawGray(canvas, img) {
  const ctx = canvas.getContext('2d'), data = ctx.createImageData(SIDE, SIDE);
  for (let i = 0; i < N; i++) {
    const v = Math.round(255 * Math.min(1, Math.max(0, img[i])));
    data.data[4 * i] = data.data[4 * i + 1] = data.data[4 * i + 2] = v;
    data.data[4 * i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
}

// Signed error on a diverging ramp: safelight where recovery is too bright,
// cyan where it is too dark.
function drawError(canvas, img, ref) {
  const ctx = canvas.getContext('2d'), data = ctx.createImageData(SIDE, SIDE);
  for (let i = 0; i < N; i++) {
    const e = Math.max(-1, Math.min(1, 4 * (Math.min(1, Math.max(0, img[i])) - ref[i])));
    const a = Math.abs(e);
    const [r, g, b] = e > 0 ? [255, 93, 82] : [108, 198, 214];
    data.data[4 * i] = 12 + a * (r - 12);
    data.data[4 * i + 1] = 11 + a * (g - 11);
    data.data[4 * i + 2] = 13 + a * (b - 13);
    data.data[4 * i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
}

/* ----------------------------------------------------------- worker pool */

// One pool for the Phase Lab and the bench; each job is a message out and a
// stream of messages back, the last of which says it is done.
const POOL = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8));
const pool = { workers: [], idle: [], queue: [] };

function spawn() {
  const w = new Worker(new URL('./js/worker.js', import.meta.url), { type: 'module' });
  w.onmessage = (ev) => {
    const job = w.job;
    if (!job) return;
    if (job.onMessage(ev.data)) {
      w.job = null;
      pool.idle.push(w);
      pump();
    }
  };
  pool.workers.push(w);
  return w;
}

function submit(msg, onMessage) {
  pool.queue.push({ msg, onMessage });
  pump();
}

function pump() {
  while (pool.queue.length) {
    let w = pool.idle.pop();
    if (!w) {
      if (pool.workers.length >= POOL) return;
      w = spawn();
    }
    const job = pool.queue.shift();
    w.job = job;
    w.postMessage(job.msg);
  }
}

function cancelJobs(filter) {
  pool.queue = pool.queue.filter((j) => !filter(j.msg));
}

/* ----------------------------------------------------------- the camera */

let recWorker = null, recBusy = false;

function camWorker() {
  if (!recWorker) {
    recWorker = new Worker(new URL('./js/worker.js', import.meta.url), { type: 'module' });
    recWorker.onmessage = onRecover;
  }
  return recWorker;
}

function params() {
  return { side: SIDE, frac: state.frac, mode: state.mode, method: state.method, noise: state.noise, seed: state.seed, iters: state.iters };
}

let recoverTimer = 0;
function scheduleRecover() {
  clearTimeout(recoverTimer);
  recoverTimer = setTimeout(startRecover, 90);
}

function startRecover() {
  // A reconstruction in flight for stale settings is thrown away with its worker.
  if (recBusy && recWorker) { recWorker.terminate(); recWorker = null; }
  const token = ++state.token;
  recBusy = true;
  const m = Math.max(2, Math.round(state.frac * N));
  state.cam = makeCamera({ side: SIDE, m, mode: state.mode, seed: state.seed });
  state.y = null;
  state.anim = 0;
  $('pat-m').textContent = fmtInt(m);
  $('budget-hint').textContent = `M = ${fmtInt(m)} readings for ${fmtInt(N)} pixels`;
  $('lin-stat').textContent = '…';
  $('sp-stat').textContent = 'measuring…';
  camWorker().postMessage({ type: 'recover', scene: state.scene, params: params(), token });
}

function onRecover(ev) {
  const msg = ev.data;
  if (msg.token !== state.token) return;
  if (msg.type === 'linear') {
    state.y = msg.y;
    drawGray($('linear'), msg.image);
    $('lin-stat').textContent = `PSNR ${msg.psnr.toFixed(1)} dB · SSIM ${msg.ssim.toFixed(3)}`;
  } else if (msg.type === 'frame') {
    drawGray($('sparse'), msg.image);
    drawError($('error'), msg.image, state.scene);
    $('sp-stat').textContent = `iteration ${msg.iter} · PSNR ${msg.psnr.toFixed(1)} dB`;
  } else if (msg.type === 'sparse') {
    recBusy = false;
    drawGray($('sparse'), msg.image);
    drawError($('error'), msg.image, state.scene);
    $('sp-stat').textContent = `PSNR ${msg.psnr.toFixed(1)} dB · SSIM ${msg.ssim.toFixed(3)}`;
  }
}

// The mirror array plays the measurement sequence on a loop, a few patterns
// per frame, while the trace fills in the reading each one produced.
const patBuf = new Int8Array(N);
function animate() {
  requestAnimationFrame(animate);
  const cam = state.cam;
  if (!cam || !state.scene) return;
  const step = Math.max(1, Math.round(cam.m / 300));
  state.anim = (state.anim + step) % cam.m;
  const j = state.anim;
  cam.pattern(j, patBuf);

  const mctx = $('mirrors').getContext('2d'), tctx = $('through').getContext('2d');
  const md = mctx.createImageData(SIDE, SIDE), td = tctx.createImageData(SIDE, SIDE);
  for (let i = 0; i < N; i++) {
    const on = patBuf[i] > 0, v = state.scene[i];
    const mv = on ? 236 : 22;
    md.data[4 * i] = mv; md.data[4 * i + 1] = mv - 6; md.data[4 * i + 2] = mv - 10; md.data[4 * i + 3] = 255;
    const lum = on ? 255 * v : 0;
    td.data[4 * i] = lum; td.data[4 * i + 1] = lum * 0.93; td.data[4 * i + 2] = lum * 0.88; td.data[4 * i + 3] = 255;
  }
  mctx.putImageData(md, 0, 0);
  tctx.putImageData(td, 0, 0);
  $('pat-no').textContent = fmtInt(j + 1);
  drawTrace(j);
}

function drawTrace(j) {
  const c = $('trace'), ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const y = state.y;
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H / 2 + 0.5); ctx.lineTo(W, H / 2 + 0.5); ctx.stroke();
  if (!y) return;
  const m = y.length;
  // Reading 0 is the all-ones pattern, the total brightness, and dwarfs the
  // rest; scale to the others and pin that one at the top.
  let s = 1e-9;
  for (let i = 1; i < m; i++) s = Math.max(s, Math.abs(y[i]));
  const lo = Math.max(0, j - 719), bw = W / 720;
  for (let i = lo; i <= j; i++) {
    const v = i === 0 ? 1 : y[i] / s, x = (i - lo) * bw;
    const h = Math.min(1, Math.abs(v)) * (H / 2 - 8);
    ctx.fillStyle = i === j ? COLORS.safelight : i === 0 ? COLORS.ink : 'rgba(108, 198, 214, 0.75)';
    ctx.fillRect(x, v >= 0 ? H / 2 - h : H / 2, Math.max(1, bw - 0.3), h);
  }
  ctx.fillStyle = COLORS.dim;
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.fillText(`y${sub(j)} = ${j === 0 ? y[0].toFixed(2) + '  (all mirrors on: total brightness)' : y[j].toFixed(4)}`, 10, 18);
}

function sub(n) { return String(n).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]); }

/* ----------------------------------------------------------- scenes */

function setScene(id, img) {
  state.sceneId = id;
  state.scene = img || renderScene(id, SIDE);
  drawGray($('truth'), state.scene);
  scheduleRecover();
  clearSweep();
}

async function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = c.height = SIDE;
  const ctx = c.getContext('2d');
  const s = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, SIDE, SIDE);
  const d = ctx.getImageData(0, 0, SIDE, SIDE).data, img = new Float64Array(N);
  for (let i = 0; i < N; i++) img[i] = (0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]) / 255;
  let opt = $('scene').querySelector('option[value="upload"]');
  if (!opt) {
    opt = document.createElement('option');
    opt.value = 'upload';
    $('scene').appendChild(opt);
  }
  opt.textContent = `Yours: ${file.name.slice(0, 24)}`;
  $('scene').value = 'upload';
  state.upload = img;
  setScene('upload', img);
}

/* ----------------------------------------------------------- budget sweep */

const FRACS = [0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6];
let sweepWorker = null, sweepToken = 0, sweepPts = [];

function clearSweep() {
  if (sweepWorker) { sweepWorker.terminate(); sweepWorker = null; }
  sweepPts = [];
  $('sweep').disabled = false;
  $('sweep-stat').textContent = '—';
  drawSweep();
}

function runSweep() {
  clearSweep();
  const token = ++sweepToken;
  $('sweep').disabled = true;
  $('sweep-stat').textContent = 'measuring…';
  sweepWorker = new Worker(new URL('./js/worker.js', import.meta.url), { type: 'module' });
  sweepWorker.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.token !== token) return;
    if (msg.type === 'sweep-point') {
      sweepPts.push(msg);
      drawSweep();
      $('sweep-stat').textContent = `${sweepPts.length} of ${FRACS.length} budgets`;
    } else if (msg.type === 'sweep-done') {
      $('sweep').disabled = false;
      sweepWorker.terminate();
      sweepWorker = null;
      const gains = sweepPts.map((p) => p.sparse - p.lin);
      const best = sweepPts[gains.indexOf(Math.max(...gains))];
      $('sweep-stat').textContent = `prior worth up to +${Math.max(...gains).toFixed(1)} dB, at ${Math.round(best.frac * 100)}%`;
    }
  };
  sweepWorker.postMessage({ type: 'sweep', scene: state.scene, params: params(), fracs: FRACS, token });
}

function drawSweep() {
  const c = $('sweep-chart'), ctx = c.getContext('2d'), W = c.width, H = c.height;
  const L = 50, R = 16, T = 18, B = 40;
  ctx.clearRect(0, 0, W, H);
  const pts = sweepPts;
  let lo = 10, hi = 40;
  for (const p of pts) { lo = Math.min(lo, Math.floor(p.lin / 5) * 5); hi = Math.max(hi, Math.ceil(p.sparse / 5) * 5); }
  const X = (f) => L + (f / 0.6) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.strokeStyle = COLORS.line;
  ctx.fillStyle = COLORS.dimmer;
  for (let v = lo; v <= hi; v += 5) {
    ctx.beginPath(); ctx.moveTo(L, Y(v) + 0.5); ctx.lineTo(W - R, Y(v) + 0.5); ctx.stroke();
    ctx.fillText(`${v}`, 14, Y(v) + 4);
  }
  for (const f of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) ctx.fillText(`${Math.round(f * 100)}%`, X(f) - 12, H - 20);
  ctx.fillText('PSNR, dB', 10, 12);
  ctx.fillText('measurement budget M/N', W / 2 - 80, H - 4);
  if (!pts.length) {
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('Press "Sweep the budget" to re-measure at 11 budgets.', L + 20, T + 40);
    return;
  }
  const series = (key, color, width) => {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p.frac), Y(p[key])) : ctx.moveTo(X(p.frac), Y(p[key]))));
    ctx.stroke();
    for (const p of pts) { ctx.beginPath(); ctx.arc(X(p.frac), Y(p[key]), 3.5, 0, 2 * Math.PI); ctx.fill(); }
  };
  series('lin', COLORS.cyan, 1.5);
  series('sparse', COLORS.safelight, 2.2);
  ctx.lineWidth = 1;
  const last = pts[pts.length - 1];
  ctx.fillStyle = COLORS.safelight; ctx.fillText('sparse', Math.min(X(last.frac) + 6, W - 60), Y(last.sparse) - 8);
  ctx.fillStyle = COLORS.cyan; ctx.fillText('linear', Math.min(X(last.frac) + 6, W - 60), Y(last.lin) + 16);
}

/* ----------------------------------------------------------- Phase Lab */

const LAB = { n: 256, gx: 24, gy: 24, rhoMax: 0.5, cells: null, running: false, token: 0, trials: 0 };
const HEAT = { L: 64, R: 18, T: 18, B: 52 };

function labGeom() {
  const c = $('heat');
  const pw = c.width - HEAT.L - HEAT.R, ph = c.height - HEAT.T - HEAT.B;
  return { c, pw, ph, cw: pw / LAB.gx, ch: ph / LAB.gy };
}

const cellRho = (i) => ((i + 0.5) / LAB.gx) * LAB.rhoMax;
const cellDelta = (j) => (j + 0.5) / LAB.gy;

function heatColor(f) {
  // Dark for failure, through ember, to near-white for certain success.
  const stops = [[25, 22, 26], [120, 38, 34], [255, 93, 82], [255, 214, 196]];
  const t = Math.min(0.999, Math.max(0, f)) * (stops.length - 1), k = Math.floor(t), u = t - k;
  const a = stops[k], b = stops[k + 1];
  return `rgb(${a.map((v, i) => Math.round(v + u * (b[i] - v))).join(',')})`;
}

function drawHeat() {
  const { c, pw, ph, cw, ch } = labGeom(), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#0a090b';
  ctx.fillRect(HEAT.L, HEAT.T, pw, ph);
  if (LAB.cells) {
    for (let i = 0; i < LAB.gx; i++) {
      for (let j = 0; j < LAB.gy; j++) {
        const f = LAB.cells[i * LAB.gy + j];
        if (f < 0) continue;
        // Integer edges, so neighbouring cells meet without hairline seams.
        const x0 = Math.round(HEAT.L + i * cw), x1 = Math.round(HEAT.L + (i + 1) * cw);
        const y0 = Math.round(HEAT.T + (LAB.gy - 1 - j) * ch), y1 = Math.round(HEAT.T + (LAB.gy - j) * ch);
        ctx.fillStyle = heatColor(f);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
  }
  // Axes.
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.fillStyle = COLORS.dim;
  for (let r = 0; r <= LAB.rhoMax + 1e-9; r += 0.1) ctx.fillText(r.toFixed(1), HEAT.L + (r / LAB.rhoMax) * pw - 10, HEAT.T + ph + 18);
  for (let d = 0; d <= 1 + 1e-9; d += 0.2) ctx.fillText(d.toFixed(1), HEAT.L - 34, HEAT.T + (1 - d) * ph + 4);
  ctx.fillText('ρ = k/N, fraction of the signal that is non-zero', HEAT.L + pw / 2 - 170, c.height - 10);
  ctx.save();
  ctx.translate(16, HEAT.T + ph / 2 + 90);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('δ = M/N, measurement budget', 0, 0);
  ctx.restore();
  // ψ(ρ), drawn from theory alone.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let s = 0; s <= 200; s++) {
    const r = (s / 200) * LAB.rhoMax, x = HEAT.L + (r / LAB.rhoMax) * pw, y = HEAT.T + (1 - psi(r)) * ph;
    s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('ψ(ρ)', HEAT.L + pw - 44, HEAT.T + (1 - psi(LAB.rhoMax)) * ph - 8);
  ctx.fillStyle = COLORS.dim;
  ctx.fillText('exact recovery', HEAT.L + 12, HEAT.T + 20);
  ctx.fillText('failure', HEAT.L + pw - 70, HEAT.T + ph - 12);
}

function runLab() {
  if (LAB.running) {
    stopLab();
    return;
  }
  const token = ++LAB.token, kind = $('ensemble').value, trials = +$('trials').value;
  LAB.cells = new Float32Array(LAB.gx * LAB.gy).fill(-1);
  LAB.running = true;
  LAB.trials = 0;
  $('run-lab').textContent = 'Stop';
  let done = 0, agree = 0;
  const total = LAB.gx * LAB.gy;
  // Shuffled order, so the map resolves everywhere at once instead of sweeping.
  const order = [];
  for (let i = 0; i < LAB.gx; i++) for (let j = 0; j < LAB.gy; j++) order.push([i, j]);
  for (let a = order.length - 1; a > 0; a--) { const b = Math.floor(Math.random() * (a + 1)); [order[a], order[b]] = [order[b], order[a]]; }
  for (const [i, j] of order) {
    const k = Math.max(1, Math.round(cellRho(i) * LAB.n)), m = Math.max(1, Math.round(cellDelta(j) * LAB.n));
    submit({ type: 'cell', n: LAB.n, m, k, kind, trials, seed: 1 + 1000 * (i * LAB.gy + j), i, j, token, lab: true }, (msg) => {
      if (msg.type !== 'cell-done') return false;
      if (msg.token !== LAB.token) return true;
      LAB.cells[msg.i * LAB.gy + msg.j] = msg.frac;
      LAB.trials += trials;
      done++;
      if ((msg.frac >= 0.5) === (cellDelta(msg.j) >= psi(cellRho(msg.i)))) agree++;
      $('lab-cells').textContent = `${done} / ${total}`;
      $('lab-trials').textContent = fmtInt(LAB.trials);
      $('lab-agree').textContent = `${((100 * agree) / done).toFixed(1)}%`;
      drawHeat();
      if (done === total) stopLab();
      return true;
    });
  }
  $('lab-workers').textContent = `${POOL} workers`;
}

function stopLab() {
  LAB.running = false;
  LAB.token++;
  cancelJobs((m) => m.lab);
  $('run-lab').textContent = 'Run the Phase Lab';
}

function onHeatHover(ev) {
  const { c, pw, ph, cw, ch } = labGeom(), rect = c.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * c.width - HEAT.L;
  const y = ((ev.clientY - rect.top) / rect.height) * c.height - HEAT.T;
  if (x < 0 || y < 0 || x >= pw || y >= ph) return;
  const i = Math.floor(x / cw), j = LAB.gy - 1 - Math.floor(y / ch);
  const rho = cellRho(i), delta = cellDelta(j);
  const k = Math.max(1, Math.round(rho * LAB.n)), m = Math.max(1, Math.round(delta * LAB.n));
  const f = LAB.cells ? LAB.cells[i * LAB.gy + j] : -1;
  $('lab-hover').innerHTML = `k = ${k}, M = ${m} of N = ${LAB.n}<br>ψ(${rho.toFixed(3)}) = ${psi(rho).toFixed(3)} → predicts ${delta >= psi(rho) ? 'success' : 'failure'}<br>measured: ${f < 0 ? 'not yet run' : `${Math.round(f * 100)}% exact`}`;
}

/* ----------------------------------------------------------- bench */

// Longest rows first so the pool finishes together.
const BENCH_ORDER = ['rho05-20', 'width', 'universal', 'rho10', 'exact', 'linear', 'coherence', 'fista', 'folding', 'fwht', 'ortho'];

function renderBenchSkeleton() {
  $('tests').innerHTML = TESTS.map((t) => `<li class="test" id="t-${t.id}"><span class="mark">○</span><div class="head"><strong>${t.title}</strong></div><div class="detail"></div><div class="meas"></div></li>`).join('');
}

function runBench() {
  renderBenchSkeleton();
  $('run-bench').disabled = true;
  const t0 = performance.now();
  let pass = 0, fail = 0;
  const ids = BENCH_ORDER.filter((id) => TESTS.some((t) => t.id === id));
  for (const id of ids) {
    const li = $(`t-${id}`);
    li.className = 'test running';
    li.querySelector('.mark').textContent = '◌';
    li.insertAdjacentHTML('beforeend', '<div class="bar"><i></i></div>');
    submit({ type: 'bench', id }, (msg) => {
      if (msg.type === 'bench-progress') {
        li.querySelector('.bar i').style.width = `${Math.round(msg.frac * 100)}%`;
        return false;
      }
      const r = msg.result;
      r.pass ? pass++ : fail++;
      li.className = `test ${r.pass ? 'pass' : 'fail'}`;
      li.innerHTML = `<span class="mark">${r.pass ? '✓' : '✗'}</span>
        <div class="head"><strong>${r.name}</strong><span class="oracle">${r.oracle}</span></div>
        <div class="detail">${r.detail}</div>
        <div class="meas"><span class="exp">expected ${r.expected}</span>${r.measured}<span class="exp">${(r.ms / 1000).toFixed(1)} s</span></div>`;
      $('bench-stat').textContent = `${pass} passed, ${fail} failed · ${((performance.now() - t0) / 1000).toFixed(0)} s`;
      if (pass + fail === ids.length) $('run-bench').disabled = false;
      return true;
    });
  }
  $('bench-stat').textContent = `running on ${POOL} workers…`;
}

/* ----------------------------------------------------------- wiring */

function init() {
  const sel = $('scene');
  for (const [id, s] of Object.entries(SCENES)) sel.insertAdjacentHTML('beforeend', `<option value="${id}">${s.name}</option>`);
  sel.value = state.sceneId;
  sel.onchange = () => (sel.value === 'upload' ? setScene('upload', state.upload) : setScene(sel.value));
  $('file').onchange = (ev) => loadImage(ev.target.files[0]);
  document.addEventListener('dragover', (ev) => { ev.preventDefault(); document.body.classList.add('dragging'); });
  document.addEventListener('dragleave', () => document.body.classList.remove('dragging'));
  document.addEventListener('drop', (ev) => {
    ev.preventDefault();
    document.body.classList.remove('dragging');
    loadImage(ev.dataTransfer.files[0]);
  });

  $('budget').oninput = (ev) => {
    state.frac = +ev.target.value / 100;
    $('budget-out').textContent = `${ev.target.value}%`;
    scheduleRecover();
  };
  $('mode').onchange = (ev) => { state.mode = ev.target.value; scheduleRecover(); clearSweep(); };
  $('method').onchange = (ev) => { state.method = ev.target.value; scheduleRecover(); clearSweep(); };
  $('noise').oninput = (ev) => {
    state.noise = +ev.target.value / 1000;
    $('noise-out').textContent = state.noise.toFixed(3);
    scheduleRecover();
    clearSweep();
  };
  $('sweep').onclick = runSweep;
  $('run-lab').onclick = runLab;
  $('heat').onmousemove = onHeatHover;
  $('run-bench').onclick = runBench;

  renderBenchSkeleton();
  setScene(state.sceneId);
  drawHeat();
  drawSweep();
  requestAnimationFrame(animate);

  const q = new URLSearchParams(location.search);
  if (q.has('lab')) runLab();
  if (q.has('bench')) runBench();
  if (q.has('sweep')) setTimeout(runSweep, 200);
}

init();
