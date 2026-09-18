// Small canvas charts: a strip chart for the force history, the lift polar,
// and profile plots for the bench rows. Colours match the page tokens.

const INK = '#dfe7f2', DIM = '#8b9ab4', LINE = '#24304a', AMBER = '#f0a030', CYAN = '#5fb8d0', GREEN = '#5fd0a0', RED = '#e2686d';
const FONT = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function frame(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0d1219';
  ctx.fillRect(0, 0, w, h);
}

function niceStep(range, target = 5) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

// series: [{ values: Float32Array | number[], color, label }], sharing one x
// axis (index) and one y axis. `n` is how many trailing points to show.
export function stripChart(canvas, series, { n, y0 = null, y1 = null, xLabel = '' } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  frame(ctx, w, h);
  const L = 56, R = 16, T = 12, B = 26;
  let lo = Infinity, hi = -Infinity;
  for (const s of series) {
    const v = s.values;
    const start = Math.max(0, v.length - n);
    for (let j = start; j < v.length; j++) { if (v[j] < lo) lo = v[j]; if (v[j] > hi) hi = v[j]; }
  }
  if (!Number.isFinite(lo)) { lo = -1; hi = 1; }
  if (y0 !== null) lo = Math.min(lo, y0);
  if (y1 !== null) hi = Math.max(hi, y1);
  if (hi - lo < 1e-6) { hi += 0.5; lo -= 0.5; }
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;
  const sy = (v) => T + (hi - v) / (hi - lo) * (h - T - B);
  ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.fillStyle = DIM; ctx.font = FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const step = niceStep(hi - lo, 4);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    const y = sy(v);
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
    ctx.fillText(Math.abs(v) < 1e-9 ? '0' : v.toFixed(step < 0.1 ? 2 : 1), L - 8, y);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(xLabel, L, h - 8);
  let lx = w - R;
  for (let si = series.length - 1; si >= 0; si--) {
    const s = series[si];
    const v = s.values;
    const start = Math.max(0, v.length - n);
    const count = v.length - start;
    if (count < 2) continue;
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let j = start; j < v.length; j++) {
      const x = L + (j - start) / (n - 1) * (w - L - R);
      const y = sy(v[j]);
      if (j === start) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = s.color; ctx.textAlign = 'right';
    lx -= 4; ctx.fillText(s.label, lx, T + 12); lx -= ctx.measureText(s.label).width + 14;
  }
}

// points: [{ alpha, cl, cd, done }], drawn as Cl (cyan) and Cd (amber) vs α.
export function polarChart(canvas, points, { title = '' } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  frame(ctx, w, h);
  const L = 54, R = 54, T = 30, B = 40;
  const alphas = points.map((p) => p.alpha);
  const a0 = Math.min(...alphas, -4), a1 = Math.max(...alphas, 20);
  const done = points.filter((p) => p.done);
  let lo = -0.5, hi = 1.5;
  for (const p of done) { lo = Math.min(lo, p.cl, p.cd); hi = Math.max(hi, p.cl, p.cd); }
  hi += 0.1; lo -= 0.1;
  const sx = (a) => L + (a - a0) / (a1 - a0) * (w - L - R);
  const sy = (v) => T + (hi - v) / (hi - lo) * (h - T - B);
  ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.fillStyle = DIM; ctx.font = FONT;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const step = niceStep(hi - lo, 5);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    const y = sy(v);
    ctx.strokeStyle = Math.abs(v) < 1e-9 ? DIM : LINE;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
    ctx.fillText(v.toFixed(1), L - 8, y);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let a = Math.ceil(a0 / 4) * 4; a <= a1; a += 4) {
    const x = sx(a);
    ctx.strokeStyle = LINE; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, h - B); ctx.stroke();
    ctx.fillStyle = DIM; ctx.fillText(a + '°', x, h - B + 6);
  }
  ctx.fillStyle = DIM; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, L, 18);
  ctx.textAlign = 'right';
  ctx.fillStyle = CYAN; ctx.fillText('Cl', w - R, 18);
  ctx.fillStyle = AMBER; ctx.fillText('Cd', w - R - 30, 18);
  for (const [key, color] of [['cd', AMBER], ['cl', CYAN]]) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.beginPath();
    let first = true;
    for (const p of done) {
      const x = sx(p.alpha), y = sy(p[key]);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = color;
    for (const p of done) { ctx.beginPath(); ctx.arc(sx(p.alpha), sy(p[key]), 3.5, 0, Math.PI * 2); ctx.fill(); }
  }
  for (const p of points) {
    if (p.done) continue;
    ctx.strokeStyle = p.running ? AMBER : LINE; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(sx(p.alpha), T); ctx.lineTo(sx(p.alpha), h - B); ctx.stroke();
    ctx.setLineDash([]);
  }
}

// Profiles for the bench: pairs of [measured, exact] along y, drawn as a
// measured curve over exact dots, plus optional Ghia rows [y, ref, got].
export function profileChart(canvas, { profile = null, rows = null, xLabel = '', yLabel = '' }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  frame(ctx, w, h);
  const L = 42, R = 12, T = 14, B = 40;
  ctx.font = FONT; ctx.fillStyle = DIM;
  let pts = [];
  if (profile) {
    const H = profile.length;
    pts = profile.map(([got, exact], j) => ({ y: (j + 0.5) / H, ref: exact, got }));
  } else if (rows) {
    pts = rows.map(([y, ref, got]) => ({ y, ref, got }));
  }
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { lo = Math.min(lo, p.ref, p.got); hi = Math.max(hi, p.ref, p.got); }
  if (hi - lo < 1e-12) { hi = lo + 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const sx = (v) => L + (v - lo) / (hi - lo) * (w - L - R);
  const sy = (y) => T + (1 - y) * (h - T - B);
  ctx.strokeStyle = LINE; ctx.lineWidth = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const step = niceStep(hi - lo, 4);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    const x = sx(v);
    ctx.strokeStyle = Math.abs(v) < 1e-12 ? DIM : LINE;
    ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, h - B); ctx.stroke();
    ctx.fillStyle = DIM; ctx.fillText(Math.abs(v) < 1e-12 ? '0' : v.toPrecision(2), x, h - B + 5);
  }
  ctx.save(); ctx.translate(12, (T + h - B) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(yLabel, 0, 0); ctx.restore();
  ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText(xLabel, w - R, h - 6);
  // measured
  ctx.strokeStyle = CYAN; ctx.lineWidth = 1.8; ctx.beginPath();
  pts.forEach((p, j) => { const x = sx(p.got), y = sy(p.y); if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.stroke();
  // reference
  ctx.fillStyle = AMBER;
  const every = profile ? Math.max(1, Math.round(pts.length / 12)) : 1;
  pts.forEach((p, j) => { if (j % every) return; ctx.beginPath(); ctx.arc(sx(p.ref), sy(p.y), 3, 0, Math.PI * 2); ctx.fill(); });
  ctx.textAlign = 'right'; ctx.fillStyle = AMBER; ctx.fillText('reference', w - R - 4, T + 12);
  ctx.fillStyle = CYAN; ctx.fillText('solver', w - R - 4 - ctx.measureText('reference').width - 12, T + 12);
}

// Force history for a shedding test: the lift signal and the crossings.
export function signalChart(canvas, values, { label = '' } = {}) {
  stripChart(canvas, [{ values, color: CYAN, label }], { n: values.length, y0: 0 });
}
