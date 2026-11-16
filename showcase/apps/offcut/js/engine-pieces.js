import { applyPose, bounds, composePoses, splitByLine, translation } from './engine-geom.js';

// A construction piece is { poly, F, ...stage snapshots }. F carries the shape
// frame to wherever the piece currently lies.

function moved(piece, motion, poly) {
  return { ...piece, poly: poly.map((p) => applyPose(motion, p)), F: composePoses(motion, piece.F) };
}

// Cuts every piece along the line through (px,py) with normal (nx,ny); pieces
// on the positive side are carried by `motion`.
export function cutAndMove(pieces, px, py, nx, ny, motion, eps) {
  const out = [];
  for (const piece of pieces) {
    const { pos, neg } = splitByLine(piece.poly, px, py, nx, ny, eps);
    if (neg) out.push(neg === piece.poly ? piece : { ...piece, poly: neg });
    if (pos) out.push(moved(piece, motion, pos));
  }
  return out;
}

export const movePieces = (pieces, motion) => pieces.map((p) => moved(p, motion, p.poly));

export function piecesBounds(pieces) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pieces) bounds(p.poly, box);
  return box;
}

export function moveToOrigin(pieces) {
  const box = piecesBounds(pieces);
  return { pieces: movePieces(pieces, translation(-box[0], -box[1])), w: box[2] - box[0], h: box[3] - box[1] };
}
