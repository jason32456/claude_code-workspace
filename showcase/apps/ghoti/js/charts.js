// Canvas drawing for the three figures. Nothing here computes anything: every number
// drawn was measured by the worker.

const CSS = getComputedStyle(document.documentElement);
const v = (name, fallback) => (CSS.getPropertyValue(name) || fallback).trim();

const INK = () => v('--ink', '#e9e5dd');
const MUTED = () => v('--muted', '#8b939e');
const DIM = () => v('--dim', '#5c646e');
const LINE = () => v('--line', '#262d36');
const ACCENT = () => v('--accent', '#e8a33d');
const TEAL = () => v('--teal', '#4dbcaa');
const BAD = () => v('--bad', '#e2624e');

// Size the backing store to the element's real width so nothing is blurry, and return
// a context already scaled to CSS pixels.
function fit(canvas, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || canvas.width;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  return { ctx, w: cssWidth, h: cssHeight };
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function drawMatrix(canvas, data) {
  const cols = data.cols;
  const padL = 30;
  const padT = 52;
  const padR = 6;
  const padB = 8;
  const cellW = Math.max(16, (canvas.clientWidth - padL - padR) / cols);
  const cellH = 21;
  const height = padT + cellH * 26 + padB;
  const { ctx, w } = fit(canvas, height);

  let max = 0;
  for (const x of data.matrix) if (x > max) max = x;

  ctx.font = `11px ${v('--mono', 'monospace')}`;
  ctx.textBaseline = 'middle';

  // Column headings, rotated so 40 phone labels fit without overlapping.
  ctx.save();
  ctx.fillStyle = MUTED();
  for (let c = 0; c < cols; c++) {
    const label = c < data.baseNames.length ? data.baseNames[c] : '∅';
    ctx.save();
    ctx.translate(padL + c * cellW + cellW / 2, padT - 8);
    ctx.rotate(-Math.PI / 3);
    ctx.textAlign = 'left';
    ctx.fillStyle = c === data.baseNames.length ? DIM() : MUTED();
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
  ctx.restore();

  for (let r = 0; r < 26; r++) {
    ctx.fillStyle = MUTED();
    ctx.textAlign = 'right';
    ctx.fillText(LETTERS[r], padL - 7, padT + r * cellH + cellH / 2);
    for (let c = 0; c < cols; c++) {
      const p = data.matrix[r * cols + c] / (max || 1);
      const x = padL + c * cellW;
      const y = padT + r * cellH;
      ctx.fillStyle = 'rgba(255,255,255,0.028)';
      ctx.fillRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
      if (p > 0.004) {
        // Square-root scaling: the rare-but-real correspondences are the interesting
        // ones and a linear ramp hides all of them under a handful of near-certainties.
        const t = Math.sqrt(p);
        const isSilent = c === data.baseNames.length;
        ctx.fillStyle = isSilent
          ? `rgba(77, 188, 170, ${0.1 + 0.85 * t})`
          : `rgba(232, 163, 61, ${0.08 + 0.9 * t})`;
        ctx.fillRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
      }
    }
  }
  // Separate the silence column from the phones.
  ctx.strokeStyle = LINE();
  ctx.lineWidth = 1;
  ctx.beginPath();
  const sx = padL + data.baseNames.length * cellW;
  ctx.moveTo(sx, padT - 2);
  ctx.lineTo(sx, padT + 26 * cellH);
  ctx.stroke();
  return w;
}

function axes(ctx, w, h, padL, padR, padT, padB, yTicks, label) {
  ctx.strokeStyle = LINE();
  ctx.fillStyle = DIM();
  ctx.lineWidth = 1;
  ctx.font = `11px ${v('--mono', 'monospace')}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (const t of yTicks) {
    const y = padT + (1 - t.at) * (h - padT - padB);
    ctx.beginPath();
    ctx.moveTo(padL, y + 0.5);
    ctx.lineTo(w - padR, y + 0.5);
    ctx.stroke();
    ctx.fillText(t.label, padL - 8, y);
  }
  if (label) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = DIM();
    ctx.fillText(label, (padL + w - padR) / 2, h - 6);
    ctx.restore();
  }
}

export function drawSweep(canvas, sweep, bestWidth) {
  const { ctx, w, h } = fit(canvas, 340);
  const padL = 46;
  const padR = 14;
  const padT = 18;
  const padB = 34;
  if (!sweep.length) return;

  const max = Math.max(...sweep.map((s) => s.wordAccuracy)) * 1.18 || 1;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    at: f,
    label: `${Math.round(f * max * 100)}%`,
  }));
  axes(ctx, w, h, padL, padR, padT, padB, ticks, 'letters of context on each side');

  const n = sweep.length;
  const bw = (w - padL - padR) / n;
  sweep.forEach((s, i) => {
    const x = padL + i * bw;
    const hgt = (s.wordAccuracy / max) * (h - padT - padB);
    const y = h - padB - hgt;
    const best = s.width === bestWidth;
    ctx.fillStyle = best ? ACCENT() : 'rgba(232,163,61,0.3)';
    ctx.fillRect(x + bw * 0.16, y, bw * 0.68, hgt);
    ctx.fillStyle = best ? ACCENT() : MUTED();
    ctx.font = `${best ? '600 ' : ''}11px ${v('--mono', 'monospace')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${(s.wordAccuracy * 100).toFixed(1)}`, x + bw / 2, y - 4);
    ctx.fillStyle = best ? INK() : DIM();
    ctx.textBaseline = 'top';
    ctx.fillText(String(s.width), x + bw / 2, h - padB + 7);
  });

  // The decline after the peak is the point of the figure, so trace it.
  ctx.strokeStyle = TEAL();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  sweep.forEach((s, i) => {
    const x = padL + i * bw + bw / 2;
    const y = h - padB - (s.wordAccuracy / max) * (h - padT - padB);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

export function drawEm(canvas, history) {
  const { ctx, w, h } = fit(canvas, 220);
  const padL = 62;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const pts = history.filter((p) => p.proper);
  if (pts.length < 2) return;

  const lo = Math.min(...pts.map((p) => p.logLik));
  const hi = Math.max(...pts.map((p) => p.logLik));
  const span = hi - lo || 1;
  axes(ctx, w, h, padL, padR, padT, padB, [
    { at: 1, label: (hi / 1000).toFixed(0) + 'k' },
    { at: 0.5, label: ((lo + span / 2) / 1000).toFixed(0) + 'k' },
    { at: 0, label: (lo / 1000).toFixed(0) + 'k' },
  ], 'EM pass');

  const x = (i) => padL + (i / (pts.length - 1)) * (w - padL - padR);
  const y = (p) => padT + (1 - (p.logLik - lo) / span) * (h - padT - padB);

  ctx.strokeStyle = ACCENT();
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p)) : ctx.moveTo(x(i), y(p))));
  ctx.stroke();

  pts.forEach((p, i) => {
    const down = i > 0 && p.logLik < pts[i - 1].logLik - 1e-6;
    ctx.fillStyle = down ? BAD() : ACCENT();
    ctx.beginPath();
    ctx.arc(x(i), y(p), down ? 4.5 : 2.6, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = DIM();
  ctx.font = `11px ${v('--mono', 'monospace')}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('log-likelihood', padL + 4, padT + 2);
}

export function drawWave(canvas, data) {
  const { ctx, w, h } = fit(canvas, 54);
  if (!data || !data.length) return;
  ctx.strokeStyle = 'rgba(232,163,61,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = Math.max(1, Math.floor(data.length / w));
  for (let x = 0; x < w; x++) {
    let lo = 1;
    let hi = -1;
    const s = x * step;
    for (let k = s; k < s + step && k < data.length; k++) {
      if (data[k] < lo) lo = data[k];
      if (data[k] > hi) hi = data[k];
    }
    ctx.moveTo(x + 0.5, h / 2 - (hi * h) / 2);
    ctx.lineTo(x + 0.5, h / 2 - (lo * h) / 2);
  }
  ctx.stroke();
}
