import { TILE } from './constants.js';
import { idx, dist2 } from './utils.js';

// Integer Bresenham line, endpoints inclusive. Works in every octant without
// special-casing because the error term swaps which axis steps each time.
export function bresenhamLine(x0, y0, x1, y1) {
  const points = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

// Casts a ray to every tile inside a circle of `radius` and marks it visible
// up to (and including) the first wall along the way. Cheap at dungeon scale
// (radius <= 6 => a few hundred short rays per turn) and avoids the classic
// shadowcasting edge cases.
export function computeFOV(tiles, width, height, px, py, radius) {
  const visible = new Set();
  visible.add(idx(px, py, width));
  const r2 = radius * radius;
  const minY = Math.max(0, py - radius);
  const maxY = Math.min(height - 1, py + radius);
  const minX = Math.max(0, px - radius);
  const maxX = Math.min(width - 1, px + radius);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (dist2(x, y, px, py) > r2) continue;
      const line = bresenhamLine(px, py, x, y);
      for (const p of line) {
        const i = idx(p.x, p.y, width);
        visible.add(i);
        if (tiles[i] === TILE.WALL) break;
      }
    }
  }
  return visible;
}

// Used by monster AI to decide whether it can spot the player: true only if
// no wall sits strictly between the two points and they're within maxDist.
export function hasLineOfSight(tiles, width, x0, y0, x1, y1, maxDist) {
  if (dist2(x0, y0, x1, y1) > maxDist * maxDist) return false;
  const line = bresenhamLine(x0, y0, x1, y1);
  for (const p of line) {
    if (p.x === x1 && p.y === y1) return true;
    if (tiles[idx(p.x, p.y, width)] === TILE.WALL) return false;
  }
  return true;
}
