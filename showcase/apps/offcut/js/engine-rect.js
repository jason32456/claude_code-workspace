import { translation } from './engine-geom.js';
import { cutAndMove, moveToOrigin, movePieces } from './engine-pieces.js';

// Turns the parallelogram {O + a·v + b·u} (v = base, u = the other side, both
// given through the horizontal side length L and the slanted side) into a
// rectangle by sliding one triangle along the base direction.
function parallelogramToRect(pieces, O, L, slant, eps) {
  let d;
  let baseLen;
  let p;
  if (Math.abs(slant[0]) <= L) {
    d = [1, 0];
    baseLen = L;
    p = slant[0];
  } else {
    baseLen = Math.hypot(slant[0], slant[1]);
    d = [slant[0] / baseLen, slant[1] / baseLen];
    p = L * d[0];
  }
  let out = pieces;
  if (Math.abs(p) > eps) {
    if (p > 0) {
      out = cutAndMove(out, O[0] + p * d[0], O[1] + p * d[1], -d[0], -d[1], translation(baseLen * d[0], baseLen * d[1]), eps);
    } else {
      const a = p + baseLen;
      out = cutAndMove(out, O[0] + a * d[0], O[1] + a * d[1], d[0], d[1], translation(-baseLen * d[0], -baseLen * d[1]), eps);
    }
  }
  if (d[0] !== 1) out = movePieces(out, [d[0], -d[1], 0, 0]);
  return moveToOrigin(out);
}

// cell: trapezoid with horizontal parallel sides, in the working frame.
// Half-turns about a leg midpoint and translations only.
export function cellToRect(cell, F0, eps) {
  const { yt, yb, xtl, xtr, xbl, xbr } = cell;
  const T = xtr - xtl;
  const B = xbr - xbl;
  let pieces = [{ poly: [[xtl, yt], [xtr, yt], [xbr, yb], [xbl, yb]], F: F0 }];
  let L;
  let slant;
  if (Math.abs(T - B) > eps) {
    const ym = (yt + yb) / 2;
    const mrx = (xtr + xbr) / 2;
    pieces = cutAndMove(pieces, 0, ym, 0, -1, [-1, 0, 2 * mrx, 2 * ym], eps);
    L = T + B;
    slant = [(xtl + xbl) / 2 - xbl, ym - yb];
  } else {
    L = (T + B) / 2;
    slant = [xtl - xbl, yt - yb];
  }
  return parallelogramToRect(pieces, [xbl, yb], L, slant, eps);
}
