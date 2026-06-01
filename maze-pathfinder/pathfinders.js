import { key, neighbors4, CELL } from './grid.js';

function reconstructPath(cameFrom, start, end) {
  const path = [];
  let cur = end;
  while (cur && key(cur) !== key(start)) {
    path.unshift(cur);
    cur = cameFrom.get(key(cur));
  }
  if (cur) path.unshift(start);
  return path.length > 1 ? path : [];
}

export function bfs(grid, start, end) {
  const visitedOrder = [];
  const cameFrom = new Map();
  const queue = [start];
  const seen = new Set([key(start)]);

  while (queue.length) {
    const cell = queue.shift();
    visitedOrder.push(cell);
    if (key(cell) === key(end)) break;
    for (const n of neighbors4(grid, cell)) {
      if (seen.has(key(n)) || n.type === CELL.WALL) continue;
      seen.add(key(n));
      cameFrom.set(key(n), cell);
      queue.push(n);
    }
  }
  return { visitedOrder, path: reconstructPath(cameFrom, start, end) };
}

class MinHeap {
  constructor() { this.h = []; }
  push(item, priority) { this.h.push({ item, priority }); this.h.sort((a, b) => a.priority - b.priority); }
  pop() { return this.h.shift()?.item; }
  get size() { return this.h.length; }
}

export function dijkstra(grid, start, end) {
  const visitedOrder = [];
  const cameFrom = new Map();
  const dist = new Map();
  const pq = new MinHeap();

  dist.set(key(start), 0);
  pq.push(start, 0);

  while (pq.size) {
    const cell = pq.pop();
    const cellKey = key(cell);
    if (visitedOrder.some(v => key(v) === cellKey)) continue;
    visitedOrder.push(cell);
    if (cellKey === key(end)) break;

    const d = dist.get(cellKey) ?? Infinity;
    for (const n of neighbors4(grid, cell)) {
      if (n.type === CELL.WALL) continue;
      const nd = d + (n.weight ?? 1);
      const nk = key(n);
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        cameFrom.set(nk, cell);
        pq.push(n, nd);
      }
    }
  }
  return { visitedOrder, path: reconstructPath(cameFrom, start, end) };
}

function manhattan(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c); }

export function astar(grid, start, end) {
  const visitedOrder = [];
  const cameFrom = new Map();
  const g = new Map();
  const pq = new MinHeap();

  g.set(key(start), 0);
  pq.push(start, manhattan(start, end));

  while (pq.size) {
    const cell = pq.pop();
    const cellKey = key(cell);
    if (visitedOrder.some(v => key(v) === cellKey)) continue;
    visitedOrder.push(cell);
    if (cellKey === key(end)) break;

    const gCur = g.get(cellKey) ?? Infinity;
    for (const n of neighbors4(grid, cell)) {
      if (n.type === CELL.WALL) continue;
      const ng = gCur + (n.weight ?? 1);
      const nk = key(n);
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        cameFrom.set(nk, cell);
        pq.push(n, ng + manhattan(n, end));
      }
    }
  }
  return { visitedOrder, path: reconstructPath(cameFrom, start, end) };
}
