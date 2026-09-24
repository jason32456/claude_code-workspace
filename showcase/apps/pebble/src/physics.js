import { STONE_R, HALF_W, BACK_LINE, SHEET_END, RELEASE_Y, FAR_TEE } from './constants.js';

export const G = 9.81;
export const MU = 0.0085;
export const SWEEP_FRICTION = 0.12;
export const SWEEP_CURL = 0.5;
export const CURL_K = 0.0115;
export const CURL_V0 = 0.35;
export const OMEGA_REF = 0.6;
export const RESTITUTION = 0.85;
export const STOP_V = 0.004;
export const DT = 1 / 240;

export function makeStone(id, team) {
  return { id, team, x: 0, y: 0, vx: 0, vy: 0, omega: 0, angle: 0, inPlay: false, moving: false, out: null };
}

export function cloneStones(stones) {
  return stones.map((s) => ({ ...s }));
}

// Direction from the release point to the broom, scaled to the release speed.
export function releaseVelocity(broomX, v0) {
  const dx = broomX;
  const dy = FAR_TEE - RELEASE_Y;
  const len = Math.hypot(dx, dy);
  return { vx: (v0 * dx) / len, vy: (v0 * dy) / len };
}

export function deliver(stone, broomX, v0, spin) {
  const { vx, vy } = releaseVelocity(broomX, v0);
  stone.x = 0;
  stone.y = RELEASE_Y;
  stone.vx = vx;
  stone.vy = vy;
  stone.omega = spin * OMEGA_REF;
  stone.inPlay = true;
  stone.moving = true;
  stone.out = null;
}

// One integration step. sweep is 0..1 and applies only to the stone with id sweepId.
// ctx collects what happened: hits on the shooter, collision impulses, stones leaving play.
export function step(stones, dt, sweep, sweepId, ctx) {
  for (const s of stones) {
    if (!s.inPlay || !s.moving) continue;
    const v = Math.hypot(s.vx, s.vy);
    if (v < STOP_V) {
      s.vx = s.vy = 0;
      s.moving = false;
      s.omega = 0;
      continue;
    }
    const ux = s.vx / v;
    const uy = s.vy / v;
    const sw = s.id === sweepId ? sweep : 0;
    const dec = MU * G * (1 - SWEEP_FRICTION * sw);
    const spin = Math.max(-1, Math.min(1, s.omega / OMEGA_REF));
    const lat = (CURL_K * spin * (1 - SWEEP_CURL * sw)) / (v + CURL_V0);
    // clockwise (omega > 0) seen from above curls to the right of travel
    const nv = v - dec * dt;
    if (nv <= STOP_V) {
      s.x += s.vx * dt * 0.5;
      s.y += s.vy * dt * 0.5;
      s.vx = s.vy = 0;
      s.moving = false;
      s.omega = 0;
      continue;
    }
    let vx = ux * nv + lat * uy * dt;
    let vy = uy * nv - lat * ux * dt;
    const k = nv / Math.hypot(vx, vy);
    s.vx = vx * k;
    s.vy = vy * k;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.angle += s.omega * dt * (0.4 + Math.min(1, v / 2));
  }

  for (let i = 0; i < stones.length; i++) {
    const a = stones[i];
    if (!a.inPlay) continue;
    for (let j = i + 1; j < stones.length; j++) {
      const b = stones[j];
      if (!b.inPlay || (!a.moving && !b.moving)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = 2 * STONE_R;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      const push = (min - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      if (rel <= 0) continue;
      const j2 = ((1 + RESTITUTION) / 2) * rel;
      a.vx -= j2 * nx;
      a.vy -= j2 * ny;
      b.vx += j2 * nx;
      b.vy += j2 * ny;
      a.moving = b.moving = true;
      a.omega *= 0.35;
      b.omega *= 0.35;
      if (ctx) {
        ctx.impacts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, impulse: j2 });
        if (a.id === ctx.shooterId || b.id === ctx.shooterId) ctx.shooterHit = true;
      }
    }
  }

  for (const s of stones) {
    if (!s.inPlay) continue;
    let out = null;
    if (Math.abs(s.x) + STONE_R > HALF_W) out = 'side';
    else if (s.y - STONE_R > BACK_LINE) out = 'back';
    else if (s.y > SHEET_END) out = 'back';
    if (out) {
      s.inPlay = false;
      s.moving = false;
      s.out = out;
      if (ctx) ctx.removed.push({ id: s.id, reason: out });
    }
  }
}

export function anyMoving(stones) {
  return stones.some((s) => s.inPlay && s.moving);
}

export function newCtx(shooterId) {
  return { shooterId, shooterHit: false, impacts: [], removed: [] };
}

// Runs a throw to rest. sweepFn(stone, t) -> 0..1 lets a caller model sweeping.
export function simulate(stones, shooterId, { dt = DT, maxT = 60, sweepFn = null, trace = null } = {}) {
  const ctx = newCtx(shooterId);
  let t = 0;
  const shooter = stones.find((s) => s.id === shooterId);
  while (t < maxT && anyMoving(stones)) {
    const sw = sweepFn ? sweepFn(shooter, t) : 0;
    step(stones, dt, sw, shooterId, ctx);
    if (trace) trace(stones, t, sw);
    t += dt;
  }
  ctx.time = t;
  return ctx;
}
