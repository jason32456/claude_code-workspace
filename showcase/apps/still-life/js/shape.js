// Masks are the only geometry in Still Life: { w, h, data: Uint8Array(w*h) },
// row-major, 1 = solid. They are immutable once handed to the Eye, which caches
// on object identity — build a new mask rather than editing one in place.

export function makeMask(w, h, fill = 0) {
  return { w, h, data: new Uint8Array(w * h).fill(fill ? 1 : 0) };
}

export function maskFromFn(w, h, fn) {
  const mask = makeMask(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (fn(x, y)) mask.data[y * w + x] = 1;
    }
  }
  return mask;
}

export function rectMask(w, h) {
  return makeMask(w, h, 1);
}

export function diskMask(r) {
  const size = 2 * r + 1;
  const limit = (r + 0.5) * (r + 0.5);
  return maskFromFn(size, size, (x, y) => (x - r) * (x - r) + (y - r) * (y - r) <= limit);
}

export function ringMask(rOuter, rInner) {
  const size = 2 * rOuter + 1;
  const outer = (rOuter + 0.5) * (rOuter + 0.5);
  const inner = (rInner + 0.5) * (rInner + 0.5);
  return maskFromFn(size, size, (x, y) => {
    const d = (x - rOuter) * (x - rOuter) + (y - rOuter) * (y - rOuter);
    return d <= outer && d > inner;
  });
}

export function maskFromRows(rows, solid = '#') {
  const h = rows.length;
  const w = Math.max(1, ...rows.map((row) => row.length));
  return maskFromFn(w, h, (x, y) => rows[y][x] === solid);
}

function scratchCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  return null;
}

const TEXT_FAMILY = '"Arial Black", "Helvetica Neue", "Segoe UI", "DejaVu Sans", system-ui, sans-serif';
const textCache = new Map();

// Rasterises a line of text into a tightly cropped mask whose capital letters
// are about `height` cells tall. Thin strokes do not survive as motion, so the
// weight is heavy by default. Without a canvas (Node) it degrades to a solid
// block of roughly the right size, which keeps headless simulations running.
export function textMask(str, { height = 28, weight = 900, family = TEXT_FAMILY, spacing = 0 } = {}) {
  const key = `${str}|${height}|${weight}|${family}|${spacing}`;
  const cached = textCache.get(key);
  if (cached) return cached;

  const fontSize = Math.max(6, Math.round(height / 0.72));
  const canvasH = Math.ceil(fontSize * 1.6);
  const probe = scratchCanvas(8, 8);
  let mask;

  if (!probe || !str.trim()) {
    mask = str.trim() ? rectMask(Math.max(1, Math.round(str.length * height * 0.7)), height) : makeMask(1, 1);
  } else {
    const font = `${weight} ${fontSize}px ${family}`;
    const probeCtx = probe.getContext('2d');
    probeCtx.font = font;
    if (spacing && 'letterSpacing' in probeCtx) probeCtx.letterSpacing = `${spacing}px`;
    const canvasW = Math.ceil(probeCtx.measureText(str).width + fontSize);

    const canvas = scratchCanvas(canvasW, canvasH);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = font;
    if (spacing && 'letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000';
    ctx.fillText(str, Math.round(fontSize / 2), Math.round(fontSize * 1.15));

    const pixels = ctx.getImageData(0, 0, canvasW, canvasH).data;
    let x0 = canvasW, y0 = canvasH, x1 = -1, y1 = -1;
    for (let y = 0; y < canvasH; y++) {
      for (let x = 0; x < canvasW; x++) {
        if (pixels[(y * canvasW + x) * 4 + 3] > 127) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    mask = x1 < 0
      ? makeMask(1, 1)
      : maskFromFn(x1 - x0 + 1, y1 - y0 + 1, (x, y) => pixels[((y + y0) * canvasW + x + x0) * 4 + 3] > 127);
  }

  textCache.set(key, mask);
  return mask;
}
