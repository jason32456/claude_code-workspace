export const CELL = { EMPTY: 'empty', WALL: 'wall', START: 'start', END: 'end' };
export const VISIT = { NONE: '', FRONTIER: 'frontier', VISITED: 'visited', PATH: 'path' };

export function createGrid(cols, rows) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ r, c, type: CELL.EMPTY, visit: VISIT.NONE, weight: 1 });
    }
  }
  return { cols, rows, cells };
}

export function cellAt(grid, r, c) {
  if (r < 0 || r >= grid.rows || c < 0 || c >= grid.cols) return null;
  return grid.cells[r * grid.cols + c];
}

export function key(cell) { return `${cell.r},${cell.c}`; }

export function neighbors4(grid, cell) {
  const { r, c } = cell;
  return [
    cellAt(grid, r - 1, c),
    cellAt(grid, r + 1, c),
    cellAt(grid, r, c - 1),
    cellAt(grid, r, c + 1),
  ].filter(Boolean);
}

export function clearVisit(grid) {
  for (const cell of grid.cells) cell.visit = VISIT.NONE;
}

export function clearAll(grid) {
  for (const cell of grid.cells) {
    cell.type = CELL.EMPTY;
    cell.visit = VISIT.NONE;
    cell.weight = 1;
  }
}
