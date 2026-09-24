import { FAR_TEE, FAR_HOG, HOUSE_R, RING4, STONE_R, STONES_PER_TEAM } from './constants.js';
import { cloneStones, deliver, simulate, makeStone } from './physics.js';
import { adjudicate, distToButton, inHouse, inFGZ, scoreEnd } from './rules.js';

export const LEVELS = {
  club: { sv: 0.06, sb: 0.12, samples: 2, label: 'Club' },
  provincial: { sv: 0.035, sb: 0.07, samples: 3, label: 'Provincial' },
  olympic: { sv: 0.018, sb: 0.035, samples: 3, label: 'Olympic' },
};

const EVAL_DT = 1 / 90;

function gauss(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Where a lone stone stops on an empty sheet.
function restOf(broom, v0, spin, dt = EVAL_DT) {
  const s = makeStone(-1, 'x');
  deliver(s, broom, v0, spin);
  simulate([s], -1, { dt });
  return s;
}

// Lateral position of a lone stone as it passes a given y (or where it stops, if short).
function passOf(broom, v0, spin, y) {
  const s = makeStone(-1, 'x');
  deliver(s, broom, v0, spin);
  let px = null;
  simulate([s], -1, {
    dt: EVAL_DT,
    trace: (st) => {
      if (px === null && st[0].y >= y) px = st[0].x;
    },
  });
  return px ?? s.x;
}

const drawCache = new Map();

// Solve release speed and broom for a lone stone to rest at (tx, ty).
export function solveDraw(tx, ty, spin) {
  const key = `${tx.toFixed(2)},${ty.toFixed(2)},${spin}`;
  if (drawCache.has(key)) return drawCache.get(key);
  let v0 = 2.2 + (ty - FAR_TEE) * 0.035;
  let broom = tx - spin * 1.2;
  for (let i = 0; i < 6; i++) {
    const r = restOf(broom, v0, spin);
    const ey = ty - r.y;
    const ex = tx - r.x;
    if (Math.abs(ey) < 0.03 && Math.abs(ex) < 0.02) break;
    const a = 0.0085 * 9.81;
    const vNeeded = Math.sqrt(Math.max(0.01, v0 * v0 + 2 * a * ey));
    v0 = vNeeded;
    broom += ex * 1.05;
  }
  const sol = { v0, broom };
  drawCache.set(key, sol);
  return sol;
}

// Solve broom so a stone at speed v0 passes through x = tx at y = ty.
export function solveHit(tx, ty, v0, spin) {
  let broom = tx;
  for (let i = 0; i < 5; i++) {
    const px = passOf(broom, v0, spin, ty);
    const e = tx - px;
    if (Math.abs(e) < 0.01) break;
    broom += e * 1.1;
  }
  return broom;
}

function candidates(stones, team) {
  const out = [];
  const mine = stones.filter((s) => s.inPlay && s.team === team);
  const theirs = stones.filter((s) => s.inPlay && s.team !== team);
  const spots = [
    [0, FAR_TEE, 'draw to the button'],
    [0, FAR_TEE - 0.7, 'draw top four-foot'],
    [0, FAR_TEE + 0.6, 'draw back four-foot'],
    [-0.7, FAR_TEE - 0.2, 'draw left of the pin'],
    [0.7, FAR_TEE - 0.2, 'draw right of the pin'],
    [-1.2, FAR_TEE + 0.3, 'draw into the side of the house'],
    [1.2, FAR_TEE + 0.3, 'draw into the side of the house'],
    [0, FAR_TEE - 3.2, 'centre guard'],
    [-0.9, FAR_TEE - 2.9, 'corner guard'],
    [0.9, FAR_TEE - 2.9, 'corner guard'],
  ];
  for (const [x, y, label] of spots) {
    for (const spin of [1, -1]) {
      const d = solveDraw(x, y, spin);
      out.push({ ...d, spin, kind: 'draw', label });
    }
  }
  const shot = scoreEnd(stones).ranked[0];
  for (const t of theirs) {
    if (t.y < FAR_HOG - 0.5) continue;
    for (const spin of [1, -1]) {
      for (const [v0, off, label] of [
        [3.2, 0, 'takeout'],
        [3.2, 0.09 * spin, 'hit and roll'],
        [4.0, 0, 'peel'],
        [2.6, 0, 'tap back'],
      ]) {
        out.push({ v0, broom: solveHit(t.x + off, t.y, v0, spin), spin, kind: 'hit', label });
      }
      if (t === shot && inHouse(t)) {
        const d = solveDraw(t.x, t.y - 2 * STONE_R - 0.01, spin);
        out.push({ ...d, spin, kind: 'draw', label: 'freeze' });
      }
    }
  }
  for (const m of mine) {
    if (!inFGZ(m)) continue;
    for (const spin of [1, -1]) {
      out.push({ v0: 2.45, broom: solveHit(m.x, m.y, 2.45, spin), spin, kind: 'hit', label: 'raise' });
    }
  }
  return out;
}

// Value of a settled house for `team`, given stones left and hammer.
export function evaluate(stones, team, hammer, remaining) {
  const sc = scoreEnd(stones);
  const signed = sc.team === null ? 0 : sc.team === team ? sc.points : -sc.points;
  if (remaining === 0) {
    if (signed === 0) return hammer === team ? -0.4 : 0.4;
    if (signed === 1 && hammer === team) return 0.6;
    return signed;
  }
  let v = signed * 0.9;
  const late = remaining <= 4;
  for (const s of stones) {
    if (!s.inPlay) continue;
    const mine = s.team === team ? 1 : -1;
    const d = distToButton(s);
    if (inHouse(s)) {
      v += mine * (0.35 + 0.5 * Math.max(0, HOUSE_R + STONE_R - d)) * (late ? 1.2 : 0.8);
      if (d < RING4) v += mine * 0.25;
    } else if (inFGZ(s)) {
      // centre guards help the team without hammer, corner guards the team with it
      const ownerHasHammer = hammer === s.team;
      const helpsOwner = Math.abs(s.x) < 0.5 ? !ownerHasHammer : ownerHasHammer;
      v += mine * (helpsOwner ? 0.25 : 0.05) * (late ? 0.5 : 1);
    }
  }
  return v;
}

function mulberry(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playOut(stones, shooter, cand, thrownCount, noise) {
  const world = cloneStones(stones);
  const before = cloneStones(stones);
  const s = world.find((t) => t.id === shooter.id);
  deliver(s, cand.broom + noise.b, cand.v0 + noise.v, cand.spin);
  const ctx = simulate(world, s.id, { dt: EVAL_DT });
  adjudicate(world, before, s, ctx, thrownCount);
  return world;
}

// Picks a shot. Runs in slices so the page stays responsive; resolves with the plan.
export async function chooseShot({ stones, shooter, team, hammer, thrownCount, level, seed = Date.now(), onProgress }) {
  const L = LEVELS[level];
  const rng = mulberry(seed);
  const cands = candidates(stones, team);
  const remaining = STONES_PER_TEAM * 2 - thrownCount - 1;
  const noises = [{ v: 0, b: 0 }];
  for (let i = 1; i < L.samples; i++) noises.push({ v: gauss(rng) * L.sv, b: gauss(rng) * L.sb });
  let best = null;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    let total = 0;
    for (const n of noises) total += evaluate(playOut(stones, shooter, c, thrownCount, n), team, hammer, remaining);
    c.score = total / noises.length;
    if (!best || c.score > best.score) best = c;
    if (i % 6 === 5) {
      onProgress?.(i / cands.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const planned = playOut(stones, shooter, best, thrownCount, { v: 0, b: 0 });
  const rest = planned.find((s) => s.id === shooter.id);
  best.target = rest.inPlay ? { x: rest.x, y: rest.y } : null;
  best.exec = { v0: best.v0 + gauss(rng) * L.sv, broom: best.broom + gauss(rng) * L.sb };
  // A draw is thrown a touch light on purpose: sweeping can add distance, never remove it.
  if (best.kind === 'draw') best.exec.v0 -= L.sv * 0.8;
  return best;
}

// Sweep decision for the AI's own draw: predict the unswept rest and sweep if short.
export function aiSweep(stones, shooter, plan) {
  if (plan.kind !== 'draw' || !plan.target) return false;
  const s = shooter;
  if (s.y > plan.target.y) return false;
  const ghost = { ...s, id: -2 };
  simulate([ghost], -2, { dt: 1 / 60 });
  return ghost.y < plan.target.y - 0.12;
}
