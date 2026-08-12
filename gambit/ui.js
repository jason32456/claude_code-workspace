// Rendering + DOM input handling. Talks to the engine only through the
// exported query functions; never mutates game state itself.
import { file, rank, sqOf, WHITE } from './engine.js';

const PIECE_GLYPH = {
  P: '♟', N: '♞', B: '♝', R: '♜', Q: '♛', K: '♚',
};
const VALUES = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const moveListEl = document.getElementById('moveList');
const capturedTopEl = document.getElementById('capturedTop');
const capturedBottomEl = document.getElementById('capturedBottom');
const materialTopEl = document.getElementById('materialTop');
const materialBottomEl = document.getElementById('materialBottom');
const promotionModal = document.getElementById('promotionModal');
const resultBanner = document.getElementById('resultBanner');
const resultText = document.getElementById('resultText');

let squareEls = [];

export function buildBoard(flipped, onSquareClick, onDrop) {
  boardEl.innerHTML = '';
  squareEls = new Array(64);
  const order = squareRenderOrder(flipped);

  for (const sq of order) {
    const f = file(sq), r = rank(sq);
    const div = document.createElement('div');
    div.className = `square ${(f + r) % 2 === 0 ? 'dark' : 'light'}`;
    div.dataset.square = String(sq);

    if (f === (flipped ? 7 : 0)) {
      const label = document.createElement('span');
      label.className = 'coord rank-label';
      label.textContent = String(r + 1);
      div.appendChild(label);
    }
    if (r === (flipped ? 7 : 0)) {
      const label = document.createElement('span');
      label.className = 'coord file-label';
      label.textContent = 'abcdefgh'[f];
      div.appendChild(label);
    }

    div.addEventListener('click', () => onSquareClick(sq));
    div.addEventListener('dragover', (e) => e.preventDefault());
    div.addEventListener('drop', (e) => {
      e.preventDefault();
      onDrop(sq);
    });

    squareEls[sq] = div;
    boardEl.appendChild(div);
  }
}

function squareRenderOrder(flipped) {
  const order = [];
  if (!flipped) {
    for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) order.push(sqOf(f, r));
  } else {
    for (let r = 0; r < 8; r++) for (let f = 7; f >= 0; f--) order.push(sqOf(f, r));
  }
  return order;
}

export function renderPieces(board, interactive, onDragStart) {
  for (let sq = 0; sq < 64; sq++) {
    const el = squareEls[sq];
    const existing = el.querySelector('.piece');
    if (existing) existing.remove();

    const piece = board[sq];
    if (!piece) continue;
    const span = document.createElement('span');
    span.className = `piece ${piece[0] === WHITE ? 'piece-white' : 'piece-black'}`;
    span.textContent = PIECE_GLYPH[piece[1]];
    span.draggable = interactive;
    span.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(sq));
      onDragStart(sq);
    });
    el.appendChild(span);
  }
}

export function clearHighlights() {
  for (const el of squareEls) {
    if (!el) continue;
    el.classList.remove('selected', 'legal-move', 'legal-capture', 'last-move', 'in-check');
  }
}

export function highlightSelection(selectedSq, legalDestinations) {
  if (selectedSq === null) return;
  squareEls[selectedSq].classList.add('selected');
  for (const move of legalDestinations) {
    squareEls[move.to].classList.add(move.captured || move.flags.enPassant ? 'legal-capture' : 'legal-move');
  }
}

export function highlightLastMove(move) {
  if (!move) return;
  squareEls[move.from].classList.add('last-move');
  squareEls[move.to].classList.add('last-move');
}

export function highlightCheck(kingSq) {
  if (kingSq === -1 || kingSq === undefined) return;
  squareEls[kingSq].classList.add('in-check');
}

export function setStatus(text) {
  statusEl.textContent = text;
}

export function renderMoveList(moves) {
  moveListEl.innerHTML = '';
  for (let i = 0; i < moves.length; i += 2) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const num = document.createElement('span');
    num.className = 'move-num';
    num.textContent = `${i / 2 + 1}.`;
    const whiteMove = document.createElement('span');
    whiteMove.className = 'move-san';
    whiteMove.textContent = moves[i]?.san ?? '';
    const blackMove = document.createElement('span');
    blackMove.className = 'move-san';
    blackMove.textContent = moves[i + 1]?.san ?? '';
    row.append(num, whiteMove, blackMove);
    moveListEl.appendChild(row);
  }
  moveListEl.scrollTop = moveListEl.scrollHeight;
}

export function renderCaptured(moves, playerColor) {
  const capturedByWhite = [];
  const capturedByBlack = [];
  for (const { move } of moves) {
    if (!move.captured) continue;
    if (move.captured[0] === WHITE) capturedByBlack.push(move.captured[1]);
    else capturedByWhite.push(move.captured[1]);
  }
  const materialWhite = capturedByWhite.reduce((s, t) => s + VALUES[t], 0);
  const materialBlack = capturedByBlack.reduce((s, t) => s + VALUES[t], 0);
  const diff = materialWhite - materialBlack;

  const bottomIsWhite = playerColor === WHITE;
  const topPieces = bottomIsWhite ? capturedByBlack : capturedByWhite;
  const bottomPieces = bottomIsWhite ? capturedByWhite : capturedByBlack;
  const topDiff = bottomIsWhite ? (diff < 0 ? -diff : 0) : (diff > 0 ? diff : 0);
  const bottomDiff = bottomIsWhite ? (diff > 0 ? diff : 0) : (diff < 0 ? -diff : 0);

  capturedTopEl.textContent = topPieces.map((t) => PIECE_GLYPH[t]).join(' ');
  capturedBottomEl.textContent = bottomPieces.map((t) => PIECE_GLYPH[t]).join(' ');
  materialTopEl.textContent = topDiff > 0 ? `+${topDiff}` : '';
  materialBottomEl.textContent = bottomDiff > 0 ? `+${bottomDiff}` : '';
}

export function showPromotionPicker(color) {
  return new Promise((resolve) => {
    promotionModal.innerHTML = '';
    promotionModal.classList.remove('hidden');
    for (const type of ['Q', 'R', 'B', 'N']) {
      const btn = document.createElement('button');
      btn.className = `promo-btn ${color === WHITE ? 'piece-white' : 'piece-black'}`;
      btn.textContent = PIECE_GLYPH[type];
      btn.addEventListener('click', () => {
        promotionModal.classList.add('hidden');
        resolve(type);
      });
      promotionModal.appendChild(btn);
    }
  });
}

export function showResult(text) {
  resultText.textContent = text;
  resultBanner.classList.remove('hidden');
}

export function hideResult() {
  resultBanner.classList.add('hidden');
}

export function setThinking(isThinking) {
  boardEl.classList.toggle('thinking', isThinking);
}
