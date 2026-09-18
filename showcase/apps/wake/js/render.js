// Field colouring and smoke tracers. The lattice is painted at grid
// resolution into an ImageData, scaled up onto the display canvas, then the
// tracer layer is composited over it at display resolution.

import { OBSTACLE, FLUID } from './lbm.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Piecewise-linear colour ramps, stops in [0, 1].
function ramp(stops) {
  const lut = new Uint32Array(256);
  for (let j = 0; j < 256; j++) {
    const t = j / 255;
    let a = 0;
    while (a < stops.length - 2 && stops[a + 1][0] < t) a++;
    const [ta, ca] = stops[a], [tb, cb] = stops[a + 1];
    const u = tb > ta ? clamp01((t - ta) / (tb - ta)) : 0;
    const r = Math.round(ca[0] + (cb[0] - ca[0]) * u);
    const g = Math.round(ca[1] + (cb[1] - ca[1]) * u);
    const b = Math.round(ca[2] + (cb[2] - ca[2]) * u);
    lut[j] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return lut;
}

// Vorticity: clockwise blue, anticlockwise amber, still fluid nearly the page
// background so the vortices read as objects rather than a heatmap.
export const VORT = ramp([
  [0.00, [90, 170, 255]],
  [0.25, [40, 95, 190]],
  [0.46, [14, 22, 40]],
  [0.50, [11, 15, 22]],
  [0.54, [40, 24, 18]],
  [0.75, [200, 95, 30]],
  [1.00, [255, 215, 120]],
]);

export const SPEED = ramp([
  [0.00, [8, 10, 20]],
  [0.20, [40, 20, 80]],
  [0.45, [130, 30, 100]],
  [0.65, [210, 70, 50]],
  [0.85, [245, 160, 40]],
  [1.00, [255, 245, 190]],
]);

export const PRESS = ramp([
  [0.00, [60, 120, 230]],
  [0.35, [24, 40, 80]],
  [0.50, [16, 20, 30]],
  [0.65, [80, 36, 30]],
  [1.00, [240, 110, 60]],
]);

const SOLID = (255 << 24) | (236 << 16) | (230 << 8) | 222;

export class FieldPainter {
  constructor(lat) {
    this.lat = lat;
    this.image = new ImageData(lat.nx, lat.ny);
    this.px = new Uint32Array(this.image.data.buffer);
    this.vort = new Float32Array(lat.n);
    this.off = document.createElement('canvas');
    this.off.width = lat.nx;
    this.off.height = lat.ny;
    this.offCtx = this.off.getContext('2d');
  }

  paint(mode, scale) {
    const { lat, px } = this;
    const { n, mask, ux, uy, rho } = lat;
    if (mode === 'vorticity') {
      lat.vorticity(this.vort);
      const v = this.vort, s = 1 / scale.vort;
      for (let k = 0; k < n; k++) {
        if (mask[k] !== FLUID) { px[k] = mask[k] === OBSTACLE ? SOLID : 0xff1a2130; continue; }
        // tanh soft clip keeps the strong cores from saturating to one flat colour
        const t = 0.5 + 0.5 * Math.tanh(v[k] * s);
        px[k] = VORT[(t * 255) | 0];
      }
    } else if (mode === 'speed') {
      const s = 1 / scale.speed;
      for (let k = 0; k < n; k++) {
        if (mask[k] !== FLUID) { px[k] = mask[k] === OBSTACLE ? SOLID : 0xff1a2130; continue; }
        const t = clamp01(Math.hypot(ux[k], uy[k]) * s);
        px[k] = SPEED[(t * 255) | 0];
      }
    } else {
      const s = 1 / scale.press;
      for (let k = 0; k < n; k++) {
        if (mask[k] !== FLUID) { px[k] = mask[k] === OBSTACLE ? SOLID : 0xff1a2130; continue; }
        const t = 0.5 + 0.5 * Math.tanh((rho[k] - 1) * s);
        px[k] = PRESS[(t * 255) | 0];
      }
    }
    this.offCtx.putImageData(this.image, 0, 0);
    return this.off;
  }
}

// Smoke rake: tracers released from fixed heights at the inlet and carried by
// the interpolated velocity field. Old tracers die at the outlet or after a
// fixed life so the array never grows.
export class Smoke {
  constructor(lat, { lines = 14, max = 24000, every = 3 } = {}) {
    this.lat = lat;
    this.max = max;
    this.every = every;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.alive = new Uint8Array(max);
    this.count = 0;
    this.cursor = 0;
    this.tick = 0;
    this.lines = [];
    for (let j = 0; j < lines; j++) this.lines.push((j + 0.5) * lat.ny / lines);
    this.tmp = [0, 0];
  }

  clear() { this.alive.fill(0); this.count = 0; }

  advance() {
    const { lat, x, y, alive, max, tmp } = this;
    const nx = lat.nx, ny = lat.ny;
    if (++this.tick % this.every === 0) {
      for (const ly of this.lines) {
        const j = this.cursor;
        this.cursor = (this.cursor + 1) % max;
        x[j] = 1.5; y[j] = ly; alive[j] = 1;
      }
    }
    const mask = lat.mask;
    for (let j = 0; j < max; j++) {
      if (!alive[j]) continue;
      lat.sampleU(x[j], y[j], tmp);
      let px = x[j] + tmp[0], py = y[j] + tmp[1];
      if (py < 0) py += ny; else if (py >= ny) py -= ny;
      if (px >= nx - 1.5 || px < 0) { alive[j] = 0; continue; }
      const k = (py | 0) * nx + (px | 0);
      if (mask[k] !== FLUID) { alive[j] = 0; continue; }
      x[j] = px; y[j] = py;
    }
  }

  draw(ctx, sx, sy) {
    const { x, y, alive, max } = this;
    ctx.fillStyle = 'rgba(235, 240, 248, 0.55)';
    const w = Math.max(1, sx * 0.6);
    for (let j = 0; j < max; j++) {
      if (!alive[j]) continue;
      ctx.fillRect(x[j] * sx - w / 2, y[j] * sy - w / 2, w, w);
    }
  }
}
