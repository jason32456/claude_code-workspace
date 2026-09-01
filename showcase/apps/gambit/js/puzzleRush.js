import { Chess } from '../vendor/chess.esm.js';
import { BoardView, kingSquare } from './boardView.js';
import { sfx } from './sound.js';
import { PUZZLES } from '../data/puzzles.js';
import { getBestStreak, setBestStreak } from './storage.js';

const GLYPH = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};
const PROMO_PIECES = ['q', 'r', 'b', 'n'];
const MAX_LIVES = 3;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseUci(str) {
  return { from: str.slice(0, 2), to: str.slice(2, 4), promotion: str.length > 4 ? str[4] : undefined };
}

export function initPuzzleRush() {
  const boardEl = document.getElementById('puzzleBoard');
  const timerEl = document.getElementById('puzzleTimer');
  const solvedEl = document.getElementById('puzzleSolved');
  const livesEl = document.getElementById('puzzleLives');
  const bestEl = document.getElementById('puzzleBest');
  const statusLine = document.getElementById('puzzleStatusLine');
  const difficultySelect = document.getElementById('puzzleDifficultySelect');
  const startBtn = document.getElementById('startPuzzleBtn');
  const introBlock = document.getElementById('puzzleIntro');
  const themeBlock = document.getElementById('puzzleThemeBlock');
  const themeLine = document.getElementById('puzzleTheme');
  const hintBtn = document.getElementById('hintBtn');
  const hintText = document.getElementById('hintText');
  const summaryBlock = document.getElementById('puzzleSummaryBlock');
  const summaryText = document.getElementById('puzzleSummaryText');
  const restartBtn = document.getElementById('puzzleRestartBtn');

  const chess = new Chess();
  const board = new BoardView(boardEl, { onSquareClick: handleSquareClick });

  let difficulty = 'medium';
  let queue = [];
  let currentIndex = 0;
  let solutionStep = 0;
  let lives = MAX_LIVES;
  let solved = 0;
  let streak = 0;
  let running = false;
  let locked = false; // true while opponent's scripted reply is auto-playing
  let selected = null;
  let legalTargets = [];
  let startTime = 0;
  let timerHandle = null;

  function refreshBest() {
    bestEl.textContent = getBestStreak(difficulty);
  }
  refreshBest();

  difficultySelect.addEventListener('click', (e) => {
    const btn = e.target.closest('.opt-btn');
    if (!btn || running) return;
    difficultySelect.querySelectorAll('.opt-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.difficulty;
    refreshBest();
  });

  startBtn.addEventListener('click', startRun);
  restartBtn.addEventListener('click', startRun);
  hintBtn.addEventListener('click', () => {
    hintText.classList.remove('hidden');
    hintText.textContent = queue[currentIndex]?.hint || '';
  });

  function startRun() {
    queue = shuffle(PUZZLES.filter((p) => p.tier === difficulty));
    if (queue.length === 0) return;
    currentIndex = 0;
    lives = MAX_LIVES;
    solved = 0;
    streak = 0;
    running = true;
    locked = false;
    startTime = Date.now();
    clearInterval(timerHandle);
    timerHandle = setInterval(updateTimer, 500);
    introBlock.classList.add('hidden');
    summaryBlock.classList.add('hidden');
    themeBlock.classList.remove('hidden');
    updateHud();
    loadPuzzle();
  }

  function updateTimer() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function updateHud() {
    solvedEl.textContent = solved;
    livesEl.textContent = '♥ '.repeat(lives).trim() || '—';
    bestEl.textContent = getBestStreak(difficulty);
  }

  function loadPuzzle() {
    if (currentIndex >= queue.length) {
      queue = shuffle(queue);
      currentIndex = 0;
    }
    const puzzle = queue[currentIndex];
    chess.load(puzzle.fen);
    solutionStep = 0;
    selected = null;
    legalTargets = [];
    locked = false;
    hintText.classList.add('hidden');
    themeLine.textContent = puzzle.theme;
    const side = chess.turn() === 'w' ? 'White' : 'Black';
    statusLine.textContent = `Find the best move for ${side}.`;
    draw();
  }

  function handleSquareClick(square) {
    if (!running || locked) return;
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
          showPromotionPicker(square, chess.turn(), (promo) => attemptMove(selected, square, promo));
          return;
        }
        attemptMove(selected, square);
        return;
      }
      if (piece && piece.color === chess.turn()) {
        selectSquare(square);
        return;
      }
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

  function attemptMove(from, to, promotion) {
    const puzzle = queue[currentIndex];
    const expected = parseUci(puzzle.solution[solutionStep]);
    const isCorrect = expected.from === from && expected.to === to && (expected.promotion || undefined) === (promotion || undefined);

    selected = null;
    legalTargets = [];

    if (!isCorrect) {
      handleWrongAnswer();
      return;
    }

    const move = chess.move({ from, to, promotion });
    playMoveSound(move);
    board.flashResult('correct');
    solutionStep++;
    draw();

    if (solutionStep >= puzzle.solution.length) {
      handleSolved();
      return;
    }

    // Auto-play the scripted opponent reply, then wait for the player's next move.
    locked = true;
    statusLine.textContent = 'Opponent replies…';
    setTimeout(() => {
      const oppMove = chess.move(parseUci(puzzle.solution[solutionStep]));
      playMoveSound(oppMove);
      solutionStep++;
      draw();
      locked = false;
      const side = chess.turn() === 'w' ? 'White' : 'Black';
      statusLine.textContent = `Find the best move for ${side}.`;
    }, 500);
  }

  function playMoveSound(move) {
    if (!move) return;
    if (chess.isCheckmate()) sfx.gameOver();
    else if (chess.inCheck()) sfx.check();
    else if (move.captured) sfx.capture();
    else sfx.move();
  }

  function handleWrongAnswer() {
    sfx.wrong();
    board.flashResult('wrong');
    lives--;
    updateHud();
    if (lives <= 0) {
      endRun();
      return;
    }
    statusLine.textContent = "Not quite — try again.";
    draw();
  }

  function handleSolved() {
    solved++;
    streak++;
    setBestStreak(difficulty, streak);
    updateHud();
    statusLine.textContent = 'Solved! Next puzzle…';
    locked = true;
    setTimeout(() => {
      currentIndex++;
      loadPuzzle();
    }, 700);
  }

  function endRun() {
    running = false;
    locked = false;
    clearInterval(timerHandle);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    themeBlock.classList.add('hidden');
    summaryBlock.classList.remove('hidden');
    const best = getBestStreak(difficulty);
    summaryText.textContent =
      `You solved ${solved} puzzle${solved === 1 ? '' : 's'} in ${m}:${String(s).padStart(2, '0')}. ` +
      `Streak: ${streak}${streak >= best ? ' — new best!' : ` (best: ${best})`}`;
    statusLine.textContent = 'Run complete.';
    sfx.gameOver();
  }

  function showPromotionPicker(square, color, onPick) {
    const picker = document.createElement('div');
    picker.className = 'promo-picker';
    PROMO_PIECES.forEach((p) => {
      const btn = document.createElement('button');
      btn.textContent = GLYPH[color][p];
      btn.addEventListener('click', () => {
        picker.remove();
        onPick(p);
      });
      picker.appendChild(btn);
    });
    const wrapRect = boardEl.parentElement.getBoundingClientRect();
    const sqRect = board.squareEls.get(square).getBoundingClientRect();
    picker.style.left = `${sqRect.left - wrapRect.left}px`;
    picker.style.top = `${sqRect.top - wrapRect.top}px`;
    boardEl.parentElement.appendChild(picker);
  }

  function draw() {
    const checkSquare = chess.inCheck() ? kingSquare(chess, chess.turn()) : null;
    const history = chess.history({ verbose: true });
    const lastMove = history.length ? history[history.length - 1] : null;
    board.render(chess, { selected, legalTargets, lastMove, checkSquare });
  }
}
