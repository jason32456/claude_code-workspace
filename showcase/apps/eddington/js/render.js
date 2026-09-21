// Progressive tile renderer: a pool of module workers, coarse passes first so
// the frame is legible in a few hundred milliseconds and sharpens from there.

const PASSES = [8, 4, 2];

export class Renderer {
  constructor(canvas, onStatus) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onStatus = onStatus;
    const n = Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4));
    this.workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./trace.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => this._onRows(ev.data, w);
      this.workers.push(w);
    }
    this.job = 0;
    this.queue = [];
    this.busy = new Set();
  }

  get workerCount() { return this.workers.length; }

  render(p) {
    this.p = p;
    this.job++;
    this.W = p.W; this.H = p.H;
    this.canvas.width = p.W; this.canvas.height = p.H;
    this.buf = new Float32Array(p.W * p.H * 3);
    this.img = this.ctx.createImageData(p.W, p.H);
    this.rays = 0;
    this.t0 = performance.now();
    this.done = 0;

    const scales = [...PASSES.filter((s) => s > p.finalScale), p.finalScale];
    this.queue = [];
    for (const scale of scales) {
      const bandRows = Math.max(scale, Math.ceil(p.H / (this.workers.length * 4) / scale) * scale);
      for (let y = 0; y < p.H; y += bandRows) {
        this.queue.push({ type: 'band', job: this.job, p, scale, ss: scale === p.finalScale ? p.ss : 1, y0: y, y1: Math.min(p.H, y + bandRows) });
      }
    }
    this.total = this.queue.length;
    for (const w of this.workers) this._pump(w);
  }

  _pump(w) {
    if (this.busy.has(w)) return;
    const task = this.queue.shift();
    if (!task) return;
    this.busy.add(w);
    w.postMessage(task);
  }

  _onRows(msg, w) {
    this.busy.delete(w);
    if (msg.job !== this.job) { this._pump(w); return; }
    this.rays += msg.rays;
    const { scale } = msg;
    for (const { y, row } of msg.rows) {
      for (let x = 0, k = 0; x < this.W; x += scale, k += 3) {
        const r = row[k], g = row[k + 1], b = row[k + 2];
        for (let dy = 0; dy < scale && y + dy < this.H; dy++) {
          for (let dx = 0; dx < scale && x + dx < this.W; dx++) {
            const o = ((y + dy) * this.W + (x + dx)) * 3;
            this.buf[o] = r; this.buf[o + 1] = g; this.buf[o + 2] = b;
          }
        }
      }
    }
    this.done++;
    this._paint();
    this._pump(w);
    if (this.queue.length === 0 && this.busy.size === 0) this._status(true);
    else this._status(false);
  }

  _status(finished) {
    const dt = (performance.now() - this.t0) / 1000;
    this.onStatus({
      pct: Math.round((this.done / this.total) * 100),
      rays: this.rays,
      seconds: dt,
      rate: this.rays / Math.max(1e-3, dt),
      finished,
    });
  }

  _paint() {
    const e = this.p.exposure, d = this.img.data, n = this.W * this.H;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        const v = 1 - Math.exp(-Math.max(0, this.buf[i * 3 + c]) * e);
        d[i * 4 + c] = Math.round(255 * Math.pow(v, 1 / 2.2));
      }
      d[i * 4 + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
