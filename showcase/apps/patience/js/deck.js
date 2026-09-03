import { shuffle } from './rng.js';

export const SUITS = ['S', 'H', 'D', 'C'];
export const RED_SUITS = new Set(['H', 'D']);
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function isRed(suit) {
  return RED_SUITS.has(suit);
}

export function buildDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      cards.push({ id: `${suit}${rank}`, suit, rank, faceUp: false });
    }
  }
  return cards;
}

// Standard Klondike deal: 7 tableau columns of 1..7 cards (top card face up),
// remaining 24 go to the stock, face down.
export function deal(rng) {
  const deck = shuffle(buildDeck(), rng);
  const tableau = [[], [], [], [], [], [], []];
  let i = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[i++] };
      card.faceUp = row === col;
      tableau[col].push(card);
    }
  }
  const stock = deck.slice(i).map((c) => ({ ...c, faceUp: false }));
  return {
    tableau,
    stock,
    waste: [],
    foundations: { S: [], H: [], D: [], C: [] },
  };
}
