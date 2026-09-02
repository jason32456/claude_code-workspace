import { TILE, DUNGEON_W, DUNGEON_H, MAX_FLOOR } from './constants.js';
import { idx, randInt, dist2, weightedChoice } from './utils.js';
import { createMonster, monsterPoolForDepth } from './entities.js';
import { spawnItems } from './items.js';

function carveRoom(tiles, width, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      tiles[idx(x, y, width)] = TILE.FLOOR;
    }
  }
}

function roomsOverlap(a, b, pad = 1) {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  );
}

function center(room) {
  return { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
}

function carveH(tiles, width, y, x1, x2) {
  const from = Math.min(x1, x2);
  const to = Math.max(x1, x2);
  for (let x = from; x <= to; x++) tiles[idx(x, y, width)] = TILE.FLOOR;
}

function carveV(tiles, width, x, y1, y2) {
  const from = Math.min(y1, y2);
  const to = Math.max(y1, y2);
  for (let y = from; y <= to; y++) tiles[idx(x, y, width)] = TILE.FLOOR;
}

function connect(tiles, width, a, b) {
  if (Math.random() < 0.5) {
    carveH(tiles, width, a.y, a.x, b.x);
    carveV(tiles, width, b.x, a.y, b.y);
  } else {
    carveV(tiles, width, a.x, a.y, b.y);
    carveH(tiles, width, b.y, a.x, b.x);
  }
}

function bfsDistances(tiles, width, height, start) {
  const dist = new Int32Array(width * height).fill(-1);
  const startIdx = idx(start.x, start.y, width);
  dist[startIdx] = 0;
  const queue = [startIdx];
  let qi = 0;
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  while (qi < queue.length) {
    const cur = queue[qi++];
    const cx = cur % width;
    const cy = (cur / width) | 0;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = idx(nx, ny, width);
      if (dist[ni] !== -1 || tiles[ni] === TILE.WALL) continue;
      dist[ni] = dist[cur] + 1;
      queue.push(ni);
    }
  }
  return dist;
}

function farthestTile(dist, width, height) {
  let best = -1;
  let bestIdx = 0;
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] > best) {
      best = dist[i];
      bestIdx = i;
    }
  }
  return { x: bestIdx % width, y: (bestIdx / width) | 0 };
}

function collectFloorTiles(tiles, width, height) {
  const list = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[idx(x, y, width)] === TILE.FLOOR) list.push({ x, y });
    }
  }
  return list;
}

function tileKey(t) {
  return t.y * 100000 + t.x;
}

export function generateFloor(depth) {
  const width = DUNGEON_W;
  const height = DUNGEON_H;
  const tiles = new Uint8Array(width * height).fill(TILE.WALL);
  const rooms = [];
  const targetRooms = Math.min(16, 8 + depth);
  let attempts = 0;
  while (rooms.length < targetRooms && attempts < 400) {
    attempts++;
    const w = randInt(4, 8);
    const h = randInt(4, 6);
    const x = randInt(1, width - w - 2);
    const y = randInt(1, height - h - 2);
    const room = { x, y, w, h };
    if (rooms.some((r) => roomsOverlap(room, r))) continue;
    carveRoom(tiles, width, room);
    rooms.push(room);
  }
  if (rooms.length === 0) {
    const room = { x: 2, y: 2, w: 6, h: 6 };
    carveRoom(tiles, width, room);
    rooms.push(room);
  }
  for (let i = 1; i < rooms.length; i++) {
    connect(tiles, width, center(rooms[i - 1]), center(rooms[i]));
  }

  const playerStart = center(rooms[0]);
  const dist = bfsDistances(tiles, width, height, playerStart);
  const stairsPos = farthestTile(dist, width, height);
  tiles[idx(stairsPos.x, stairsPos.y, width)] = depth === MAX_FLOOR ? TILE.EMBERHEART : TILE.STAIRS;

  const used = new Set([tileKey(playerStart), tileKey(stairsPos)]);
  const candidates = collectFloorTiles(tiles, width, height).filter(
    (t) => dist2(t.x, t.y, playerStart.x, playerStart.y) > 25 && !used.has(tileKey(t))
  );

  const monsters = [];
  if (candidates.length > 0) {
    const pool = monsterPoolForDepth(depth);
    const monsterCount = Math.min(14, 4 + depth);
    for (let i = 0; i < monsterCount; i++) {
      let attempts2 = 0;
      while (attempts2 < 100) {
        attempts2++;
        const tile = candidates[randInt(0, candidates.length - 1)];
        const key = tileKey(tile);
        if (used.has(key)) continue;
        used.add(key);
        const type = weightedChoice(pool);
        monsters.push(createMonster(type, tile.x, tile.y, depth));
        break;
      }
    }
    if (depth === MAX_FLOOR) {
      // Guarantee the Warden guards the Emberheart room.
      let attempts3 = 0;
      while (attempts3 < 100) {
        attempts3++;
        const tile = candidates[randInt(0, candidates.length - 1)];
        if (dist2(tile.x, tile.y, stairsPos.x, stairsPos.y) > 36) continue;
        const key = tileKey(tile);
        if (used.has(key)) continue;
        used.add(key);
        monsters.push(createMonster('warden', tile.x, tile.y, depth));
        break;
      }
    }
  }

  const items = candidates.length > 0 ? spawnItems(depth, candidates, used) : [];

  return { width, height, tiles, rooms, playerStart, stairsPos, monsters, items };
}
