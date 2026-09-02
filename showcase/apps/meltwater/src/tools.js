import { N, CELL_AREA, idx } from './grid.js';

export const WALL_H = 3.0;
const DIG_RATE = 1.5;
const RAISE_RATE = 1.2;
const STRUCT_BRUSH = 1.35;
const TIMBER_PER_CELL = 1;
const MAX_GATES = 4;

// Cut and fill. Digging grows the spoil pile, raising spends it, and both count
// against the season's earth-moved cap — at triple rate once the melt is on.
export class Tools {
  constructor(world) {
    this.world = world;
    this.tool = 'dig';
    this.radius = 6;
    this.minR = 2;
    this.maxR = 14;
    this.spoil = world.level.spoil;
    this.work = 0;
    this.timber = world.level.timber;
    this.gateStroke = null;
    this.dirty = true;
    this.blocked = '';
  }

  available() {
    return {
      dig: true,
      raise: true,
      dam: this.world.level.timber > 0,
      gate: this.world.level.timber > 0,
      erase: this.world.level.timber > 0,
    };
  }

  startStroke() {
    this.gateStroke = null;
  }

  endStroke() {
    this.gateStroke = null;
  }

  setRadius(delta) {
    this.radius = Math.max(this.minR, Math.min(this.maxR, this.radius + delta));
  }

  apply(gx, gz, dt, melting) {
    this.blocked = '';
    if (this.tool === 'dig' || this.tool === 'raise') return this.sculpt(gx, gz, dt, melting);
    if (this.tool === 'dam') return this.structure(gx, gz, false);
    if (this.tool === 'gate') return this.structure(gx, gz, true);
    if (this.tool === 'erase') return this.erase(gx, gz);
    return 0;
  }

