const PIECE_GLYPH = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export class BoardView {
  constructor(el, { onSquareClick } = {}) {
    this.el = el;
    this.onSquareClick = onSquareClick || (() => {});
    this.flipped = false;
    this.squareEls = new Map();
    this._buildGrid();
  }

  _buildGrid() {
    this.el.innerHTML = '';
    this.squareEls.clear();
    const order = this._squareOrder();
    order.forEach(({ file, rank }, i) => {
      const square = `${FILES[file]}${rank + 1}`;
      const isLight = (file + rank) % 2 === 1;
      const div = document.createElement('div');
      div.className = `square ${isLight ? 'light' : 'dark'}`;
      div.dataset.square = square;
      div.setAttribute('role', 'gridcell');
      div.addEventListener('click', () => this.onSquareClick(square));

      const col = i % 8;
      const row = Math.floor(i / 8);
      if (col === 0) {
        const rl = document.createElement('span');
        rl.className = 'rank-label';
        rl.textContent = rank + 1;
        div.appendChild(rl);
      }
      if (row === 7) {
        const fl = document.createElement('span');
        fl.className = 'file-label';
        fl.textContent = FILES[file];
        div.appendChild(fl);
      }

      this.el.appendChild(div);
      this.squareEls.set(square, div);
    });
  }

  _squareOrder() {
    const order = [];
    for (let rank = 7; rank >= 0; rank--) {
      for (let file = 0; file < 8; file++) {
        order.push(this.flipped ? { file: 7 - file, rank: 7 - rank } : { file, rank });
      }
    }
    return order;
  }

  setFlipped(flipped) {
    this.flipped = flipped;
    this._buildGrid();
  }

  render(chess, { selected = null, legalTargets = [], lastMove = null, checkSquare = null } = {}) {
    const board = chess.board();
    const legalSet = new Set(legalTargets.map((m) => m.to));
    const captureSet = new Set(legalTargets.filter((m) => m.captured || m.flags?.includes('e')).map((m) => m.to));

    for (const [square, div] of this.squareEls) {
      div.classList.remove('selected', 'last-move', 'in-check');
      div.querySelectorAll('.piece, .move-dot, .capture-ring').forEach((n) => n.remove());

      const file = FILES.indexOf(square[0]);
      const rank = parseInt(square[1], 10) - 1;
      const cell = board[7 - rank][file];

      if (cell) {
        const span = document.createElement('span');
        span.className = `piece ${cell.color === 'w' ? 'white' : 'black'}`;
        span.textContent = PIECE_GLYPH[cell.color][cell.type];
        div.appendChild(span);
      }

      if (square === selected) div.classList.add('selected');
      if (lastMove && (square === lastMove.from || square === lastMove.to)) div.classList.add('last-move');
      if (square === checkSquare) div.classList.add('in-check');

      if (legalSet.has(square)) {
        const marker = document.createElement('span');
        marker.className = captureSet.has(square) ? 'capture-ring' : 'move-dot';
        div.appendChild(marker);
      }
    }
  }

  flashResult(kind) {
    const cls = kind === 'correct' ? 'flash-correct' : 'flash-wrong';
    this.el.classList.remove('flash-correct', 'flash-wrong');
    // eslint-disable-next-line no-unused-expressions
    this.el.offsetWidth; // restart animation
    this.el.classList.add(cls);
  }
}

export function kingSquare(chess, color) {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (cell && cell.type === 'k' && cell.color === color) {
        return `${FILES[f]}${8 - r}`;
      }
    }
  }
  return null;
}
