// Minimal plotting used by every bench pane. Linear or log axes, a few series,
// no dependencies.
// Log axes otherwise print things like 0.000001, which collide with the title.
function fmtAuto(v, log) {
  if (log && (Math.abs(v) < 1e-2 || Math.abs(v) >= 1e4)) {
    return `1e${Math.round(Math.log10(Math.abs(v)))}`;
  }
  return String(+v.toPrecision(4));
}

export function plot(canvas, spec) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 640, h = canvas.clientHeight || 320;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const m = { l: 74, r: 16, t: 16, b: 42 };
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const lx = spec.logX, ly = spec.logY;
  const tx = (v) => (lx ? Math.log10(v) : v), ty = (v) => (ly ? Math.log10(v) : v);
  const [x0, x1] = spec.xlim.map(tx), [y0, y1] = spec.ylim.map(ty);
  const X = (v) => m.l + ((tx(v) - x0) / (x1 - x0)) * pw;
  const Y = (v) => m.t + ph - ((ty(v) - y0) / (y1 - y0)) * ph;

  g.fillStyle = '#080b14'; g.fillRect(m.l, m.t, pw, ph);
  g.strokeStyle = '#1d2740'; g.lineWidth = 1;
  g.fillStyle = '#7c8aa8'; g.font = '11px ui-monospace, monospace';

  const ticks = (a, b, log) => {
    const out = [];
    if (log) {
      for (let e = Math.ceil(a); e <= Math.floor(b); e++) out.push(Math.pow(10, e));
    } else {
      const span = b - a, step = Math.pow(10, Math.floor(Math.log10(span)));
      const s = span / step > 5 ? step * 2 : span / step > 2 ? step : step / 2;
      for (let v = Math.ceil(a / s) * s; v <= b + 1e-9; v += s) out.push(v);
    }
    return out;
  };

  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const v of ticks(x0, x1, lx)) {
    const px = X(v);
    g.beginPath(); g.moveTo(px, m.t); g.lineTo(px, m.t + ph); g.stroke();
    g.fillText(spec.fmtX ? spec.fmtX(v) : fmtAuto(v, lx), px, m.t + ph + 6);
  }
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of ticks(y0, y1, ly)) {
    const py = Y(v);
    g.beginPath(); g.moveTo(m.l, py); g.lineTo(m.l + pw, py); g.stroke();
    g.fillText(spec.fmtY ? spec.fmtY(v) : fmtAuto(v, ly), m.l - 8, py);
  }

  g.save();
  g.beginPath(); g.rect(m.l, m.t, pw, ph); g.clip();
  for (const s of spec.series) {
    g.strokeStyle = s.color; g.fillStyle = s.color;
    g.lineWidth = s.width || 2;
    if (s.dash) g.setLineDash(s.dash); else g.setLineDash([]);
    if (s.points) {
      for (const [px, py] of s.data) {
        g.beginPath(); g.arc(X(px), Y(py), s.width || 3.2, 0, 7); g.fill();
      }
    } else {
      g.beginPath();
      s.data.forEach(([px, py], i) => (i ? g.lineTo(X(px), Y(py)) : g.moveTo(X(px), Y(py))));
      g.stroke();
    }
  }
  g.restore();
  g.setLineDash([]);
  g.strokeStyle = '#2b3959'; g.strokeRect(m.l, m.t, pw, ph);

  g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillStyle = '#95a4c4'; g.font = '12px ui-monospace, monospace';
  if (spec.xlabel) g.fillText(spec.xlabel, m.l + pw / 2, h - 4);
  if (spec.ylabel) {
    g.save(); g.translate(12, m.t + ph / 2); g.rotate(-Math.PI / 2);
    g.textBaseline = 'top'; g.fillText(spec.ylabel, 0, 0); g.restore();
  }

  if (spec.legend) {
    const n = spec.series.filter((s) => s.label).length;
    let ly0 = spec.legendAt === 'bl' ? m.t + ph - 16 * n : m.t + 10;
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '11px ui-monospace, monospace';
    for (const s of spec.series.filter((s) => s.label)) {
      g.fillStyle = s.color; g.fillRect(m.l + 12, ly0 - 1.5, 16, 3);
      g.fillStyle = '#c3cfe6'; g.fillText(s.label, m.l + 34, ly0);
      ly0 += 16;
    }
  }
}
