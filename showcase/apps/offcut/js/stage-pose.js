export const FRAME_COUNT = 7;
export const FRAME_NAMES = ['From', 'Rects', 'Bars', 'Ribbon', 'Bars', 'Rects', 'To'];
export const STAGGER = 0.38;

export const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function wrapAngle(a) {
  const tau = Math.PI * 2;
  return a - tau * Math.round(a / tau);
}

function centroidOf(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    const k = x0 * y1 - x1 * y0;
    a += k;
    cx += (x0 + x1) * k;
    cy += (y0 + y1) * k;
  }
  if (Math.abs(a) < 1e-12) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n, 0];
  }
  return [cx / (3 * a), cy / (3 * a), a / 2];
}

const IDENTITY = [1, 0, 0, 0];

function framePoses(piece, f) {
  if (f < 3) return piece.a[f];
  if (f === 3) return IDENTITY;
  return piece.b[6 - f];
}

function frameBox(result, f) {
  if (f < 3) return result.a.poses[f].box;
  if (f === 3) return result.ribbon.box;
  return result.b.poses[6 - f].box;
}

/**
 * Turns an engine result into flat arrays: each piece's ring relative to its
 * own centroid, plus its centroid's position and angle in all seven key frames
 * (in each frame's own plane coordinates).
 */
export function buildFilm(result) {
  const n = result.pieces.length;
  const ribbonWidth = result.ribbon.width || 1;
  const vstart = new Uint32Array(n + 1);
  const total = result.pieces.reduce((s, p) => s + p.ring.length, 0);
  const lx = new Float64Array(total);
  const ly = new Float64Array(total);
  const radius = new Float64Array(n);
  const frac = new Float64Array(n);
  const orient = new Int8Array(n);
  const px = new Float64Array(FRAME_COUNT * n);
  const py = new Float64Array(FRAME_COUNT * n);
  const ang = new Float64Array(FRAME_COUNT * n);
  let totalArea = 0;
  let k = 0;
  result.pieces.forEach((piece, i) => {
    const [gx, gy, signed] = centroidOf(piece.ring);
    vstart[i] = k;
    let r = 0;
    for (const [x, y] of piece.ring) {
      lx[k] = x - gx;
      ly[k] = y - gy;
      r = Math.max(r, Math.hypot(lx[k], ly[k]));
      k++;
    }
    radius[i] = r;
    orient[i] = signed < 0 ? -1 : 1;
    frac[i] = clamp01(gx / ribbonWidth);
    totalArea += Math.abs(signed);
    for (let f = 0; f < FRAME_COUNT; f++) {
      const [c, s, tx, ty] = framePoses(piece, f);
      px[f * n + i] = c * gx - s * gy + tx;
      py[f * n + i] = s * gx + c * gy + ty;
      ang[f * n + i] = Math.atan2(s, c);
    }
  });
  vstart[n] = k;
  const boxes = Array.from({ length: FRAME_COUNT }, (_, f) => frameBox(result, f));
  return { n, vstart, lx, ly, radius, frac, orient, px, py, ang, boxes, totalArea };
}

export function fitBox(box, width, height, padding) {
  const bw = Math.max(box[2] - box[0], 1e-9);
  const bh = Math.max(box[3] - box[1], 1e-9);
  const s = Math.min((width - 2 * padding) / bw, (height - 2 * padding) / bh);
  return {
    s,
    ox: (width - bw * s) / 2 - box[0] * s,
    oy: (height - bh * s) / 2 - box[1] * s,
  };
}

/** Screen-space centroid positions of every piece in every key frame. */
export function layoutFilm(film, width, height, padding) {
  const { n } = film;
  const sx = new Float64Array(FRAME_COUNT * n);
  const sy = new Float64Array(FRAME_COUNT * n);
  const scale = new Float64Array(FRAME_COUNT);
  const fits = film.boxes.map((box) => fitBox(box, width, height, padding));
  fits.forEach((fit, f) => {
    scale[f] = fit.s;
    for (let i = 0; i < n; i++) {
      sx[f * n + i] = film.px[f * n + i] * fit.s + fit.ox;
      sy[f * n + i] = film.py[f * n + i] * fit.s + fit.oy;
    }
  });
  return { sx, sy, scale, fits };
}

export function segmentOf(pos) {
  const f = Math.min(FRAME_COUNT - 2, Math.max(0, Math.floor(pos)));
  return { f, t: Math.min(1, Math.max(0, pos - f)) };
}

/** Rigid pose of piece i on screen at timeline position pos (0..6). */
export function samplePiece(film, layout, pos, i, out) {
  const { f, t } = segmentOf(pos);
  const n = film.n;
  const u = clamp01((t - film.frac[i] * STAGGER) / (1 - STAGGER));
  const e = easeInOut(u);
  const a = f * n + i;
  const b = a + n;
  out.x = layout.sx[a] + (layout.sx[b] - layout.sx[a]) * e;
  out.y = layout.sy[a] + (layout.sy[b] - layout.sy[a]) * e;
  const theta = film.ang[a] + wrapAngle(film.ang[b] - film.ang[a]) * e;
  out.c = Math.cos(theta);
  out.s = Math.sin(theta);
  out.scale = layout.scale[f] + (layout.scale[f + 1] - layout.scale[f]) * e;
  out.moving = u > 0 && u < 1;
  return out;
}
