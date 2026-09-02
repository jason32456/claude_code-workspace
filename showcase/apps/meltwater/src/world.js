import { N, CELL_AREA, idx, makeNoise } from './grid.js';
import { LEVELS } from './levels.js';

export const ZONE_NONE = 0;
export const ZONE_FIELD = 1;
export const ZONE_VILLAGE = 2;
export const ZONE_RESERVOIR = 3;

function clampRect(r) {
  return {
    x0: Math.max(0, r.x | 0),
    z0: Math.max(0, r.z | 0),
    x1: Math.min(N - 1, (r.x + r.w) | 0),
    z1: Math.min(N - 1, (r.z + r.d) | 0),
  };
}

function forRect(rect, fn) {
  const r = clampRect(rect);
  for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) fn(x, z, idx(x, z));
}

function rectMean(h, rect) {
  let sum = 0;
  let n = 0;
  forRect(rect, (x, z, i) => {
    sum += h[i];
    n++;
  });
  return n ? sum / n : 0;
}

// ---------------------------------------------------------------- shaping ops

function baseValley(h, noise, o) {
  const drop = o.drop ?? 30;
  const floor = o.floor ?? 1.5;
  for (let z = 0; z < N; z++) {
    const t = z / (N - 1);
    const along = drop * (1 - t) * (0.55 + 0.45 * (1 - t)) + floor;
    const cx = o.centre(z);
    const half = o.halfWidth(z);
    for (let x = 0; x < N; x++) {
      const dx = Math.abs(x - cx) / half;
      let cross;
      if (dx < 1) cross = 1.7 * dx * dx;
      else cross = 1.7 + (dx - 1) * (dx - 1) * 34 + (dx - 1) * 6;
      const grain = noise(x, z, 0.045, 4) * (o.grain ?? 2.2) + noise(x, z, 0.16, 2) * 0.55;
      h[idx(x, z)] = along + Math.min(cross, 19) + grain;
    }
  }
}

function ridge(h, o) {
  const { x0, z0, x1, z1, height, width } = o;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz || 1;
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      let t = ((x - x0) * dx + (z - z0) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = x0 + dx * t;
      const pz = z0 + dz * t;
      const dist = Math.hypot(x - px, z - pz);
      if (dist > width) continue;
      const f = Math.cos((dist / width) * Math.PI * 0.5);
      const taper = o.taper ? Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.5 : 1;
      h[idx(x, z)] += height * f * f * taper;
    }
  }
}

function basin(h, o) {
  const { x, z, r, depth } = o;
  for (let zz = Math.max(0, z - r - 4); zz <= Math.min(N - 1, z + r + 4); zz++) {
    for (let xx = Math.max(0, x - r - 4); xx <= Math.min(N - 1, x + r + 4); xx++) {
      const d = Math.hypot(xx - x, zz - z) / r;
      const i = idx(xx, zz);
      if (d < 1) h[i] -= depth * (Math.cos(d * Math.PI * 0.5) ** 2);
      else if (d < 1.35 && o.rim) h[i] += o.rim * (1 - (d - 1) / 0.35);
    }
  }
}

function shelf(h, rect, o = {}) {
  const target = o.height !== undefined ? o.height : rectMean(h, rect) + (o.raise ?? 0);
  const feather = o.feather ?? 5;
  const r = clampRect(rect);
  for (let z = r.z0 - feather; z <= r.z1 + feather; z++) {
    for (let x = r.x0 - feather; x <= r.x1 + feather; x++) {
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      const dx = Math.max(0, Math.max(r.x0 - x, x - r.x1));
      const dz = Math.max(0, Math.max(r.z0 - z, z - r.z1));
      const d = Math.max(dx, dz);
      const w = d === 0 ? 1 : Math.max(0, 1 - d / feather) ** 1.5;
      const i = idx(x, z);
      h[i] = h[i] * (1 - w) + target * w;
    }
  }
  return target;
}

// A terrace paddy: flat bed, lip on three sides, open uphill so it can fill.
function paddy(h, rect, o = {}) {
  const bed = shelf(h, rect, { height: o.height, feather: o.feather ?? 8 }) - (o.dish ?? 0.3);
  const r = clampRect(rect);
  const lip = o.lip ?? 0.9;
  // The uphill end of a paddy is open, and so is the uphill third of each side,
  // so water that arrives anywhere along the top of the terrace can get in.
  const openTo = r.z0 + (r.z1 - r.z0) * 0.36;
  for (let z = r.z0; z <= r.z1; z++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const side = (x === r.x0 || x === r.x1) && z > openTo;
      const edge = side || z === r.z1 ? lip : 0;
      h[idx(x, z)] = bed + edge;
    }
  }
  return bed;
}

// ---------------------------------------------------------------- world build

