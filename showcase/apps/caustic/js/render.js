// Drawing. Two series colours carry every chart: amber for the unregularised
// interpolating fit, blue for the ridge-regularised one. They are separable
// under the common forms of colour-vision deficiency and both hold contrast on
// this background. The heatmap uses a single-hue sequential ramp — a rainbow
// would invent structure that the data does not have.

export const COL = {
  bg: '#0b0f14', surface: '#11161d', line: '#222c38', lineSoft: '#1a212b',
  ink: '#dce4ef', ink2: '#99a5b5', ink3: '#6b7788',
  amber: '#c07d20', blue: '#3b82f6', accent: '#5fd0a0', danger: '#e5484d',
};

export function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

const niceLog = (v) => {
  const e = Math.floor(Math.log10(v));
  const m = v / Math.pow(10, e);
  return (m < 1.5 ? '1' : m < 3.5 ? '3' : '') + 'e' + (e < 0 ? '−' : '') + Math.abs(e);
};

export function drawAxes(ctx, w, h, pad, opts) {
  const { xLabel, yLabel, xTicks, yTicks } = opts;
  ctx.strokeStyle = COL.lineSoft; ctx.lineWidth = 1;
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = COL.ink3;

  for (const t of yTicks) {
    const y = Math.round(t.y) + 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(t.label, pad.l - 8, y);
  }
  for (const t of xTicks) {
    const x = Math.round(t.x) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(t.label, x, h - pad.b + 7);
  }
  ctx.strokeStyle = COL.line;
  ctx.beginPath();
  ctx.moveTo(pad.l + 0.5, pad.t); ctx.lineTo(pad.l + 0.5, h - pad.b + 0.5); ctx.lineTo(w - pad.r, h - pad.b + 0.5);
  ctx.stroke();

  ctx.fillStyle = COL.ink2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(xLabel, (pad.l + w - pad.r) / 2, h - 2);
  ctx.save();
  ctx.translate(11, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'top';
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

// Log-log error curve with the interpolation threshold marked.
export function drawCurve(canvas, series, opts) {
  const { ctx, w, h } = setupCanvas(canvas);
  const pad = { l: 58, r: 14, t: 16, b: 34 };
  const all = series.flatMap((s) => s.pts).filter((p) => Number.isFinite(p.y) && p.y > 0);
  if (!all.length) return null;

  const xs = all.map((p) => p.x);
  const x0 = Math.log(Math.min(...xs)), x1 = Math.log(Math.max(...xs));
  // Only series that opt in set the vertical range. Training error falls to
  // 1e-30 once the fit interpolates, and letting it drive the axis compresses
  // the test curve -- the entire subject of the chart -- into a flat line.
  const ranging = series.filter((s) => s.setsRange !== false).flatMap((s) => s.pts)
    .filter((p) => Number.isFinite(p.y) && p.y > 0);
  const ys = (ranging.length ? ranging : all).map((p) => p.y);
  let y0 = Math.log10(Math.min(...ys)), y1 = Math.log10(Math.max(...ys));
  y0 = Math.floor(y0); y1 = Math.ceil(y1);
  if (y1 - y0 < 1) y1 = y0 + 1;

  const X = (v) => pad.l + ((Math.log(v) - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - ((Math.log10(v) - y0) / (y1 - y0)) * (h - pad.t - pad.b);

  const yTicks = [];
  const stepY = Math.max(1, Math.round((y1 - y0) / 6));
  for (let e = y0; e <= y1; e += stepY) yTicks.push({ y: Y(Math.pow(10, e)), label: '1e' + (e < 0 ? '−' : '') + Math.abs(e) });
  const xTicks = [];
  for (let e = Math.ceil(x0 / Math.LN10); Math.pow(10, e) <= Math.exp(x1) * 1.001; e++) {
    for (const m of [1, 3]) {
      const v = m * Math.pow(10, e);
      if (Math.log(v) >= x0 - 1e-9 && Math.log(v) <= x1 + 1e-9) xTicks.push({ x: X(v), label: niceLog(v) });
    }
  }
  drawAxes(ctx, w, h, pad, { xLabel: opts.xLabel, yLabel: opts.yLabel, xTicks, yTicks });

  // The threshold band, drawn under the data.
  if (opts.threshold && opts.threshold >= Math.exp(x0) && opts.threshold <= Math.exp(x1)) {
    const tx = X(opts.threshold);
    ctx.fillStyle = 'rgba(229, 72, 77, 0.10)';
    ctx.fillRect(tx - 6, pad.t, 12, h - pad.t - pad.b);
    ctx.strokeStyle = 'rgba(229, 72, 77, 0.55)';
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx + 0.5, pad.t); ctx.lineTo(tx + 0.5, h - pad.b); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COL.danger;
    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(opts.thresholdLabel || 'threshold', tx, h - pad.b - 4);
  }

  for (const s of series) {
    const pts = s.pts.filter((p) => Number.isFinite(p.y) && p.y > 0).sort((a, b) => a.x - b.x);
    if (!pts.length) continue;
    ctx.save();
    ctx.beginPath(); ctx.rect(pad.l, pad.t - 2, w - pad.l - pad.r, h - pad.t - pad.b + 4); ctx.clip();
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2;
    if (s.dash) ctx.setLineDash(s.dash);
    ctx.beginPath();
    const floor = Math.pow(10, y0 - 0.35);
    pts.forEach((p, i) => {
      const yv = Math.max(p.y, floor);
      i ? ctx.lineTo(X(p.x), Y(yv)) : ctx.moveTo(X(p.x), Y(yv));
    });
    ctx.stroke();
    ctx.setLineDash([]);
    if (s.dots !== false) {
      ctx.fillStyle = s.color;
      for (const p of pts) { ctx.beginPath(); ctx.arc(X(p.x), Y(Math.max(p.y, floor)), 2.2, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }
  return { X, Y, pad };
}

// The heatmap: model size across, dataset size down, log test error as tone.
export function drawHeatmap(canvas, state, opts) {
  const { ctx, w, h } = setupCanvas(canvas);
  const pad = { l: 58, r: 16, t: 16, b: 38 };
  const { Ps, Ns, rows, filled } = state;
  if (!Ps || !Ns || !filled) return null;

  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
  const vals = [];
  for (let r = 0; r < filled; r++) for (const v of rows[r]) if (Number.isFinite(v) && v > 0) vals.push(Math.log10(v));
  if (!vals.length) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals);

  const cw = plotW / Ps.length, ch = plotH / Ns.length;
  for (let r = 0; r < filled; r++) {
    for (let c = 0; c < Ps.length; c++) {
      const v = rows[r][c];
      const t = Number.isFinite(v) && v > 0 ? (Math.log10(v) - lo) / (hi - lo || 1) : 1;
      ctx.fillStyle = ramp(t);
      ctx.fillRect(pad.l + c * cw, pad.t + r * ch, Math.ceil(cw) + 0.5, Math.ceil(ch) + 0.5);
    }
  }

  // P = n runs as a diagonal in these log axes; draw it so the eye can check
  // that the bright band really does sit on the threshold rather than near it.
  ctx.strokeStyle = 'rgba(220, 228, 239, 0.5)';
  ctx.setLineDash([5, 4]); ctx.lineWidth = 1.25;
  ctx.beginPath();
  let started = false;
  for (let r = 0; r < Ns.length; r++) {
    const n = Ns[r];
    const lp = Math.log(n), l0 = Math.log(Ps[0]), l1 = Math.log(Ps[Ps.length - 1]);
    if (lp < l0 || lp > l1) { started = false; continue; }
    const x = pad.l + ((lp - l0) / (l1 - l0)) * plotW;
    const y = pad.t + (r + 0.5) * ch;
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.setLineDash([]);

  const xTicks = [], yTicks = [];
  const lx0 = Math.log(Ps[0]), lx1 = Math.log(Ps[Ps.length - 1]);
  for (const v of [3, 10, 30, 100, 300]) {
    if (v < Ps[0] || v > Ps[Ps.length - 1]) continue;
    xTicks.push({ x: pad.l + ((Math.log(v) - lx0) / (lx1 - lx0)) * plotW, label: String(v) });
  }
  for (let r = 0; r < Ns.length; r += Math.ceil(Ns.length / 6)) {
    yTicks.push({ y: pad.t + (r + 0.5) * ch, label: String(Ns[r]) });
  }
  ctx.strokeStyle = COL.line;
  ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, plotW, plotH);
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = COL.ink3;
  for (const t of yTicks) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(t.label, pad.l - 8, t.y); }
  for (const t of xTicks) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(t.label, t.x, h - pad.b + 7); }
  ctx.fillStyle = COL.ink2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(opts.xLabel, (pad.l + w - pad.r) / 2, h - 2);
  ctx.save(); ctx.translate(11, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'top'; ctx.fillText(opts.yLabel, 0, 0); ctx.restore();

  const hit = (px, py) => {
    const c = Math.floor((px - pad.l) / cw), r = Math.floor((py - pad.t) / ch);
    if (c < 0 || r < 0 || c >= Ps.length || r >= Ns.length) return null;
    return { P: Ps[c], n: Ns[r], value: rows[r] ? rows[r][c] : NaN, c, r };
  };
  const cellRect = (c, r) => ({ x: pad.l + c * cw, y: pad.t + r * ch, w: cw, h: ch });
  return { hit, cellRect, lo, hi, pad, plotW, plotH };
}

// Single-hue sequential ramp: deep slate -> amber -> white-hot.
export function ramp(t) {
  const u = Math.max(0, Math.min(1, t));
  const stops = [
    [0.00, 12, 20, 30], [0.35, 32, 52, 78], [0.62, 150, 92, 30],
    [0.85, 214, 148, 46], [1.00, 252, 238, 210],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (u <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const k = (u - a[0]) / (b[0] - a[0] || 1);
      return `rgb(${Math.round(a[1] + k * (b[1] - a[1]))},${Math.round(a[2] + k * (b[2] - a[2]))},${Math.round(a[3] + k * (b[3] - a[3]))})`;
    }
  }
  return 'rgb(252,238,210)';
}

// Diverging ramp for signed function values: blue for negative, amber for
// positive, near-black at zero. Two hues, monotone lightness away from the
// centre — the signed analogue of the sequential ramp above, and still not a
// rainbow.
function diverge(t) {
  const u = Math.max(-1, Math.min(1, t));
  const a = Math.abs(u);
  const c = u < 0 ? [59, 130, 246] : [214, 148, 46];
  const k = Math.pow(a, 0.75);
  return `rgb(${Math.round(12 + k * (c[0] - 12))},${Math.round(16 + k * (c[1] - 16))},${Math.round(22 + k * (c[2] - 22))})`;
}

// The learned function itself. In D=1 that is a curve over the input line with
// the training points on it; in D>=2 it is a slice of the input space, with the
// teacher varying along the horizontal axis only — so any vertical structure is
// variance the model invented.
export function drawFit(canvas, r, opts = {}) {
  const { ctx, w, h } = setupCanvas(canvas);
  if (!r) {
    ctx.fillStyle = COL.ink3;
    ctx.font = '13px ' + 'ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(opts.empty || 'No cell selected.', w / 2, h / 2);
    return;
  }
  const pad = { l: 44, r: 12, t: 12, b: 30 };
  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;

  if (r.D === 1) {
    // Clip the vertical range to the honest data range, then mark where the
    // interpolant left the frame. A fit that swings to +-40 would otherwise
    // flatten everything else into a line.
    const ys = [...r.points.map((p) => p.y), ...Array.from(r.truth)];
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const m = (hi - lo) * 0.35 || 1;
    lo -= m; hi += m;
    const X = (v) => pad.l + ((v + 3.2) / 6.4) * plotW;
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * plotH;

    ctx.strokeStyle = COL.lineSoft; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = Math.round(pad.t + (i / 4) * plotH) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    }
    ctx.strokeStyle = COL.line;
    ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, plotW, plotH);

    // teacher
    ctx.strokeStyle = 'rgba(153,165,181,0.85)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]); ctx.beginPath();
    for (let i = 0; i < r.grid.length; i++) {
      const x = X(r.grid[i]), y = Y(r.truth[i]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);

    // the fit, clipped
    ctx.save();
    ctx.beginPath(); ctx.rect(pad.l, pad.t, plotW, plotH); ctx.clip();
    ctx.strokeStyle = COL.amber; ctx.lineWidth = 2; ctx.beginPath();
    let escaped = false;
    for (let i = 0; i < r.grid.length; i++) {
      const v = r.fit[i];
      if (v < lo || v > hi) escaped = true;
      const x = X(r.grid[i]), y = Y(Math.max(lo - 1, Math.min(hi + 1, v)));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = COL.ink;
    for (const p of r.points) {
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 3, 0, 7); ctx.fill();
    }
    if (escaped) {
      ctx.fillStyle = COL.danger;
      ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      let peak = 0;
      for (const v of r.fit) peak = Math.max(peak, Math.abs(v));
      ctx.fillText(`fit leaves the frame — peak |f| = ${peak.toFixed(1)}`, w - pad.r - 6, pad.t + 6);
    }
    ctx.fillStyle = COL.ink3;
    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('input x', (pad.l + w - pad.r) / 2, h - 2);
    return;
  }

  // D >= 2: the learned surface on a slice.
  const S = r.side;
  let scale = 0;
  for (const v of r.truth) scale = Math.max(scale, Math.abs(v));
  scale = Math.max(scale, 1e-6);
  const img = ctx.createImageData(S, S);
  for (let a = 0; a < S; a++) {
    for (let b = 0; b < S; b++) {
      const v = r.surface[a * S + b] / scale;
      const col = diverge(Math.max(-1, Math.min(1, v)));
      const m = col.match(/\d+/g);
      const o = (b * S + a) * 4;
      img.data[o] = +m[0]; img.data[o + 1] = +m[1]; img.data[o + 2] = +m[2]; img.data[o + 3] = 255;
    }
  }
  const off = document.createElement('canvas');
  off.width = S; off.height = S;
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, pad.l, pad.t, plotW, plotH);
  ctx.strokeStyle = COL.line;
  ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, plotW, plotH);

  let peak = 0;
  for (const v of r.surface) peak = Math.max(peak, Math.abs(v));
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillStyle = peak > scale * 3 ? COL.danger : COL.ink3;
  ctx.fillText(`peak |f| = ${peak.toFixed(1)} · teacher ${scale.toFixed(1)}`, w - pad.r - 6, pad.t + 6);
  ctx.fillStyle = COL.ink3;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('along the teacher direction →', (pad.l + w - pad.r) / 2, h - 2);
  ctx.save(); ctx.translate(12, pad.t + plotH / 2); ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'top'; ctx.fillText('← orthogonal', 0, 0); ctx.restore();
}

// Grouped bars, log scale, for the dimension pane.
export function drawBars(canvas, rows, opts) {
  const { ctx, w, h } = setupCanvas(canvas);
  const pad = { l: 58, r: 14, t: 16, b: 42 };
  if (!rows.length) return;
  const vals = rows.flatMap((r) => opts.keys.map((k) => r[k])).filter((v) => Number.isFinite(v) && v > 0);
  if (!vals.length) return;
  let y0 = Math.floor(Math.log10(Math.min(...vals)));
  let y1 = Math.ceil(Math.log10(Math.max(...vals)));
  if (y1 - y0 < 1) y1 = y0 + 1;
  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
  const Y = (v) => pad.t + (1 - (Math.log10(v) - y0) / (y1 - y0)) * plotH;

  ctx.strokeStyle = COL.lineSoft; ctx.lineWidth = 1;
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = COL.ink3;
  const stepY = Math.max(1, Math.round((y1 - y0) / 6));
  for (let e = y0; e <= y1; e += stepY) {
    const y = Math.round(Y(Math.pow(10, e))) + 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('1e' + (e < 0 ? '−' : '') + Math.abs(e), pad.l - 8, y);
  }

  const gw = plotW / rows.length;
  const bw = Math.min(16, (gw - 10) / opts.keys.length);
  rows.forEach((r, i) => {
    const cx = pad.l + gw * (i + 0.5);
    opts.keys.forEach((k, j) => {
      const v = r[k];
      if (!Number.isFinite(v) || v <= 0) return;
      const x = cx + (j - (opts.keys.length - 1) / 2) * bw - bw / 2;
      const y = Y(v);
      ctx.fillStyle = opts.colors[j];
      ctx.fillRect(x, y, bw - 2, h - pad.b - y);
    });
    ctx.fillStyle = r.win ? COL.accent : COL.danger;
    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(r.win ? '✓' : '✗', cx, h - pad.b + 6);
    ctx.fillStyle = COL.ink3;
    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(String(r.D), cx, h - pad.b + 19);
  });

  ctx.strokeStyle = COL.line;
  ctx.beginPath();
  ctx.moveTo(pad.l + 0.5, pad.t); ctx.lineTo(pad.l + 0.5, h - pad.b + 0.5); ctx.lineTo(w - pad.r, h - pad.b + 0.5);
  ctx.stroke();
  ctx.fillStyle = COL.ink2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(opts.xLabel, (pad.l + w - pad.r) / 2, h - 2);
  ctx.save(); ctx.translate(11, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'top'; ctx.fillText(opts.yLabel, 0, 0); ctx.restore();
}


// Predicted against true, for the selected cell. This is the one picture that
// works at every input dimension: training points sit exactly on the diagonal
// whenever the model interpolates, so the only thing that varies across the
// ridge is how far the test points scatter off it.
export function drawScatter(canvas, r, opts = {}) {
  const { ctx, w, h } = setupCanvas(canvas);
  if (!r || !r.testTrue) {
    ctx.fillStyle = COL.ink3;
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(opts.empty || 'No cell selected.', w / 2, h / 2);
    return;
  }
  const pad = { l: 52, r: 14, t: 14, b: 34 };
  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;

  // Square, symmetric limits set by the TRUE values, so the diagonal is at 45
  // degrees and an exploding prediction is visible as points pinned to an edge
  // rather than as a silently rescaled axis.
  let lim = 0;
  for (const v of r.testTrue) lim = Math.max(lim, Math.abs(v));
  for (const p of r.points) lim = Math.max(lim, Math.abs(p.y));
  lim *= 1.25;
  const T = (v) => pad.l + ((v + lim) / (2 * lim)) * plotW;
  const P = (v) => pad.t + (1 - (v + lim) / (2 * lim)) * plotH;

  ctx.strokeStyle = COL.lineSoft; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const t = -lim + (2 * lim * i) / 4;
    const y = Math.round(P(t)) + 0.5, x = Math.round(T(t)) + 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(153,165,181,0.8)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(T(-lim), P(-lim)); ctx.lineTo(T(lim), P(lim)); ctx.stroke();
  ctx.setLineDash([]);

  ctx.save();
  ctx.beginPath(); ctx.rect(pad.l, pad.t, plotW, plotH); ctx.clip();
  let escaped = 0;
  ctx.fillStyle = 'rgba(59,130,246,0.65)';
  for (let i = 0; i < r.testTrue.length; i++) {
    const pv = r.testPred[i];
    if (Math.abs(pv) > lim) escaped++;
    ctx.beginPath();
    ctx.arc(T(r.testTrue[i]), P(Math.max(-lim * 1.05, Math.min(lim * 1.05, pv))), 2.4, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = COL.amber;
  for (let i = 0; i < r.points.length; i++) {
    ctx.beginPath();
    ctx.arc(T(r.points[i].y), P(Math.max(-lim * 1.05, Math.min(lim * 1.05, r.trainPred[i]))), 3.2, 0, 7);
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = COL.line;
  ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, plotW, plotH);
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = COL.ink3;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('true value', (pad.l + w - pad.r) / 2, h - 2);
  ctx.save(); ctx.translate(12, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'top'; ctx.fillText('predicted', 0, 0); ctx.restore();
  if (escaped) {
    ctx.fillStyle = COL.danger;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`${escaped} of ${r.testTrue.length} predictions off the chart`, w - pad.r - 6, pad.t + 6);
  }
}
