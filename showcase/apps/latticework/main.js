import { SudokuGame, loadSaved, getStreak, recordDailyWin, localDateKey } from './js/game.js';
import { findNextPlacement, TIER_NAMES } from './js/solver.js';
import { seedFromString } from './js/generator.js';
import { rowOf, colOf, PEERS } from './js/units.js';

const DAILY_TIER = 2; // Medium -- everyone gets the same puzzle on a given day

const boardEl = document.getElementById('board');
const numpadEl = document.getElementById('numpad');
const difficultySelect = document.getElementById('difficulty-select');
const newGameBtn = document.getElementById('new-game-btn');
const dailyBtn = document.getElementById('daily-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const notesBtn = document.getElementById('notes-btn');
const eraseBtn = document.getElementById('erase-btn');
const hintBtn = document.getElementById('hint-btn');
const hintPanel = document.getElementById('hint-panel');
const hintTechniqueEl = document.getElementById('hint-technique');
const hintReasonEl = document.getElementById('hint-reason');
const modeDisplay = document.getElementById('mode-display');
const tierDisplay = document.getElementById('tier-display');
const timerDisplay = document.getElementById('timer-display');
const mistakesDisplay = document.getElementById('mistakes-display');
const streakDisplay = document.getElementById('streak-display');
const streakCountEl = document.getElementById('streak-count');
const winModal = document.getElementById('win-modal');
const winTime = document.getElementById('win-time');
const winMistakes = document.getElementById('win-mistakes');
const winTier = document.getElementById('win-tier');
const winStreak = document.getElementById('win-streak');
const winCloseBtn = document.getElementById('win-close-btn');
const loadingOverlay = document.getElementById('loading-overlay');

let game = null;
let lastHintCell = null;
let saveTimer = null;

const worker = new Worker(new URL('./js/worker.js', import.meta.url), { type: 'module' });
let nextRequestId = 1;
const pending = new Map();
worker.onmessage = (e) => {
  const { requestId, ...result } = e.data;
  const resolve = pending.get(requestId);
  if (resolve) {
    pending.delete(requestId);
    resolve(result);
  }
};

function requestPuzzle(tier, seed) {
  const requestId = nextRequestId++;
  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    worker.postMessage({ requestId, tier, seed });
  });
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// --- Board rendering -----------------------------------------------------

function buildBoardSkeleton() {
  boardEl.innerHTML = '';
  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = String(i);
    cell.setAttribute('role', 'gridcell');
    cell.tabIndex = -1;
    if (colOf(i) % 3 === 2 && colOf(i) !== 8) cell.classList.add('box-border-right');
    if (rowOf(i) % 3 === 2 && rowOf(i) !== 8) cell.classList.add('box-border-bottom');
    cell.addEventListener('click', () => selectCell(i));
    boardEl.appendChild(cell);
  }
}

function buildNumpad() {
  numpadEl.innerHTML = '';
  for (let d = 1; d <= 9; d++) {
    const btn = document.createElement('button');
    btn.textContent = String(d);
    btn.dataset.digit = String(d);
    btn.addEventListener('click', () => enterDigit(d));
    numpadEl.appendChild(btn);
  }
}

function renderBoard() {
  const cells = boardEl.children;
  const selectedVal = game.selected != null ? game.values[game.selected] : 0;
  for (let i = 0; i < 81; i++) {
    const cellEl = cells[i];
    cellEl.classList.remove('given', 'selected', 'peer', 'same-digit', 'error', 'hint-cell');
    cellEl.innerHTML = '';

    if (game.isGiven(i)) cellEl.classList.add('given');
    if (i === game.selected) cellEl.classList.add('selected');
    else if (game.selected != null && PEERS[game.selected].includes(i)) cellEl.classList.add('peer');

    const value = game.values[i];
    if (value !== 0) {
      if (selectedVal !== 0 && value === selectedVal && i !== game.selected) cellEl.classList.add('same-digit');
      if (!game.isGiven(i) && value !== game.solution[i]) cellEl.classList.add('error');
      cellEl.textContent = String(value);
    } else if (game.notes[i] !== 0) {
      const grid = document.createElement('div');
      grid.className = 'notes-grid';
      for (let d = 1; d <= 9; d++) {
        const span = document.createElement('span');
        span.textContent = game.notes[i] & (1 << (d - 1)) ? String(d) : '';
        grid.appendChild(span);
      }
      cellEl.appendChild(grid);
    }

    if (i === lastHintCell) cellEl.classList.add('hint-cell');
  }
}

function renderNumpad() {
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) {
    if (game.values[i] !== 0 && game.values[i] === game.solution[i]) counts[game.values[i]]++;
  }
  for (const btn of numpadEl.children) {
    const d = Number(btn.dataset.digit);
    btn.classList.toggle('exhausted', counts[d] === 9);
  }
}

function renderStatus() {
  modeDisplay.textContent = game.mode === 'daily' ? 'Daily Challenge' : 'Practice';
  tierDisplay.textContent = TIER_NAMES[game.tier] ?? '—';
  timerDisplay.textContent = formatTime(game.elapsedMs);
  mistakesDisplay.textContent = String(game.mistakes);
  undoBtn.disabled = game.undoStack.length === 0;
  redoBtn.disabled = game.redoStack.length === 0;
  notesBtn.classList.toggle('active', game.notesMode);
}

function renderStreak() {
  const streak = getStreak();
  streakCountEl.textContent = String(streak.current);
  streakDisplay.classList.toggle('active', streak.current > 0);
}

function render() {
  renderBoard();
  renderNumpad();
  renderStatus();
}

// --- Interaction -----------------------------------------------------

