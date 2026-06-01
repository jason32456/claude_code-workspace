import { createGrid, cellAt, clearVisit, clearAll, CELL, VISIT } from './grid.js';
import { bfs, dijkstra, astar } from './pathfinders.js';
import { recursiveBacktracker, primsAlgorithm } from './generators.js';
import { animate, cancelAnimation } from './animator.js';

const COLS = 51, ROWS = 25;
let grid = createGrid(COLS, ROWS);
let startCell = cellAt(grid, 1, 1);
let endCell = cellAt(grid, ROWS - 2, COLS - 2);
startCell.type = CELL.START;
endCell.type = CELL.END;

// DOM refs
const gridEl = document.getElementById('grid');
const speedSlider = document.getElementById('speed');
const solverSelect = document.getElementById('solver');
const generatorSelect = document.getElementById('generator');
const statsEl = document.getElementById('stats');

// Build DOM grid
function buildDom() {
  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
  for (const cell of grid.cells) {
    const div = document.createElement('div');
    div.className = 'cell';
    div.dataset.r = cell.r;
    div.dataset.c = cell.c;
    updateCellDom(div, cell);
    gridEl.appendChild(div);
  }
}

function cellDom(cell) {
  return gridEl.querySelector(`[data-r="${cell.r}"][data-c="${cell.c}"]`);
}

function updateCellDom(div, cell) {
  div.className = 'cell';
  if (cell.type === CELL.WALL) div.classList.add('wall');
  else if (cell.type === CELL.START) div.classList.add('start');
  else if (cell.type === CELL.END) div.classList.add('end');
  else if (cell.visit === VISIT.PATH) div.classList.add('path');
  else if (cell.visit === VISIT.VISITED) div.classList.add('visited');
  else if (cell.visit === VISIT.FRONTIER) div.classList.add('frontier');
  if (cell.weight > 1) div.classList.add('weighted');
}

function renderCell(cell) {
  const div = cellDom(cell);
  if (div) updateCellDom(div, cell);
}

function renderAll() {
  for (const cell of grid.cells) renderCell(cell);
}

// Interaction state
let isMouseDown = false;
let paintMode = null; // 'wall' | 'erase' | 'weight'
let dragging = null; // 'start' | 'end'
let isAnimating = false;

gridEl.addEventListener('mousedown', e => {
  const div = e.target.closest('.cell');
  if (!div) return;
  isMouseDown = true;
  const cell = cellAt(grid, +div.dataset.r, +div.dataset.c);
  if (!cell) return;

  if (cell.type === CELL.START) { dragging = 'start'; return; }
  if (cell.type === CELL.END) { dragging = 'end'; return; }

  if (e.shiftKey) {
    paintMode = 'weight';
    toggleWeight(cell);
  } else {
    paintMode = cell.type === CELL.WALL ? 'erase' : 'wall';
    toggleWall(cell);
  }
});

gridEl.addEventListener('mousemove', e => {
  if (!isMouseDown) return;
  const div = e.target.closest('.cell');
  if (!div) return;
  const cell = cellAt(grid, +div.dataset.r, +div.dataset.c);
  if (!cell) return;

  if (dragging) {
    if (cell.type === CELL.WALL || cell.type === CELL.START || cell.type === CELL.END) return;
    const prev = dragging === 'start' ? startCell : endCell;
    prev.type = CELL.EMPTY;
    renderCell(prev);
    cell.type = dragging === 'start' ? CELL.START : CELL.END;
    if (dragging === 'start') startCell = cell; else endCell = cell;
    renderCell(cell);
    return;
  }

  if (paintMode === 'weight') { toggleWeight(cell); return; }
  if (cell.type === CELL.START || cell.type === CELL.END) return;
  if (paintMode === 'wall' && cell.type !== CELL.WALL) { cell.type = CELL.WALL; renderCell(cell); }
  if (paintMode === 'erase' && cell.type === CELL.WALL) { cell.type = CELL.EMPTY; renderCell(cell); }
});

window.addEventListener('mouseup', () => { isMouseDown = false; dragging = null; paintMode = null; });

