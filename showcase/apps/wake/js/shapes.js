// Obstacle geometry. Everything ends up as a polygon in lattice coordinates
// that is rasterised into the mask with an even-odd scanline fill, except the
// cylinder, which is exact so the benchmarks see a true circle.

import { OBSTACLE, FLUID } from './lbm.js';

// NACA 4-digit section: camber m (fraction of chord), camber position p,
// thickness t. Returns closed polygon of [x, y] with chord along +x from 0..1,
// y up, ordered around the perimeter.
export function naca4(m, p, t, n = 120) {
  const upper = [], lower = [];
  for (let j = 0; j <= n; j++) {
    // Cosine spacing packs points at the leading edge where curvature is high.
    const x = 0.5 * (1 - Math.cos(Math.PI * j / n));
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    let yc = 0, dyc = 0;
    if (m > 0 && p > 0) {
      if (x < p) { yc = m / (p * p) * (2 * p * x - x * x); dyc = 2 * m / (p * p) * (p - x); }
      else { yc = m / ((1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x); dyc = 2 * m / ((1 - p) ** 2) * (p - x); }
    }
    const th = Math.atan(dyc);
    upper.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]);
    lower.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]);
  }
  return upper.concat(lower.reverse());
}

export function rectPoly(w, h) {
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
}

export function ellipsePoly(a, b, n = 96) {
  const out = [];
  for (let j = 0; j < n; j++) {
    const t = 2 * Math.PI * j / n;
    out.push([a * Math.cos(t), b * Math.sin(t)]);
  }
  return out;
}

// Polygons are authored y-up; the lattice is y-down on screen, so y is
// flipped first. Then a rotation by `angle` (radians) about the pivot: with
// flow along +x and the trailing edge at +x, a positive angle drops the
// trailing edge down the screen, which is nose-up.
export function transform(poly, { scale = 1, angle = 0, cx = 0, cy = 0, ox = 0, oy = 0 }) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return poly.map(([x, y]) => {
    const px = (x - ox) * scale, py = -(y - oy) * scale;
    return [cx + px * c - py * s, cy + px * s + py * c];
  });
}

// Even-odd scanline fill at cell centres (x + 0.5, y + 0.5).
export function fillPolygon(lat, poly, value = OBSTACLE) {
  const { nx, ny, mask } = lat;
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of poly) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(ny - 1, Math.ceil(maxY));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let j = 0; j < poly.length; j++) {
      const [ax, ay] = poly[j], [bx, by] = poly[(j + 1) % poly.length];
      if ((ay <= yc) !== (by <= yc)) xs.push(ax + (yc - ay) * (bx - ax) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let j = 0; j + 1 < xs.length; j += 2) {
      const xa = Math.max(0, Math.ceil(xs[j] - 0.5)), xb = Math.min(nx - 1, Math.floor(xs[j + 1] - 0.5));
      for (let x = xa; x <= xb; x++) mask[y * nx + x] = value;
    }
  }
}

export function fillCircle(lat, cx, cy, r, value = OBSTACLE) {
  const { nx, ny, mask } = lat;
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(ny - 1, Math.ceil(cy + r + 1)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(nx - 1, Math.ceil(cx + r + 1)); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) mask[y * nx + x] = value;
    }
  }
}

export const SHAPES = {
  cylinder: { label: 'Cylinder', ref: 'D', angle: false },
  airfoil: { label: 'NACA 2412 airfoil', ref: 'chord', angle: true },
  symmetric: { label: 'NACA 0012 airfoil', ref: 'chord', angle: true },
  plate: { label: 'Flat plate', ref: 'chord', angle: true },
  square: { label: 'Square', ref: 'side', angle: true },
  ellipse: { label: 'Ellipse 3:1', ref: 'chord', angle: true },
  custom: { label: 'Painted', ref: 'height', angle: false },
};

// Place a named shape in the lattice. `size` is the reference length in cells
// (diameter, chord or side); `angle` is the angle of attack in degrees, nose up.
export function placeShape(lat, name, { cx, cy, size, angle = 0 }) {
  lat.clearObstacle();
  const a = angle * Math.PI / 180;
  switch (name) {
    case 'cylinder':
      fillCircle(lat, cx, cy, size / 2);
      break;
    case 'airfoil':
      fillPolygon(lat, transform(naca4(0.02, 0.4, 0.12), { scale: size, angle: a, cx, cy, ox: 0.4, oy: 0 }));
      break;
    case 'symmetric':
      fillPolygon(lat, transform(naca4(0, 0, 0.12), { scale: size, angle: a, cx, cy, ox: 0.4, oy: 0 }));
      break;
    case 'plate':
      fillPolygon(lat, transform(rectPoly(1, 0.06), { scale: size, angle: a, cx, cy }));
      break;
    case 'square':
      fillPolygon(lat, transform(rectPoly(1, 1), { scale: size, angle: a, cx, cy }));
      break;
    case 'ellipse':
      fillPolygon(lat, transform(ellipsePoly(0.5, 1 / 6), { scale: size, angle: a, cx, cy }));
      break;
    default:
      break;
  }
  lat.finalizeMask();
}

// Reference length actually occupied by the obstacle: its projected height
// across the flow, used for painted shapes where nothing else is defined.
export function obstacleExtent(lat) {
  const { nx, ny, mask } = lat;
  let x0 = nx, x1 = -1, y0 = ny, y1 = -1, count = 0;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (mask[y * nx + x] !== OBSTACLE) continue;
    count++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (!count) return { count: 0, width: 0, height: 0 };
  return { count, width: x1 - x0 + 1, height: y1 - y0 + 1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 };
}

export function paintCircle(lat, cx, cy, r, erase = false) {
  fillCircle(lat, cx, cy, r, erase ? FLUID : OBSTACLE);
}
