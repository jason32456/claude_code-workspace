import { createCore } from './eye-core.js';

const DEFAULT_PALETTE = ['#14130f', '#e9e4d8'];
const TRAIL_FRAMES = 6;
const SAVE_SCALE = 4;
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

function parseHex(color) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function pack(r, g, b) {
  return LITTLE_ENDIAN
    ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
}

export function createEye(canvas, { cols, rows }) {
  const core = createCore({ cols, rows });
  const cells = cols * rows;
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { alpha: false });
  const image = ctx.createImageData(cols, rows);
  const pixels = new Uint32Array(image.data.buffer);

  const previous = new Uint8Array(cells);
  const heat = new Uint8Array(cells);
  const trailStep = Math.ceil(255 / TRAIL_FRAMES);
  const ramp = new Uint32Array(256);

  let colors = [0, 0];
  let view = 'normal';
  let rendered = 0;
  let cellSize = 0;

  function applyPalette(palette) {
    const dark = parseHex(palette[0]);
    const light = parseHex(palette[1]);
    if (!dark || !light) return;
    colors = [pack(...dark), pack(...light)];
    for (let level = 0; level < 256; level++) {
      const t = level / 255;
      ramp[level] = pack(
        Math.round(dark[0] + (light[0] - dark[0]) * t),
        Math.round(dark[1] + (light[1] - dark[1]) * t),
        Math.round(dark[2] + (light[2] - dark[2]) * t),
      );
    }
  }
  applyPalette(DEFAULT_PALETTE);

  function paint() {
    const { bits } = core;
    if (view === 'difference') {
      for (let i = 0; i < cells; i++) pixels[i] = ramp[heat[i]];
    } else {
      const [dark, light] = colors;
      for (let i = 0; i < cells; i++) pixels[i] = bits[i] ? light : dark;
    }
    ctx.putImageData(image, 0, 0);
  }

  // Changed cells are tracked in every view, so toggling the difference view
  // mid-motion shows the trail immediately rather than starting from black.
  function trackChanges() {
    const { bits } = core;
    for (let i = 0; i < cells; i++) {
      if (bits[i] !== previous[i]) heat[i] = 255;
      else heat[i] = heat[i] > trailStep ? heat[i] - trailStep : 0;
    }
  }

  function render(scene) {
    if (scene.palette) applyPalette(scene.palette);
    previous.set(core.bits);
    core.compose(scene);
    if (rendered > 0) trackChanges();
    rendered++;
    paint();
  }

  function setView(next) {
    const wanted = next === 'difference' ? 'difference' : 'normal';
    if (wanted === view) return;
    view = wanted;
    if (rendered > 0) paint();
  }

  function census() {
    return core.tally();
  }

  function resize() {
    const host = canvas.parentElement;
    if (!host) return cellSize;
    const dpr = window.devicePixelRatio || 1;
    const style = getComputedStyle(host);
    const availW = host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = host.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    // Whole device pixels per cell: on a fractional-DPR screen a whole CSS
    // multiple would still land on fractional device pixels and blur the grid.
    const device = Math.max(1, Math.floor(Math.min((availW * dpr) / cols, (availH * dpr) / rows)));
    if (device === cellSize) return cellSize;
    cellSize = device;
    canvas.style.width = `${(cols * device) / dpr}px`;
    canvas.style.height = `${(rows * device) / dpr}px`;
    return cellSize;
  }

  function saveFrame() {
    if (rendered === 0) return;
    const { bits } = core;
    const frame = ctx.createImageData(cols, rows);
    const out = new Uint32Array(frame.data.buffer);
    for (let i = 0; i < cells; i++) out[i] = bits[i] ? colors[1] : colors[0];

    const small = document.createElement('canvas');
    small.width = cols;
    small.height = rows;
    small.getContext('2d').putImageData(frame, 0, 0);

    const big = document.createElement('canvas');
    big.width = cols * SAVE_SCALE;
    big.height = rows * SAVE_SCALE;
    const bigCtx = big.getContext('2d');
    bigCtx.imageSmoothingEnabled = false;
    bigCtx.drawImage(small, 0, 0, big.width, big.height);

    big.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `still-life-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  canvas.style.imageRendering = 'crisp-edges';
  canvas.style.imageRendering = 'pixelated';
  resize();

  return {
    render,
    setView,
    census,
    saveFrame,
    resize,
    get view() { return view; },
    get cellSize() { return cellSize; },
  };
}
