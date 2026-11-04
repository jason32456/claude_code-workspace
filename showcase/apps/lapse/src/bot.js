// The layer planner that flies the rivals, the demo and the bench. Every few
// seconds it simulates holding each candidate height through the real wind
// field and picks the one whose closest approach to the goal is best.
import { altitudeHold, predictMarker, GOAL_R } from './sim.js';
import { mulberry, wrap180, clamp } from './world.js';

export const SKILLS = {
  expert: { noise: 0, replan: 6, dropSlack: 0, bias: 0 },
  good: { noise: 9, replan: 10, dropSlack: 25, bias: 6 },
  fair: { noise: 18, replan: 14, dropSlack: 55, bias: 13 },
  rough: { noise: 30, replan: 18, dropSlack: 90, bias: 20 },
};

export function createBot(skill = 'expert', seed = 1) {
  const S = SKILLS[skill];
  const r = mulberry(seed * 977 + 13);
  return { S, r, nextPlan: 0, target: null, mode: 'climb', bestPred: Infinity, rising: 0, takeoff: 4 + r() * 50, bias: (r() * 2 - 1) * S.bias, landT: 0 };
}

function goalsOf(sim, b) { return sim.F.tasks[b.taskIdx]?.goals ?? null; }

function plan(sim, b, bot) {
  const W = sim.world, goals = goalsOf(sim, b);
  const L0 = W.L0;
  let best = null;
  const cosB = Math.cos((bot.bias * Math.PI) / 180), sinB = Math.sin((bot.bias * Math.PI) / 180);
  // Cumulative drift of a marker thrown from each 20 m step of height.
  const g0 = W.ground(b.x, b.z), OX = [0], OZ = [0];
  for (let k = 1; k < 80; k++) {
    const w = W.wind(b.x, g0 + k * 20, b.z, sim.t);
    OX.push(OX[k - 1] + w.x * 2.5); OZ.push(OZ[k - 1] + w.z * 2.5);
  }
  const off = (y) => { const k = clamp(Math.round((y - g0) / 20), 0, 79); return [OX[k], OZ[k]]; };
  for (let agl = 30; agl <= 1100; agl += 30) {
    let x = b.x, z = b.z, y = b.y, t = sim.t, dmin = Infinity, tmin = 0;
    const ty = L0 + agl;
    for (let k = 0; k < 48; k++) {
      const dt = 8;
      y += Math.sign(ty - y) * Math.min(Math.abs(ty - y), 1.8 * dt);
      const gy = Math.max(y, W.ground(x, z) + 25);
      const w = W.wind(x, gy + 14, z, t);
      const wx = w.x * cosB - w.z * sinB, wz = w.x * sinB + w.z * cosB;
      x += wx * dt; z += wz * dt; t += dt;
      const [ox, oz] = off(gy);
      for (const [gx, gz] of goals) {
        const d = Math.hypot(x + ox - gx, z + oz - gz);
        if (d < dmin) { dmin = d; tmin = t - sim.t; }
      }
    }
    const nw = W.nearestWire(b.x, b.z);
    let cost = dmin + 0.12 * Math.abs(ty - b.y) + 0.15 * tmin + 0.06 * agl;
    if (nw && nw.d < 400 && ty < nw.h + 30) cost += 400;
    cost += (bot.r() * 2 - 1) * bot.S.noise * 4;
    if (!best || cost < best.cost) best = { cost, ty, dmin };
  }
  return best;
}

function landingTarget(sim, b, bot) {
  const W = sim.world;
  const g = W.ground(b.x, b.z), hg = b.y - g;
  const w = W.wind(b.x, g + 20, b.z, sim.t);
  const desperate = sim.F.deadline - sim.t < 300 || b.fuel < 4;
  const ok = (x, z) => {
    const f = W.fieldAt(x, z);
    if (!f.legal && !(desperate && f.id !== 6)) return false;
    const nw = W.nearestWire(x, z);
    return !nw || nw.d > 140;
  };
  if (hg < 30) {
    // Committed: keep going down unless the field we are about to touch is bad.
    const ax = b.x + b.vx * 10, az = b.z + b.vz * 10;
    return ok(ax, az) && ok(b.x, b.z) ? g - 20 : g + 60;
  }
  const td = hg / 1.3 + 8;
  const ax = b.x + w.x * td, az = b.z + w.z * td;
  const all = [-25, 0, 25].every((s) => ok(ax + w.x * s, az + w.z * s));
  return all ? g - 20 : g + 70;
}

export function botStep(sim, b, bot) {
  if (b.done) return { burn: false, vent: 0 };
  const W = sim.world;
  const goals = goalsOf(sim, b);
  if (sim.t < bot.takeoff) return { burn: false, vent: 0 };
  const ctl = { burn: false, vent: 0, drop: false, land: false };

  // Out of time: give up the remaining goals and find a field.
  if (goals && (sim.F.deadline - sim.t < 540 || (bot.taskT0 != null && sim.t - bot.taskT0 > 900 && bot.lastDmin > GOAL_R))) {
    ctl.skip = true; bot.taskT0 = null;
    return ctl;
  }
  if (goals && bot.taskIdx !== b.taskIdx) { bot.taskIdx = b.taskIdx; bot.taskT0 = sim.t; }
  if (goals) {
    if (sim.t >= bot.nextPlan) {
      const p = plan(sim, b, bot);
      bot.target = p.ty; bot.lastDmin = p.dmin;
      bot.nextPlan = sim.t + bot.S.replan;
    }
    const near = Math.min(...goals.map(([gx, gz]) => Math.hypot(b.x - gx, b.z - gz)));
    bot.tick = (bot.tick ?? 0) + 1;
    if (near < 2600 && b.flying && bot.tick % 15 === 0) {
      const m = predictMarker(sim, b, 0.5);
      const d = Math.min(...goals.map(([gx, gz]) => Math.hypot(m.x - gx, m.z - gz)));
      if (d < bot.bestPred) { bot.bestPred = d; bot.rising = 0; }
      else bot.rising++;
      const slack = bot.S.dropSlack, best = bot.bestPred, ahead = bot.lastDmin ?? 0;
      const localMin = bot.rising > 2 && best < GOAL_R * 0.9 && d < best + 30 + slack && ahead > best * 0.5;
      const salvage = best < GOAL_R * 0.8 && d > best + 120 && d < GOAL_R * 0.95 && ahead > best * 0.5;
      if (d < 8 + slack * 0.3 || localMin || salvage) {
        ctl.drop = true; bot.bestPred = Infinity; bot.rising = 0; bot.nextPlan = 0;
      }
    }
  } else {
    bot.target = landingTarget(sim, b, bot);
    if (b.y - W.ground(b.x, b.z) < 1 && b.flying) { ctl.vent = 1; bot.landT += 1 / 30; if (bot.landT > 1) ctl.land = true; return ctl; }
  }
  const h = altitudeHold(sim, b, Math.max(bot.target ?? b.y, goals ? W.ground(b.x, b.z) + 20 : -1e9));
  ctl.burn = h.burn; ctl.vent = h.vent;
  return ctl;
}

export function predictedMiss(sim, b) {
  const goals = goalsOf(sim, b);
  if (!goals) return null;
  const m = predictMarker(sim, b, 0.5);
  let best = { d: Infinity };
  goals.forEach(([gx, gz]) => { const d = Math.hypot(m.x - gx, m.z - gz); if (d < best.d) best = { d, x: m.x, z: m.z }; });
  return best;
}
export { wrap180 };
