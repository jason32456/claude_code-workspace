import { RANK_LABELS, isRed } from './deck.js';

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const FACE_DOWN_OFFSET = 9;
export const FACE_UP_OFFSET = 26;
const WASTE_FAN_OFFSET = 20;

export function suitSymbol(suit) {
  return SUIT_SYMBOLS[suit];
}

function cardEl(card, { zone, pile = null, cardIndex = null, top = 0, left = 0 }) {
  const el = document.createElement('div');
  el.className = `card ${card.faceUp ? 'face-up' : 'face-down'} ${isRed(card.suit) ? 'red' : 'black'}`;
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
  el.dataset.id = card.id;
  el.dataset.suit = card.suit;
  el.dataset.rank = String(card.rank);
  el.dataset.zone = zone;
  if (pile !== null) el.dataset.pile = String(pile);
  if (cardIndex !== null) el.dataset.cardIndex = String(cardIndex);

  if (card.faceUp) {
    const rank = RANK_LABELS[card.rank];
    const sym = SUIT_SYMBOLS[card.suit];
    el.innerHTML = `
      <div class="corner top-left"><span class="rank">${rank}</span><span class="suit">${sym}</span></div>
      <div class="pip">${sym}</div>
      <div class="corner bottom-right"><span class="rank">${rank}</span><span class="suit">${sym}</span></div>
    `;
  }
  return el;
}

export function renderBoard(state, els) {
  renderStock(state, els.stockEl);
  renderWaste(state, els.wasteEl);
  renderFoundations(state, els.foundationEls);
  renderTableau(state, els.tableauEls);
}

function renderStock(state, stockEl) {
  stockEl.innerHTML = '';
  stockEl.dataset.zone = 'stock';
  if (state.stock.length > 0) {
    const el = document.createElement('div');
    el.className = 'card face-down';
    el.style.top = '0px';
    el.style.left = '0px';
    stockEl.appendChild(el);
  } else {
    const el = document.createElement('div');
    el.className = 'pile-placeholder recycle';
    el.textContent = '↻';
    stockEl.appendChild(el);
  }
}

function renderWaste(state, wasteEl) {
  wasteEl.innerHTML = '';
  wasteEl.dataset.zone = 'waste';
  const n = state.waste.length;
  if (n === 0) {
    const el = document.createElement('div');
    el.className = 'pile-placeholder';
    wasteEl.appendChild(el);
    return;
  }
  const fanCount = Math.min(3, n);
  for (let i = 0; i < fanCount; i++) {
    const idx = n - fanCount + i;
    const card = state.waste[idx];
    const isTop = idx === n - 1;
    const el = cardEl(card, {
      zone: 'waste',
      cardIndex: idx,
      left: i * WASTE_FAN_OFFSET,
    });
    if (!isTop) el.classList.add('not-draggable');
    wasteEl.appendChild(el);
  }
}

function renderFoundations(state, foundationEls) {
  for (const suit of Object.keys(foundationEls)) {
    const el = foundationEls[suit];
    el.innerHTML = '';
    el.dataset.zone = 'foundation';
    el.dataset.suit = suit;
    const pile = state.foundations[suit];
    if (pile.length === 0) {
      const ph = document.createElement('div');
      ph.className = 'pile-placeholder suit-hint';
      ph.textContent = SUIT_SYMBOLS[suit];
      el.appendChild(ph);
    } else {
      const top = pile[pile.length - 1];
      el.appendChild(cardEl(top, { zone: 'foundation', cardIndex: pile.length - 1 }));
    }
  }
}

function renderTableau(state, tableauEls) {
  state.tableau.forEach((pile, pileIndex) => {
    const el = tableauEls[pileIndex];
    el.innerHTML = '';
    el.dataset.zone = 'tableau';
    el.dataset.pile = String(pileIndex);
    let y = 0;
    pile.forEach((card, cardIndex) => {
      const cEl = cardEl(card, { zone: 'tableau', pile: pileIndex, cardIndex, top: y });
      el.appendChild(cEl);
      y += card.faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET;
    });
    el.style.minHeight = `${Math.max(y + 90, 130)}px`;
  });
}

export function flashInvalid(el) {
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 320);
}

export function pulseHint(elements) {
  elements.forEach((el) => el && el.classList.add('hint-glow'));
  setTimeout(() => elements.forEach((el) => el && el.classList.remove('hint-glow')), 1600);
}
