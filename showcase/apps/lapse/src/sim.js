// Balloon physics, markers, pibals, scoring. Deterministic and DOM-free so the
// bench can run it headless.
import { makeWorld, mulberry, clamp, D2R, FIELD } from './world.js';

export const DT = 1 / 30;
export const G = 9.81;
const R_AIR = 287.05;
export const V_ENV = 2600;          // m³
const A_TOP = 227;                  // m², vertical drag reference (r = 8.5 m)
const A_SIDE = 330;                 // m², horizontal drag reference
const A_SKIN = 950;                 // m², fabric area for heat loss
const CD_V = 0.8, CD_H = 0.5;
export const M_DRY = 580;           // kg: envelope, basket, burner, tank tares, crew
export const FUEL0 = 40;            // kg of propane
export const BURN_W = 2.6e6;        // W into the envelope air while the blast valve is open
export const BURN_KG = 0.093;       // kg/s
export const T_RED = 393.15;        // 120 °C
const VENT_K = 0.035;               // 1/s of temperature excess spilled at full vent
const CP = 1005;
export const ENV_H = 24;            // basket floor to crown
export const ENV_R = 8.5;
export const GOAL_R = 500;
export const MARKERS = 4;

const ptsFor = (d) => Math.round(1000 * Math.max(0, 1 - d / GOAL_R));

export function makeBalloon(sim, x, z, opts = {}) {
  const W = sim.world, y = W.ground(x, z);
  const b = {
    id: opts.id ?? 'you', name: opts.name ?? 'You', color: opts.color ?? 0,
    x, y, z, vx: 0, vy: 0, vz: 0, Te: 0, fuel: FUEL0, burner: 0, vent: 0,
    onGround: true, flying: false, done: false, endReason: '', taskIdx: 0, markersLeft: MARKERS,
    track: [], trackT: 0, hold: null, overT: 0, burnTime: 0, fuelUsed: 0,
    score: { tasks: sim.F.tasks.map(() => null), landing: null, pens: [], total: 0 },
    contactField: null, lastImpact: 0, still: 0, maxY: y,
  };
  b.Te = equilibriumTe(sim, b, y) - 2;
  return b;
}

export const mass = (b) => M_DRY + b.fuel;

export function airAt(sim, y) {
  const W = sim.world, p = W.pres(y), Ta = W.airT(y);
  return { p, Ta, rho: p / (R_AIR * Ta) };
}

// Envelope temperature that floats the balloon at height y with extra force f (N).
export function equilibriumTe(sim, b, y, extraN = 0) {
  const { p, rho } = airAt(sim, y);
  const re = rho - (mass(b) + extraN / G) / V_ENV;
  return re > 0.2 ? p / (R_AIR * re) : 600;
}

export function createSim(F, opts = {}) {
  const world = makeWorld(F);
  const sim = {
    F, world, t: 0, rng: mulberry(opts.seed ?? 1), seed: opts.seed ?? 1,
    events: [], input: { burn: false, vent: 0, drop: false, land: false },
    markers: [], pibals: [], ladder: [], ladderT: [], result: null, thermalsOn: false, seaOn: false,
    balloons: [], player: null,
  };
  const [lx, lz] = F.launch;
  sim.player = makeBalloon(sim, lx, lz);
  sim.balloons.push(sim.player);
  // Initial sounding at launch.
  for (let h = 0; h <= 1500; h += 50) {
    const w = world.wind(lx, world.L0 + Math.max(h, 40), lz, 0);
    sim.ladder.push({ h, x: w.x, z: w.z });
    sim.ladderT.push(0);
  }
  return sim;
}

export function addRival(sim, b) { sim.balloons.push(b); return b; }

function releasePibal(sim) {
  const [lx, lz] = sim.F.launch;
  sim.pibals.push({ x: lx + 30, z: lz - 20, y: sim.world.L0 + 2, alive: true, born: sim.t, trail: [] });
}

