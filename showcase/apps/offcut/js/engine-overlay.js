import { bounds, clipConvex, signedArea, tidyRing } from './engine-geom.js';

// Both partitions are lists of bars ({x0, x1, atoms}) ordered along the ribbon;
// an atom is { ring, bbox, ... }. Returns every non-empty convex overlap.
export function overlay(barsA, barsB, { eps, minArea, width, height }) {
  const out = [];
  let dropped = 0;
  let from = 0;
  for (const barA of barsA) {
    while (from < barsB.length && barsB[from].x1 <= barA.x0 + eps) from++;
    for (let bi = from; bi < barsB.length && barsB[bi].x0 < barA.x1 - eps; bi++) {
      const barB = barsB[bi];
      for (const a of barA.atoms) {
        for (const b of barB.atoms) {
          if (a.bbox[0] >= b.bbox[2] || b.bbox[0] >= a.bbox[2] || a.bbox[1] >= b.bbox[3] || b.bbox[1] >= a.bbox[3]) continue;
          const clipped = clipConvex(a.ring, b.ring, eps);
          if (!clipped) continue;
          const ring = tidyRing(clipped, eps);
          if (!ring) continue;
          const area = signedArea(ring);
          if (area < minArea) {
            dropped += area;
            continue;
          }
          for (const p of ring) {
            p[0] = Math.min(Math.max(p[0], 0), width);
            p[1] = Math.min(Math.max(p[1], 0), height);
          }
          out.push({ ring, a, b, area: signedArea(ring), bbox: bounds(ring) });
        }
      }
    }
  }
  return { pieces: out, dropped };
}
