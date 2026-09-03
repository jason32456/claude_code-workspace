import { canPlaceOnFoundation, canPlaceOnTableau, isValidRun } from './game.js';
import { RANK_LABELS } from './deck.js';

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };

function label(card) {
  return `${RANK_LABELS[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

// Scans every legal move and returns the single most useful one — biased
// toward moves that reveal a hidden card, then foundation plays, then
// tableau reshuffles, then drawing from stock as a last resort. This is a
// nudge, not a solver: it never looks more than one move ahead.
export function findHint(state) {
  const candidates = [];

  for (let i = 0; i < 7; i++) {
    const pile = state.tableau[i];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    if (top.faceUp && canPlaceOnFoundation(top, state.foundations[top.suit])) {
      const reveals = pile.length > 1 && !pile[pile.length - 2].faceUp;
      candidates.push({
        type: 'tableau-foundation',
        pile: i,
        score: reveals ? 150 : 80,
        text: `${label(top)}: tableau ${i + 1} → foundation`,
      });
    }
  }

  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    if (canPlaceOnFoundation(top, state.foundations[top.suit])) {
      candidates.push({
        type: 'waste-foundation',
        score: 80,
        text: `${label(top)}: waste → foundation`,
      });
    }
  }

  for (let i = 0; i < 7; i++) {
    const pile = state.tableau[i];
    for (let start = 0; start < pile.length; start++) {
      if (!pile[start].faceUp) continue;
      if (!isValidRun(pile, start)) continue;
      const first = pile[start];
      for (let j = 0; j < 7; j++) {
        if (j === i) continue;
        const dest = state.tableau[j];
        if (!canPlaceOnTableau(first, dest)) continue;
        const reveals = start > 0 && !pile[start - 1].faceUp;
        const isPointlessRelocate = start === 0 && dest.length === 0;
        if (isPointlessRelocate) continue;
        candidates.push({
          type: 'tableau-tableau',
          from: i,
          cardIndex: start,
          to: j,
          score: reveals ? 150 : dest.length === 0 ? 25 : 20,
          text: `${label(first)}: tableau ${i + 1} → tableau ${j + 1}`,
        });
      }
    }
  }

  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    for (let j = 0; j < 7; j++) {
      if (canPlaceOnTableau(top, state.tableau[j])) {
        candidates.push({
          type: 'waste-tableau',
          to: j,
          score: 40,
          text: `${label(top)}: waste → tableau ${j + 1}`,
        });
      }
    }
  }

  if (state.stock.length > 0) {
    candidates.push({ type: 'draw', score: 10, text: 'Draw from the stock' });
  } else if (state.waste.length > 0) {
    candidates.push({ type: 'recycle', score: 5, text: 'Recycle the waste back into the stock' });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}
