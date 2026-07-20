import { generateMaze, floorCells, distanceField } from './maze.js';
import { sfx } from './audio.js';

// All world coordinates are in tile units; the renderer scales to pixels.

export const PLAYER_SPEED = 4.4;
export const PING_SPEED = 9.5;
export const PING_COOLDOWN = 0.9;
export const LIGHT_DECAY = 1 / 3.5;
export const AMBIENT_RADIUS = 2.3;

export function levelConfig(level) {
  const step = Math.min(level - 1, 8);
  return {
    cols: 19 + step * 2,
    rows: 13 + step * 1 + (step % 2), // keep odd
    shards: Math.min(3 + Math.floor((level - 1) / 2), 6),
    lurkers: Math.min(2 + level, 9),
    lurkerSpeed: 1.5 + Math.min(level * 0.12, 1.1),
    aggroSpeed: 2.9 + Math.min(level * 0.15, 1.4),
    hearRadius: 4.5 + Math.min(level * 0.4, 4),
  };
}

export function createLevel(level, score, hearts) {
  const cfg = levelConfig(level);
  if (cfg.rows % 2 === 0) cfg.rows += 1;
  const grid = generateMaze(cfg.cols, cfg.rows);
  const spawn = { x: 1, y: 1 };
  const dist = distanceField(grid, spawn.x, spawn.y);
  const cells = floorCells(grid).filter((c) => dist[c.y][c.x] > 0);
  cells.sort((a, b) => dist[b.y][b.x] - dist[a.y][a.x]);

  // Exit = farthest reachable cell; shards spread across the distance range.
  const exitCell = cells[0];
  const shards = [];
  const used = new Set([`${exitCell.x},${exitCell.y}`]);
  for (let i = 0; i < cfg.shards; i++) {
    const band = cells.filter((c) => {
      const d = dist[c.y][c.x];
      const maxD = dist[exitCell.y][exitCell.x];
      const lo = (i + 0.5) / (cfg.shards + 1) * maxD;
      return d > lo && !used.has(`${c.x},${c.y}`);
    });
    const pick = band.length ? band[Math.floor(Math.random() * Math.min(band.length, 12))] : cells[i + 1];
    used.add(`${pick.x},${pick.y}`);
    shards.push({ x: pick.x + 0.5, y: pick.y + 0.5, taken: false, phase: Math.random() * 7 });
  }

  const lurkers = [];
  const farCells = cells.filter((c) => dist[c.y][c.x] > 6 && !used.has(`${c.x},${c.y}`));
  for (let i = 0; i < cfg.lurkers; i++) {
    const c = farCells[Math.floor(Math.random() * farCells.length)] || cells[cells.length - 1];
    lurkers.push({
      x: c.x + 0.5, y: c.y + 0.5, r: 0.34,
      dir: Math.random() * Math.PI * 2,
      state: 'wander', targetX: 0, targetY: 0, aggroT: 0,
      phase: Math.random() * 7,
    });
  }

  return {
    level, score, hearts, cfg, grid,
    cols: cfg.cols, rows: cfg.rows,
    player: { x: spawn.x + 0.5, y: spawn.y + 0.5, r: 0.28, invuln: 0, moving: false },
    exit: { x: exitCell.x + 0.5, y: exitCell.y + 0.5, open: false },
    shards, lurkers,
    pings: [],
    light: new Float32Array(cfg.cols * cfg.rows),
    pingCooldown: 0,
    time: 0,
    shake: 0,
    heartbeatLevel: 0,
    events: [],
  };
}

function isWall(state, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= state.cols || ty >= state.rows) return true;
  return state.grid[ty][tx] === 1;
}

// Circle-vs-grid movement with axis separation so you slide along walls.
function moveCircle(state, ent, dx, dy) {
  const tryAxis = (nx, ny) => {
    const r = ent.r;
    const minTx = Math.floor(nx - r), maxTx = Math.floor(nx + r);
    const minTy = Math.floor(ny - r), maxTy = Math.floor(ny + r);
    for (let ty = minTy; ty <= maxTy; ty++)
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!isWall(state, tx, ty)) continue;
        const cx = Math.max(tx, Math.min(nx, tx + 1));
        const cy = Math.max(ty, Math.min(ny, ty + 1));
        if ((nx - cx) ** 2 + (ny - cy) ** 2 < r * r) return false;
      }
    return true;
  };
  let blocked = false;
  if (tryAxis(ent.x + dx, ent.y)) ent.x += dx; else blocked = true;
  if (tryAxis(ent.x, ent.y + dy)) ent.y += dy; else blocked = true;
  return !blocked;
}

export function emitPing(state, x, y) {
  if (state.pingCooldown > 0) return false;
  state.pingCooldown = PING_COOLDOWN;
  const maxR = Math.hypot(state.cols, state.rows);
  state.pings.push({ x, y, r: 0, maxR });
  sfx.ping();

  // Lurkers that hear it converge on the ping origin — not on you.
  for (const l of state.lurkers) {
    if (Math.hypot(l.x - x, l.y - y) < state.cfg.hearRadius) {
      l.state = 'aggro';
      l.targetX = x;
      l.targetY = y;
      l.aggroT = 4.5;
    }
  }
  return true;
}

