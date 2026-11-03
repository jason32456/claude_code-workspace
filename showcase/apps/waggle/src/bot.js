// An autopilot scout. It flies, tastes and dances through the same inputs the
// player has. It knows where the patches are (to steer), but learns quality and
// poison only by tasting, and dances against the sun it last saw.
import { bearingOf, wrap180 } from './world.js';
import { toggleHive, setDanceFor, ENTRANCE, M_PER_S } from './sim.js';

export function createBot(opts = {}) {
  let s = (opts.seed ?? 7) >>> 0;
  return {
    mode: opts.mode || 'honest', clock: opts.mode === 'expert', target: null, quota: opts.quota ?? 12, runs: 0, cool: 0,
    rnd: () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296), want: null,
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function value(sim, m) {
  const p = sim.patches[m.i];
  if (m.toxic || m.q <= 0) return 0;
  const left = Math.min(p.open[1], sim.day.end) - sim.hour;
  if (left < 0.6 || sim.hour < p.open[0]) return 0;
  return m.q * (p.hornet ? 0.4 : 1) * Math.min(1, left / 2) * (0.4 + 0.6 * p.stock / p.cap) / (1 + m.dist / 900);
}

function bestMem(sim) {
  let best = null, bv = 0.05;
  for (const id of sim.player.memOrder) {
    const v = value(sim, sim.player.mem[id]);
    if (v > bv) { bv = v; best = id; }
  }
  return best;
}

export function botStep(sim, bot) {
  const I = sim.input, P = sim.player;
  I.turn = 0; I.fwd = 0; I.boost = false; I.climb = 0;
  if (bot.mode === 'lazy') return;
  if (bot.cool > 0) { bot.cool -= 1 / 60; }

  if (P.inHive) {
    const D = sim.dance;
    const best = bestMem(sim);
    const stale = !bot.clock && sim.hour - P.sunSeen.hour > 0.3;
    const untasted = sim.patches.some((p) => !P.mem[p.id]);
    if (!best || bot.runs >= bot.quota || (stale && D.state === 'ready')) {
      if (D.state !== 'ready') { I.waggle = false; return; }
      I.waggle = false; bot.runs = 0;
      bot.target = untasted ? 'scout' : 'resight';
      toggleHive(sim);
      return;
    }
    setDanceFor(sim, best);
    const m = P.mem[best];
    if (!bot.want || D.state === 'ready') {
      bot.want = bot.mode === 'random'
        ? { a: (bot.rnd() - 0.5) * 360, d: 0.4 + bot.rnd() * 4 }
        : { a: wrap180(m.bearing - (bot.clock ? sim.sun.az : P.sunSeen.az)), d: m.dist / M_PER_S };
    }
    const A = bot.want.a;
    if (D.state === 'ready') {
      I.aim = A;
      I.waggle = Math.abs(wrap180(D.th - A)) < 4;
    } else if (D.state === 'run') {
      I.aim = A + 0.8 * wrap180(A - D.th);
      I.waggle = D.t < bot.want.d;
      if (!I.waggle) { bot.runs++; bot.want = null; }
    } else I.waggle = false;
    return;
  }

  // outside: pick a destination
  if (bot.target === null || bot.target === 'scout') {
    const prior = (p) => (bot.clock ? -p.r / (1 + Math.hypot(p.x, p.z) / 500) : Math.hypot(p.x, p.z));
    const todo = sim.patches.filter((p) => !P.mem[p.id]).sort((a, b) => prior(a) - prior(b));
    bot.target = todo.length ? todo[0].i : 'home';
  }
  if (bot.target === 'resight') { bot.target = 'hop'; bot.cool = 1.5; }
  let tx, tz, landing = false, low = false;
  if (typeof bot.target === 'number') {
    const p = sim.patches[bot.target];
    if (P.mem[p.id] && P.mem[p.id].hour >= sim.hour - 0.02) bot.target = 'home';
    tx = p.x; tz = p.z; const d = Math.hypot(P.x - p.x, P.z - p.z);
    if (d < p.r * 0.7) { landing = true; low = true; }
    else if (d < p.r + 60) low = true;
    const home = Math.hypot(P.x, P.z);
    if (P.energy < 0.12 + home / 4500 && !landing) bot.target = 'home';
  }
  if (bot.target === 'hop') {
    if (bot.cool > 0) { tx = 0; tz = 60; } else bot.target = 'home';
  }
  if (bot.target === 'home') {
    tx = ENTRANCE.x; tz = ENTRANCE.z + 1;
    const d = Math.hypot(P.x - tx, P.z - tz);
    if (d < 40) { low = true; if (d < 14) landing = true; }
  }
  if (tx === undefined) return;
  const want = bearingOf(tx - P.x, tz - P.z);
  const err = wrap180(want - P.yaw);
  I.turn = clamp(err / 20, -1, 1);
  const g = sim.ground(P.x, P.z), agl = P.y - g;
  const tgtAgl = landing ? 2.5 : low ? 5 : 14;
  I.climb = clamp((tgtAgl - agl) / 2, -1, 1);
  if (landing) I.fwd = -1;
  else if (Math.abs(err) > 50) I.fwd = -1;
  else if (!low && P.energy > 0.35) { I.fwd = 1; I.boost = true; }
  else I.fwd = low ? -1 : 0;
  if (bot.target === 'home' && Math.hypot(P.x - ENTRANCE.x, P.z - ENTRANCE.z) < 3.5) {
    toggleHive(sim);
    if (P.inHive) bot.target = null;
  }
}
