import { cleanShape, scaleShape, toShape } from './engine-clean.js';
import { decomposeShape } from './engine-cells.js';
import { applyPose, bounds, composePoses, IDENTITY, invertPose, normalizePose, translation } from './engine-geom.js';
import { shelfLayout } from './engine-layout.js';
import { overlay } from './engine-overlay.js';
import { movePieces } from './engine-pieces.js';
import { rectToBar } from './engine-bar.js';
import { cellToRect } from './engine-rect.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());


// Cuts one shape into pieces that tile the ribbon [0,W]x[0,h], remembering
// for each piece how it moved on the way: F1 (shape -> its cell's rectangle),
// F2 (-> bar) and F3 (-> ribbon).
function cutShape(shape, h, eps, gap) {
  const asked = [0, 1].map((q) => ({ q, cells: decomposeShape(shape, q) }));
  const { q, cells } = asked[1].cells.length < asked[0].cells.length ? asked[1] : asked[0];
  const F0 = q ? [0, 1, 0, 0] : IDENTITY;

  const rects = [];
  const bars = [];
  const built = cells.map((cell) => {
    const rect = cellToRect(cell, F0, eps);
    const stage1 = rect.pieces.map((p) => ({ ...p, F1: p.F }));
    const bar = rectToBar(stage1, rect.w, rect.h, h, eps);
    rects.push({ w: rect.w, h: rect.h });
    bars.push({ w: bar.w, h });
    return bar.pieces.map((p) => ({ ...p, F2: p.F }));
  });

  const rectLayout = shelfLayout(rects, gap);
  const barLayout = shelfLayout(bars, gap);
  const ribbonBars = [];
  let x = 0;
  built.forEach((pieces, cell) => {
    const U = translation(x, 0);
    const atoms = movePieces(pieces, U).map((p) => {
      const invF3 = invertPose(p.F);
      return {
        ring: p.poly,
        bbox: bounds(p.poly),
        cell,
        poses: [
          normalizePose(invF3),
          normalizePose(composePoses(translation(...rectLayout.offsets[cell]), composePoses(p.F1, invF3))),
          normalizePose(composePoses(translation(...barLayout.offsets[cell]), composePoses(p.F2, invF3))),
        ],
      };
    });
    ribbonBars.push({ x0: x, x1: x + bars[cell].w, atoms });
    x += bars[cell].w;
  });
  return { cells: cells.length, bars: ribbonBars };
}

function poseBox(pieces, side, index) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pieces) for (const v of p.ring) bounds([applyPose(p[side][index], v)], box);
  return box;
}

export function dissect(shapeA, shapeB, options = {}) {
  const t0 = now();
  const A = cleanShape(shapeA);
  const rawB = cleanShape(shapeB);
  const scaleB = Math.sqrt(A.area / rawB.area);
  const B = scaleShape(rawB, scaleB, rawB.centroid);
  const area = A.area;

  const aspect = Number.isFinite(options.ribbonAspect) && options.ribbonAspect > 0 ? options.ribbonAspect : 12;
  const height = Math.sqrt(area / aspect);
  const width = area / height;
  const scale = Math.sqrt(area);
  const eps = 1e-11 * scale;
  const gap = 0.02 * scale;

  const cutA = cutShape(A, height, eps, gap);
  const cutB = cutShape(B, height, eps, gap);
  const { pieces: overlaps } = overlay(cutA.bars, cutB.bars, { eps, minArea: 1e-13 * area, width, height });

  overlaps.sort((p, q) => p.bbox[0] - q.bbox[0] || p.bbox[1] - q.bbox[1]);
  const pieces = overlaps.map((o, id) => ({
    id,
    ring: o.ring,
    area: o.area,
    cellA: o.a.cell,
    cellB: o.b.cell,
    a: o.a.poses,
    b: o.b.poses,
  }));

  let sum = 0;
  let smallest = Infinity;
  for (const p of pieces) {
    sum += p.area;
    smallest = Math.min(smallest, p.area);
  }
  const keys = ['shape', 'rects', 'bars'];
  const side = (clean, cut, name) => ({
    shape: toShape(clean),
    cells: cut.cells,
    poses: keys.map((key, i) => ({ key, box: poseBox(pieces, name, i) })),
  });
  const ribbonBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pieces) bounds(p.ring, ribbonBox);

  return {
    area,
    scaleB,
    ribbon: { width, height, box: ribbonBox },
    a: side(A, cutA, 'a'),
    b: side(B, cutB, 'b'),
    pieces,
    audit: { pieces: pieces.length, areaError: Math.abs(sum - area) / area, smallestArea: smallest, ms: now() - t0 },
  };
}

