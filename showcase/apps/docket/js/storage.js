import { uid } from './utils.js';

const STORAGE_KEY = 'docket:v1';

function emptyState() {
  return { boards: {}, boardOrder: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.boards) return null;
    return parsed;
  } catch {
    return null;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = load();

// Populates a brand-new store via `seedFn(state)`. No-op if a store already
// exists, so returning users always keep their own data.
export function initState(seedFn) {
  if (state) return state;
  state = emptyState();
  if (seedFn) seedFn(state);
  save();
  return state;
}

export function getState() {
  if (!state) state = emptyState();
  return state;
}

export function createBoard(name) {
  const id = uid('board');
  state.boards[id] = {
    id,
    name,
    createdAt: Date.now(),
    columnOrder: [],
    columns: {},
    cardOrder: {},
    cards: {},
    labelOrder: [],
    labels: {},
  };
  state.boardOrder.push(id);
  save();
  return state.boards[id];
}

export function renameBoard(boardId, name) {
  state.boards[boardId].name = name;
  save();
}

export function deleteBoard(boardId) {
  delete state.boards[boardId];
  state.boardOrder = state.boardOrder.filter((id) => id !== boardId);
  save();
}

export function createColumn(boardId, name, wipLimit = null) {
  const board = state.boards[boardId];
  const id = uid('col');
  board.columns[id] = { id, name, wipLimit };
  board.columnOrder.push(id);
  board.cardOrder[id] = [];
  save();
  return board.columns[id];
}

export function renameColumn(boardId, colId, name) {
  state.boards[boardId].columns[colId].name = name;
  save();
}

export function setColumnWipLimit(boardId, colId, wipLimit) {
  state.boards[boardId].columns[colId].wipLimit = wipLimit;
  save();
}

export function deleteColumn(boardId, colId) {
  const board = state.boards[boardId];
  for (const cardId of board.cardOrder[colId] || []) {
    delete board.cards[cardId];
  }
  delete board.cardOrder[colId];
  delete board.columns[colId];
  board.columnOrder = board.columnOrder.filter((id) => id !== colId);
  save();
}

export function reorderColumn(boardId, colId, toIndex) {
  const board = state.boards[boardId];
  board.columnOrder = board.columnOrder.filter((id) => id !== colId);
  board.columnOrder.splice(toIndex, 0, colId);
  save();
}

export function createCard(boardId, columnId, title) {
  const board = state.boards[boardId];
  const id = uid('card');
  board.cards[id] = { id, columnId, title, description: '', due: null, labels: [], createdAt: Date.now() };
  board.cardOrder[columnId].push(id);
  save();
  return board.cards[id];
}

export function updateCard(boardId, cardId, patch) {
  Object.assign(state.boards[boardId].cards[cardId], patch);
  save();
}

export function deleteCard(boardId, cardId) {
  const board = state.boards[boardId];
  const card = board.cards[cardId];
  board.cardOrder[card.columnId] = board.cardOrder[card.columnId].filter((id) => id !== cardId);
  delete board.cards[cardId];
  save();
}

export function moveCard(boardId, cardId, toColumnId, toIndex) {
  const board = state.boards[boardId];
  const card = board.cards[cardId];
  board.cardOrder[card.columnId] = board.cardOrder[card.columnId].filter((id) => id !== cardId);
  card.columnId = toColumnId;
  board.cardOrder[toColumnId].splice(toIndex, 0, cardId);
  save();
}

export function createLabel(boardId, name, color) {
  const board = state.boards[boardId];
  const id = uid('label');
  board.labels[id] = { id, name, color };
  board.labelOrder.push(id);
  save();
  return board.labels[id];
}

export function toggleCardLabel(boardId, cardId, labelId) {
  const card = state.boards[boardId].cards[cardId];
  if (card.labels.includes(labelId)) {
    card.labels = card.labels.filter((id) => id !== labelId);
  } else {
    card.labels.push(labelId);
  }
  save();
}
