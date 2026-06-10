import { TILE_FLOOR, TILE_WALL, TILE_SIZE } from '../constants';
import type { CTileMap } from '../components';

export function createTestRoom(): CTileMap {
  const W = 50, H = 35;
  const tiles = new Uint8Array(W * H); // 0 = floor by default

  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) tiles[y * W + x] = v;
  };
  const hwall = (x0: number, x1: number, y: number) => {
    for (let x = x0; x <= x1; x++) set(x, y, TILE_WALL);
  };
  const vwall = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) set(x, y, TILE_WALL);
  };
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    hwall(x0, x1, y0); hwall(x0, x1, y1);
    vwall(x0, y0+1, y1-1); vwall(x1, y0+1, y1-1);
  };
  const door = (x: number, y: number) => set(x, y, TILE_FLOOR);

  // Perimeter
  box(0, 0, W - 1, H - 1);

  // — Top-left room —
  box(2, 2, 14, 12);
  door(8, 2);   // top door
  door(14, 7);  // right door
  door(14, 8);
  // Internal pillar
  set(5, 5, TILE_WALL); set(5, 6, TILE_WALL);
  set(11, 5, TILE_WALL); set(11, 6, TILE_WALL);

  // — Corridor heading right —
  // open area between rooms is the default floor

  // — Mid-top room —
  box(18, 2, 30, 10);
  door(24, 2);
  door(24, 10);
  door(18, 5);
  door(30, 5);
  door(30, 6);
  // Internal wall splits room
  hwall(20, 28, 6);
  door(24, 6);

  // — Top-right room —
  box(34, 2, 48, 14);
  door(34, 8);
  door(34, 9);
  door(41, 14);
  door(42, 14);
  // Columns
  for (let i = 0; i < 3; i++) {
    set(36 + i * 4, 4, TILE_WALL);
    set(36 + i * 4, 5, TILE_WALL);
    set(36 + i * 4, 10, TILE_WALL);
    set(36 + i * 4, 11, TILE_WALL);
  }

  // — Central vertical corridor —
  vwall(16, 0, 25);
  door(16, 13); door(16, 14); door(16, 15);

  // — Left lower room —
  box(2, 16, 13, 28);
  door(13, 21); door(13, 22);
  door(7, 28); door(8, 28);
  // Zig-zag internal walls
  hwall(4, 11, 20);
  door(7, 20);
  hwall(4, 11, 24);
  door(9, 24);

  // — Center bottom open area — (no walls, natural)
  // Scattered pillar clusters
  set(20, 18, TILE_WALL); set(21, 18, TILE_WALL);
  set(20, 19, TILE_WALL);
  set(27, 20, TILE_WALL); set(27, 21, TILE_WALL);
  set(28, 21, TILE_WALL);
  set(22, 25, TILE_WALL);
  set(30, 16, TILE_WALL); set(31, 16, TILE_WALL); set(30, 17, TILE_WALL);

  // — Bottom-right maze —
  box(34, 18, 48, 33);
  door(34, 25); door(34, 26);
  door(41, 18); door(42, 18);
  // Maze walls
  hwall(36, 44, 21); door(40, 21); door(41, 21);
  vwall(40, 22, 27); door(40, 25);
  hwall(36, 40, 27); door(36, 27);
  vwall(36, 28, 32); door(36, 30);
  hwall(37, 46, 30); door(42, 30);

  // — Bottom corridor connecting rooms —
  vwall(17, 29, 34);
  door(17, 31); door(17, 32);
  hwall(18, 33, 29);
  door(25, 29);

  // suppress unused import warning
  void TILE_FLOOR;

  return {
    width: W,
    height: H,
    tiles,
    solids: new Set([TILE_WALL]),
    pixelWidth: W * TILE_SIZE,
    pixelHeight: H * TILE_SIZE,
  };
}
