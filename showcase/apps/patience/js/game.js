import { deal } from './deck.js';
import { isRed, SUITS } from './deck.js';
import { mulberry32 } from './rng.js';

export const SCORE_TO_FOUNDATION = 10;
export const SCORE_REVEAL = 5;
export const SCORE_WASTE_TO_TABLEAU = 5;
export const SCORE_FOUNDATION_TO_TABLEAU = -15;
export const SCORE_RECYCLE_PENALTY = 20;

export function canPlaceOnFoundation(card, foundationPile) {
  if (foundationPile.length === 0) return card.rank === 1;
  const top = foundationPile[foundationPile.length - 1];
  return card.rank === top.rank + 1;
}

export function canPlaceOnTableau(card, pile) {
  if (pile.length === 0) return card.rank === 13;
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return isRed(card.suit) !== isRed(top.suit) && card.rank === top.rank - 1;
}

// Every card from startIndex to the end of the pile must be face up and
// form a valid descending, alternating-color run — that's the portion of a
// pile that can be dragged together.
export function isValidRun(pile, startIndex) {
  if (startIndex < 0 || startIndex >= pile.length) return false;
  for (let i = startIndex; i < pile.length; i++) {
    if (!pile[i].faceUp) return false;
    if (i > startIndex) {
      const prev = pile[i - 1];
      const cur = pile[i];
      if (isRed(prev.suit) === isRed(cur.suit)) return false;
      if (cur.rank !== prev.rank - 1) return false;
    }
  }
  return true;
}

export class GameEngine {
  constructor(seed, drawCount = 1) {
    this.seed = seed;
    this.state = {
      ...deal(mulberry32(seed)),
      drawCount,
      score: 0,
      moves: 0,
      redeals: 0,
    };
    this.history = [];
    this.startedAt = Date.now();
    this.wonAt = null;
  }

  clone() {
    return structuredClone(this.state);
  }

  pushHistory() {
    this.history.push(this.clone());
    if (this.history.length > 500) this.history.shift();
  }

  canUndo() {
    return this.history.length > 0;
  }

  undo() {
    if (!this.canUndo()) return false;
    this.state = this.history.pop();
    return true;
  }

  drawFromStock() {
    const { stock, waste, drawCount } = this.state;
    if (stock.length === 0) return false;
    this.pushHistory();
    const n = Math.min(drawCount, stock.length);
    for (let i = 0; i < n; i++) {
      const card = stock.pop();
      card.faceUp = true;
      waste.push(card);
    }
    this.state.moves++;
    return true;
  }

  recycleWaste() {
    const { stock, waste } = this.state;
    if (stock.length !== 0 || waste.length === 0) return false;
    this.pushHistory();
    this.state.stock = waste
      .slice()
      .reverse()
      .map((c) => ({ ...c, faceUp: false }));
    this.state.waste = [];
    this.state.redeals++;
    this.state.score = Math.max(0, this.state.score - SCORE_RECYCLE_PENALTY);
    return true;
  }

  moveWasteToFoundation() {
    const { waste } = this.state;
    if (waste.length === 0) return false;
    const card = waste[waste.length - 1];
    const foundation = this.state.foundations[card.suit];
    if (!canPlaceOnFoundation(card, foundation)) return false;
    this.pushHistory();
    waste.pop();
    foundation.push(card);
    this.state.score += SCORE_TO_FOUNDATION;
    this.state.moves++;
    return true;
  }

  moveWasteToTableau(toPile) {
    const { waste } = this.state;
    if (waste.length === 0) return false;
    const card = waste[waste.length - 1];
    const dest = this.state.tableau[toPile];
    if (!canPlaceOnTableau(card, dest)) return false;
    this.pushHistory();
    waste.pop();
    dest.push(card);
    this.state.score += SCORE_WASTE_TO_TABLEAU;
    this.state.moves++;
    return true;
  }

  moveTableauToFoundation(pileIndex) {
    const src = this.state.tableau[pileIndex];
    if (src.length === 0) return false;
    const card = src[src.length - 1];
    if (!card.faceUp) return false;
    const foundation = this.state.foundations[card.suit];
    if (!canPlaceOnFoundation(card, foundation)) return false;
    this.pushHistory();
    src.pop();
    foundation.push(card);
    this.state.score += SCORE_TO_FOUNDATION;
    if (src.length > 0 && !src[src.length - 1].faceUp) {
      src[src.length - 1].faceUp = true;
      this.state.score += SCORE_REVEAL;
    }
    this.state.moves++;
    return true;
  }

  moveTableauRun(fromPile, cardIndex, toPile) {
    if (fromPile === toPile) return false;
    const src = this.state.tableau[fromPile];
    if (!isValidRun(src, cardIndex)) return false;
    const first = src[cardIndex];
    const dest = this.state.tableau[toPile];
    if (!canPlaceOnTableau(first, dest)) return false;
    this.pushHistory();
    const moved = src.splice(cardIndex);
    dest.push(...moved);
    if (src.length > 0 && !src[src.length - 1].faceUp) {
      src[src.length - 1].faceUp = true;
      this.state.score += SCORE_REVEAL;
    }
    this.state.moves++;
    return true;
  }

  moveFoundationToTableau(suit, toPile) {
    const foundation = this.state.foundations[suit];
    if (foundation.length === 0) return false;
    const card = foundation[foundation.length - 1];
    const dest = this.state.tableau[toPile];
    if (!canPlaceOnTableau(card, dest)) return false;
    this.pushHistory();
    foundation.pop();
    dest.push(card);
    this.state.score = Math.max(0, this.state.score + SCORE_FOUNDATION_TO_TABLEAU);
    this.state.moves++;
    return true;
  }

  autoMoveToFoundation(zone, pileIndex) {
    if (zone === 'waste') return this.moveWasteToFoundation();
    if (zone === 'tableau') return this.moveTableauToFoundation(pileIndex);
    return false;
  }

  isGameWon() {
    return SUITS.every((s) => this.state.foundations[s].length === 13);
  }

  canAutoFinish() {
    return (
      this.state.stock.length === 0 &&
      this.state.tableau.every((pile) => pile.every((c) => c.faceUp))
    );
  }

  // One greedy step toward the win: send any foundation-ready card home.
  // Safe once no hidden cards remain — repeated calls always finish the game.
  autoFinishStep() {
    for (let i = 0; i < 7; i++) {
      if (this.moveTableauToFoundation(i)) return true;
    }
    if (this.moveWasteToFoundation()) return true;
    return false;
  }
}
