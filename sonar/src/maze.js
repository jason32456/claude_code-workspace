// Grid maze: 1 = wall, 0 = floor. Odd dimensions, carved with a recursive
// backtracker, then perforated so the maze has loops and escape routes.

export function generateMaze(cols, rows, rng = Math.random) {
  const g = Array.from({ length: rows }, () => Array(cols).fill(1));

  const stack = [[1, 1]];
  g[1][1] = 0;
  const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];

  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options = dirs
      .map(([dx, dy]) => [cx + dx, cy + dy, cx + dx / 2, cy + dy / 2])
      .filter(([nx, ny]) => nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1 && g[ny][nx] === 1);

    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, wx, wy] = options[Math.floor(rng() * options.length)];
    g[wy][wx] = 0;
    g[ny][nx] = 0;
    stack.push([nx, ny]);
  }

  // Knock out interior walls to create loops (skip walls that would orphan nothing).
  const punches = Math.floor(cols * rows * 0.045);
  for (let i = 0; i < punches; i++) {
    const x = 1 + Math.floor(rng() * (cols - 2));
    const y = 1 + Math.floor(rng() * (rows - 2));
    if (g[y][x] !== 1) continue;
    const openNS = g[y - 1][x] === 0 && g[y + 1][x] === 0;
    const openEW = g[y][x - 1] === 0 && g[y][x + 1] === 0;
    if (openNS !== openEW) g[y][x] = 0; // only punch straight corridor walls
  }

  return g;
}

export function floorCells(grid) {
  const cells = [];
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[0].length; x++)
      if (grid[y][x] === 0) cells.push({ x, y });
  return cells;
}

// BFS distance field from a cell — used to place shards/exit far from spawn.
export function distanceField(grid, sx, sy) {
  const rows = grid.length, cols = grid[0].length;
  const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const q = [[sx, sy]];
  dist[sy][sx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && grid[ny][nx] === 0 && dist[ny][nx] === -1) {
        dist[ny][nx] = dist[y][x] + 1;
        q.push([nx, ny]);
      }
    }
  }
  return dist;
}
