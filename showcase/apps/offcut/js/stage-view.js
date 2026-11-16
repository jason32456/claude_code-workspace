import { FRAME_COUNT, buildFilm, layoutFilm, fitBox, samplePiece, segmentOf, easeInOut } from './stage-pose.js';

const BUCKETS = 72;
const PADDING = 30;
const SHADOW_LIMIT = 1500;

function parseColor(text, fallback) {
  const m = /^#([0-9a-f]{6})$/i.exec((text || '').trim());
  const v = m ? parseInt(m[1], 16) : fallback;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

const css = (rgb, alpha = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

export class StageView {
  constructor(canvas, { onHover = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onHover = onHover;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.pos = 0;
    this.result = null;
    this.film = null;
    this.layout = null;
    this.hover = -1;
    this.dirty = true;
    this.theme = null;
    this.cur = null;
    this.scratch = { x: 0, y: 0, c: 1, s: 0, scale: 1, moving: false };
    canvas.addEventListener('pointermove', (e) => this.pointAt(e, false));
    canvas.addEventListener('pointerdown', (e) => this.pointAt(e, true));
    canvas.addEventListener('pointerleave', () => this.setHover(-1));
    this.refreshTheme();
  }

  refreshTheme() {
    const style = getComputedStyle(this.canvas);
    const get = (name, fallback) => parseColor(style.getPropertyValue(name), fallback);
    const stops = [get('--ramp-0', 0xcf4f3a), get('--ramp-1', 0xe8b04a), get('--ramp-2', 0x3a8c86)];
    this.theme = {
      fills: Array.from({ length: BUCKETS }, (_, b) => {
        const t = b / (BUCKETS - 1);
        return t < 0.5 ? css(mix(stops[0], stops[1], t * 2)) : css(mix(stops[1], stops[2], (t - 0.5) * 2));
      }),
      cut: get('--cut', 0x1d1b18),
      ink: get('--ink', 0x1d1b18),
      bg: get('--stage', 0xfbf8f2),
      accent: get('--ink', 0x1d1b18),
    };
    this.dirty = true;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (rect.width === this.width && rect.height === this.height && dpr === this.dpr) return;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.relayout();
  }

  setResult(result) {
    this.result = result;
    this.film = result ? buildFilm(result) : null;
    this.hover = -1;
    if (this.film) {
      const { n, frac } = this.film;
      const bucket = new Uint8Array(n);
      for (let i = 0; i < n; i++) bucket[i] = Math.round(frac[i] * (BUCKETS - 1));
      this.bucket = bucket;
      this.order = Uint32Array.from({ length: n }, (_, i) => i).sort((p, q) => bucket[p] - bucket[q] || p - q);
      this.cur = { x: new Float64Array(n), y: new Float64Array(n), c: new Float64Array(n), s: new Float64Array(n), scale: new Float64Array(n) };
    }
    this.relayout();
  }

  relayout() {
    this.layout = this.film && this.width ? layoutFilm(this.film, this.width, this.height, PADDING) : null;
    this.dirty = true;
  }

  setPos(pos) {
    if (pos !== this.pos) {
      this.pos = pos;
      this.dirty = true;
    }
  }

  setHover(id) {
    if (id === this.hover) return;
    this.hover = id;
    this.dirty = true;
    this.onHover(id);
  }

  pointAt(e, press) {
    if (e.pointerType === 'touch' && !press) return;
    const rect = this.canvas.getBoundingClientRect();
    this.setHover(this.hitTest(e.clientX - rect.left, e.clientY - rect.top));
  }

  hitTest(x, y) {
    if (!this.film || !this.layout || !this.cur) return -1;
    const { film, cur, order } = this;
    for (let k = order.length - 1; k >= 0; k--) {
      const i = order[k];
      const dx = x - cur.x[i];
      const dy = y - cur.y[i];
      const sc = cur.scale[i];
      const reach = film.radius[i] * sc;
      if (dx * dx + dy * dy > reach * reach) continue;
      const lx = (cur.c[i] * dx + cur.s[i] * dy) / sc;
      const ly = (-cur.s[i] * dx + cur.c[i] * dy) / sc;
      const a = film.vstart[i];
      const b = film.vstart[i + 1];
      let inside = true;
      for (let v = a; v < b && inside; v++) {
        const w = v + 1 < b ? v + 1 : a;
        const cross = (film.lx[w] - film.lx[v]) * (ly - film.ly[v]) - (film.ly[w] - film.ly[v]) * (lx - film.lx[v]);
        if (cross * film.orient[i] < 0) inside = false;
      }
      if (inside) return i;
    }
    return -1;
  }

  pieceScreen(i) {
    const out = { x: 0, y: 0, c: 1, s: 0, scale: 1 };
    if (this.film && this.layout) samplePiece(this.film, this.layout, this.pos, i, out);
    return out;
  }

  tracePiece(path, i, pose) {
    const { film } = this;
    for (let v = film.vstart[i], end = film.vstart[i + 1], first = v; v < end; v++) {
      const x = pose.x + pose.scale * (pose.c * film.lx[v] - pose.s * film.ly[v]);
      const y = pose.y + pose.scale * (pose.s * film.lx[v] + pose.c * film.ly[v]);
      if (v === first) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
  }

  render() {
    if (!this.dirty) return;
    this.dirty = false;
    const { ctx, dpr, theme } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const { film, layout } = this;
    if (!film || !layout || !film.n) return;

    const { f, t } = segmentOf(this.pos);
    const nowScale = layout.scale[f] + (layout.scale[f + 1] - layout.scale[f]) * easeInOut(t);
    const avg = Math.sqrt(film.totalArea / film.n) * nowScale;
    const pose = this.scratch;
    const moving = t > 0 && t < 1;
    const shadow = moving && film.n <= SHADOW_LIMIT;

    const strokes = new Path2D();
    let path = new Path2D();
    let current = this.bucket[this.order[0]];
    const flush = () => {
      if (shadow) {
        ctx.shadowColor = css(theme.ink, 0.22);
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 2;
      }
      ctx.fillStyle = theme.fills[current];
      ctx.fill(path);
      ctx.shadowColor = 'transparent';
      strokes.addPath(path);
      path = new Path2D();
    };
    for (let k = 0; k < this.order.length; k++) {
      const i = this.order[k];
      if (this.bucket[i] !== current) {
        flush();
        current = this.bucket[i];
      }
      samplePiece(film, layout, this.pos, i, pose);
      this.cur.x[i] = pose.x;
      this.cur.y[i] = pose.y;
      this.cur.c[i] = pose.c;
      this.cur.s[i] = pose.s;
      this.cur.scale[i] = pose.scale;
      this.tracePiece(path, i, pose);
    }
    flush();

    ctx.lineJoin = 'round';
    ctx.lineWidth = avg < 6 ? 0.55 : avg < 12 ? 0.8 : 1;
    ctx.strokeStyle = css(theme.cut, Math.min(0.85, Math.max(0.07, (avg - 1.5) / 16)));
    ctx.stroke(strokes);

    if (this.hover >= 0) this.drawHover(this.hover);
  }

  drawHover(i) {
    const { ctx, theme, film, layout } = this;
    const pose = samplePiece(film, layout, this.pos, i, { x: 0, y: 0, c: 1, s: 0, scale: 1 });
    const p = new Path2D();
    this.tracePiece(p, i, pose);
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(theme.ink, 0.95);
    ctx.fillStyle = css(theme.bg, 0.28);
    ctx.fill(p);
    ctx.stroke(p);
    if (film.radius[i] * pose.scale > 11) {
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = css(theme.bg, 0.9);
      ctx.strokeText(String(i + 1), pose.x, pose.y);
      ctx.fillStyle = css(theme.ink, 1);
      ctx.fillText(String(i + 1), pose.x, pose.y);
      ctx.textAlign = 'start';
    }
    this.drawInset(i, 0, 'From');
    this.drawInset(i, 1, 'To');
  }

  drawInset(i, side, label) {
    const { ctx, theme, film, result } = this;
    const frame = side ? FRAME_COUNT - 1 : 0;
    const w = Math.min(176, Math.max(104, this.width * 0.24));
    const h = w * 0.78;
    const margin = 10;
    const x = side ? this.width - w - margin : margin;
    const y = margin;
    ctx.save();
    ctx.fillStyle = css(theme.bg, 0.94);
    ctx.strokeStyle = css(theme.ink, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fill();
    ctx.stroke();

    const labelH = 16;
    const fit = fitBox(film.boxes[frame], w, h - labelH, 12);
    const ox = x + fit.ox;
    const oy = y + fit.oy;
    const shape = side ? result.b.shape : result.a.shape;
    ctx.beginPath();
    for (const region of shape) {
      for (const ring of [region.outer, ...region.holes]) {
        ring.forEach(([px, py], k) => (k ? ctx.lineTo(px * fit.s + ox, py * fit.s + oy) : ctx.moveTo(px * fit.s + ox, py * fit.s + oy)));
        ctx.closePath();
      }
    }
    ctx.fillStyle = css(theme.ink, 0.1);
    ctx.fill('evenodd');
    ctx.strokeStyle = css(theme.ink, 0.45);
    ctx.stroke();

    const n = film.n;
    const theta = film.ang[frame * n + i];
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const cx = film.px[frame * n + i];
    const cy = film.py[frame * n + i];
    ctx.beginPath();
    for (let v = film.vstart[i], end = film.vstart[i + 1], first = v; v < end; v++) {
      const px = (cx + c * film.lx[v] - s * film.ly[v]) * fit.s + ox;
      const py = (cy + s * film.lx[v] + c * film.ly[v]) * fit.s + oy;
      if (v === first) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = theme.fills[this.bucket[i]];
    ctx.fill();
    ctx.strokeStyle = css(theme.ink, 0.9);
    ctx.stroke();

    ctx.fillStyle = css(theme.ink, 0.85);
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${label} · piece ${i + 1}`, x + 7, y + h - 5);
    ctx.restore();
  }
}
