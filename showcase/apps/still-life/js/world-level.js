import { diskMask, maskFromFn, rectMask, ringMask, textMask } from './shape.js';
import { SEEKER, TILE } from './world-config.js';
import { GLASS, WALL, createNav } from './world-nav.js';

const DEFAULT_PALETTE = ['#14130f', '#e9e4d8'];

export const MASKS = {
  player: diskMask(5),
  seeker: maskFromFn(17, 17, (x, y) => Math.abs(x - 8) + Math.abs(y - 8) <= 8),
  spark: diskMask(4),
  gate: ringMask(11, 7),
};

export const CARRIER_RADIUS = { player: 5, seeker: 8, spark: 4, gate: 11 };

const centre = (t) => t * TILE + TILE / 2;

function findTiles(map, ch) {
  const found = [];
  map.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) if (row[tx] === ch) found.push([tx, ty]);
  });
  return found;
}

function tileMask(nav, tiles, kind) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const [tx, ty] of tiles) {
    x0 = Math.min(x0, tx);
    y0 = Math.min(y0, ty);
    x1 = Math.max(x1, tx);
    y1 = Math.max(y1, ty);
  }
  const set = new Set(tiles.map(([tx, ty]) => ty * nav.tcols + tx));
  const mask = maskFromFn((x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, (x, y) =>
    set.has((y0 + Math.floor(y / TILE)) * nav.tcols + x0 + Math.floor(x / TILE)));
  return { mask, x: x0 * TILE, y: y0 * TILE, tiles, kind };
}

function glassPieces(nav) {
  const pieceOfTile = new Int16Array(nav.tcols * nav.trows).fill(-1);
  const pieces = [];
  for (let ty = 0; ty < nav.trows; ty++) {
    for (let tx = 0; tx < nav.tcols; tx++) {
      if (nav.kindAt(tx, ty) !== GLASS || pieceOfTile[ty * nav.tcols + tx] >= 0) continue;
      const tiles = [];
      const stack = [[tx, ty]];
      pieceOfTile[ty * nav.tcols + tx] = pieces.length;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        tiles.push([cx, cy]);
        for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + sx;
          const ny = cy + sy;
          if (nav.kindAt(nx, ny) !== GLASS || pieceOfTile[ny * nav.tcols + nx] >= 0) continue;
          pieceOfTile[ny * nav.tcols + nx] = pieces.length;
          stack.push([nx, ny]);
        }
      }
      const piece = tileMask(nav, tiles, GLASS);
      piece.id = `glass-${pieces.length}`;
      piece.cx = piece.x + piece.mask.w / 2;
      piece.cy = piece.y + piece.mask.h / 2;
      pieces.push(piece);
    }
  }
  return { pieces, pieceOfTile };
}

function seekerDef(raw, index) {
  const route = (raw.route || [raw.at]).map(([tx, ty, stop]) => ({ x: centre(tx), y: centre(ty), stop: stop !== 0 }));
  const perTick = SEEKER.perTick;
  return {
    id: `seeker-${index}`,
    x: centre(raw.at[0]),
    y: centre(raw.at[1]),
    route,
    listen: raw.listen || SEEKER.listen,
    patrolSpeed: perTick(raw.patrol || SEEKER.patrol),
    huntSpeed: perTick(raw.hunt || SEEKER.hunt),
    investigateSpeed: perTick(raw.investigate || SEEKER.investigate),
  };
}

// Everything about a level that never changes while it is played: tile map,
// masks, item layout. Masks are built once so the Eye can cache on identity.
export function buildLevel(def, cols, rows) {
  const tcols = cols / TILE;
  const trows = rows / TILE;
  if (def.map.length !== trows || def.map.some((row) => row.length !== tcols)) {
    throw new Error(`level "${def.name}" map must be ${tcols} x ${trows} tiles`);
  }
  const nav = createNav(def.map.map((row) => row.replace(/[@O*]/g, '.')));
  const [start] = findTiles(def.map, '@');
  const [gate] = findTiles(def.map, 'O');
  const sparks = findTiles(def.map, '*');
  const wallTiles = [];
  for (let ty = 0; ty < trows; ty++) {
    for (let tx = 0; tx < tcols; tx++) if (nav.kindAt(tx, ty) === WALL) wallTiles.push([tx, ty]);
  }
  const walls = wallTiles.length ? tileMask(nav, wallTiles, WALL) : null;
  const glass = glassPieces(nav);

  return {
    name: def.name,
    palette: def.palette || DEFAULT_PALETTE,
    nav,
    cols,
    rows,
    start: { x: centre(start[0]), y: centre(start[1]) },
    gate: gate ? { x: centre(gate[0]), y: centre(gate[1]) } : null,
    sparks: sparks.map(([tx, ty]) => ({ x: centre(tx), y: centre(ty) })),
    walls,
    glass: glass.pieces,
    pieceOfTile: glass.pieceOfTile,
    seekers: (def.seekers || []).map(seekerDef),
    rivers: (def.rivers || []).map((r, i) => ({
      id: `river-${i}`,
      x: r.tx * TILE,
      y: r.ty * TILE,
      w: r.w * TILE,
      h: r.h * TILE,
      mask: rectMask(r.w * TILE, r.h * TILE),
      vx: (r.vx || 0) / 60,
      vy: (r.vy || 0) / 60,
    })),
    ground: def.ground ? { vx: def.ground.vx / 60, vy: (def.ground.vy || 0) / 60 } : null,
    texts: (def.texts || []).map((t, i) => {
      const mask = textMask(t.str, { height: t.height || 16 });
      return { id: `text-${i}`, mask, x: t.x === undefined ? (cols - mask.w) >> 1 : t.x, y: t.y, when: t.when };
    }),
    titleMask: textMask(def.name, { height: 20 }),
    sweepMask: rectMask(3, rows),
  };
}
