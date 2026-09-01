// A plain depth-limited minimax + alpha-beta search over chess.js legal
// moves. Not competition-strength — no opening book, no quiescence search —
// just enough to be a real, beatable-but-not-trivial opponent without a
// Web Worker or WASM engine.

const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables, White's perspective, row 0 = rank 8 ... row 7 = rank 1.
// eslint-disable-next-line no-multi-spaces
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];
const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];
const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];
const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
];
const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];
const KING_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];

const PST = { p: PAWN_PST, n: KNIGHT_PST, b: BISHOP_PST, r: ROOK_PST, q: QUEEN_PST, k: KING_PST };

const DEPTH_BY_DIFFICULTY = { easy: 1, medium: 2, hard: 3 };

function evaluate(chess) {
  const board = chess.board();
  let score = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = board[row][col];
      if (!cell) continue;
      const value = PIECE_VALUE[cell.type];
      const pstRow = cell.color === 'w' ? row : 7 - row;
      const pst = PST[cell.type][pstRow][col];
      const sign = cell.color === 'w' ? 1 : -1;
      score += sign * (value + pst);
    }
  }
  return score;
}

function orderedMoves(chess) {
  const moves = chess.moves({ verbose: true });
  return moves.sort((a, b) => {
    const aScore = a.captured ? PIECE_VALUE[a.captured] : 0;
    const bScore = b.captured ? PIECE_VALUE[b.captured] : 0;
    return bScore - aScore;
  });
}

function minimax(chess, depth, alpha, beta, maximizing) {
  if (depth === 0 || chess.isGameOver()) {
    return evaluate(chess);
  }
  const moves = orderedMoves(chess);
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.max(best, minimax(chess, depth - 1, alpha, beta, false));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of moves) {
    chess.move(move);
    best = Math.min(best, minimax(chess, depth - 1, alpha, beta, true));
    chess.undo();
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

// Picks a move for whichever side is to move in `chess`. Easy plays the
// shallow search but only among moves within a small margin of the best
// score, so it still occasionally misses the objectively strongest reply.
export function chooseAiMove(chess, difficulty) {
  const depth = DEPTH_BY_DIFFICULTY[difficulty] ?? 2;
  const maximizing = chess.turn() === 'w';
  const moves = orderedMoves(chess);
  if (moves.length === 0) return null;

  const scored = moves.map((move) => {
    chess.move(move);
    const score = minimax(chess, depth - 1, -Infinity, Infinity, !maximizing);
    chess.undo();
    return { move, score };
  });

  scored.sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score));

  if (difficulty === 'easy') {
    const margin = 60;
    const best = scored[0].score;
    const withinMargin = scored.filter((s) => Math.abs(s.score - best) <= margin);
    return withinMargin[Math.floor(Math.random() * withinMargin.length)].move;
  }

  return scored[0].move;
}
