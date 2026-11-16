import { traceGrid, translateShape, shapeBounds } from './trace.js';
import { PRESET_SIZE, drawPreset, findPreset } from './presets.js';

const FONT_STACK = '"Arial Black", "Helvetica Neue", Helvetica, Arial, "Segoe UI", "Liberation Sans", "DejaVu Sans", sans-serif';
const REFERENCE_SIZE = 420;
const MAX_WIDTH = 3200;
export const DEFAULT_DETAIL = 50;

export function toleranceForDetail(detail, scale = 1) {
  const d = Math.min(1, Math.max(0, detail / 100));
  return (1 + 16 * (1 - d) ** 2) * scale;
}

function surface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
}

export function canvasToShape(canvas, detail, scale = 1) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const grid = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < grid.length; i++) grid[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  const shape = traceGrid(grid, canvas.width, canvas.height, {
    tolerance: toleranceForDetail(detail, scale),
    minArea: 24 * scale * scale,
  });
  if (!shape.length) return shape;
  const [minX, minY] = shapeBounds(shape);
  return translateShape(shape, -minX, -minY);
}

export function wordToShape(text, detail) {
  const word = text.trim();
  if (!word) return [];
  let size = REFERENCE_SIZE;
  const probe = surface(8, 8).ctx;
  const setup = (ctx, px) => {
    ctx.font = `900 ${px}px ${FONT_STACK}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${px * 0.05}px`;
    ctx.textBaseline = 'alphabetic';
  };
  setup(probe, size);
  const width = probe.measureText(word).width;
  if (width > MAX_WIDTH) {
    size = Math.floor((size * MAX_WIDTH) / width);
    setup(probe, size);
  }
  const m = probe.measureText(word);
  const pad = Math.ceil(size * 0.1);
  const left = m.actualBoundingBoxLeft;
  const ascent = m.actualBoundingBoxAscent;
  const { canvas, ctx } = surface(
    Math.ceil(left + m.actualBoundingBoxRight) + 2 * pad,
    Math.ceil(ascent + m.actualBoundingBoxDescent) + 2 * pad,
  );
  setup(ctx, size);
  ctx.fillStyle = '#000';
  ctx.fillText(word, pad + left, pad + ascent);
  return canvasToShape(canvas, detail, size / REFERENCE_SIZE);
}

export function presetToShape(name, detail) {
  const preset = findPreset(name);
  if (!preset) return [];
  const { canvas, ctx } = surface(PRESET_SIZE, PRESET_SIZE);
  drawPreset(ctx, preset);
  return canvasToShape(canvas, detail);
}

export function paintShape(ctx, shape, width, height, color) {
  if (!shape.length) return;
  const [minX, minY, maxX, maxY] = shapeBounds(shape);
  const margin = 12;
  const s = Math.min((width - 2 * margin) / (maxX - minX || 1), (height - 2 * margin) / (maxY - minY || 1), 1);
  const ox = (width - (maxX - minX) * s) / 2 - minX * s;
  const oy = (height - (maxY - minY) * s) / 2 - minY * s;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const region of shape) {
    for (const ring of [region.outer, ...region.holes]) {
      ring.forEach(([x, y], i) => (i ? ctx.lineTo(x * s + ox, y * s + oy) : ctx.moveTo(x * s + ox, y * s + oy)));
      ctx.closePath();
    }
  }
  ctx.fill('evenodd');
}
