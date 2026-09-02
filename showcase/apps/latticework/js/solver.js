// Human-technique Sudoku solver. Instead of brute force, this applies the
// same logical deductions a person would, in increasing order of difficulty.
// It's used both to *grade* a puzzle (the hardest technique it needs is its
// difficulty) and to power the in-game hint button (find the next legal
// deduction and explain it in plain language).

import { UNITS, ROWS, COLS, BOXES, boxOf, computeCandidates, digitToBit, bitToDigit, popcount, bitsOf, isComplete } from './units.js';

export const TIERS = {
  SINGLE: 1, // naked / hidden single
  INTERSECTION_PAIR: 2, // pointing pair/triple, box-line reduction, naked pair
  SUBSET: 3, // naked triple, hidden pair, hidden triple
  FISH: 4, // X-Wing
};

export const TIER_NAMES = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Expert' };

function unitLabel(cells) {
  const rows = new Set(cells.map((i) => Math.floor(i / 9)));
  const cols = new Set(cells.map((i) => i % 9));
  if (rows.size === 1) return `row ${[...rows][0] + 1}`;
  if (cols.size === 1) return `column ${[...cols][0] + 1}`;
  return 'box';
}

function cellName(i) {
  return `R${Math.floor(i / 9) + 1}C${(i % 9) + 1}`;
}

// --- Tier 1: singles -------------------------------------------------

function findNakedSingle(board, cands) {
  for (let i = 0; i < 81; i++) {
    if (board[i] !== 0) continue;
    if (popcount(cands[i]) === 1) {
      return {
        technique: 'Naked single',
        tier: TIERS.SINGLE,
        type: 'place',
        cell: i,
        digit: bitToDigit(cands[i]),
        reason: `${cellName(i)} has only one candidate left: ${bitToDigit(cands[i])}.`,
      };
    }
  }
  return null;
}

function findHiddenSingle(board, cands) {
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const bit = digitToBit(d);
      const spots = unit.filter((i) => board[i] === 0 && cands[i] & bit);
      if (spots.length === 1) {
        const i = spots[0];
        if (popcount(cands[i]) === 1) continue; // already a naked single
        return {
          technique: 'Hidden single',
          tier: TIERS.SINGLE,
          type: 'place',
          cell: i,
          digit: d,
          reason: `In ${unitLabel(unit)}, ${d} can only go in ${cellName(i)}.`,
        };
      }
    }
  }
  return null;
}

// --- Tier 2: intersections --------------------------------------------

function findPointingOrBoxLine(board, cands) {
  // Pointing pair/triple: a digit confined to one row/col within a box ->
  // eliminate it from the rest of that row/col outside the box.
  for (let b = 0; b < 9; b++) {
    const box = BOXES[b];
    for (let d = 1; d <= 9; d++) {
      const bit = digitToBit(d);
      const spots = box.filter((i) => board[i] === 0 && cands[i] & bit);
      if (spots.length < 2) continue;
      const rows = new Set(spots.map((i) => Math.floor(i / 9)));
      const cols = new Set(spots.map((i) => i % 9));
      let line = null;
      if (rows.size === 1) line = ROWS[[...rows][0]];
      else if (cols.size === 1) line = COLS[[...cols][0]];
      if (!line) continue;
      const elims = line.filter((i) => !box.includes(i) && board[i] === 0 && cands[i] & bit);
      if (elims.length) {
        return {
          technique: 'Pointing ' + (spots.length === 2 ? 'pair' : 'triple'),
          tier: TIERS.INTERSECTION_PAIR,
          type: 'eliminate',
          eliminations: elims.map((i) => ({ cell: i, digit: d })),
          reason: `In box ${b + 1}, ${d} only fits in ${unitLabel(spots)}, so it can be removed elsewhere in that line.`,
        };
      }
    }
  }
  // Box-line reduction: a digit confined to one box within a row/col ->
  // eliminate it from the rest of that box.
  for (const unit of [...ROWS, ...COLS]) {
    for (let d = 1; d <= 9; d++) {
      const bit = digitToBit(d);
      const spots = unit.filter((i) => board[i] === 0 && cands[i] & bit);
      if (spots.length < 2) continue;
      const boxes = new Set(spots.map((i) => boxOf(i)));
      if (boxes.size !== 1) continue;
      const boxCells = BOXES[[...boxes][0]];
      const elims = boxCells.filter((i) => !unit.includes(i) && board[i] === 0 && cands[i] & bit);
      if (elims.length) {
        return {
          technique: 'Box-line reduction',
          tier: TIERS.INTERSECTION_PAIR,
          type: 'eliminate',
          eliminations: elims.map((i) => ({ cell: i, digit: d })),
          reason: `In ${unitLabel(unit)}, ${d} only fits within one box, so it can be removed elsewhere in that box.`,
        };
      }
    }
  }
  return null;
}

