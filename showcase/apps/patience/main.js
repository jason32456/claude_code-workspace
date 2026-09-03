import { GameEngine } from './js/game.js';
import { findHint } from './js/hint.js';
import { renderBoard, pulseHint, suitSymbol } from './js/render.js';
import { initDragAndDrop } from './js/drag.js';
import { sfxFlip, sfxPlace, sfxInvalid, sfxDraw, sfxDeal, sfxWin, setMuted, isMuted } from './js/audio.js';
import { hashString, randomSeed, todaySeedString } from './js/rng.js';
import { loadStats, recordGameResult, getDailyStatus, formatTime } from './js/stats.js';

const els = {
  stockEl: document.getElementById('stock'),
  wasteEl: document.getElementById('waste'),
  foundationEls: {
    S: document.querySelector('[data-zone="foundation"][data-suit="S"]'),
    H: document.querySelector('[data-zone="foundation"][data-suit="H"]'),
    D: document.querySelector('[data-zone="foundation"][data-suit="D"]'),
    C: document.querySelector('[data-zone="foundation"][data-suit="C"]'),
  },
  tableauEls: Array.from(document.querySelectorAll('[data-zone="tableau"]')),
};
const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const movesEl = document.getElementById('moves');
const timerEl = document.getElementById('timer');
const modeLabelEl = document.getElementById('mode-label');
const hintTextEl = document.getElementById('hint-text');
const undoBtn = document.getElementById('undo-btn');
const autoFinishBtn = document.getElementById('auto-finish-btn');
const soundBtn = document.getElementById('sound-btn');

let engine = null;
let isDaily = false;
let dailyDateStr = null;
let resultRecorded = false;
let timerInterval = null;
let hintTimeout = null;
let autoFinishTimer = null;

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerEl.textContent = formatTime(Date.now() - engine.startedAt);
  }, 500);
}

function stopTimer() {
  clearInterval(timerInterval);
}

function newGame(drawCount, { seed = null, daily = false, dateStr = null } = {}) {
  recordAbandonedIfNeeded();
  clearInterval(autoFinishTimer);
  autoFinishTimer = null;
  const usedSeed = seed !== null ? seed : randomSeed();
  engine = new GameEngine(usedSeed, drawCount);
  isDaily = daily;
  dailyDateStr = dateStr;
  resultRecorded = false;
  hintTextEl.textContent = '';
  document.getElementById('win-overlay').hidden = true;
  modeLabelEl.textContent = daily ? `Daily Challenge · Draw ${drawCount}` : `Draw ${drawCount}`;
  sfxDeal(28);
  startTimer();
  refresh();
}

function recordAbandonedIfNeeded() {
  if (!engine || resultRecorded) return;
  if (engine.state.moves === 0) return;
  recordGameResult({
    won: false,
    timeMs: Date.now() - engine.startedAt,
    score: engine.state.score,
    moves: engine.state.moves,
    isDaily,
    dateStr: dailyDateStr,
  });
  resultRecorded = true;
}

function refresh() {
  renderBoard(engine.state, els);
  scoreEl.textContent = String(engine.state.score);
  movesEl.textContent = String(engine.state.moves);
  undoBtn.disabled = !engine.canUndo();
  autoFinishBtn.hidden = !(engine.canAutoFinish() && !engine.isGameWon());
  if (engine.isGameWon() && !resultRecorded) {
    handleWin();
  }
}

function handleWin() {
  resultRecorded = true;
  stopTimer();
  sfxWin();
  const timeMs = Date.now() - engine.startedAt;
  const stats = recordGameResult({
    won: true,
    timeMs,
    score: engine.state.score,
    moves: engine.state.moves,
    isDaily,
    dateStr: dailyDateStr,
  });
  const summary = document.getElementById('win-summary');
  let streakNote = '';
  if (isDaily) streakNote = ` · Daily streak: ${stats.currentStreak}`;
  summary.textContent = `Time ${formatTime(timeMs)} · Moves ${engine.state.moves} · Score ${engine.state.score}${streakNote}`;
  document.getElementById('win-overlay').hidden = false;
  runWinCelebration();
}

function onMove(descriptor) {
  let ok = false;
  switch (descriptor.type) {
    case 'tableau-tableau':
      ok = engine.moveTableauRun(descriptor.from, descriptor.cardIndex, descriptor.to);
      break;
    case 'tableau-foundation':
      ok = engine.moveTableauToFoundation(descriptor.pile);
      break;
    case 'waste-tableau':
      ok = engine.moveWasteToTableau(descriptor.to);
      break;
    case 'waste-foundation':
      ok = engine.moveWasteToFoundation();
      break;
    case 'foundation-tableau':
      ok = engine.moveFoundationToTableau(descriptor.suit, descriptor.to);
      break;
  }
  if (ok) {
    sfxPlace();
    refresh();
  }
  return ok;
}

function onAutoMove(zone, pile) {
  if (engine.autoMoveToFoundation(zone, pile)) {
    sfxPlace();
    refresh();
  }
}

initDragAndDrop({
  boardEl,
  engine: { get state() { return engine.state; } },
  onMove,
  onAutoMove,
  refresh,
  playSound: (name) => (name === 'invalid' ? sfxInvalid() : sfxPlace()),
});

