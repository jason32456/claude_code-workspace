import { translation } from './engine-geom.js';
import { cutAndMove, movePieces, moveToOrigin } from './engine-pieces.js';

const MAX_FOLDS = 12;
const REL = 1e-9;

// A fold halves the longer side and stacks the halves: (X,Y) -> (X/2,2Y) or (2X,Y/2).
const foldKind = (X, Y) => (X >= Y ? 'X' : 'Y');
const foldDims = (kind, X, Y) => (kind === 'X' ? [X / 2, 2 * Y] : [2 * X, Y / 2]);

function foldPieces(pieces, kind, X, Y, eps) {
  return kind === 'X'
    ? cutAndMove(pieces, X / 2, 0, 1, 0, translation(-X / 2, Y), eps)
    : cutAndMove(pieces, 0, Y / 2, 0, 1, translation(X, -Y / 2), eps);
}

function foldChain(X, Y) {
  const dims = [[X, Y]];
  const kinds = [];
  for (let i = 0; i < MAX_FOLDS; i++) {
    const [cx, cy] = dims[i];
    const kind = foldKind(cx, cy);
    kinds.push(kind);
    dims.push(foldDims(kind, cx, cy));
  }
  return { dims, kinds };
}

const near = (a, b) => Math.abs(a - b) <= REL * Math.max(a, b);

// One rectangle -> rectangle step by two shears; null when no variant fits.
function shearOption(S, T) {
  for (const rotate of [false, true]) {
    const w = rotate ? S[1] : S[0];
    const H = rotate ? S[0] : S[1];
    if (near(w, T[0]) && near(H, T[1])) return { rotate, kind: 'none' };
  }
  for (const rotate of [false, true]) {
    const w = rotate ? S[1] : S[0];
    const H = rotate ? S[0] : S[1];
    for (const axis of [0, 1]) {
      const m = T[axis];
      if (m < H * (1 - 1e-12)) continue;
      const s = Math.sqrt(Math.max(0, m * m - H * H));
      if (s > w * (1 + REL)) continue;
      if (w * s > m * m * (1 + REL)) continue;
      return { rotate, kind: 'shear', axis, w, H, m, s: Math.min(s, w) };
    }
  }
  return null;
}

function planBar(w, H, wBar, h) {
  const src = foldChain(w, H);
  const tgt = foldChain(wBar, h);
  let best = null;
  for (let j = 0; j <= MAX_FOLDS; j++) {
    for (let k = 0; k <= MAX_FOLDS; k++) {
      const cost = 2 ** j + 2 ** k + j + k;
      if (best && cost >= best.cost) continue;
      const option = shearOption(src.dims[j], tgt.dims[k]);
      if (option) best = { cost, j, k, option, src, tgt };
    }
  }
  if (!best) {
    const err = new Error(`rectangle too elongated to recut ${w} ${H} ${wBar} ${h}`);
    err.code = 'degenerate';
    throw err;
  }
  return best;
}

function shearPieces(pieces, X, Y, option, eps) {
  let out = pieces;
  let w = X;
  let H = Y;
  if (option.rotate) {
    out = movePieces(out, [0, 1, Y, 0]);
    w = Y;
    H = X;
  }
  if (option.kind === 'none') return moveToOrigin(out);
  const { m, s, axis } = option;
  let d = [0, -1];
  if (s > eps) {
    const len = Math.hypot(H, s);
    out = cutAndMove(out, 0, H, -H / len, -s / len, translation(w, 0), eps);
    d = [s / m, -H / m];
    const p = (w * s) / m;
    if (p > eps) out = cutAndMove(out, p * d[0], H + p * d[1], -d[0], -d[1], translation(m * d[0], m * d[1]), eps);
  }
  out = movePieces(out, axis === 0 ? [d[0], -d[1], 0, 0] : [d[1], d[0], 0, 0]);
  return moveToOrigin(out);
}

// Rectangle pieces filling [0,w]x[0,H] -> bar of height h.
export function rectToBar(pieces, w, H, h, eps) {
  const wBar = (w * H) / h;
  const { j, k, option, src, tgt } = planBar(w, H, wBar, h);
  let out = pieces;
  for (let i = 0; i < j; i++) out = foldPieces(out, src.kinds[i], src.dims[i][0], src.dims[i][1], eps);
  const shaped = shearPieces(out, src.dims[j][0], src.dims[j][1], option, eps);
  out = shaped.pieces;
  for (let i = k - 1; i >= 0; i--) {
    const [X, Y] = tgt.dims[i + 1];
    out = foldPieces(out, tgt.kinds[i] === 'X' ? 'Y' : 'X', X, Y, eps);
  }
  return { pieces: out, w: wBar };
}
