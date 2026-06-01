import { cellAt, CELL } from './grid.js';

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Recursive backtracking (DFS) — carves on odd-indexed cells
export function recursiveBacktracker(grid) {
  // Fill everything with walls first
  for (const cell of grid.cells) {
    if (cell.type !== CELL.START && cell.type !== CELL.END) cell.type = CELL.WALL;
  }

  const visited = new Set();
  const stack = [];

  // Start at (1,1) — first "room" cell
  const startCell = cellAt(grid, 1, 1);
  if (!startCell) return;
  startCell.type = CELL.EMPTY;
  visited.add(`${startCell.r},${startCell.c}`);
  stack.push(startCell);

  const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const unvisited = shuffle(dirs
      .map(([dr, dc]) => {
        const nr = cur.r + dr, nc = cur.c + dc;
        return cellAt(grid, nr, nc);
      })
      .filter(n => n && !visited.has(`${n.r},${n.c}`))
    );

    if (unvisited.length === 0) {
      stack.pop();
    } else {
      const next = unvisited[0];
      // Carve the wall between cur and next
      const between = cellAt(grid, (cur.r + next.r) / 2, (cur.c + next.c) / 2);
      if (between) between.type = CELL.EMPTY;
      next.type = CELL.EMPTY;
      visited.add(`${next.r},${next.c}`);
      stack.push(next);
    }
  }

  // Ensure start/end cells are clear after generation
  for (const cell of grid.cells) {
    if (cell.type === CELL.START || cell.type === CELL.END) {
      // Also clear neighbors so they're reachable
    }
  }
}

// Prim's randomized maze
export function primsAlgorithm(grid) {
  for (const cell of grid.cells) {
    if (cell.type !== CELL.START && cell.type !== CELL.END) cell.type = CELL.WALL;
  }

  const visited = new Set();
  const frontier = [];

  function addFrontier(r, c) {
    const cell = cellAt(grid, r, c);
    if (cell && !visited.has(`${r},${c}`)) {
      frontier.push(cell);
    }
  }

  const startCell = cellAt(grid, 1, 1);
  if (!startCell) return;
  startCell.type = CELL.EMPTY;
  visited.add('1,1');
  addFrontier(3, 1);
  addFrontier(1, 3);

  const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];

  while (frontier.length) {
    const idx = Math.floor(Math.random() * frontier.length);
    const cell = frontier.splice(idx, 1)[0];
    const ck = `${cell.r},${cell.c}`;
    if (visited.has(ck)) continue;

    // Find visited neighbors 2 steps away
    const visitedNeighbors = dirs
      .map(([dr, dc]) => cellAt(grid, cell.r + dr, cell.c + dc))
      .filter(n => n && visited.has(`${n.r},${n.c}`));

    if (visitedNeighbors.length) {
      const neighbor = visitedNeighbors[Math.floor(Math.random() * visitedNeighbors.length)];
      const between = cellAt(grid, (cell.r + neighbor.r) / 2, (cell.c + neighbor.c) / 2);
      if (between) between.type = CELL.EMPTY;
      cell.type = CELL.EMPTY;
      visited.add(ck);

      dirs.forEach(([dr, dc]) => addFrontier(cell.r + dr, cell.c + dc));
    }
  }
}