export function altitudeHold(sim, b, target) {
  const g = sim.world.ground(b.x, b.z);
  const tgt = Math.max(target, g - 10);
  const err = tgt - b.y;
  const hg = b.y - g;
  const vmax = 2.6, vmin = -(hg < 60 ? 0.6 + hg / 40 : 2.4);
  const vstar = clamp(err * 0.025, vmin, vmax);
  const { rho } = airAt(sim, b.y);
  const drag = 0.5 * rho * CD_V * A_TOP * vstar * Math.abs(vstar);
  const Tdes = equilibriumTe(sim, b, b.y, drag) + 6 * (vstar - b.vy);
  if (b.Te < Tdes - 0.4) b._hb = true;
  else if (b.Te > Tdes + 0.4) b._hb = false;
  return { burn: !!b._hb && b.Te < T_RED - 3, vent: clamp((b.Te - Tdes - 3) / 10, 0, 1) };
}

function stepBalloon(sim, b, ctl) {
  const W = sim.world, dt = DT;
  if (b.done) return;
  const burn = ctl.burn && b.fuel > 0;
  b.burner = burn ? 1 : 0;
  b.vent = ctl.vent;
  const { p, Ta, rho } = airAt(sim, b.y + 14);
  const w = W.wind(b.x, b.y + 14, b.z, sim.t);
  const rhoE = p / (R_AIR * b.Te);
  const m = mass(b);
  const Mi = m + rhoE * V_ENV + 0.5 * rho * V_ENV;

  // Heat.
  const vrel = Math.hypot(b.vx - w.x, b.vy - w.y, b.vz - w.z);
  const U = 4 + 0.8 * vrel;
  const C = rhoE * V_ENV * CP;
  let dT = (-U * A_SKIN * (b.Te - Ta)) / C - VENT_K * b.vent * (b.Te - Ta);
  if (burn) {
    dT += BURN_W / C;
    const f = BURN_KG * dt;
    b.fuel = Math.max(0, b.fuel - f);
    b.fuelUsed += f; b.burnTime += dt;
  }
  b.Te += dT * dt;
  if (b.Te > T_RED) {
    b.overT += dt;
    if (!b._otWarn) { b._otWarn = true; sim.events.push({ type: 'overtemp', who: b.id }); }
  } else b._otWarn = false;

  // Vertical.
  const vr = b.vy - w.y;
  const Fz = (rho - rhoE) * V_ENV * G - m * G - 0.5 * rho * CD_V * A_TOP * vr * Math.abs(vr);
  b.vy += (Fz / Mi) * dt;

  // Horizontal: quadratic drag towards the wind on the whole moving mass.
  const dx = w.x - b.vx, dz = w.z - b.vz, dv = Math.hypot(dx, dz);
  const k = (0.5 * rho * CD_H * A_SIDE * dv) / Mi;
  const f = 1 - Math.exp(-k * dt);
  b.vx += dx * f; b.vz += dz * f;

  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  const g = W.ground(b.x, b.z);
  const was = b.onGround;
  if (b.y <= g) {
    b.y = g;
    if (b.vy < 0) {
      if (!was && b.vy < -3.5 && b.flying) {
        b.score.pens.push({ why: `Hard landing (${(-b.vy).toFixed(1)} m/s)`, pts: -150 });
        sim.events.push({ type: 'hard', who: b.id, v: -b.vy });
      }
      b.lastImpact = -b.vy;
      b.vy = 0;
    }
    b.onGround = true;
    // A basket on the ground drags unless the envelope is carrying it.
    if (Fz <= 0) { const d = Math.exp(-2.5 * dt); b.vx *= d; b.vz *= d; }
  } else b.onGround = false;
  if (b.y > g + 3) { b.flying = true; b.air = true; }
  b.maxY = Math.max(b.maxY, b.y);

  if (b.onGround && b.air) {
    b.air = false;
    const fd = W.fieldAt(b.x, b.z);
    b.contactField = fd;
    sim.events.push({ type: 'touch', who: b.id, field: fd.name, legal: fd.legal });
    if (!fd.legal && !b.done) b.score.pens.push({ why: `Touched down in ${fd.name}`, pts: -100 });
  }

  // Power lines.
  const nw = W.nearestWire(b.x, b.z);
  if (nw) {
    b.wire = nw;
    if (nw.d < ENV_R && nw.h > b.y - 0.5 && nw.h < b.y + ENV_H) return finish(sim, b, 'strike');
    const warn = nw.d < 220 && nw.h > b.y - 12 && nw.h < b.y + ENV_H + 25;
    if (warn && !b._ww) sim.events.push({ type: 'wire', who: b.id });
    b._ww = warn;
  }

  // Track breadcrumbs.
  if (sim.t - b.trackT > 2) { b.track.push([b.x, b.y, b.z]); b.trackT = sim.t; if (b.track.length > 1500) b.track.shift(); }

  // Drops.
  if (ctl.drop && b.markersLeft > 0 && b.taskIdx < sim.F.tasks.length && b.flying) {
    b.markersLeft--;
    sim.markers.push({ who: b.id, task: b.taskIdx, x: b.x, y: b.y + 0.8, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, landed: false, trail: [] });
    sim.events.push({ type: 'drop', who: b.id, task: b.taskIdx });
    b.taskIdx++;
  }
  if (ctl.skip && b.taskIdx < sim.F.tasks.length) { b.score.tasks[b.taskIdx] = { d: null, pts: 0, skipped: true }; b.taskIdx++; }

  // Landing: down, slow and not about to lift off again.
  const settled = b.y - g < 0.5 && b.flying && Math.hypot(b.vx, b.vz) < 0.6 && b.Te < equilibriumTe(sim, b, b.y) - 1;
  b.still = settled ? b.still + dt : 0;
  if ((ctl.land && b.y - g < 1 && b.flying) || b.still > 5) return finish(sim, b, 'landed');
  if (b.fuel <= 0 && !b._noFuel) { b._noFuel = true; sim.events.push({ type: 'fuel', who: b.id }); }
}

