// Chess rules engine: board representation, legal move generation, and game
// state transitions. No AI or UI code lives here.
//
// Squares are 0..63 (a1=0 ... h8=63, rank-major, file 0..7 = a..h).
// Pieces are 2-char strings: color 'w'|'b' + type 'P'|'N'|'B'|'R'|'Q'|'K'.

export const WHITE = 'w';
export const BLACK = 'b';

const KNIGHT_OFFSETS = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_OFFSETS = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function file(sq) { return sq % 8; }
function rank(sq) { return Math.floor(sq / 8); }
function sqOf(f, r) { return r * 8 + f; }
function inBounds(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }
function opponent(color) { return color === WHITE ? BLACK : WHITE; }

export function createInitialState() {
  const board = new Array(64).fill(null);
  const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let f = 0; f < 8; f++) {
    board[sqOf(f, 0)] = `W${backRank[f]}`.replace('W', 'w');
    board[sqOf(f, 1)] = 'wP';
    board[sqOf(f, 6)] = 'bP';
    board[sqOf(f, 7)] = `B${backRank[f]}`.replace('B', 'b');
  }
  return {
    board,
    turn: WHITE,
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    epSquare: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    positionCounts: {},
  };
}

export function cloneState(state) {
  return {
    board: state.board.slice(),
    turn: state.turn,
    castling: { ...state.castling },
    epSquare: state.epSquare,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    positionCounts: { ...state.positionCounts },
  };
}

export function positionKey(state) {
  return `${state.board.map((p) => p || '-').join('')}|${state.turn}|${
    state.castling.wK ? 1 : 0
  }${state.castling.wQ ? 1 : 0}${state.castling.bK ? 1 : 0}${state.castling.bQ ? 1 : 0}|${
    state.epSquare ?? '-'
  }`;
}

function isSquareAttacked(board, sq, byColor) {
  const f = file(sq), r = rank(sq);

  const pawnDir = byColor === WHITE ? -1 : 1; // attacker's pawns sit one rank "behind" from sq's perspective
  for (const df of [-1, 1]) {
    const pf = f + df, pr = r + pawnDir;
    if (inBounds(pf, pr) && board[sqOf(pf, pr)] === `${byColor}P`) return true;
  }

  for (const [df, dr] of KNIGHT_OFFSETS) {
    const nf = f + df, nr = r + dr;
    if (inBounds(nf, nr) && board[sqOf(nf, nr)] === `${byColor}N`) return true;
  }

  for (const [df, dr] of KING_OFFSETS) {
    const nf = f + df, nr = r + dr;
    if (inBounds(nf, nr) && board[sqOf(nf, nr)] === `${byColor}K`) return true;
  }

  for (const [df, dr] of ROOK_DIRS) {
    let nf = f + df, nr = r + dr;
    while (inBounds(nf, nr)) {
      const piece = board[sqOf(nf, nr)];
      if (piece) {
        if (piece[0] === byColor && (piece[1] === 'R' || piece[1] === 'Q')) return true;
        break;
      }
      nf += df; nr += dr;
    }
  }

  for (const [df, dr] of BISHOP_DIRS) {
    let nf = f + df, nr = r + dr;
    while (inBounds(nf, nr)) {
      const piece = board[sqOf(nf, nr)];
      if (piece) {
        if (piece[0] === byColor && (piece[1] === 'B' || piece[1] === 'Q')) return true;
        break;
      }
      nf += df; nr += dr;
    }
  }

  return false;
}

function findKing(board, color) {
  return board.indexOf(`${color}K`);
}

export function isInCheck(state, color) {
  const kingSq = findKing(state.board, color);
  if (kingSq === -1) return false;
  return isSquareAttacked(state.board, kingSq, opponent(color));
}

function pushPromotionOrNormal(moves, color, from, to, captured, isPromotion) {
  if (isPromotion) {
    for (const promo of ['Q', 'R', 'B', 'N']) {
      moves.push({
        from, to, piece: `${color}P`, captured, promotion: promo,
        flags: { castle: null, enPassant: false, doublePawn: false },
      });
    }
  } else {
    moves.push({
      from, to, piece: `${color}P`, captured, promotion: null,
      flags: { castle: null, enPassant: false, doublePawn: false },
    });
  }
}