  sculpt(gx, gz, dt, melting) {
    const { terrain, base, locked } = this.world;
    const r = this.radius;
    const dig = this.tool === 'dig';
    const rate = (dig ? DIG_RATE : RAISE_RATE) * Math.min(0.05, dt);
    const costMul = melting ? 3 : 1;
    const workLeft = (this.world.level.work - this.work) / costMul;
    if (workLeft <= 0) {
      this.blocked = 'work';
      return 0;
    }

    const x0 = Math.max(0, Math.floor(gx - r));
    const x1 = Math.min(N - 1, Math.ceil(gx + r));
    const z0 = Math.max(0, Math.floor(gz - r));
    const z1 = Math.min(N - 1, Math.ceil(gz + r));

    let moved = 0;
    let budget = Math.min(workLeft, dig ? Infinity : this.spoil);
    if (!dig && budget <= 0.01) {
      this.blocked = 'spoil';
      return 0;
    }

    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - gx, z - gz);
        if (d > r) continue;
        const i = idx(x, z);
        if (locked[i]) continue;
        const w = Math.cos((d / r) * Math.PI * 0.5) ** 1.6;
        let amount = rate * w;
        if (amount * CELL_AREA > budget) amount = budget / CELL_AREA;
        if (amount <= 0) break;
        if (dig) {
          const floor = -4;
          amount = Math.min(amount, Math.max(0, terrain[i] - floor));
          terrain[i] -= amount;
        } else {
          terrain[i] += amount;
        }
        // Erosion is measured against the ground as the player last shaped it,
        // so silt can never fill a fresh channel back above where it was cut.
        base[i] = terrain[i];
        const vol = amount * CELL_AREA;
        moved += vol;
        budget -= vol;
      }
    }

    if (moved > 0) {
      this.spoil += dig ? moved : -moved;
      this.work += moved * costMul;
      this.dirty = true;
    } else if (!dig) {
      this.blocked = 'spoil';
    }
    return moved;
  }

  structure(gx, gz, isGate) {
    const { wall, wallMax, strain, gateOf, locked, gates, zone } = this.world;
    if (this.timber < TIMBER_PER_CELL) {
      this.blocked = 'timber';
      return 0;
    }
    if (isGate && this.gateStroke === null) {
      if (gates.length >= MAX_GATES) {
        this.blocked = 'gates';
        return 0;
      }
      this.gateStroke = gates.length;
      gates.push({ open: false, cells: [] });
    }

    const r = STRUCT_BRUSH;
    let placed = 0;
    for (let z = Math.max(0, Math.floor(gz - r)); z <= Math.min(N - 1, Math.ceil(gz + r)); z++) {
      for (let x = Math.max(0, Math.floor(gx - r)); x <= Math.min(N - 1, Math.ceil(gx + r)); x++) {
        if (Math.hypot(x - gx, z - gz) > r) continue;
        const i = idx(x, z);
        if (locked[i] || zone[i] === 2) continue;
        if (wall[i] > 0.05 && !(isGate && gateOf[i] < 0)) continue;
        if (this.timber < TIMBER_PER_CELL) {
          this.blocked = 'timber';
          break;
        }
        if (wall[i] <= 0.05) this.timber -= TIMBER_PER_CELL;
        wall[i] = WALL_H;
        wallMax[i] = WALL_H;
        strain[i] = 0;
        if (isGate) {
          gateOf[i] = this.gateStroke;
          gates[this.gateStroke].cells.push(i);
          if (gates[this.gateStroke].open) wall[i] = 0.35;
        } else {
          gateOf[i] = -1;
        }
        placed++;
      }
    }
    if (placed) this.dirty = true;
    return placed;
  }

  erase(gx, gz) {
    const { wall, wallMax, strain, gateOf, gates } = this.world;
    const r = STRUCT_BRUSH + 0.8;
    let removed = 0;
    for (let z = Math.max(0, Math.floor(gz - r)); z <= Math.min(N - 1, Math.ceil(gz + r)); z++) {
      for (let x = Math.max(0, Math.floor(gx - r)); x <= Math.min(N - 1, Math.ceil(gx + r)); x++) {
        if (Math.hypot(x - gx, z - gz) > r) continue;
        const i = idx(x, z);
        if (wall[i] <= 0.05) continue;
        wall[i] = 0;
        wallMax[i] = 0;
        strain[i] = 0;
        const g = gateOf[i];
        if (g >= 0 && gates[g]) gates[g].cells = gates[g].cells.filter((c) => c !== i);
        gateOf[i] = -1;
        this.timber += TIMBER_PER_CELL * 0.7;
        removed++;
      }
    }
    if (removed) {
      // Drop any gate group that no longer owns cells, keeping the 1–4 keys
      // pointing at what the player can still see.
      for (let g = gates.length - 1; g >= 0; g--) {
        if (gates[g].cells.length === 0) {
          gates.splice(g, 1);
          for (let i = 0; i < gateOf.length; i++) if (gateOf[i] > g) gateOf[i] -= 1;
        }
      }
      this.dirty = true;
    }
    return removed;
  }

  toggleGate(n) {
    const g = this.world.gates[n];
    if (!g) return null;
    g.open = !g.open;
    for (const i of g.cells) this.world.wall[i] = g.open ? 0.35 : this.world.wallMax[i];
    this.dirty = true;
    return g.open;
  }
}

// Dams hold until the head of water behind them beats their strength, then go
// all at once — and take their neighbours part of the way with them.
export function updateStructures(world, water, dt, onBreach) {
  const { wall, wallMax, terrain, strain, gateOf, gates } = world;
  const depth = water.depth;
  let breached = 0;

  for (let z = 1; z < N - 1; z++) {
    for (let x = 1; x < N - 1; x++) {
      const i = z * N + x;
      if (wall[i] <= 0.05 || wallMax[i] <= 0.05) continue;
      const g = gateOf[i];
      if (g >= 0 && gates[g] && gates[g].open) continue;

      const base = terrain[i];
      let head = 0;
      for (const j of [i - 1, i + 1, i - N, i + N]) {
        if (depth[j] < 0.02) continue;
        const h = terrain[j] + wall[j] + depth[j] - base;
        if (h > head) head = h;
      }
      const ratio = head / wallMax[i];
      if (ratio > 0.62) strain[i] += dt * (ratio - 0.62) * 1.35;
      else if (strain[i] > 0) strain[i] = Math.max(0, strain[i] - dt * 0.04);

      if (strain[i] >= 1) {
        wall[i] = 0;
        wallMax[i] = 0;
        strain[i] = 0;
        if (g >= 0 && gates[g]) gates[g].cells = gates[g].cells.filter((c) => c !== i);
        gateOf[i] = -1;
        for (const j of [i - 1, i + 1, i - N, i + N]) if (wall[j] > 0.05) strain[j] += 0.45;
        breached++;
      }
    }
  }
  if (breached) onBreach?.(breached);
  return breached;
}
