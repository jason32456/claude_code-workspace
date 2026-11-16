import { translation } from './engine-geom.js';
import { cutAndMove, movePieces, moveToOrigin } from './engine-pieces.js';

const MAX_FOLDS = 14;
const REL = 1e-9;

// A fold halves one side and stacks the halves: 'X' -> (X/2, 2Y), 'Y' -> (2X, Y/2).
const foldDims = (kind, X, Y) => (kind === 'X' ? [X / 2, 2 * Y] : [2 * X, Y / 2]);
const opposite = (kind) => (kind === 'X' ? 'Y' : 'X');

function foldPieces(pieces, kind, X, Y, eps) {
  return kind === 'X'
    ? cutAndMove(pieces, X / 2, 0, 1, 0, translation(-X / 2, Y), eps)
    : cutAndMove(pieces, 0, Y / 2, 0, 1, translation(X, -Y / 2), eps);
}

function chain(X, Y, kind, n) {
  const dims = [[X, Y]];
  for (let i = 0; i < n; i++) dims.push(foldDims(kind, dims[i][0], dims[i][1]));
  return dims;
}

// Three-piece slide: rectangle [0,a]x[0,b] -> [0,a']x[0,b'] with a < a' <= 2a,
// translations only. `flip` runs the same construction with x and y swapped.
function widen(pieces, a, b, a2, b2, flip, eps) {
  const d = b - b2;
  const e = a2 - a;
  const len = Math.hypot(a2, b);
  const P = (x, y) => (flip ? [y, x] : [x, y]);
  let out = cutAndMove(pieces, 0, 0, ...P(b / len, -a2 / len), translation(...P(e, d)), eps);
  out = cutAndMove(out, ...P(0, d), ...P(0, -1), translation(...P(a, b2)), eps);
  return movePieces(out, translation(...P(0, -d)));
}

// Fold counts and kinds that bring the width ratio of source and target into [1/2, 2].
function plans(w, H, wBar, h) {
  const found = [];
  for (const rotate of [false, true]) {
    const x0 = rotate ? H : w;
    const y0 = rotate ? w : H;
    const r0 = wBar / x0;
    const grow = r0 >= 1;
    const need = Math.max(0, Math.ceil(Math.log2(Math.max(r0, 1 / r0)) - 1 - 1e-9));
    const srcKind = grow ? 'Y' : 'X';
    const tgtKind = grow ? 'X' : 'Y';
    for (let n = need; n <= need + 1 && n <= 2 * MAX_FOLDS; n++) {
      for (let j = 0; j <= Math.min(n, MAX_FOLDS); j++) {
        const k = n - j;
        if (k > MAX_FOLDS) continue;
        const ratio = (grow ? r0 : 1 / r0) / 2 ** n;
        if (ratio > 2 * (1 + REL) || ratio < 0.5 * (1 - REL)) continue;
        found.push({ rotate, srcKind, tgtKind, j, k, cost: 2 ** j + 2 ** k + n + (rotate ? 0.5 : 0) });
      }
    }
  }
  found.sort((p, q) => p.cost - q.cost);
  return found;
}

// Rectangle pieces filling [0,w]x[0,H] -> bar [0,w*H/h]x[0,h].
export function rectToBar(pieces, w, H, h, eps) {
  const wBar = (w * H) / h;
  const plan = plans(w, H, wBar, h)[0];
  if (!plan) {
    const err = new Error(`rectangle too elongated to recut ${w} ${H} ${wBar} ${h}`);
    err.code = 'degenerate';
    throw err;
  }
  let out = pieces;
  let X = w;
  let Y = H;
  if (plan.rotate) {
    out = moveToOrigin(movePieces(out, [0, 1, 0, 0])).pieces;
    [X, Y] = [H, w];
  }
  for (let i = 0; i < plan.j; i++) {
    out = foldPieces(out, plan.srcKind, X, Y, eps);
    [X, Y] = foldDims(plan.srcKind, X, Y);
  }
  const tgt = chain(wBar, h, plan.tgtKind, plan.k);
  const [X2, Y2] = tgt[plan.k];
  const r = X2 / X;
  if (Math.abs(r - 1) > REL) {
    out = r > 1 ? widen(out, X, Y, X2, Y2, false, eps) : widen(out, Y, X, Y2, X2, true, eps);
  }
  for (let i = plan.k - 1; i >= 0; i--) {
    const [cx, cy] = tgt[i + 1];
    out = foldPieces(out, opposite(plan.tgtKind), cx, cy, eps);
  }
  return { pieces: out, w: wBar };
}
