import { TILE } from './world-config.js';

export const FREE = 0;
export const WALL = 1;
export const GLASS = 2;

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function createNav(rows) {
  const tcols = rows[0].length;
  const trows = rows.length;
  const kinds = new Uint8Array(tcols * trows);
  rows.forEach((row, ty) => {
    for (let tx = 0; tx < tcols; tx++) {
      kinds[ty * tcols + tx] = row[tx] === '#' ? WALL : row[tx] === 'g' ? GLASS : FREE;
    }
  });
  const fields = new Map();

  const kindAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= tcols || ty >= trows ? WALL : kinds[ty * tcols + tx]);
  const nav = { tcols, trows, kindAt, hitTx: -1, hitTy: -1 };

  // Circle against solid tiles. Returns GLASS if it touches any glass tile (and
  // records which), otherwise WALL / FREE.
  nav.hit = (cx, cy, r) => {
    const x0 = Math.floor((cx - r) / TILE);
    const x1 = Math.floor((cx + r) / TILE);
    const y0 = Math.floor((cy - r) / TILE);
    const y1 = Math.floor((cy + r) / TILE);
    let found = FREE;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const kind = kindAt(tx, ty);
        if (kind === FREE) continue;
        const nx = Math.min(Math.max(cx, tx * TILE), tx * TILE + TILE);
        const ny = Math.min(Math.max(cy, ty * TILE), ty * TILE + TILE);
        if ((cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < r * r) {
          if (kind === GLASS) {
            nav.hitTx = tx;
            nav.hitTy = ty;
            return GLASS;
          }
          found = WALL;
        }
      }
    }
    return found;
  };

  nav.los = (x0, y0, x1, y1) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (kindAt(Math.floor((x0 + dx * t) / TILE), Math.floor((y0 + dy * t) / TILE)) !== FREE) return false;
    }
    return true;
  };

  const canStep = (tx, ty, sx, sy) => {
    if (kindAt(tx + sx, ty + sy) !== FREE) return false;
    return sx === 0 || sy === 0 || (kindAt(tx + sx, ty) === FREE && kindAt(tx, ty + sy) === FREE);
  };

  nav.field = (gx, gy) => {
    const key = gy * tcols + gx;
    let dist = fields.get(key);
    if (dist) return dist;
    dist = new Int16Array(tcols * trows).fill(-1);
    if (kindAt(gx, gy) === FREE) {
      const queue = new Int16Array(tcols * trows);
      let head = 0;
      let tail = 0;
      dist[key] = 0;
      queue[tail++] = key;
      while (head < tail) {
        const cur = queue[head++];
        const cx = cur % tcols;
        const cy = (cur - cx) / tcols;
        for (const [sx, sy] of STEPS) {
          if (!canStep(cx, cy, sx, sy)) continue;
          const next = (cy + sy) * tcols + cx + sx;
          if (dist[next] >= 0) continue;
          dist[next] = dist[cur] + 1;
          queue[tail++] = next;
        }
      }
    }
    fields.set(key, dist);
    return dist;
  };

  nav.next = (tx, ty, gx, gy) => {
    const dist = nav.field(gx, gy);
    const here = dist[ty * tcols + tx];
    if (here < 0) return null;
    if (here === 0) return [tx, ty];
    let best = null;
    let bestScore = Infinity;
    for (const [sx, sy] of STEPS) {
      if (!canStep(tx, ty, sx, sy)) continue;
      const nx = tx + sx;
      const ny = ty + sy;
      if (dist[ny * tcols + nx] !== here - 1) continue;
      const score = (gx - nx) * (gx - nx) + (gy - ny) * (gy - ny);
      if (score < bestScore) {
        bestScore = score;
        best = [nx, ny];
      }
    }
    return best;
  };

  return nav;
}