function toggleWall(cell) {
  if (cell.type === CELL.WALL) cell.type = CELL.EMPTY;
  else { cell.type = CELL.WALL; cell.weight = 1; }
  renderCell(cell);
}

function toggleWeight(cell) {
  if (cell.type === CELL.WALL || cell.type === CELL.START || cell.type === CELL.END) return;
  cell.weight = cell.weight > 1 ? 1 : 5;
  renderCell(cell);
}

// Controls
document.getElementById('btn-solve').addEventListener('click', async () => {
  if (isAnimating) { cancelAnimation(); isAnimating = false; return; }
  clearVisit(grid);
  renderAll();

  const solverFns = { bfs, dijkstra, astar };
  const fn = solverFns[solverSelect.value];
  const trace = fn(grid, startCell, endCell);

  const speedRaw = +speedSlider.value;
  // slider 1=fast(0ms) 100=slow(50ms)
  const speedMs = Math.round((speedRaw / 100) * 50);

  isAnimating = true;
  document.getElementById('btn-solve').textContent = 'Stop';
  await animate(grid, renderCell, trace, speedMs, ({ visited, pathLength }) => {
    statsEl.textContent = `Visited: ${visited}  |  Path: ${pathLength || '—'}`;
  });
  isAnimating = false;
  document.getElementById('btn-solve').textContent = 'Solve';
  const pathLen = trace.path.length ? trace.path.length : 0;
  statsEl.textContent = `Visited: ${trace.visitedOrder.length}  |  Path: ${pathLen || 'No path'}`;
});

document.getElementById('btn-generate').addEventListener('click', () => {
  if (isAnimating) { cancelAnimation(); isAnimating = false; }
  clearAll(grid);
  if (generatorSelect.value === 'recursive') recursiveBacktracker(grid);
  else primsAlgorithm(grid);

  // Place start/end on open cells near corners
  startCell = findOpenCell(grid, 1, 1) || cellAt(grid, 1, 1);
  endCell = findOpenCell(grid, ROWS - 2, COLS - 2) || cellAt(grid, ROWS - 2, COLS - 2);
  startCell.type = CELL.START;
  endCell.type = CELL.END;
  renderAll();
  statsEl.textContent = '';
});

function findOpenCell(grid, r, c) {
  // BFS outward from (r,c) to find nearest empty cell
  const queue = [cellAt(grid, r, c)];
  const seen = new Set();
  while (queue.length) {
    const cell = queue.shift();
    if (!cell) continue;
    const k = `${cell.r},${cell.c}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (cell.type === CELL.EMPTY) return cell;
    for (const dr of [-1, 0, 1]) for (const dc of [-1, 0, 1]) {
      if (dr === 0 && dc === 0) continue;
      queue.push(cellAt(grid, cell.r + dr, cell.c + dc));
    }
  }
  return null;
}

document.getElementById('btn-clear-path').addEventListener('click', () => {
  if (isAnimating) { cancelAnimation(); isAnimating = false; }
  clearVisit(grid);
  renderAll();
  statsEl.textContent = '';
  document.getElementById('btn-solve').textContent = 'Solve';
});

document.getElementById('btn-clear-walls').addEventListener('click', () => {
  if (isAnimating) { cancelAnimation(); isAnimating = false; }
  for (const cell of grid.cells) {
    if (cell.type === CELL.WALL) cell.type = CELL.EMPTY;
    cell.weight = 1;
    cell.visit = VISIT.NONE;
  }
  renderAll();
  statsEl.textContent = '';
  document.getElementById('btn-solve').textContent = 'Solve';
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (isAnimating) { cancelAnimation(); isAnimating = false; }
  grid = createGrid(COLS, ROWS);
  startCell = cellAt(grid, 1, 1);
  endCell = cellAt(grid, ROWS - 2, COLS - 2);
  startCell.type = CELL.START;
  endCell.type = CELL.END;
  buildDom();
  statsEl.textContent = '';
  document.getElementById('btn-solve').textContent = 'Solve';
});

// Hint for weight painting
document.getElementById('weight-hint').textContent = 'Shift+drag to paint weighted cells (cost ×5)';

buildDom();
