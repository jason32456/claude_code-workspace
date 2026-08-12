// Chess AI: static evaluation + minimax with alpha-beta pruning.
import { generateLegalMoves, applyMove, isInCheck, WHITE, BLACK } from './engine.js';

const PIECE_VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

// Piece-square tables, from White's point of view (index 0 = a1 ... 63 = h8).
// Black's bonus for a square is read from the vertically mirrored index.
/* eslint-disable no-multi-spaces */
const PST = {
  P: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10,-20,-20, 10, 10,  5,
     5, -5,-10,  0,  0,-10, -5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5,  5, 10, 25, 25, 10,  5,  5,
    10, 10, 20, 30, 30, 20, 10, 10,
    50, 50, 50, 50, 50, 50, 50, 50,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  N: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  B: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  R: [
     0,  0,  0,  5,  5,  0,  0,  0,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     5, 10, 10, 10, 10, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  Q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -10,  5,  5,  5,  5,  5,  0,-10,
      0,  0,  5,  5,  5,  5,  0, -5,
     -5,  0,  5,  5,  5,  5,  0, -5,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  K: [
     20, 30, 10,  0,  0, 10, 30, 20,
     20, 20,  0,  0,  0,  0, 20, 20,
    -10,-20,-20,-20,-20,-20,-20,-10,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
  ],
};
/* eslint-enable no-multi-spaces */

function mirror(sq) {
  return sq ^ 56; // flip rank, keep file
}

function evaluate(state) {
  let score = 0;
  const board = state.board;
  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece) continue;
    const [color, type] = piece;
    const value = PIECE_VALUE[type] + PST[type][color === WHITE ? sq : mirror(sq)];
    score += color === WHITE ? value : -value;
  }
  const whiteMoves = state.turn === WHITE ? generateLegalMoves(state).length : 0;
  const blackMoves = state.turn === BLACK ? generateLegalMoves(state).length : 0;
  score += (whiteMoves - blackMoves) * 2;
  return score;
}

function orderMoves(moves) {
  return moves.slice().sort((a, b) => moveScore(b) - moveScore(a));
}

function moveScore(move) {
  if (!move.captured) return 0;
  // MVV-LVA: prioritize capturing the most valuable victim with the least
  // valuable attacker.
  return PIECE_VALUE[move.captured[1]] * 10 - PIECE_VALUE[move.piece[1]];
}

const MATE_SCORE = 1_000_000;

function negamax(state, depth, alpha, beta, deadline) {
  if (deadline && performance.now() > deadline) throw new TimeoutError();

  const legalMoves = generateLegalMoves(state);
  if (legalMoves.length === 0) {
    if (isInCheck(state, state.turn)) return -MATE_SCORE - depth; // prefer faster mates
    return 0; // stalemate
  }
  if (depth === 0) {
    const score = evaluate(state);
    return state.turn === WHITE ? score : -score;
  }

  let best = -Infinity;
  for (const move of orderMoves(legalMoves)) {
    const next = applyMove(state, move);
    const score = -negamax(next, depth - 1, -beta, -alpha, deadline);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

class TimeoutError extends Error {}

function searchBestMove(state, depth, deadline) {
  const legalMoves = orderMoves(generateLegalMoves(state));
  let bestMove = legalMoves[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of legalMoves) {
    const next = applyMove(state, move);
    const score = -negamax(next, depth - 1, -beta, -alpha, deadline);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (bestScore > alpha) alpha = bestScore;
  }
  return { move: bestMove, score: bestScore };
}

const DIFFICULTY = {
  casual: { depth: 1, randomize: true },
  club: { depth: 2, randomize: false },
  strong: { depth: 3, randomize: false },
  hard: { iterative: true, timeBudgetMs: 1500, maxDepth: 6 },
};

export function pickAIMove(state, difficulty) {
  const config = DIFFICULTY[difficulty] || DIFFICULTY.club;
  const legalMoves = generateLegalMoves(state);
  if (legalMoves.length === 0) return null;
  if (legalMoves.length === 1) return legalMoves[0];

  if (config.iterative) {
    const deadline = performance.now() + config.timeBudgetMs;
    let result = { move: legalMoves[0], score: 0 };
    for (let depth = 1; depth <= config.maxDepth; depth++) {
      try {
        result = searchBestMove(state, depth, deadline);
      } catch (e) {
        if (e instanceof TimeoutError) break;
        throw e;
      }
      if (performance.now() > deadline) break;
    }
    return result.move;
  }

  const { move: best, score: bestScore } = searchBestMove(state, config.depth, null);

  if (config.randomize) {
    // Casual: pick uniformly among moves within a small margin of the best,
    // so the bot still blunders occasionally instead of always finding the
    // engine-optimal reply.
    const margin = 60;
    const candidates = [];
    let alpha = -Infinity;
    for (const move of orderMoves(legalMoves)) {
      const next = applyMove(state, move);
      const score = -negamax(next, config.depth - 1, -Infinity, Infinity, null);
      if (score >= bestScore - margin) candidates.push(move);
    }
    if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
  }

  return best;
}
