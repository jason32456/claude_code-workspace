/**
 * Lightweight canvas price chart — draws last-trade line + true-value reference.
 */
export class PriceChart {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._maxPoints = 500;
  }

  render(priceHistory, trueValue) {
    const { _canvas: c, _ctx: ctx } = this;
    const w = c.width = c.offsetWidth;
    const h = c.height = c.offsetHeight;
    ctx.clearRect(0, 0, w, h);

    const pts = priceHistory.slice(-this._maxPoints);
    if (pts.length < 2) {
      ctx.fillStyle = '#555';
      ctx.font = '13px monospace';
      ctx.fillText('Waiting for trades…', 20, h / 2);
      return;
    }

    const prices = pts.map(p => p.price);
    let min = Math.min(...prices, trueValue ?? Infinity);
    let max = Math.max(...prices, trueValue ?? -Infinity);
    const pad = Math.max((max - min) * 0.15, 0.5);
    min -= pad; max += pad;
    const range = max - min || 1;

    const toX = i => (i / (pts.length - 1)) * w;
    const toY = v => h - ((v - min) / range) * h;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const y = (i / gridSteps) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      const val = max - (range * i / gridSteps);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '10px monospace';
      ctx.fillText(val.toFixed(1), 4, y - 3);
    }

    // True value line
    if (trueValue != null) {
      const y = toY(trueValue);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(250,204,21,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(250,204,21,0.7)';
      ctx.font = '10px monospace';
      ctx.fillText(`fair ${trueValue.toFixed(1)}`, w - 70, y - 4);
    }

    // Price line — gradient fill
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(pts[0].price));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(i), toY(pts[i].price));
    // Fill under line
    ctx.lineTo(toX(pts.length - 1), h);
    ctx.lineTo(toX(0), h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(99,179,237,0.35)');
    grad.addColorStop(1, 'rgba(99,179,237,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line itself
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(pts[0].price));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(i), toY(pts[i].price));
    ctx.strokeStyle = '#63b3ed';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Last price label
    const last = pts[pts.length - 1].price;
    const lastY = toY(last);
    ctx.fillStyle = '#63b3ed';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(last.toFixed(2), w - 60, lastY - 5);
  }
}