export function buildWorld(levelIndex) {
  const level = LEVELS[levelIndex];
  const n = N * N;
  const noise = makeNoise(level.seed);

  const terrain = new Float32Array(n);
  const base = new Float32Array(n);
  const softness = new Float32Array(n).fill(0.42);
  const locked = new Uint8Array(n);
  const zone = new Uint8Array(n);
  const fieldOf = new Int8Array(n).fill(-1);
  const wall = new Float32Array(n);
  const wallMax = new Float32Array(n);
  const strain = new Float32Array(n);
  const gateOf = new Int8Array(n).fill(-1);

  baseValley(terrain, noise, level.valley);
  for (const op of level.shape || []) {
    if (op.kind === 'ridge') ridge(terrain, op);
    else if (op.kind === 'basin') basin(terrain, op);
    else if (op.kind === 'shelf') shelf(terrain, op.rect, op);
  }

  // Softness: rock on the steep walls and up at the head, soil on the floor,
  // plus any explicitly soft ground the level asks for.
  for (let z = 1; z < N - 1; z++) {
    for (let x = 1; x < N - 1; x++) {
      const i = idx(x, z);
      const slope = Math.max(
        Math.abs(terrain[i + 1] - terrain[i - 1]),
        Math.abs(terrain[i + N] - terrain[i - N])
      );
      let s = 0.55 - slope * 0.5;
      if (terrain[i] > 26) s -= 0.35;
      softness[i] = Math.max(0.04, Math.min(1, s));
    }
  }
  for (const soft of level.soft || []) {
    forRect(soft, (x, z, i) => {
      softness[i] = Math.min(1, softness[i] + (soft.amount ?? 0.5));
    });
  }

  // Fields.
  const fields = (level.fields || []).map((f, k) => {
    const bed = paddy(terrain, f, f);
    forRect(f, (x, z, i) => {
      zone[i] = ZONE_FIELD;
      fieldOf[i] = k;
      locked[i] = 1;
      softness[i] = 0.1;
    });
    let cells = [];
    forRect(f, (x, z, i) => {
      if (
        x > f.x &&
        x < f.x + f.w &&
        z > f.z &&
        z < f.z + f.d
      )
        cells.push(i);
    });
    if (!cells.length) forRect(f, (x, z, i) => cells.push(i));
    return {
      ...f,
      index: k,
      bed,
      cells: Int32Array.from(cells),
      soaked: 0,
      wetFrac: 0,
      done: false,
    };
  });

  // Village.
  const villages = (level.villages || []).map((v) => {
    const pad = shelf(terrain, v, { raise: v.raise ?? 0.7, feather: 5 });
    forRect(v, (x, z, i) => {
      zone[i] = ZONE_VILLAGE;
      locked[i] = 1;
      softness[i] = 0.06;
      terrain[i] = pad;
    });
    const cells = [];
    forRect(v, (x, z, i) => cells.push(i));
    const houses = [];
    const count = v.houses ?? 7;
    const cols = Math.max(2, Math.round(Math.sqrt(count * (v.w / v.d))));
    const rows = Math.ceil(count / cols);
    for (let k = 0; k < count; k++) {
      const cx = k % cols;
      const cz = (k / cols) | 0;
      const jitter = ((k * 37) % 11) / 11 - 0.5;
      houses.push({
        x: v.x + 2.5 + ((v.w - 5) * (cx + 0.5)) / cols + jitter,
        z: v.z + 2.5 + ((v.d - 5) * (cz + 0.5)) / rows + jitter * 0.8,
        y: pad,
        rot: ((k * 1.9) % Math.PI) * 0.25,
      });
    }
    return { ...v, pad, cells: Int32Array.from(cells), houses, damage: 0, flooded: 0 };
  });

  // Reservoir zone: anything inside the marked basin below its rim counts as
  // banked water at settlement.
  const reservoirs = (level.reservoirs || []).map((r) => {
    const cells = [];
    for (let z = Math.max(0, r.z - r.r); z <= Math.min(N - 1, r.z + r.r); z++) {
      for (let x = Math.max(0, r.x - r.r); x <= Math.min(N - 1, r.x + r.r); x++) {
        if (Math.hypot(x - r.x, z - r.z) <= r.r) cells.push(idx(x, z));
      }
    }
    for (const i of cells) if (zone[i] === ZONE_NONE) zone[i] = ZONE_RESERVOIR;
    return { ...r, cells: Int32Array.from(cells), held: 0 };
  });

  // Sources at the glacier mouth, and the outlet row.
  const sources = [];
  for (const s of level.sources) {
    const cells = [];
    for (let z = s.z; z < s.z + (s.d ?? 3); z++) {
      for (let x = s.x; x < s.x + s.w; x++) {
        const i = idx(x, z);
        cells.push(i);
        locked[i] = 1;
        softness[i] = 0.02;
      }
    }
    sources.push({ ...s, cells: Int32Array.from(cells) });
  }
  for (let x = 0; x < N; x++) {
    locked[idx(x, N - 1)] = 1;
    locked[idx(x, 0)] = 1;
  }

  base.set(terrain);
  const origin = Float32Array.from(terrain);

  return {
    level,
    levelIndex,
    terrain,
    base,
    origin,
    softness,
    locked,
    zone,
    fieldOf,
    wall,
    wallMax,
    strain,
    gateOf,
    fields,
    villages,
    reservoirs,
    sources,
    gates: [],
    surface: new Float32Array(n),
    noErode: new Uint8Array(n),
  };
}

// terrain + intact structures: the height water actually has to climb.
export function refreshSurface(world) {
  const { terrain, wall, surface, locked, noErode } = world;
  for (let i = 0; i < surface.length; i++) {
    surface[i] = terrain[i] + wall[i];
    noErode[i] = locked[i] || wall[i] > 0.05 ? 1 : 0;
  }
}

export function volumeOver(depth, cells) {
  let v = 0;
  for (let k = 0; k < cells.length; k++) v += depth[cells[k]];
  return v * CELL_AREA;
}
