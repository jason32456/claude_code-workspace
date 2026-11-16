// The compositor. Pure integer arithmetic, no DOM, so the statistical audit in
// tools/eye-verify.mjs can run it in Node. The one rendering rule lives here and
// nowhere else; if a single frame could leak a shape, this file is why.

const GROUND_ID = 'ground';
const SIMMER_SCALE = 1 << 24;

function fmix(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h;
}

function hashString(str) {
  let h = 0x811c9dc5;
  for (let k = 0; k < str.length; k++) {
    h ^= str.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  return fmix(h ^ 0x9e3779b9);
}

// Two full finalizer rounds, one per axis, so neighbouring cells share no
// structure a still frame could show as streaks or a lattice.
function cellBit(seed, i, j) {
  let h = fmix(seed ^ Math.imul(i, 0x9e3779b1));
  h = fmix(h ^ Math.imul(j, 0x85ebca77));
  return h >>> 31;
}

export function createCore({ cols, rows }) {
  const cells = cols * rows;
  const bits = new Uint8Array(cells);
  const owner = new Uint16Array(cells);
  const result = { bits, owner };
  const seedCache = new Map();
  let frame = 0;

  // Slot 0 is the ground, slot k + 1 is items[k]. Grown only when a scene has
  // more items than any before it, so steady-state composing allocates nothing.
  let capacity = 0;
  let seeds, shiftX, shiftY, simmerAt;
  const growTo = (n) => {
    if (n <= capacity) return;
    capacity = Math.max(n, capacity * 2, 16);
    seeds = new Int32Array(capacity);
    shiftX = new Int32Array(capacity);
    shiftY = new Int32Array(capacity);
    simmerAt = new Int32Array(capacity);
  };
  growTo(16);

  function seedOf(id) {
    let seed = seedCache.get(id);
    if (seed === undefined) {
      seed = hashString(String(id));
      seedCache.set(id, seed);
    }
    return seed;
  }

  function N(id, i, j) {
    return cellBit(seedOf(id), i, j);
  }

  function compose(scene) {
    frame = (frame + 1) | 0;
    const items = scene.items || [];
    const count = Math.min(items.length, 0xfffe);
    growTo(count + 1);

    const ground = scene.ground;
    seeds[0] = seedOf(GROUND_ID);
    shiftX[0] = ground ? Math.round(ground.u || 0) : 0;
    shiftY[0] = ground ? Math.round(ground.v || 0) : 0;
    simmerAt[0] = 0;

    owner.fill(0);

    for (let k = 0; k < count; k++) {
      const item = items[k];
      const mask = item.mask;
      const slot = k + 1;
      const x = Math.round(item.x || 0);
      const y = Math.round(item.y || 0);
      const p = item.simmer > 0 ? Math.min(1, item.simmer) : 0;

      seeds[slot] = seedOf(item.id);
      shiftX[slot] = x + Math.round(item.u || 0);
      shiftY[slot] = y + Math.round(item.v || 0);
      simmerAt[slot] = Math.floor(p * SIMMER_SCALE);

      if (!mask) continue;
      const w = mask.w;
      const data = mask.data;
      const cx0 = Math.max(0, x);
      const cx1 = Math.min(cols, x + w);
      const cy0 = Math.max(0, y);
      const cy1 = Math.min(rows, y + mask.h);
      for (let cy = cy0; cy < cy1; cy++) {
        const maskRow = (cy - y) * w - x;
        const gridRow = cy * cols;
        for (let cx = cx0; cx < cx1; cx++) {
          if (data[maskRow + cx]) owner[gridRow + cx] = slot;
        }
      }
    }

    const frameSalt = fmix(frame ^ 0x68e31da4);
    for (let cy = 0; cy < rows; cy++) {
      const gridRow = cy * cols;
      for (let cx = 0; cx < cols; cx++) {
        const idx = gridRow + cx;
        const slot = owner[idx];
        let bit = cellBit(seeds[slot], cx - shiftX[slot], cy - shiftY[slot]);
        const threshold = simmerAt[slot];
        if (threshold !== 0) {
          const h = fmix(frameSalt ^ Math.imul(idx, 0x27d4eb2f));
          if ((h >>> 8) < threshold) bit = fmix(h ^ 0x5bd1e995) >>> 31;
        }
        bits[idx] = bit;
      }
    }
    return result;
  }

  function tally() {
    let light = 0;
    let totalInside = 0;
    let lightInside = 0;
    for (let idx = 0; idx < cells; idx++) {
      const bit = bits[idx];
      light += bit;
      if (owner[idx] !== 0) {
        totalInside++;
        lightInside += bit;
      }
    }
    return { light, total: cells, lightInside, totalInside };
  }

  return { cols, rows, bits, owner, compose, tally, N };
}