function pushSliding(state, from, dirs, type, moves) {
  const color = state.turn;
  const board = state.board;
  const f = file(from), r = rank(from);
  for (const [df, dr] of dirs) {
    let nf = f + df, nr = r + dr;
    while (inBounds(nf, nr)) {
      const to = sqOf(nf, nr);
      const target = board[to];
      if (!target) {
        moves.push({ from, to, piece: `${color}${type}`, captured: null, promotion: null, flags: { castle: null, enPassant: false, doublePawn: false } });
      } else {
        if (target[0] !== color) {
          moves.push({ from, to, piece: `${color}${type}`, captured: target, promotion: null, flags: { castle: null, enPassant: false, doublePawn: false } });
        }
        break;
      }
      nf += df; nr += dr;
    }
  }
}

function pushStepping(state, from, offsets, type, moves) {
  const color = state.turn;
  const board = state.board;
  const f = file(from), r = rank(from);
  for (const [df, dr] of offsets) {
    const nf = f + df, nr = r + dr;
    if (!inBounds(nf, nr)) continue;
    const to = sqOf(nf, nr);
    const target = board[to];
    if (!target || target[0] !== color) {
      moves.push({ from, to, piece: `${color}${type}`, captured: target || null, promotion: null, flags: { castle: null, enPassant: false, doublePawn: false } });
    }
  }
}

function pushCastling(state, moves) {
  const color = state.turn;
  const board = state.board;
  const opp = opponent(color);
  const homeRank = color === WHITE ? 0 : 7;
  const kingSq = sqOf(4, homeRank);
  if (board[kingSq] !== `${color}K`) return;
  if (isSquareAttacked(board, kingSq, opp)) return;

  const kSideRight = color === WHITE ? state.castling.wK : state.castling.bK;
  if (kSideRight) {
    const f1 = sqOf(5, homeRank), g1 = sqOf(6, homeRank);
    if (!board[f1] && !board[g1] && board[sqOf(7, homeRank)] === `${color}R`) {
      if (!isSquareAttacked(board, f1, opp) && !isSquareAttacked(board, g1, opp)) {
        moves.push({ from: kingSq, to: g1, piece: `${color}K`, captured: null, promotion: null, flags: { castle: 'K', enPassant: false, doublePawn: false } });
      }
    }
  }

  const qSideRight = color === WHITE ? state.castling.wQ : state.castling.bQ;
  if (qSideRight) {
    const d1 = sqOf(3, homeRank), c1 = sqOf(2, homeRank), b1 = sqOf(1, homeRank);
    if (!board[d1] && !board[c1] && !board[b1] && board[sqOf(0, homeRank)] === `${color}R`) {
      if (!isSquareAttacked(board, d1, opp) && !isSquareAttacked(board, c1, opp)) {
        moves.push({ from: kingSq, to: c1, piece: `${color}K`, captured: null, promotion: null, flags: { castle: 'Q', enPassant: false, doublePawn: false } });
      }
    }
  }
}

function generatePseudoLegalMoves(state) {
  const moves = [];
  const color = state.turn;
  const board = state.board;

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece[0] !== color) continue;
    switch (piece[1]) {
      case 'P': {
        const dir = color === WHITE ? 1 : -1;
        const startRank = color === WHITE ? 1 : 6;
        const lastRank = color === WHITE ? 7 : 0;
        const f = file(sq), r = rank(sq);
        const oneR = r + dir;
        if (inBounds(f, oneR) && !board[sqOf(f, oneR)]) {
          const to = sqOf(f, oneR);
          pushPromotionOrNormal(moves, color, sq, to, null, rank(to) === lastRank);
          const twoR = r + 2 * dir;
          if (r === startRank && !board[sqOf(f, twoR)]) {
            moves.push({ from: sq, to: sqOf(f, twoR), piece: `${color}P`, captured: null, promotion: null, flags: { castle: null, enPassant: false, doublePawn: true } });
          }
        }
        for (const df of [-1, 1]) {
          const cf = f + df, cr = r + dir;
          if (!inBounds(cf, cr)) continue;
          const to = sqOf(cf, cr);
          const target = board[to];
          if (target && target[0] !== color) {
            pushPromotionOrNormal(moves, color, sq, to, target, rank(to) === lastRank);
          } else if (to === state.epSquare) {
            const capturedSq = sqOf(cf, r);
            moves.push({ from: sq, to, piece: `${color}P`, captured: board[capturedSq], promotion: null, flags: { castle: null, enPassant: true, doublePawn: false } });
          }
        }
        break;
      }
      case 'N': pushStepping(state, sq, KNIGHT_OFFSETS, 'N', moves); break;
      case 'B': pushSliding(state, sq, BISHOP_DIRS, 'B', moves); break;
      case 'R': pushSliding(state, sq, ROOK_DIRS, 'R', moves); break;
      case 'Q': pushSliding(state, sq, [...ROOK_DIRS, ...BISHOP_DIRS], 'Q', moves); break;
      case 'K': pushStepping(state, sq, KING_OFFSETS, 'K', moves); break;
      default: break;
    }
  }

  pushCastling(state, moves);
  return moves;
}

