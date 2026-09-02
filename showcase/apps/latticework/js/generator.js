// Puzzle generation: fill a full valid grid, then remove clues one at a
// time, only keeping a removal when the puzzle (a) still has exactly one
// solution and (b) still solves with techniques at or below the requested
// difficulty tier. This is why "Expert" puzzles genuinely need X-Wing, not
// just fewer clues.

import { bitsOf, computeCandidates, isComplete } from './units.js';
import { gradePuzzle, TIERS } from './solver.js';

// Deterministic PRNG (mulberry32) so a given seed always yields the same
// puzzle -- used for the daily challenge.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Randomized backtracking fill of an empty grid into a complete solution.
export function generateFullGrid(rng) {
  const board = new Array(81).fill(0);

  function fill(pos) {
    if (pos === 81) return true;
    if (board[pos] !== 0) return fill(pos + 1);
    const cands = computeCandidates(board)[pos];
    const digits = shuffled(bitsOf(cands), rng);
    for (const d of digits) {
      board[pos] = d;
      if (fill(pos + 1)) return true;
      board[pos] = 0;
    }
    return false;
  }

  fill(0);
  return board;
}

// Counts solutions up to `limit` using backtracking with a most-constrained-
// cell heuristic. Used to verify a candidate puzzle has exactly one solution.
export function countSolutions(board, limit = 2) {
  const work = board.slice();
  let count = 0;

  function pickCell() {
    let best = -1;
    let bestCands = null;
    let bestCount = 10;
    const cands = computeCandidates(work);
    for (let i = 0; i < 81; i++) {
      if (work[i] !== 0) continue;
      const bits = bitsOf(cands[i]);
      if (bits.length === 0) return { i: -1 };
      if (bits.length < bestCount) {
        best = i;
        bestCands = bits;
        bestCount = bits.length;
        if (bestCount === 1) break;
      }
    }
    return { i: best, bits: bestCands };
  }

  function search() {
    if (count >= limit) return;
    if (isComplete(work)) {
      count++;
      return;
    }
    const { i, bits } = pickCell();
    if (i === -1) return; // dead end (a cell with no candidates)
    for (const d of bits) {
      work[i] = d;
      search();
      if (count >= limit) {
        work[i] = 0;
        return;
      }
    }
    work[i] = 0;
  }

  search();
  return count;
}

const FLOOR_CLUES = 20; // never carve below this, regardless of tier

function clueCount(board) {
  return board.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0);
}

// One carving attempt: repeatedly sweep every clue in a fresh random order,
// removing whatever keeps the puzzle uniquely solvable within the target
// tier, until a full sweep makes no further progress. This pushes each
// attempt to a *local optimum* for that removal order -- as few clues as
// that particular sequence allows -- which is what makes harder techniques
// become necessary rather than merely permitted.
function carveOnce(solution, targetTier, rng) {
  const board = solution.slice();
  let improved = true;
  while (improved && clueCount(board) > FLOOR_CLUES) {
    improved = false;
    const order = shuffled(
      Array.from({ length: 81 }, (_, i) => i),
      rng
    );
    for (const idx of order) {
      if (board[idx] === 0 || clueCount(board) <= FLOOR_CLUES) continue;
      const backup = board[idx];
      board[idx] = 0;
      if (countSolutions(board, 2) !== 1) {
        board[idx] = backup;
        continue;
      }
      const grade = gradePuzzle(board);
      if (!grade.solved || grade.tier > targetTier) {
        board[idx] = backup;
        continue;
      }
      improved = true;
    }
  }
  const finalGrade = gradePuzzle(board);
  return { puzzle: board, tier: finalGrade.solved ? finalGrade.tier : 0, clues: clueCount(board) };
}

// Attempt counts are tuned so cheap tiers resolve in one shot while rarer
// tiers (X-Wing genuinely required) get more tries at a shared solved grid.
const ATTEMPTS_FOR_TIER = {
  [TIERS.SINGLE]: 1,
  [TIERS.INTERSECTION_PAIR]: 4,
  [TIERS.SUBSET]: 8,
  [TIERS.FISH]: 14,
};

// Carve a playable puzzle out of a full solved grid, targeting a difficulty
// tier (see solver.js TIERS). Tries several removal orders and keeps the
// hardest result that doesn't exceed the target. Returns { puzzle, solution, tier }.
export function carvePuzzle(solution, targetTier, rng) {
  const attempts = ATTEMPTS_FOR_TIER[targetTier] ?? ATTEMPTS_FOR_TIER[TIERS.FISH];
  let best = null;
  for (let a = 0; a < attempts; a++) {
    const candidate = carveOnce(solution, targetTier, rng);
    if (
      !best ||
      candidate.tier > best.tier ||
      (candidate.tier === best.tier && candidate.clues < best.clues)
    ) {
      best = candidate;
    }
    if (best.tier === targetTier) break;
  }
  return { puzzle: best.puzzle, solution, tier: best.tier };
}

export function generatePuzzle(targetTier, seed) {
  const rng = makeRng(seed ?? Math.floor(Math.random() * 2 ** 32));
  const solution = generateFullGrid(rng);
  return carvePuzzle(solution, targetTier, rng);
}
