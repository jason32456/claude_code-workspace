// Static grid geometry for a 9x9 Sudoku board, indices 0..80 (row-major).

export const SIZE = 9;
export const FULL_MASK = 0b111111111; // digits 1-9 as bits 0-8

export const rowOf = (i) => Math.floor(i / 9);
export const colOf = (i) => i % 9;
export const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

export const ROWS = Array.from({ length: 9 }, (_, r) =>
  Array.from({ length: 9 }, (_, c) => r * 9 + c)
);
export const COLS = Array.from({ length: 9 }, (_, c) =>
  Array.from({ length: 9 }, (_, r) => r * 9 + c)
);
export const BOXES = Array.from({ length: 9 }, (_, b) => {
  const br = Math.floor(b / 3) * 3;
  const bc = (b % 3) * 3;
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push((br + r) * 9 + (bc + c));
  return cells;
});
export const UNITS = [...ROWS, ...COLS, ...BOXES];

export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const set = new Set([...ROWS[rowOf(i)], ...COLS[colOf(i)], ...BOXES[boxOf(i)]]);
  set.delete(i);
  return [...set];
});

export function digitToBit(d) {
  return 1 << (d - 1);
}
export function bitToDigit(mask) {
  return Math.log2(mask & -mask) + 1;
}
export function popcount(mask) {
  let n = 0;
  while (mask) {
    mask &= mask - 1;
    n++;
  }
  return n;
}
export function bitsOf(mask) {
  const out = [];
  for (let d = 1; d <= 9; d++) if (mask & digitToBit(d)) out.push(d);
  return out;
}

// One bitmask per cell: which digits are NOT ruled out by a filled peer.
export function computeCandidates(board) {
  const cands = new Array(81).fill(0);
  for (let i = 0; i < 81; i++) {
    if (board[i] !== 0) continue;
    let mask = FULL_MASK;
    for (const p of PEERS[i]) {
      if (board[p] !== 0) mask &= ~digitToBit(board[p]);
    }
    cands[i] = mask;
  }
  return cands;
}

export function isComplete(board) {
  return board.every((v) => v !== 0);
}
