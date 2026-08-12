import { createInitialState, generateLegalMoves, applyMove, isInCheck, getGameStatus, WHITE, BLACK } from './engine.js';
import { moveToSAN } from './notation.js';
import * as ui from './ui.js';

const SAVE_KEY = 'gambit-save-v1';

let history = [createInitialState()];
let moveRecords = []; // [{ move, san }]
let playerColor = WHITE;
let difficulty = 'club';
let flipped = false;
let selectedSquare = null;
let legalDestinations = [];
let aiThinking = false;
let gameOver = false;

const worker = new Worker('./ai-worker.js', { type: 'module' });
let pendingResolve = null;
worker.onmessage = (event) => {
  if (pendingResolve) {
    pendingResolve(event.data.move);
    pendingResolve = null;
  }
};

function requestAIMove(state) {
  return new Promise((resolve) => {
    pendingResolve = resolve;
    worker.postMessage({ state, difficulty });
  });
}

function currentState() {
  return history[history.length - 1];
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ history, moveRecords, playerColor, difficulty, flipped }));
  } catch {
    // localStorage unavailable (private browsing quota, etc.) — game still works, just won't resume.
  }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.history || !data.history.length) return false;
    history = data.history;
    moveRecords = data.moveRecords || [];
    playerColor = data.playerColor || WHITE;
    difficulty = data.difficulty || 'club';
    flipped = !!data.flipped;
    return true;
  } catch {
    return false;
  }
}

function candidateMoves(state, from, to) {
  return generateLegalMoves(state).filter((m) => m.from === from && m.to === to);
}

function clearSelection() {
  selectedSquare = null;
  legalDestinations = [];
}

async function trySelect(sq) {
  const state = currentState();
  if (gameOver || aiThinking || state.turn !== playerColor) return;

  if (selectedSquare !== null) {
    const moved = await tryMove(selectedSquare, sq);
    if (moved) return;
  }

  const piece = state.board[sq];
  if (piece && piece[0] === state.turn) {
    selectedSquare = sq;
    legalDestinations = generateLegalMoves(state).filter((m) => m.from === sq);
  } else {
    clearSelection();
  }
  refresh();
}

async function tryMove(from, to) {
  const state = currentState();
  const candidates = candidateMoves(state, from, to);
  if (!candidates.length) {
    clearSelection();
    return false;
  }

  let move = candidates[0];
  if (candidates.length > 1) {
    const chosen = await ui.showPromotionPicker(state.turn);
    move = candidates.find((m) => m.promotion === chosen) || candidates[0];
  }

  clearSelection();
  playMove(move);
  return true;
}

function playMove(move) {
  const state = currentState();
  const legalMovesBefore = generateLegalMoves(state);
  const next = applyMove(state, move);
  const givesCheck = isInCheck(next, next.turn);
  const nextLegal = generateLegalMoves(next);
  const isCheckmate = givesCheck && nextLegal.length === 0;
  const san = moveToSAN(state, move, legalMovesBefore, givesCheck, isCheckmate);

  history.push(next);
  moveRecords.push({ move, san });
  save();
  refresh();
  afterMove();
}

function resultMessage(status, state) {
  switch (status) {
    case 'checkmate':
      return `Checkmate — ${state.turn === WHITE ? 'Black' : 'White'} wins!`;
    case 'stalemate':
      return 'Stalemate — draw.';
    case 'draw-50':
      return 'Draw — fifty-move rule.';
    case 'draw-repetition':
      return 'Draw — threefold repetition.';
    case 'draw-material':
      return 'Draw — insufficient material.';
    default:
      return '';
  }
}

function checkGameOver() {
  const state = currentState();
  const status = getGameStatus(state);
  if (status !== 'playing') {
    gameOver = true;
    ui.showResult(resultMessage(status, state));
    return true;
  }
  return false;
}

async function afterMove() {
  if (checkGameOver()) return;
  const state = currentState();
  if (state.turn !== playerColor) {
    aiThinking = true;
    ui.setThinking(true);
    ui.setStatus(`${state.turn === WHITE ? 'White' : 'Black'} is thinking…`);
    const move = await requestAIMove(state);
    aiThinking = false;
    ui.setThinking(false);
    if (move) playMove(move);
  }
}

function statusText() {
  const state = currentState();
  const turnName = state.turn === WHITE ? 'White' : 'Black';
  const check = isInCheck(state, state.turn);
  const base = state.turn === playerColor ? 'Your move' : `${turnName} to move`;
  return check ? `${base} — Check!` : base;
}

function refresh() {
  const state = currentState();
  const interactive = !gameOver && !aiThinking && state.turn === playerColor;
  ui.renderPieces(state.board, interactive, (sq) => trySelect(sq));
  ui.clearHighlights();

  const lastRecord = moveRecords[moveRecords.length - 1];
  if (lastRecord) ui.highlightLastMove(lastRecord.move);

  if (isInCheck(state, state.turn)) {
    ui.highlightCheck(state.board.indexOf(`${state.turn}K`));
  }

  ui.highlightSelection(selectedSquare, legalDestinations);
  ui.renderMoveList(moveRecords);
  ui.renderCaptured(moveRecords, playerColor);
  if (!aiThinking) ui.setStatus(statusText());
}

function rebuildBoard() {
  ui.buildBoard(flipped, (sq) => trySelect(sq), (sq) => trySelect(sq));
}

function newGame(color, diff) {
  playerColor = color === 'random' ? (Math.random() < 0.5 ? WHITE : BLACK) : color;
  difficulty = diff;
  flipped = playerColor === BLACK;
  history = [createInitialState()];
  moveRecords = [];
  clearSelection();
  gameOver = false;
  ui.hideResult();
  rebuildBoard();
  refresh();
  save();
  afterMove();
}

function undo() {
  if (aiThinking) return;
  const pliesToRemove = moveRecords.length >= 2 ? 2 : moveRecords.length;
  if (pliesToRemove === 0) return;
  history.length -= pliesToRemove;
  moveRecords.length -= pliesToRemove;
  clearSelection();
  gameOver = false;
  ui.hideResult();
  refresh();
  save();
}

function flipBoard() {
  flipped = !flipped;
  rebuildBoard();
  refresh();
  save();
}

function buildPGN() {
  let out = '';
  for (let i = 0; i < moveRecords.length; i += 2) {
    out += `${i / 2 + 1}. ${moveRecords[i].san} `;
    if (moveRecords[i + 1]) out += `${moveRecords[i + 1].san} `;
  }
  return out.trim();
}

async function copyPGN() {
  const pgn = buildPGN() || '(no moves yet)';
  try {
    await navigator.clipboard.writeText(pgn);
    ui.setStatus('PGN copied!');
    setTimeout(() => ui.setStatus(statusText()), 1200);
  } catch {
    ui.setStatus('Could not copy — clipboard unavailable.');
  }
}

const sideSelect = document.getElementById('sideSelect');
const difficultySelect = document.getElementById('difficultySelect');

document.getElementById('newGameBtn').addEventListener('click', () => {
  newGame(sideSelect.value, difficultySelect.value);
});
document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('flipBtn').addEventListener('click', flipBoard);
document.getElementById('copyPgnBtn').addEventListener('click', copyPGN);
document.getElementById('rematchBtn').addEventListener('click', () => {
  newGame(sideSelect.value, difficultySelect.value);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') flipBoard();
  if (e.ctrlKey && e.key === 'z') undo();
});

if (load()) {
  sideSelect.value = playerColor;
  difficultySelect.value = difficulty;
  rebuildBoard();
  refresh();
  if (!checkGameOver()) afterMove();
} else {
  newGame(WHITE, 'club');
}