// Applies a move immutably, returning a brand-new state. Handles capture,
// en passant, castling rook hop, promotion, castling-rights bookkeeping,
// en-passant target refresh, and the fifty-move / move-number counters.
export function applyMove(state, move) {
  const next = cloneState(state);
  const color = state.turn;
  const opp = opponent(color);
  const board = next.board;

  board[move.from] = null;
  if (move.flags.enPassant) {
    const capturedSq = sqOf(file(move.to), rank(move.from));
    board[capturedSq] = null;
  }
  board[move.to] = move.promotion ? `${color}${move.promotion}` : move.piece;

  if (move.flags.castle === 'K') {
    const homeRank = color === WHITE ? 0 : 7;
    board[sqOf(7, homeRank)] = null;
    board[sqOf(5, homeRank)] = `${color}R`;
  } else if (move.flags.castle === 'Q') {
    const homeRank = color === WHITE ? 0 : 7;
    board[sqOf(0, homeRank)] = null;
    board[sqOf(3, homeRank)] = `${color}R`;
  }

  if (move.piece === 'wK') { next.castling.wK = false; next.castling.wQ = false; }
  if (move.piece === 'bK') { next.castling.bK = false; next.castling.bQ = false; }
  if (move.from === 0 || move.to === 0) next.castling.wQ = false;
  if (move.from === 7 || move.to === 7) next.castling.wK = false;
  if (move.from === 56 || move.to === 56) next.castling.bQ = false;
  if (move.from === 63 || move.to === 63) next.castling.bK = false;

  next.epSquare = move.flags.doublePawn
    ? sqOf(file(move.to), (rank(move.from) + rank(move.to)) / 2)
    : null;

  next.halfmoveClock = move.piece[1] === 'P' || move.captured ? 0 : state.halfmoveClock + 1;
  next.fullmoveNumber = color === BLACK ? state.fullmoveNumber + 1 : state.fullmoveNumber;
  next.turn = opp;

  const key = positionKey(next);
  next.positionCounts[key] = (state.positionCounts[key] || 0) + 1;

  return next;
}

export function generateLegalMoves(state) {
  const pseudo = generatePseudoLegalMoves(state);
  const color = state.turn;
  const legal = [];
  for (const move of pseudo) {
    const result = applyMove(state, move);
    if (!isInCheck(result, color)) legal.push(move);
  }
  return legal;
}

function hasNonKingNonBishopKnightMaterial(board) {
  for (const piece of board) {
    if (piece && (piece[1] === 'P' || piece[1] === 'R' || piece[1] === 'Q')) return true;
  }
  return false;
}

function isInsufficientMaterial(board) {
  if (hasNonKingNonBishopKnightMaterial(board)) return false;
  const minorPieces = [];
  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (piece && (piece[1] === 'N' || piece[1] === 'B')) minorPieces.push({ piece, sq });
  }
  if (minorPieces.length === 0) return true; // K vs K
  if (minorPieces.length === 1) return true; // K+minor vs K
  if (minorPieces.length === 2 && minorPieces.every((m) => m.piece[1] === 'B')) {
    const colorOf = (sq) => (file(sq) + rank(sq)) % 2;
    if (colorOf(minorPieces[0].sq) === colorOf(minorPieces[1].sq)) return true; // same-color bishops
  }
  return false;
}

// Returns one of: 'playing' | 'checkmate' | 'stalemate' | 'draw-50' |
// 'draw-repetition' | 'draw-material'
export function getGameStatus(state) {
  const legalMoves = generateLegalMoves(state);
  const inCheck = isInCheck(state, state.turn);
  if (legalMoves.length === 0) return inCheck ? 'checkmate' : 'stalemate';
  if (state.halfmoveClock >= 100) return 'draw-50';
  if ((state.positionCounts[positionKey(state)] || 0) >= 3) return 'draw-repetition';
  if (isInsufficientMaterial(state.board)) return 'draw-material';
  return 'playing';
}

export { file, rank, sqOf, opponent, isSquareAttacked };