function updatePings(state, dt) {
  for (const p of state.pings) {
    const prevR = p.r;
    p.r += PING_SPEED * dt;
    // Illuminate every tile the wavefront crossed this frame.
    for (let ty = 0; ty < state.rows; ty++) {
      for (let tx = 0; tx < state.cols; tx++) {
        const d = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y);
        if (d >= prevR - 0.6 && d <= p.r + 0.6) {
          const fade = 1 - d / p.maxR * 0.55; // far tiles get dimmer light
          const idx = ty * state.cols + tx;
          if (fade > state.light[idx]) state.light[idx] = fade;
        }
      }
    }
  }
  state.pings = state.pings.filter((p) => p.r < p.maxR);
  for (let i = 0; i < state.light.length; i++) {
    if (state.light[i] > 0) state.light[i] = Math.max(0, state.light[i] - LIGHT_DECAY * dt);
  }
}

function updateLurkers(state, dt) {
  const p = state.player;
  let nearest = Infinity;

  for (const l of state.lurkers) {
    const distToPlayer = Math.hypot(l.x - p.x, l.y - p.y);
    nearest = Math.min(nearest, distToPlayer);

    // Blind, but they feel vibrations: a moving player very close by gets chased.
    if (p.moving && distToPlayer < 1.8 && p.invuln <= 0) {
      l.state = 'aggro';
      l.targetX = p.x;
      l.targetY = p.y;
      l.aggroT = Math.max(l.aggroT, 1.2);
    }

    if (l.state === 'aggro') {
      l.aggroT -= dt;
      const dx = l.targetX - l.x, dy = l.targetY - l.y;
      const d = Math.hypot(dx, dy);
      if (l.aggroT <= 0 || d < 0.4) {
        l.state = 'wander';
        l.dir = Math.random() * Math.PI * 2;
      } else {
        l.dir = Math.atan2(dy, dx);
        const s = state.cfg.aggroSpeed * dt;
        if (!moveCircle(state, l, Math.cos(l.dir) * s, Math.sin(l.dir) * s)) {
          // Nudge around corners instead of grinding into the wall.
          l.dir += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
          moveCircle(state, l, Math.cos(l.dir) * s, Math.sin(l.dir) * s);
        }
      }
    } else {
      l.dir += (Math.random() - 0.5) * 2.4 * dt;
      const s = state.cfg.lurkerSpeed * dt;
      if (!moveCircle(state, l, Math.cos(l.dir) * s, Math.sin(l.dir) * s)) {
        l.dir = Math.random() * Math.PI * 2;
      }
    }

    // Contact
    if (p.invuln <= 0 && distToPlayer < p.r + l.r) {
      state.hearts -= 1;
      p.invuln = 2.2;
      state.shake = 0.5;
      sfx.hurt();
      state.events.push(state.hearts <= 0 ? 'dead' : 'hurt');
      // Scatter: everything backs off into the dark.
      for (const o of state.lurkers) {
        o.state = 'wander';
        o.aggroT = 0;
        const away = Math.atan2(o.y - p.y, o.x - p.x);
        for (let k = 0; k < 40; k++) {
          if (!moveCircle(state, o, Math.cos(away) * 0.1, Math.sin(away) * 0.1)) break;
        }
      }
    }
  }

  state.heartbeatLevel = Math.max(0, 1 - nearest / 4.5);
  sfx.heartbeat(state.heartbeatLevel);
}

export function update(state, dt, axis, wantPing) {
  state.time += dt;
  state.pingCooldown = Math.max(0, state.pingCooldown - dt);
  state.shake = Math.max(0, state.shake - dt * 1.6);
  const p = state.player;
  p.invuln = Math.max(0, p.invuln - dt);

  p.moving = axis.x !== 0 || axis.y !== 0;
  moveCircle(state, p, axis.x * PLAYER_SPEED * dt, axis.y * PLAYER_SPEED * dt);

  if (wantPing) emitPing(state, p.x, p.y);

  updatePings(state, dt);
  updateLurkers(state, dt);

  for (const s of state.shards) {
    if (!s.taken && Math.hypot(s.x - p.x, s.y - p.y) < 0.55) {
      s.taken = true;
      state.score += 100;
      sfx.shard();
      if (state.shards.every((sh) => sh.taken)) {
        state.exit.open = true;
        sfx.unlock();
        state.events.push('unlocked');
      }
    }
  }

  if (state.exit.open && Math.hypot(state.exit.x - p.x, state.exit.y - p.y) < 0.6) {
    const bonus = 250 + Math.max(0, Math.floor(300 - state.time * 2));
    state.score += bonus;
    state.events.push('clear');
    sfx.clear();
  }

  return state.events.splice(0);
}
