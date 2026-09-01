// Offline check for the Puzzle Rush bank: every FEN parses, every move in
// `solution` is legal in sequence, and the final position matches the
// puzzle's claimed outcome. Run with: node dev/validate-puzzles.mjs
import { Chess } from '../vendor/chess.esm.js';
import { PUZZLES } from '../data/puzzles.js';

let failures = 0;
const seen = new Set();

for (const p of PUZZLES) {
  const errs = [];
  if (seen.has(p.id)) errs.push('duplicate id');
  seen.add(p.id);

  let c;
  try {
    c = new Chess(p.fen);
  } catch (e) {
    errs.push(`bad FEN: ${e.message}`);
    console.log(`[${p.id}] FAIL`, errs);
    failures++;
    continue;
  }

  let lastMove = null;
  for (let i = 0; i < p.solution.length; i++) {
    const mv = p.solution[i];
    const from = mv.slice(0, 2);
    const to = mv.slice(2, 4);
    const promotion = mv.length > 4 ? mv.slice(4) : undefined;
    try {
      lastMove = c.move({ from, to, promotion });
    } catch (e) {
      errs.push(`move ${i} (${mv}) illegal: ${e.message}`);
      break;
    }
  }

  if (errs.length === 0) {
    if (p.outcome === 'checkmate') {
      if (!c.isCheckmate()) errs.push('final position is not checkmate');
    } else if (p.outcome === 'material') {
      if (!lastMove || !lastMove.captured) errs.push('final move is not a capture');
    } else {
      errs.push(`unknown outcome type: ${p.outcome}`);
    }
  }

  if (errs.length) {
    console.log(`[${p.id}] FAIL`, errs, '\n  fen:', p.fen);
    failures++;
  } else {
    console.log(`[${p.id}] ok (${p.tier}, ${p.theme})`);
  }
}

console.log(`\n${PUZZLES.length} puzzles, ${failures} failed`);
process.exit(failures ? 1 : 0);