function selectCell(i) {
  game.selected = i;
  render();
}

function enterDigit(d) {
  if (game.selected == null || game.completed) return;
  hideHintPanel();
  if (game.notesMode) {
    game.toggleNote(game.selected, d);
  } else {
    game.setValue(game.selected, d);
  }
  afterMove();
}

function eraseSelected() {
  if (game.selected == null) return;
  hideHintPanel();
  game.eraseCell(game.selected);
  afterMove();
}

function undo() {
  hideHintPanel();
  game.undo();
  afterMove();
}

function redo() {
  hideHintPanel();
  game.redo();
  afterMove();
}

function toggleNotesMode() {
  game.notesMode = !game.notesMode;
  renderStatus();
}

function hideHintPanel() {
  lastHintCell = null;
  hintPanel.hidden = true;
}

function useHint() {
  if (game.completed) return;
  const move = findNextPlacement(game.values);
  if (!move) {
    hintTechniqueEl.textContent = 'No pure logical step found';
    hintReasonEl.textContent =
      "This position needs a guess-and-check branch beyond this app's technique set (up through X-Wing). Try a different cell, or undo a recent entry.";
    hintPanel.hidden = false;
    return;
  }
  game.applyHint(move.cell, move.digit);
  game.selected = move.cell;
  lastHintCell = move.cell;
  hintTechniqueEl.textContent = move.technique;
  const extra = move.supportingSteps.length
    ? ` (after ${move.supportingSteps.length} supporting elimination${move.supportingSteps.length > 1 ? 's' : ''})`
    : '';
  hintReasonEl.textContent = move.reason + extra;
  hintPanel.hidden = false;
  afterMove();
}

function afterMove() {
  render();
  scheduleSave();
  if (game.completed) onWin();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => game.save(), 300);
}

function onWin() {
  game.save();
  winTime.textContent = formatTime(game.elapsedMs);
  winMistakes.textContent = String(game.mistakes);
  winTier.textContent = TIER_NAMES[game.tier] ?? '—';
  if (game.mode === 'daily') {
    const streak = recordDailyWin(game.dateKey);
    winStreak.hidden = false;
    winStreak.textContent = `🔥 ${streak.current}-day streak (best ${streak.best})`;
    renderStreak();
  } else {
    winStreak.hidden = true;
  }
  winModal.hidden = false;
}

// --- Game lifecycle -----------------------------------------------------

async function startNewGame(tier) {
  loadingOverlay.hidden = false;
  hideHintPanel();
  winModal.hidden = true;
  try {
    const { puzzle, solution, tier: gradedTier } = await requestPuzzle(tier);
    game = new SudokuGame({ puzzle, solution, tier: gradedTier, mode: 'practice' });
    game.save();
    render();
    renderStreak();
  } finally {
    loadingOverlay.hidden = true;
  }
}

async function startDaily() {
  const dateKey = localDateKey();
  const saved = loadSaved('daily');
  if (saved && saved.dateKey === dateKey) {
    game = saved;
    render();
    renderStreak();
    return;
  }
  loadingOverlay.hidden = false;
  hideHintPanel();
  winModal.hidden = true;
  try {
    const seed = seedFromString(`latticework-daily-${dateKey}`);
    const { puzzle, solution, tier: gradedTier } = await requestPuzzle(DAILY_TIER, seed);
    game = new SudokuGame({ puzzle, solution, tier: gradedTier, mode: 'daily', dateKey });
    game.save();
    render();
    renderStreak();
  } finally {
    loadingOverlay.hidden = true;
  }
}

function initGame() {
  const savedPractice = loadSaved('practice');
  if (savedPractice) {
    game = savedPractice;
    difficultySelect.value = String(game.tier);
    render();
    renderStreak();
  } else {
    startNewGame(Number(difficultySelect.value));
  }
}

// --- Timer loop -----------------------------------------------------

let lastTick = performance.now();
function timerLoop(now) {
  const delta = now - lastTick;
  lastTick = now;
  if (game) {
    game.tick(delta);
    timerDisplay.textContent = formatTime(game.elapsedMs);
  }
  requestAnimationFrame(timerLoop);
}
requestAnimationFrame(timerLoop);
setInterval(() => {
  if (game && game.running) game.save();
}, 5000);

// --- Wiring -----------------------------------------------------

buildBoardSkeleton();
buildNumpad();
initGame();

newGameBtn.addEventListener('click', () => startNewGame(Number(difficultySelect.value)));
dailyBtn.addEventListener('click', () => startDaily());
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
notesBtn.addEventListener('click', toggleNotesMode);
eraseBtn.addEventListener('click', eraseSelected);
hintBtn.addEventListener('click', useHint);
winCloseBtn.addEventListener('click', () => {
  winModal.hidden = true;
});

document.addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'SELECT') return;
  if (!game) return;

  if (e.key >= '1' && e.key <= '9') {
    enterDigit(Number(e.key));
    return;
  }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    eraseSelected();
    return;
  }
  if (e.key === 'n' || e.key === 'N') {
    toggleNotesMode();
    return;
  }
  if (e.key === 'h' || e.key === 'H') {
    useHint();
    return;
  }
  if (e.key === 'u' || e.key === 'U') {
    undo();
    return;
  }
  if (game.selected == null) return;
  let r = rowOf(game.selected);
  let c = colOf(game.selected);
  if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
  else if (e.key === 'ArrowDown') r = Math.min(8, r + 1);
  else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
  else if (e.key === 'ArrowRight') c = Math.min(8, c + 1);
  else return;
  e.preventDefault();
  selectCell(r * 9 + c);
});
