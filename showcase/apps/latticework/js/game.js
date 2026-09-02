// Game state: the live board, pencil marks, undo/redo history, timer and
// mistake count, plus localStorage persistence for practice games, the
// daily challenge, and the streak record. No DOM code lives here.

import { digitToBit } from './units.js';

const KEY_PRACTICE = 'latticework:practice';
const KEY_DAILY = 'latticework:daily';
const KEY_STREAK = 'latticework:streak';

export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateKeyOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

export class SudokuGame {
  constructor({ puzzle, solution, tier, mode, dateKey }) {
    this.puzzle = puzzle;
    this.solution = solution;
    this.tier = tier;
    this.mode = mode; // 'practice' | 'daily'
    this.dateKey = dateKey ?? null;

    this.given = puzzle.map((v) => v !== 0);
    this.values = puzzle.slice();
    this.notes = new Array(81).fill(0);
    this.selected = this.values.findIndex((v) => v === 0);
    this.notesMode = false;
    this.mistakes = 0;
    this.elapsedMs = 0;
    this.running = true;
    this.completed = false;

    this.undoStack = [];
    this.redoStack = [];
  }

  isGiven(cell) {
    return this.given[cell];
  }

  isComplete() {
    return this.values.every((v, i) => v !== 0 && v === this.solution[i]);
  }

  setValue(cell, digit) {
    if (this.isGiven(cell) || this.completed) return;
    const prevValue = this.values[cell];
    const prevNotes = this.notes[cell];
    if (prevValue === digit) return;

    this.undoStack.push({ cell, prevValue, prevNotes });
    this.redoStack = [];

    this.values[cell] = digit;
    this.notes[cell] = 0;
    if (digit !== 0 && digit !== this.solution[cell]) this.mistakes++;

    if (this.isComplete()) {
      this.completed = true;
      this.running = false;
    }
  }

  eraseCell(cell) {
    if (this.isGiven(cell) || this.completed) return;
    if (this.values[cell] === 0 && this.notes[cell] === 0) return;
    this.undoStack.push({ cell, prevValue: this.values[cell], prevNotes: this.notes[cell] });
    this.redoStack = [];
    this.values[cell] = 0;
    this.notes[cell] = 0;
  }

  toggleNote(cell, digit) {
    if (this.isGiven(cell) || this.values[cell] !== 0 || this.completed) return;
    const prevValue = this.values[cell];
    const prevNotes = this.notes[cell];
    this.undoStack.push({ cell, prevValue, prevNotes });
    this.redoStack = [];
    this.notes[cell] ^= digitToBit(digit);
  }

  applyHint(cell, digit) {
    if (this.isGiven(cell) || this.completed) return;
    this.undoStack.push({ cell, prevValue: this.values[cell], prevNotes: this.notes[cell] });
    this.redoStack = [];
    this.values[cell] = digit;
    this.notes[cell] = 0;
    if (this.isComplete()) {
      this.completed = true;
      this.running = false;
    }
  }

  undo() {
    const step = this.undoStack.pop();
    if (!step) return;
    this.redoStack.push({ cell: step.cell, prevValue: this.values[step.cell], prevNotes: this.notes[step.cell] });
    this.values[step.cell] = step.prevValue;
    this.notes[step.cell] = step.prevNotes;
    this.completed = false;
    if (!this.running) this.running = true;
  }

  redo() {
    const step = this.redoStack.pop();
    if (!step) return;
    this.undoStack.push({ cell: step.cell, prevValue: this.values[step.cell], prevNotes: this.notes[step.cell] });
    this.values[step.cell] = step.prevValue;
    this.notes[step.cell] = step.prevNotes;
    if (this.isComplete()) {
      this.completed = true;
      this.running = false;
    }
  }

  tick(deltaMs) {
    if (this.running && !this.completed) this.elapsedMs += deltaMs;
  }

  serialize() {
    return {
      puzzle: this.puzzle,
      solution: this.solution,
      tier: this.tier,
      mode: this.mode,
      dateKey: this.dateKey,
      values: this.values,
      notes: this.notes,
      selected: this.selected,
      mistakes: this.mistakes,
      elapsedMs: this.elapsedMs,
      completed: this.completed,
      savedAt: Date.now(),
    };
  }

  static deserialize(data) {
    const game = new SudokuGame({
      puzzle: data.puzzle,
      solution: data.solution,
      tier: data.tier,
      mode: data.mode,
      dateKey: data.dateKey,
    });
    game.values = data.values;
    game.notes = data.notes;
    game.selected = data.selected;
    game.mistakes = data.mistakes;
    game.elapsedMs = data.elapsedMs;
    game.completed = data.completed;
    game.running = !data.completed;
    return game;
  }

  save() {
    const key = this.mode === 'daily' ? KEY_DAILY : KEY_PRACTICE;
    try {
      localStorage.setItem(key, JSON.stringify(this.serialize()));
    } catch {
      // localStorage unavailable (private mode, quota) -- play continues, just unsaved.
    }
  }
}

export function loadSaved(mode) {
  const key = mode === 'daily' ? KEY_DAILY : KEY_PRACTICE;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return SudokuGame.deserialize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function getStreak() {
  try {
    const raw = localStorage.getItem(KEY_STREAK);
    if (!raw) return { current: 0, best: 0, lastCompletedDate: null };
    return JSON.parse(raw);
  } catch {
    return { current: 0, best: 0, lastCompletedDate: null };
  }
}

export function recordDailyWin(dateKey) {
  const streak = getStreak();
  if (streak.lastCompletedDate === dateKey) return streak; // already recorded today
  const wasYesterday = streak.lastCompletedDate === dateKeyOffset(-1);
  streak.current = wasYesterday ? streak.current + 1 : 1;
  streak.best = Math.max(streak.best, streak.current);
  streak.lastCompletedDate = dateKey;
  try {
    localStorage.setItem(KEY_STREAK, JSON.stringify(streak));
  } catch {
    // ignore
  }
  return streak;
}