els.stockEl.addEventListener('click', () => {
  if (engine.state.stock.length > 0) {
    engine.drawFromStock();
    sfxDraw();
    refresh();
  } else if (engine.state.waste.length > 0) {
    engine.recycleWaste();
    sfxFlip();
    refresh();
  }
});

undoBtn.addEventListener('click', () => {
  if (engine.undo()) refresh();
});

document.getElementById('hint-btn').addEventListener('click', () => {
  const hint = findHint(engine.state);
  clearTimeout(hintTimeout);
  if (!hint) {
    hintTextEl.textContent = 'No legal moves — try Undo.';
    hintTimeout = setTimeout(() => (hintTextEl.textContent = ''), 2500);
    return;
  }
  hintTextEl.textContent = hint.text;
  hintTimeout = setTimeout(() => (hintTextEl.textContent = ''), 3000);
  pulseHint(hintElements(hint));
});

function hintElements(hint) {
  const t = els.tableauEls;
  const f = els.foundationEls;
  switch (hint.type) {
    case 'tableau-foundation': {
      const card = engine.state.tableau[hint.pile].at(-1);
      return [t[hint.pile].lastElementChild, f[card.suit]];
    }
    case 'waste-foundation': {
      const card = engine.state.waste.at(-1);
      return [els.wasteEl.lastElementChild, f[card.suit]];
    }
    case 'tableau-tableau':
      return [t[hint.from], t[hint.to]];
    case 'waste-tableau':
      return [els.wasteEl.lastElementChild, t[hint.to]];
    case 'draw':
    case 'recycle':
      return [els.stockEl];
    default:
      return [];
  }
}

autoFinishBtn.addEventListener('click', () => {
  autoFinishBtn.disabled = true;
  autoFinishTimer = setInterval(() => {
    const moved = engine.autoFinishStep();
    if (moved) {
      sfxPlace();
      refresh();
    }
    if (!moved || engine.isGameWon()) {
      clearInterval(autoFinishTimer);
      autoFinishTimer = null;
      autoFinishBtn.disabled = false;
    }
  }, 140);
});

soundBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  soundBtn.textContent = isMuted() ? '🔇' : '🔊';
});

// New Game dropdown
const newGameBtn = document.getElementById('new-game-btn');
const newGameMenu = document.getElementById('new-game-menu');
newGameBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  newGameMenu.hidden = !newGameMenu.hidden;
});
document.addEventListener('click', () => (newGameMenu.hidden = true));
newGameMenu.querySelectorAll('[data-draw]').forEach((btn) => {
  btn.addEventListener('click', () => {
    newGame(Number(btn.dataset.draw));
    newGameMenu.hidden = true;
  });
});
document.getElementById('daily-btn').addEventListener('click', () => {
  const dateStr = todaySeedString();
  const seed = hashString(dateStr);
  newGame(1, { seed, daily: true, dateStr });
  newGameMenu.hidden = true;
});

// Win overlay
document.getElementById('win-new-game').addEventListener('click', () => {
  document.getElementById('win-overlay').hidden = true;
  newGame(engine.state.drawCount);
});
document.getElementById('win-close').addEventListener('click', () => {
  document.getElementById('win-overlay').hidden = true;
});

// Stats overlay
document.getElementById('stats-btn').addEventListener('click', () => {
  const stats = loadStats();
  const daily = dailyDateStr ? getDailyStatus(dailyDateStr) : getDailyStatus(todaySeedString());
  const winRate = stats.gamesPlayed ? Math.round((100 * stats.gamesWon) / stats.gamesPlayed) : 0;
  const list = document.getElementById('stats-list');
  list.innerHTML = `
    <dt>Games played</dt><dd>${stats.gamesPlayed}</dd>
    <dt>Games won</dt><dd>${stats.gamesWon} (${winRate}%)</dd>
    <dt>Best time</dt><dd>${formatTime(stats.bestTimeMs)}</dd>
    <dt>Best score</dt><dd>${stats.bestScore}</dd>
    <dt>Daily streak</dt><dd>${stats.currentStreak} (best ${stats.bestStreak})</dd>
    <dt>Today's daily</dt><dd>${daily ? (daily.won ? 'Completed ✓' : 'Attempted') : 'Not played yet'}</dd>
  `;
  document.getElementById('stats-overlay').hidden = false;
});
document.getElementById('stats-close').addEventListener('click', () => {
  document.getElementById('stats-overlay').hidden = true;
});

// --- win celebration: a short cascade of falling cards on canvas ---
function runWinCelebration() {
  const canvas = document.getElementById('win-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#e63946', '#1d3557', '#f1c40f', '#2a9d8f', '#f4a261'];
  const pieces = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height,
    w: 8 + Math.random() * 8,
    h: 12 + Math.random() * 10,
    vy: 2 + Math.random() * 3,
    vx: -1 + Math.random() * 2,
    rot: Math.random() * Math.PI,
    vr: -0.2 + Math.random() * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  let frames = 0;
  let raf = null;
  function tick() {
    frames++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (frames < 260 && !document.getElementById('win-overlay').hidden) {
      raf = requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (raf) cancelAnimationFrame(raf);
    }
  }
  tick();
}

window.addEventListener('beforeunload', recordAbandonedIfNeeded);

newGame(1);
