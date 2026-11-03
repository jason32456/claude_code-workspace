// Deterministic simulation: the player bee, the dance, the followers and the
// colony. No DOM, no Three — the bench runs this file headless.
import { makeTerrain, sunAt, bearingOf, dirOf, wrap180, wrap360, D2R } from './world.js';

export const DT = 1 / 60;
export const M_PER_S = 250;            // waggle code: metres per second of run
export const LOAD_MG = 40;             // nectar per full-quality load
export const ENTRANCE = { x: 0, y: 1.6, z: 3.2 };
const BEE_V = 24, SEARCH_T = 16, FORAGE_T = 5, UNLOAD_T = 3;
const SLOTS = 6;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rng) => {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function circMean(angles) {
  let s = 0, c = 0;
  for (const a of angles) { s += Math.sin(a * D2R); c += Math.cos(a * D2R); }
  const n = angles.length || 1;
  return { mean: Math.atan2(s, c) / D2R, R: Math.hypot(s, c) / n };
}

export function createSim(day, opts = {}) {
  const rng = mulberry32((opts.seed ?? 1) * 2654435761);
  const ground = makeTerrain(day);
  const sim = {
    day, ground, rng, t: 0, hour: day.start, sun: sunAt(day.start, day.lat, day.dec),
    patches: day.patches.map((p, i) => ({ ...p, i, y: ground(p.x, p.z), stock: p.cap, loads: 0, visits: 0, deaths: 0 })),
    bees: [], nectar: 0, trips: 0, lost: 0, events: [], result: null, ending: false,
    input: { turn: 0, fwd: 0, boost: false, climb: 0, aim: 0, waggle: false },
    player: {
      x: ENTRANCE.x, y: 4, z: ENTRANCE.z + 6, yaw: 180, speed: 8, bank: 0, energy: 1,
      inHive: false, cool: 0, sip: 0, sipPatch: -1, mem: {}, memOrder: [], sunSeen: null, exhausted: false,
    },
    dance: null, danceStats: { sessions: 0, runs: 0, recruits: 0 },
  };
  for (let i = 0; i < day.colony; i++) {
    sim.bees.push({ id: i, s: 'idle', x: 0, y: 1, z: 0, tx: 0, tz: 0, cx: 0, cz: 0, R: 0, p: -1, t: 0,
      load: 0, empty: 0, fromPlayer: false, attending: false, ph: rng() * 6.28, yaw: 0 });
  }
  return sim;
}

const emit = (sim, type, o = {}) => sim.events.push({ type, t: sim.t, ...o });
export const isOpen = (sim, p) => sim.hour >= p.open[0] && sim.hour < p.open[1];

// ---------------------------------------------------------------- player flight
function stepPlayer(sim, dt) {
  const P = sim.player, I = sim.input;
  if (P.inHive) {
    P.energy = Math.min(1, P.energy + 0.25 * dt);
    P.exhausted = false;
    stepDance(sim, dt);
    return;
  }
  P.yaw = wrap360(P.yaw + I.turn * 95 * dt);
  P.bank += (I.turn - P.bank) * Math.min(1, 5 * dt);
  let target = I.fwd > 0 ? 22 : I.fwd < 0 ? 3 : 13;
  if (I.boost && I.fwd >= 0) target = 34;
  if (P.exhausted) target = Math.min(target, 5);
  P.speed += (target - P.speed) * Math.min(1, 2.2 * dt);
  const [dx, dz] = dirOf(P.yaw);
  P.x += dx * P.speed * dt; P.z += dz * P.speed * dt;
  const r = Math.hypot(P.x, P.z);
  if (r > 1650) { P.x *= 1650 / r; P.z *= 1650 / r; }
  const g = sim.ground(P.x, P.z);
  let climb = P.exhausted ? Math.min(I.climb, 0) - 0.3 : I.climb;
  P.y = clamp(P.y + climb * 9 * dt, g + 0.9, g + 90);
  P.energy -= (0.0012 + 0.00025 * P.speed) * dt;
  if (P.energy <= 0 && !P.exhausted) { P.energy = 0; P.exhausted = true; emit(sim, 'exhausted'); }

  // tasting: low and slow over a patch
  let over = -1;
  for (const p of sim.patches) if (Math.hypot(P.x - p.x, P.z - p.z) < p.r && P.y - g < 6 && P.speed < 7.5) over = p.i;
  if (over >= 0) {
    if (P.sipPatch !== over) { P.sipPatch = over; P.sip = 0; }
    const p = sim.patches[over], open = isOpen(sim, p);
    P.sip += dt;
    if (open) { P.energy = Math.min(1, P.energy + 0.6 * dt); if (P.energy > 0.15) P.exhausted = false; }
    if (P.sip >= 1 && P.sip - dt < 1) taste(sim, p, open);
  } else { P.sipPatch = -1; P.sip = 0; }

  P.cool = Math.max(0, P.cool - dt);
  if (P.cool <= 0 && Math.hypot(P.x - ENTRANCE.x, P.z - ENTRANCE.z) < 3 && P.y < 5) enterHive(sim);
}

function taste(sim, p, open) {
  const P = sim.player;
  const first = !P.mem[p.id];
  P.mem[p.id] = {
    id: p.id, i: p.i, name: p.name, color: p.color, q: p.q, toxic: p.toxic, open, window: p.open,
    bearing: bearingOf(P.x, P.z), dist: Math.hypot(P.x, P.z), hour: sim.hour, hornet: p.hornet > 0,
  };
  P.memOrder = P.memOrder.filter((k) => k !== p.id);
  P.memOrder.push(p.id);
  emit(sim, 'taste', { id: p.id, first, open, toxic: p.toxic, q: p.q });
}

export function nearEntrance(sim) {
  const P = sim.player;
  return Math.hypot(P.x - ENTRANCE.x, P.z - ENTRANCE.z) < 14 && P.y < 14;
}

export function toggleHive(sim) {
  const P = sim.player;
  if (P.inHive) {
    endDance(sim);
    P.inHive = false;
    P.x = ENTRANCE.x; P.z = ENTRANCE.z + 4; P.y = ENTRANCE.y + 2; P.yaw = 180; P.speed = 8; P.cool = 2.5;
    emit(sim, 'leave');
    return true;
  }
  if (nearEntrance(sim)) { enterHive(sim); return true; }
  return false;
}

function enterHive(sim) {
  const P = sim.player;
  P.inHive = true; P.speed = 0;
  P.sunSeen = { az: sim.sun.az, hour: sim.hour };
  sim.dance = {
    x: 0, y: 0, th: 0, jv: 0, state: 'ready', t: 0, side: 1, sx: 0, sy: 0, runS: 0, runC: 0, runT: 0, runN: 0,
    jostleT: 0.4, runs: [], slots: [], forPatch: P.memOrder[P.memOrder.length - 1] ?? null, start: sim.t, bump: 0,
  };
  sim.danceStats.sessions++;
  fillSlots(sim);
  emit(sim, 'enter');
}

function endDance(sim) {
  if (!sim.dance) return;
  for (const s of sim.dance.slots) sim.bees[s.bee].attending = false;
  sim.dance = null;
}

export function setDanceFor(sim, id) {
  if (sim.dance && sim.player.mem[id]) sim.dance.forPatch = id;
}

// ---------------------------------------------------------------- the dance
function fillSlots(sim) {
  const D = sim.dance;
  for (let k = 0; k < SLOTS; k++) {
    if (D.slots[k]) continue;
    const b = sim.bees.find((b) => b.s === 'idle' && !b.attending);
    if (!b) break;
    b.attending = true;
    D.slots[k] = { bee: b.id, seen: [], need: 3 + Math.floor(sim.rng() * 3), k, enter: sim.t };
  }
}

function stepDance(sim, dt) {
  const D = sim.dance, I = sim.input, rng = sim.rng;
  D.t += dt;
  D.bump = Math.max(0, D.bump - dt * 3);
  if (D.state === 'ready') {
    D.th += clamp(wrap180(I.aim - D.th), -400 * dt, 400 * dt);
    D.x *= 1 - Math.min(1, 1.5 * dt); D.y *= 1 - Math.min(1, 1.5 * dt);
    if (I.waggle) {
      D.state = 'run'; D.t = 0; D.sx = D.x; D.sy = D.y; D.runS = 0; D.runC = 0; D.runN = 0; D.jv = 0;
      D.jostleT = 0.2 + rng() * 0.3;
    }
  } else if (D.state === 'run') {
    D.jostleT -= dt;
    if (D.jostleT <= 0) {
      D.jv += gauss(rng) * 70;
      D.jostleT = 0.25 + rng() * 0.4;
      D.bump = 1;
    }
    D.jv *= Math.exp(-3 * dt);
    D.th = wrap180(D.th + (wrap180(I.aim - D.th) * 2.6 + D.jv) * dt);
    const s = D.th * D2R;
    D.x += Math.sin(s) * 1.6 * dt; D.y += Math.cos(s) * 1.6 * dt;
    D.runS += Math.sin(s); D.runC += Math.cos(s); D.runN++;
    if (!I.waggle || D.t >= 6) finishRun(sim);
  } else if (D.state === 'return') {
    const T = D.retT, u = Math.min(1, D.t / T);
    const ex = D.x0, ey = D.y0;
    const mx = (ex + D.sx) / 2, my = (ey + D.sy) / 2;
    const half = Math.hypot(ex - D.sx, ey - D.sy) / 2 + 0.25;
    const base = Math.atan2(ey - my, ex - mx);
    const a = base + D.side * Math.PI * u;
    D.x = mx + Math.cos(a) * half; D.y = my + Math.sin(a) * half;
    D.th = Math.atan2(-D.side * Math.sin(a), D.side * Math.cos(a)) / D2R;
    if (u >= 1) { D.state = 'ready'; D.t = 0; D.side = -D.side; }
  }
}

function finishRun(sim) {
  const D = sim.dance, dur = D.t;
  D.x0 = D.x; D.y0 = D.y;
  D.state = 'return'; D.t = 0; D.retT = 0.8 + 0.1 * dur;
  if (dur < 0.25) return;
  const angle = Math.atan2(D.runS, D.runC) / D2R;
  const straight = Math.hypot(D.runS, D.runC) / Math.max(1, D.runN);
  const run = { angle, dur, straight, bearing: wrap360(sim.sun.az + angle), dist: dur * M_PER_S, t: sim.t, sunAz: sim.sun.az };
  D.runs.push(run);
  sim.danceStats.runs++;
  emit(sim, 'run', run);
  const mem = D.forPatch ? sim.player.mem[D.forPatch] : null;
  const vig = mem ? (isOpen(sim, sim.patches[mem.i]) ? mem.q : 0.1) : 0.15;
  for (let k = 0; k < SLOTS; k++) {
    const s = D.slots[k];
    if (!s) continue;
    s.seen.push(run);
    if (s.seen.length < s.need) continue;
    const { mean, R } = circMean(s.seen.map((r) => r.bearing));
    let p = 0.2 + 0.7 * vig;
    if (R < 0.9) p *= 0.5;
    const bee = sim.bees[s.bee];
    bee.attending = false;
    D.slots[k] = null;
    if (sim.rng() < p && !sim.ending) {
      const md = s.seen.reduce((a, r) => a + r.dur, 0) / s.seen.length;
      const d = Math.max(20, md * M_PER_S * (1 + gauss(sim.rng) * 0.07));
      const sig = 4 + 22 * Math.exp(-d / 280);
      const b = wrap360(mean + gauss(sim.rng) * sig);
      launch(sim, bee, b, d, true);
      sim.danceStats.recruits++;
      emit(sim, 'recruit', { bearing: b, dist: d, bee: bee.id });
    } else emit(sim, 'decline', { bee: bee.id });
  }
  fillSlots(sim);
}

// ---------------------------------------------------------------- the colony
function launch(sim, bee, bearing, dist, fromPlayer) {
  const [dx, dz] = dirOf(bearing);
  bee.s = 'vec'; bee.tx = dx * dist; bee.tz = dz * dist; bee.x = ENTRANCE.x; bee.z = ENTRANCE.z; bee.y = ENTRANCE.y;
  bee.p = -1; bee.t = 0; bee.load = 0; bee.empty = 0; bee.fromPlayer = fromPlayer; bee.dist = dist; bee.bearing = bearing;
}

function sendToPatch(sim, bee) {
  const p = sim.patches[bee.p], a = sim.rng() * 6.283, r = Math.sqrt(sim.rng()) * p.r * 0.8;
  bee.s = 'topatch'; bee.tx = p.x + Math.cos(a) * r; bee.tz = p.z + Math.sin(a) * r; bee.t = 0;
  bee.x = ENTRANCE.x; bee.z = ENTRANCE.z;
}

function flyTo(sim, b, tx, tz, dt) {
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
  const step = BEE_V * dt;
  b.yaw = Math.atan2(dx, -dz);
  if (d <= step) { b.x = tx; b.z = tz; } else { b.x += (dx / d) * step; b.z += (dz / d) * step; }
  const g = sim.ground(b.x, b.z), alt = g + 3 + Math.min(10, d * 0.3, Math.hypot(b.x, b.z) * 0.3);
  b.y += (alt - b.y) * Math.min(1, 3 * dt);
  return d <= step;
}

function stepBees(sim, dt) {
  const rng = sim.rng;
  for (const b of sim.bees) {
    if (b.s === 'idle' || b.s === 'dead') continue;
    b.t += dt;
    switch (b.s) {
      case 'vec':
        if (flyTo(sim, b, b.tx, b.tz, dt)) { b.s = 'search'; b.t = 0; b.cx = b.tx; b.cz = b.tz; b.R = 30 + 0.1 * b.dist; }
        break;
      case 'search': {
        const a = b.t * 1.7 + b.ph, r = b.R * Math.min(1, b.t / (SEARCH_T * 0.85));
        const nx = b.cx + Math.cos(a) * r, nz = b.cz + Math.sin(a) * r;
        b.yaw = Math.atan2(nx - b.x, -(nz - b.z));
        b.x = nx; b.z = nz;
        b.y += (sim.ground(b.x, b.z) + 4 - b.y) * Math.min(1, 3 * dt);
        let found = null, best = 1e9;
        for (const p of sim.patches) {
          const d = Math.hypot(b.x - p.x, b.z - p.z);
          if (d < p.r + 10 && d < best) { best = d; found = p; }
        }
        if (found) {
          b.p = found.i; b.s = 'forage'; b.t = 0;
          if (b.fromPlayer) emit(sim, 'found', { bee: b.id, id: found.id, ex: b.cx, ez: b.cz, err: Math.hypot(b.cx - found.x, b.cz - found.z) });
        } else if (b.t > SEARCH_T) {
          b.s = 'home'; b.load = 0; b.p = -1;
          if (b.fromPlayer) emit(sim, 'miss', { bee: b.id, ex: b.cx, ez: b.cz });
        }
        break;
      }
      case 'topatch':
        if (flyTo(sim, b, b.tx, b.tz, dt)) { b.s = 'forage'; b.t = 0; }
        break;
      case 'forage': {
        const p = sim.patches[b.p];
        b.x += Math.cos(b.t * 2 + b.ph) * 3 * dt; b.z += Math.sin(b.t * 2.3 + b.ph) * 3 * dt;
        b.y += (sim.ground(b.x, b.z) + 0.8 + Math.abs(Math.sin(b.t * 3)) - b.y) * Math.min(1, 4 * dt);
        if (b.t < FORAGE_T) break;
        p.visits++;
        if (isOpen(sim, p) && p.stock >= 1) { p.stock -= 1; b.load = p.q; } else b.load = 0;
        if ((p.toxic && rng() < 0.5) || (p.hornet && rng() < p.hornet)) {
          b.s = 'dead'; sim.lost++; p.deaths++;
          emit(sim, 'death', { id: p.id, cause: p.toxic ? 'poison' : 'hornet', x: b.x, z: b.z });
          break;
        }
        if (p.toxic) b.load = 0;
        b.s = 'home'; b.t = 0;
        break;
      }
      case 'home':
        if (flyTo(sim, b, ENTRANCE.x, ENTRANCE.z, dt)) arrive(sim, b);
        break;
      case 'unload':
        if (b.t >= UNLOAD_T) {
          if (sim.ending || sim.sun.alt < 2) { b.s = 'idle'; b.p = -1; break; }
          sendToPatch(sim, b);
        }
        break;
    }
  }
}

function arrive(sim, b) {
  b.x = 0; b.z = 0; b.y = 1; b.t = 0;
  const p = b.p >= 0 ? sim.patches[b.p] : null;
  if (p && b.load > 0) {
    const mg = LOAD_MG * b.load;
    sim.nectar += mg; sim.trips++; p.loads++; b.empty = 0;
    emit(sim, 'unload', { id: p.id, mg });
    const frac = p.stock / p.cap;
    if (!sim.ending && sim.rng() < 0.35 * p.q * Math.min(1, frac * 1.6)) {
      const n = 1 + (sim.rng() < p.q * 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const r = sim.bees.find((x) => x.s === 'idle' && !x.attending);
        if (!r) break;
        const tb = bearingOf(p.x, p.z), td = Math.hypot(p.x, p.z);
        launch(sim, r, wrap360(tb + gauss(sim.rng) * 6), td * (1 + gauss(sim.rng) * 0.06), false);
      }
    }
    b.s = 'unload';
  } else {
    b.empty++;
    if (!p || b.empty >= 2) { b.s = 'idle'; b.p = -1; b.load = 0; }
    else b.s = 'unload';
  }
  b.load = 0;
}

function stepPatches(sim, dt) {
  for (const p of sim.patches) if (isOpen(sim, p)) p.stock = Math.min(p.cap, p.stock + p.regen * dt);
}

export function step(sim) {
  if (sim.result) return;
  const dt = DT;
  sim.t += dt;
  sim.hour = sim.day.start + sim.t / 60;
  sim.sun = sunAt(sim.hour, sim.day.lat, sim.day.dec);
  if (sim.hour >= sim.day.end - 0.25 && !sim.ending) { sim.ending = true; emit(sim, 'dusk'); }
  stepPlayer(sim, dt);
  stepBees(sim, dt);
  stepPatches(sim, dt);
  if (sim.hour >= sim.day.end) finish(sim);
}

function finish(sim) {
  const tg = sim.day.targets;
  const medal = sim.nectar >= tg[2] ? 3 : sim.nectar >= tg[1] ? 2 : sim.nectar >= tg[0] ? 1 : 0;
  sim.result = {
    nectar: sim.nectar, trips: sim.trips, lost: sim.lost, medal,
    perPatch: sim.patches.map((p) => ({ id: p.id, name: p.name, color: p.color, loads: p.loads, deaths: p.deaths, mg: p.loads * p.q * LOAD_MG * (p.toxic ? 0 : 1) })),
    ...sim.danceStats,
  };
  emit(sim, 'end', sim.result);
}

export function colonyCounts(sim) {
  let idle = 0, out = 0, dead = 0;
  for (const b of sim.bees) b.s === 'idle' || b.s === 'unload' ? idle++ : b.s === 'dead' ? dead++ : out++;
  return { idle, out, dead, total: sim.bees.length };
}
