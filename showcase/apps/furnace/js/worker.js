// One horizontal band of the image, rendered over and over.
//
// The worker keeps its own float accumulator and never ships it: what crosses
// back is an 8-bit band plus the few statistics the furnace panel needs, which
// is about a tenth of what the floats would cost per pass.

import { renderTile } from './trace.js';
import { SCENES } from './scenes.js';

let scene = null, camera = null, acc = null;
let width = 0, height = 0, y0 = 0, y1 = 0, samples = 0;
let opts = {};

/** ACES filmic (Narkowicz fit), then the sRGB transfer. */
function tonemap(x) {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  const v = Math.max((x * (a * x + b)) / (x * (c * x + d) + e), 0);
  return Math.min(v, 1) ** (1 / 2.2);
}

/** Linear display, used by the furnace so a deviation is not hidden by a curve. */
function linearMap(x) {
  return Math.min(Math.max(x, 0), 1) ** (1 / 2.2);
}

/**
 * A difference image: how far each pixel is from the 1.0 the furnace demands,
 * amplified so it can be seen at all. This is the standard way renders are
 * compared, and it is labelled with its gain on the page, because an amplified
 * error shown without its multiplier is a lie by presentation.
 */
const HEAT = [[0, 0, 0], [46, 26, 92], [140, 30, 110], [226, 76, 54], [250, 176, 60], [255, 255, 214]];
function deviationMap(v, gain) {
  const e = Math.min(Math.abs(v - 1) * gain, 1);
  const t = e * (HEAT.length - 1);
  const i = Math.min(Math.floor(t), HEAT.length - 2);
  const f = t - i;
  const a = HEAT[i], b = HEAT[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

self.onmessage = (ev) => {
  const msg = ev.data;

  if (msg.type === 'init') {
    const entry = SCENES[msg.scene];
    scene = entry.build(msg.sceneOpts);
    camera = entry.camera;
    width = msg.width; height = msg.height;
    y0 = msg.y0; y1 = msg.y1;
    opts = msg.opts || {};
    acc = new Float32Array(width * (y1 - y0) * 3);
    samples = 0;
    return;
  }

  if (msg.type === 'pass') {
    for (let p = 0; p < (msg.passes || 1); p++) {
      renderTile(scene, camera, acc, width, height, y0, y1, samples, opts, y0);
      samples++;
    }

    const rows = y1 - y0;
    const map = msg.linear ? linearMap : tonemap;
    const rgba = new Uint8ClampedArray(width * rows * 4);
    let min = Infinity, max = -Infinity, sum = 0;
    for (let i = 0, j = 0; i < width * rows * 3; i += 3, j += 4) {
      const r = acc[i] / samples, g = acc[i + 1] / samples, b = acc[i + 2] / samples;
      if (r < min) min = r;
      if (r > max) max = r;
      sum += r;
      if (msg.deviation) {
        const c = deviationMap(r, msg.gain || 20);
        rgba[j] = c[0]; rgba[j + 1] = c[1]; rgba[j + 2] = c[2];
      } else {
        rgba[j] = map(r) * 255;
        rgba[j + 1] = map(g) * 255;
        rgba[j + 2] = map(b) * 255;
      }
      rgba[j + 3] = 255;
    }
    self.postMessage(
      { type: 'band', y0, rows, rgba, samples, min, max, sum, n: width * rows },
      [rgba.buffer],
    );
  }
};