function finish(sim, b, why) {
  b.done = true; b.endReason = why; b.burner = 0;
  const S = b.score;
  if (why === 'strike') {
    sim.events.push({ type: 'strike', who: b.id });
    S.pens.push({ why: 'Power line strike', pts: 0 });
  } else if (why === 'landed') {
    const fd = sim.world.fieldAt(b.x, b.z);
    S.landing = { field: fd.name, legal: fd.legal, pts: fd.legal ? 200 : -(fd.pen ?? 300) };
    sim.events.push({ type: 'land', who: b.id, field: fd.name, legal: fd.legal });
  } else if (why === 'deadline') {
    S.landing = { field: 'still airborne', legal: false, pts: -400 };
  }
  total(sim, b);
}

export function total(sim, b) {
  const S = b.score;
  if (b.endReason === 'strike') { S.total = 0; return 0; }
  let t = 0;
  for (const s of S.tasks) if (s) t += s.pts;
  if (S.landing) t += S.landing.pts;
  for (const p of S.pens) t += p.pts;
  t -= Math.round(50 * b.overT);
  S.total = Math.max(0, t);
  return S.total;
}

function stepMarker(sim, mk) {
  const W = sim.world, dt = DT;
  const w = W.wind(mk.x, mk.y, mk.z, sim.t);
  const k = 0.153;
  const ry = mk.vy - w.y;
  mk.vy += (-G - k * ry * Math.abs(ry)) * dt;
  const f = 1 - Math.exp(-dt / 1.5);
  mk.vx += (w.x - mk.vx) * f; mk.vz += (w.z - mk.vz) * f;
  mk.x += mk.vx * dt; mk.y += mk.vy * dt; mk.z += mk.vz * dt;
  if ((mk.trail.length === 0 || sim.t - mk.trailT > 0.5)) { mk.trail.push([mk.x, mk.y, mk.z]); mk.trailT = sim.t; }
  const g = W.ground(mk.x, mk.z);
  if (mk.y <= g) {
    mk.y = g; mk.landed = true;
    const task = sim.F.tasks[mk.task];
    let d = Infinity, gi = 0;
    task.goals.forEach(([gx, gz], i) => { const e = Math.hypot(mk.x - gx, mk.z - gz); if (e < d) { d = e; gi = i; } });
    const b = sim.balloons.find((q) => q.id === mk.who);
    const res = { d, pts: ptsFor(d), goal: gi };
    if (b) { b.score.tasks[mk.task] = res; total(sim, b); }
    sim.events.push({ type: 'score', who: mk.who, task: mk.task, ...res });
  }
}

