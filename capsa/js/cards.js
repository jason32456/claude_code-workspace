// Card rendering. Cards are DOM + CSS rather than images: crisp at any pixel
// density, themeable, and nothing to load over the network.

import { RANKS, SUITS, rankOf, suitOf } from './engine.js';

// ♦ and ♥ render red; ♣ and ♠ near-black. Suit is never the only cue — the
// glyph itself distinguishes all four, which keeps the table readable for
// red/green colour blindness.
const IS_RED = [true, false, true, false];

export function cardElement(card, { button = false } = {}) {
  const el = document.createElement(button ? 'button' : 'div');
  const rank = RANKS[rankOf(card)];
  const suit = SUITS[suitOf(card)];

  el.className = 'card' + (IS_RED[suitOf(card)] ? ' is-red' : '');
  el.dataset.card = String(card);
  if (button) {
    el.type = 'button';
    el.setAttribute('aria-pressed', 'false');
  }
  el.setAttribute('aria-label', `${rank} of ${['diamonds', 'clubs', 'hearts', 'spades'][suitOf(card)]}`);

  const corner = document.createElement('span');
  corner.className = 'card-corner';
  corner.textContent = rank;

  const face = document.createElement('span');
  face.className = 'card-rank';
  face.textContent = rank;

  const pip = document.createElement('span');
  pip.className = 'card-suit';
  pip.textContent = suit;

  const stack = document.createElement('span');
  stack.style.display = 'grid';
  stack.style.placeItems = 'center';
  stack.append(face, pip);

  el.append(corner, stack);
  return el;
}

// Cards may not hide more than this much of the neighbour beneath them, or the
// fan stops being readable as individual cards.
const MAX_OVERLAP = 0.72;

// How far each card should overlap its neighbour so the whole hand fits the
// width available. Returns a negative pixel margin.
export function overlapFor(count, containerWidth, cardWidth) {
  if (count <= 1) return 0;
  const needed = count * cardWidth;
  if (needed <= containerWidth) return 0;
  const excess = needed - containerWidth;
  return -Math.min(cardWidth * MAX_OVERLAP, excess / (count - 1));
}

// The narrowest the fan can ever be, at maximum overlap. Anything a caller
// wants to add — the gaps around a selected card — has to fit in what is left.
export function tightestWidth(count, cardWidth) {
  if (count <= 1) return cardWidth;
  return cardWidth * (count - MAX_OVERLAP * (count - 1));
}
