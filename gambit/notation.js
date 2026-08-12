// Square <-> algebraic helpers and SAN (Standard Algebraic Notation) generation.
// Squares are 0..63, a1=0, h1=7, a8=56, h8=63 (rank-major, file 0..7 = a..h).

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function fileOf(sq) {
  return sq % 8;
}

export function rankOf(sq) {
  return Math.floor(sq / 8);
}

export function toAlgebraic(sq) {
  return `${FILES[fileOf(sq)]}${rankOf(sq) + 1}`;
}

export function fromAlgebraic(str) {
  const file = FILES.indexOf(str[0]);
  const rank = parseInt(str[1], 10) - 1;
  return rank * 8 + file;
}

const PIECE_LETTER = { P: '', N: 'N', B: 'B', R: 'R', Q: 'Q', K: 'K' };

// Build the SAN string for a move. Requires the full legal move list in the
// position *before* the move, to disambiguate and to detect +/# suffixes.
export function moveToSAN(state, move, legalMoves, givesCheck, isCheckmate) {
  if (move.flags.castle === 'K') return suffix('O-O', givesCheck, isCheckmate);
  if (move.flags.castle === 'Q') return suffix('O-O-O', givesCheck, isCheckmate);

  const type = move.piece[1];
  const isCapture = !!move.captured || move.flags.enPassant;
  const dest = toAlgebraic(move.to);

  if (type === 'P') {
    let san = '';
    if (isCapture) san += `${FILES[fileOf(move.from)]}x`;
    san += dest;
    if (move.promotion) san += `=${move.promotion}`;
    return suffix(san, givesCheck, isCheckmate);
  }

  let san = PIECE_LETTER[type];
  const ambiguous = legalMoves.filter(
    (m) => m !== move && m.piece === move.piece && m.to === move.to && m.from !== move.from
  );
  if (ambiguous.length) {
    const sameFile = ambiguous.some((m) => fileOf(m.from) === fileOf(move.from));
    const sameRank = ambiguous.some((m) => rankOf(m.from) === rankOf(move.from));
    if (!sameFile) san += FILES[fileOf(move.from)];
    else if (!sameRank) san += String(rankOf(move.from) + 1);
    else san += toAlgebraic(move.from);
  }
  if (isCapture) san += 'x';
  san += dest;
  return suffix(san, givesCheck, isCheckmate);
}

function suffix(san, givesCheck, isCheckmate) {
  if (isCheckmate) return `${san}#`;
  if (givesCheck) return `${san}+`;
  return san;
}