// Where a marker thrown now would land (used by the bot and the HUD aid).
export function predictMarker(sim, b, dtp = 0.25) {
  const W = sim.world;
  let x = b.x, y = b.y + 0.8, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz, t = sim.t;
  for (let i = 0; i < 2000; i++) {
    const w = W.wind(x, y, z, t);
    vy += (-G - 0.153 * (vy - w.y) * Math.abs(vy - w.y)) * dtp;
    const f = 1 - Math.exp(-dtp / 1.5);
    vx += (w.x - vx) * f; vz += (w.z - vz) * f;
    x += vx * dtp; y += vy * dtp; z += vz * dtp; t += dtp;
    if (y <= W.ground(x, z)) break;
  }
  return { x, z };
}

export function step(sim, controls) {
  const F = sim.F;
  sim.t += DT;
  if (!sim.thermalsOn && sim.t > F.thermals) { sim.thermalsOn = true; sim.events.push({ type: 'thermals' }); }
  if (F.id === 'saltings' && !sim.seaOn && sim.t > 1080) { sim.seaOn = true; sim.events.push({ type: 'seabreeze' }); }
  if (Math.floor((sim.t - DT) / 100) !== Math.floor(sim.t / 100)) releasePibal(sim);

  for (const b of sim.balloons) {
    let ctl;
    if (b === sim.player) {
      const I = sim.input;
      ctl = { burn: I.burn, vent: I.vent, drop: I.drop, land: I.land, skip: I.skip };
      if (b.hold != null && !I.burn && !I.vent) {
        const h = altitudeHold(sim, b, b.hold);
        ctl.burn = h.burn; ctl.vent = h.vent;
      }
      I.drop = false; I.land = false; I.skip = false;
    } else ctl = controls?.get(b.id) ?? { burn: false, vent: 0 };
    stepBalloon(sim, b, ctl);
  }
  for (const mk of sim.markers) if (!mk.landed) stepMarker(sim, mk);

  for (const pb of sim.pibals) {
    if (!pb.alive) continue;
    const w = sim.world.wind(pb.x, pb.y, pb.z, sim.t);
    pb.x += w.x * DT; pb.z += w.z * DT; pb.y += 3.5 * DT;
    const agl = pb.y - sim.world.L0;
    const bin = Math.round(agl / 50);
    if (bin >= 0 && bin < sim.ladder.length && Math.abs(agl - bin * 50) < 2) {
      const L = sim.ladder[bin];
      L.x = w.x; L.z = w.z; sim.ladderT[bin] = sim.t;
    }
    if (sim.t - (pb.tt ?? -9) > 3) { pb.trail.push([pb.x, pb.y, pb.z]); pb.tt = sim.t; }
    if (agl > 1500) pb.alive = false;
  }
  if (sim.pibals.length > 8) sim.pibals.shift();

  if (sim.t >= F.deadline) for (const b of sim.balloons) if (!b.done) finish(sim, b, 'deadline');

  const P = sim.player;
  const pend = sim.markers.some((m) => !m.landed && m.who === P.id);
  if (P.done && !pend && !sim.result) {
    // Let rivals finish quickly in the background for the leaderboard.
    sim.result = resultFor(sim, P);
  }
}

export function resultFor(sim, b) {
  total(sim, b);
  const F = sim.F, S = b.score;
  const medal = S.total >= F.medals[2] ? 3 : S.total >= F.medals[1] ? 2 : S.total >= F.medals[0] ? 1 : 0;
  return {
    total: S.total, medal, reason: b.endReason, tasks: S.tasks, landing: S.landing, pens: S.pens,
    overT: b.overT, fuelUsed: b.fuelUsed, t: sim.t, field: b.done ? sim.world.fieldAt(b.x, b.z).name : '',
  };
}

export const clockOf = (sim) => sim.F.clock + sim.t / 3600;
export { FIELD, D2R };
