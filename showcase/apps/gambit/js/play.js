import { Chess } from '../vendor/chess.esm.js';
import { BoardView, kingSquare } from './boardView.js';
import { sfx } from './sound.js';
import { chooseAiMove } from './ai.js';

const GLYPH = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};
const PROMO_PIECES = ['q', 'r', 'b', 'n'];

export function initPlay() {
  const boardEl = document.getElementById('board');
  const promoPicker = document.getElementById('promoPicker');
  const statusLine = document.getElementById('statusLine');
  const moveListEl = document.getElementById('moveList');
  const capturedByWhite = document.getElementById('capturedByWhite');
  const capturedByBlack = document.getElementById('capturedByBlack');
  const topLabel = document.getElementById('topPlayerLabel');
  const bottomLabel = document.getElementById('bottomPlayerLabel');
  const opponentSelect = document.getElementById('opponentSelect');
  const difficultySelect = document.getElementById('difficultySelect');
  const newGameBtn = document.getElementById('newGameBtn');
  const undoBtn = document.getElementById('undoBtn');
  const flipBtn = document.getElementById('flipBtn');
  const resignBtn = document.getElementById('resignBtn');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalCloseBtn = document.getElementById('modalCloseBtn');

  const chess = new Chess();
  let opponent = 'human';
  let difficulty = 'medium';
  let selected = null;
  let legalTargets = [];
  let manualGameOver = null; // e.g. "White resigned."
  let aiThinking = false;

  const board = new BoardView(boardEl, { onSquareClick: handleSquareClick });

  function isHumanTurnBlocked() {
    return opponent === 'ai' && chess.turn() === 'b';
  }

  function handleSquareClick(square) {
    if (manualGameOver || chess.isGameOver() || aiThinking) return;
    if (!promoPicker.classList.contains('hidden')) return;
    if (isHumanTurnBlocked()) return;

    const piece = chess.get(square);

    if (selected) {
      if (square === selected) {
        selected = null;
        legalTargets = [];
        draw();
        return;
      }
      const target = legalTargets.find((m) => m.to === square);
      if (target) {
        const needsPromotion = target.piece === 'p' && (square[1] === '8' || square[1] === '1');
        if (needsPromotion) {
          showPromotionPicker(square, chess.turn(), (promo) => {
            hidePromotionPicker();
            commitMove(selected, square, promo);
          });
          return;
        }
        commitMove(selected, square);
        return;
      }
      if (piece && piece.color === chess.turn()) {
        selectSquare(square);
        return;
      }
      sfx.illegal();
      selected = null;
      legalTargets = [];
      draw();
      return;
    }

    if (piece && piece.color === chess.turn()) {
      selectSquare(square);
    }
  }

  function selectSquare(square) {
    selected = square;
    legalTargets = chess.moves({ square, verbose: true });
    draw();
  }

  function commitMove(from, to, promotion) {
    const move = chess.move({ from, to, promotion });
    if (!move) return;
    selected = null;
    legalTargets = [];
    playMoveSound(move);
    afterMove();
    if (!manualGameOver && !chess.isGameOver() && opponent === 'ai' && chess.turn() === 'b') {
      aiThinking = true;
      statusLine.textContent = 'Computer is thinking…';
      setTimeout(runAiMove, 260);
    }
  }

  function runAiMove() {
    const move = chooseAiMove(chess, difficulty);
    aiThinking = false;
    if (!move) {
      afterMove();
      return;
    }
    chess.move(move);
    playMoveSound(move);
    afterMove();
  }

  function playMoveSound(move) {
    if (chess.isCheckmate()) sfx.gameOver();
    else if (chess.inCheck()) sfx.check();
    else if (move.captured) sfx.capture();
    else sfx.move();
  }

  function afterMove() {
    rebuildCapturedAndMoves();
    draw();
    if (chess.isGameOver()) {
      showGameOverModal();
    } else {
      updateStatusLine();
    }
  }

  function rebuildCapturedAndMoves() {
    const history = chess.history({ verbose: true });
    const takenByWhite = []; // black pieces white has captured
    const takenByBlack = []; // white pieces black has captured
    moveListEl.innerHTML = '';
    let moveNum = 1;
    let row = null;

    history.forEach((move, i) => {
      if (move.captured) {
        const capturedColor = move.color === 'w' ? 'b' : 'w';
        (move.color === 'w' ? takenByWhite : takenByBlack).push(GLYPH[capturedColor][move.captured]);
      }
      if (i % 2 === 0) {
        row = document.createElement('li');
        row.className = 'move-row';
        row.style.display = 'contents';
        const num = document.createElement('span');
        num.className = 'move-num';
        num.textContent = `${moveNum}.`;
        row.appendChild(num);
        moveListEl.appendChild(row);
        moveNum++;
      }
      const span = document.createElement('span');
      span.className = `san${move.san.includes('#') ? ' check' : ''}`;
      span.textContent = move.san;
      row.appendChild(span);
    });

    capturedByWhite.textContent = '';
    capturedByBlack.textContent = '';
    capturedByWhite.append(...takenByWhite.map(textSpan));
    capturedByBlack.append(...takenByBlack.map(textSpan));
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function textSpan(txt) {
    const s = document.createElement('span');
    s.textContent = txt;
    return s;
  }

  function updateStatusLine() {
    const side = chess.turn() === 'w' ? 'White' : 'Black';
    statusLine.textContent = chess.inCheck() ? `${side} to move — check!` : `${side} to move`;
  }

  function showGameOverModal() {
    let title = 'Game over';
    let body = '';
    if (manualGameOver) {
      body = manualGameOver;
    } else if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? 'Black' : 'White';
      title = 'Checkmate';
      body = `${winner} wins by checkmate.`;
    } else if (chess.isStalemate()) {
      title = 'Stalemate';
      body = "It's a draw — the side to move has no legal moves but isn't in check.";
    } else if (chess.isThreefoldRepetition()) {
      title = 'Draw';
      body = 'Draw by threefold repetition.';
    } else if (chess.isInsufficientMaterial()) {
      title = 'Draw';
      body = 'Draw — neither side has enough material to force checkmate.';
    } else if (chess.isDraw()) {
      title = 'Draw';
      body = 'Draw by the 50-move rule.';
    }
    modalTitle.textContent = title;
    modalBody.textContent = body;
    modalOverlay.classList.remove('hidden');
    statusLine.textContent = body;
  }

  function showPromotionPicker(square, color, onPick) {
    promoPicker.innerHTML = '';
    promoPicker.classList.remove('hidden');
    PROMO_PIECES.forEach((p) => {
      const btn = document.createElement('button');
      btn.textContent = GLYPH[color][p];
      btn.addEventListener('click', () => onPick(p));
      promoPicker.appendChild(btn);
    });
    const wrapRect = boardEl.parentElement.getBoundingClientRect();
    const squareEl = board.squareEls.get(square);
    const sqRect = squareEl.getBoundingClientRect();
    promoPicker.style.left = `${sqRect.left - wrapRect.left}px`;
    promoPicker.style.top = `${sqRect.top - wrapRect.top}px`;
  }

  function hidePromotionPicker() {
    promoPicker.classList.add('hidden');
  }

  function draw() {
    const checkSquare = chess.inCheck() ? kingSquare(chess, chess.turn()) : null;
    const history = chess.history({ verbose: true });
    const lastMove = history.length ? history[history.length - 1] : null;
    board.render(chess, { selected, legalTargets, lastMove, checkSquare });
    topLabel.textContent = board.flipped ? 'White' : 'Black';
    bottomLabel.textContent = board.flipped ? 'Black' : 'White';
  }

  function newGame() {
    chess.reset();
    selected = null;
    legalTargets = [];
    manualGameOver = null;
    aiThinking = false;
    modalOverlay.classList.add('hidden');
    hidePromotionPicker();
    rebuildCapturedAndMoves();
    updateStatusLine();
    draw();
  }

  newGameBtn.addEventListener('click', newGame);

  undoBtn.addEventListener('click', () => {
    if (aiThinking) return;
    modalOverlay.classList.add('hidden');
    manualGameOver = null;
    const stepsBack = opponent === 'ai' && chess.history().length >= 2 ? 2 : 1;
    for (let i = 0; i < stepsBack && chess.history().length > 0; i++) chess.undo();
    selected = null;
    legalTargets = [];
    rebuildCapturedAndMoves();
    updateStatusLine();
    draw();
  });

  flipBtn.addEventListener('click', () => {
    board.setFlipped(!board.flipped);
    draw();
  });

  resignBtn.addEventListener('click', () => {
    if (manualGameOver || chess.isGameOver()) return;
    const resigning = chess.turn() === 'w' ? 'White' : 'Black';
    const winner = resigning === 'White' ? 'Black' : 'White';
    manualGameOver = `${resigning} resigned. ${winner} wins.`;
    sfx.gameOver();
    showGameOverModal();
  });

  modalCloseBtn.addEventListener('click', () => modalOverlay.classList.add('hidden'));

  opponentSelect.addEventListener('click', (e) => {
    const btn = e.target.closest('.opt-btn');
    if (!btn) return;
    opponentSelect.querySelectorAll('.opt-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    opponent = btn.dataset.opponent;
    newGame();
  });

  difficultySelect.addEventListener('click', (e) => {
    const btn = e.target.closest('.opt-btn');
    if (!btn) return;
    difficultySelect.querySelectorAll('.opt-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.difficulty;
    newGame();
  });

  newGame();
}
