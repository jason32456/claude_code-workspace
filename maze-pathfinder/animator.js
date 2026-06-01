import { VISIT, CELL } from './grid.js';

let cancelFlag = false;

export function cancelAnimation() { cancelFlag = true; }

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function animate(grid, renderCell, { visitedOrder, path }, speedMs, onStats) {
  cancelFlag = false;
  let visited = 0;

  for (const cell of visitedOrder) {
    if (cancelFlag) return;
    if (cell.type !== CELL.START && cell.type !== CELL.END) {
      cell.visit = VISIT.VISITED;
      renderCell(cell);
    }
    visited++;
    if (onStats) onStats({ visited, pathLength: 0 });
    if (speedMs > 0) await delay(speedMs);
  }

  if (cancelFlag) return;

  for (const cell of path) {
    if (cancelFlag) return;
    if (cell.type !== CELL.START && cell.type !== CELL.END) {
      cell.visit = VISIT.PATH;
      renderCell(cell);
    }
    if (speedMs > 0) await delay(speedMs * 2);
  }

  if (onStats) onStats({ visited, pathLength: path.length });
}