// --- Naked / hidden subsets (pairs handled at tier 2, triples at tier 3) --

function combinations(arr, k) {
  const out = [];
  const rec = (start, chosen) => {
    if (chosen.length === k) {
      out.push(chosen.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      chosen.push(arr[i]);
      rec(i + 1, chosen);
      chosen.pop();
    }
  };
  rec(0, []);
  return out;
}

function findNakedSubset(board, cands, size, tier) {
  for (const unit of UNITS) {
    const empties = unit.filter((i) => board[i] === 0 && popcount(cands[i]) >= 2 && popcount(cands[i]) <= size);
    for (const combo of combinations(empties, size)) {
      const union = combo.reduce((m, i) => m | cands[i], 0);
      if (popcount(union) !== size) continue;
      const elims = unit.filter((i) => !combo.includes(i) && board[i] === 0 && cands[i] & union);
      if (elims.length) {
        const kind = size === 2 ? 'pair' : size === 3 ? 'triple' : 'quad';
        return {
          technique: `Naked ${kind}`,
          tier,
          type: 'eliminate',
          eliminations: elims.flatMap((i) => bitsOf(cands[i] & union).map((d) => ({ cell: i, digit: d }))),
          reason: `${combo.map(cellName).join(', ')} in ${unitLabel(unit)} can only hold {${bitsOf(union).join(',')}}, so those digits are removed from the rest of the unit.`,
        };
      }
    }
  }
  return null;
}

function findHiddenSubset(board, cands, size, tier) {
  for (const unit of UNITS) {
    const digits = [];
    for (let d = 1; d <= 9; d++) {
      const bit = digitToBit(d);
      const spots = unit.filter((i) => board[i] === 0 && cands[i] & bit);
      if (spots.length >= 1 && spots.length <= size) digits.push(d);
    }
    for (const combo of combinations(digits, size)) {
      const comboMask = combo.reduce((m, d) => m | digitToBit(d), 0);
      const cells = unit.filter((i) => board[i] === 0 && cands[i] & comboMask);
      if (cells.length !== size) continue;
      // Do these cells carry any candidates outside the combo? If so, strip them.
      const elims = [];
      for (const i of cells) {
        const extra = cands[i] & ~comboMask;
        if (extra) elims.push(...bitsOf(extra).map((d) => ({ cell: i, digit: d })));
      }
      if (elims.length) {
        const kind = size === 2 ? 'pair' : size === 3 ? 'triple' : 'quad';
        return {
          technique: `Hidden ${kind}`,
          tier,
          type: 'eliminate',
          eliminations: elims,
          reason: `In ${unitLabel(unit)}, digits {${combo.join(',')}} only fit in ${cells.map(cellName).join(', ')}, so other candidates there are removed.`,
        };
      }
    }
  }
  return null;
}

// --- Tier 4: X-Wing -----------------------------------------------------

function findXWing(board, cands) {
  for (let d = 1; d <= 9; d++) {
    const bit = digitToBit(d);
    for (const [lines, cross] of [
      [ROWS, COLS],
      [COLS, ROWS],
    ]) {
      const lineSpots = lines.map((line) => line.filter((i) => board[i] === 0 && cands[i] & bit));
      for (let a = 0; a < 9; a++) {
        if (lineSpots[a].length !== 2) continue;
        for (let b = a + 1; b < 9; b++) {
          if (lineSpots[b].length !== 2) continue;
          const crossPos = (i) => (lines === ROWS ? i % 9 : Math.floor(i / 9));
          const posA = lineSpots[a].map(crossPos);
          const posB = lineSpots[b].map(crossPos);
          const sameCross = posA.every((p) => posB.includes(p));
          if (!sameCross) continue;
          const crossIdxs = posA;
          const targetCells = crossIdxs.flatMap((ci) => cross[ci]);
          const elims = targetCells.filter(
            (i) => board[i] === 0 && cands[i] & bit && !lineSpots[a].includes(i) && !lineSpots[b].includes(i)
          );
          if (elims.length) {
            return {
              technique: 'X-Wing',
              tier: TIERS.FISH,
              type: 'eliminate',
              eliminations: elims.map((i) => ({ cell: i, digit: d })),
              reason: `${d} forms an X-Wing across two lines, eliminating it from the crossing lines elsewhere.`,
            };
          }
        }
      }
    }
  }
  return null;
}

const TECHNIQUES = [
  findNakedSingle,
  findHiddenSingle,
  (board, cands) => findPointingOrBoxLine(board, cands),
  (board, cands) => findNakedSubset(board, cands, 2, TIERS.INTERSECTION_PAIR),
  (board, cands) => findNakedSubset(board, cands, 3, TIERS.SUBSET),
  (board, cands) => findHiddenSubset(board, cands, 2, TIERS.SUBSET),
  (board, cands) => findHiddenSubset(board, cands, 3, TIERS.SUBSET),
  findXWing,
];

// Find the next cell the player can actually fill in, applying as many
// elimination-only techniques as needed first (an elimination alone doesn't
// change the board, so it can't be "the hint" -- but it can unlock one).
// Returns the placement move plus the chain of eliminations that led to it,
// or null if no placement is currently reachable by logic alone.
export function findNextPlacement(board) {
  const excluded = new Array(81).fill(0);
  const supportingSteps = [];
  let guard = 0;

  while (guard++ < 200) {
    const baseCands = computeCandidates(board);
    const cands = baseCands.map((m, i) => m & ~excluded[i]);
    let found = null;
    for (const tech of TECHNIQUES) {
      found = tech(board, cands);
      if (found) break;
    }
    if (!found) return null;
    if (found.type === 'place') return { ...found, supportingSteps };
    for (const { cell, digit } of found.eliminations) excluded[cell] |= digitToBit(digit);
    supportingSteps.push(found);
  }
  return null;
}

// Fully solve (or get as far as possible) using only logical techniques,
// tracking the hardest tier required. Eliminations are respected by keeping
// a running exclusion mask per cell rather than by mutating `board`.
export function logicalSolve(board) {
  const work = board.slice();
  const excluded = new Array(81).fill(0);
  let maxTier = 0;
  let guard = 0;

  while (!isComplete(work) && guard++ < 500) {
    const baseCands = computeCandidates(work);
    const cands = baseCands.map((m, i) => m & ~excluded[i]);
    let progressed = false;

    for (const tech of TECHNIQUES) {
      const move = tech(work, cands);
      if (!move) continue;
      maxTier = Math.max(maxTier, move.tier);
      if (move.type === 'place') {
        work[move.cell] = move.digit;
        excluded[move.cell] = 0;
      } else {
        for (const { cell, digit } of move.eliminations) {
          excluded[cell] |= digitToBit(digit);
        }
      }
      progressed = true;
      break;
    }
    if (!progressed) break;
  }

  return { solved: isComplete(work), board: work, tier: maxTier };
}

export function gradePuzzle(board) {
  const result = logicalSolve(board);
  return { solved: result.solved, tier: result.tier };
}
