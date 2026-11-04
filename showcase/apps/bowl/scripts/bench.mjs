// Headless checks for Bowl. Run from the app folder: node scripts/bench.mjs
import * as T from '../src/track.js';
import { createSim, step, forces, integrate, hash, evaluate, leafOf, DT, EFF, MASTER_F, TRACK_F } from '../src/sim.js';
import { makeBot, botStep } from '../src/bot.js';
import { SHIFTS } from '../src/shifts.js';

let fails = 0;
const row = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${detail}`); if (!ok) fails++; };
const car = (o = {}) => ({ id: 0, type: 'box', block: 'CHI', len: 19, mass: 34000, rr: 0.0025, cda: 10, ...o });
const body = (cars, s, v, bits = [null, null, null], plan = null) => {
  const b = { id: Math.random(), cars, s, v, bits, plan, manual: false, pre: false, block: cars[0].block, wasMoving: true, born: 0 };
  b.len = cars.reduce((a, c) => a + c.len, 0); b.mass = cars.reduce((a, c) => a + c.mass, 0);
  return b;
};
function run(i, kind = 'expert') {
  const S = createSim(i), bot = makeBot(kind);
  while (!S.done) { botStep(S, bot); step(S, DT); }
  return S;
}

// 1. Free roll in the bowl: deceleration is g(rr − grade)/EFF.
{
  const b = body([car({ cda: 0 })], 340, 3);
  const v0 = b.v, s0 = b.s;
  while (b.s < 500) { const { Fd, R } = forces(b, 3, 0, 1, false, false); integrate(b, Fd, R, DT); }
  const a = (v0 * v0 - b.v * b.v) / (2 * (b.s - s0));
  const want = (T.G * (0.0025 - 0.0005)) / EFF;
  row('free roll deceleration = g(rr − grade)/1.05', Math.abs(a / want - 1) < 0.003, `${a.toFixed(5)} vs ${want.toFixed(5)} m/s²`);
}
// 2. Hump descent against the energy equation.
{
  const b = body([car({ len: 10, cda: 0 })], 5.5, 1.0);
  while (b.s < 39.5) { const { Fd, R } = forces(b, -1, 0, 1, false, false); integrate(b, Fd, R, DT); }
  const d = b.s - 5.5;
  const want = Math.sqrt(1 + (2 * T.G * (0.040 - 0.0025) * d) / EFF);
  row('hump descent speed matches energy balance', Math.abs(b.v / want - 1) < 0.002, `${b.v.toFixed(4)} vs ${want.toFixed(4)} m/s`);
}
// 3. Retarder force: fixed plus weight-responsive, so empties slow harder.
{
  const dec = (m, which) => {
    const b = body([car({ mass: m, len: 10 })], which === 'm' ? 60 : 230, 4);
    const r0 = forces(b, 3, 0, 1, false, false).R;
    const r1 = forces(b, 3, 0, 1, which === 'm', which === 't').R;
    return (r1 - r0) / (m * EFF);
  };
  const mE = dec(30000, 'm'), mL = dec(120000, 'm'), tE = dec(30000, 't'), tL = dec(120000, 't');
  const ok = Math.abs(mE - (MASTER_F[0] + MASTER_F[1] * 30000) / (30000 * EFF)) < 1e-9 && Math.abs(tL - (TRACK_F[0] + TRACK_F[1] * 120000) / (120000 * EFF)) < 1e-9;
  row('retarder decel: empty vs loaded', ok && mE / mL > 1.9 && tE / tL > 1.8, `master ${mE.toFixed(2)}/${mL.toFixed(2)}, track ${tE.toFixed(2)}/${tL.toFixed(2)} m/s²`);
}
// 4. Coupling conserves momentum.
{
  const S = createSim(0);
  S.trains = []; S.train = null; S.bodies = [];
  const A = body([car({ mass: 90000 })], 420, 0, T.leafBits(3), 3);
  const B = body([car({ mass: 34000 }), car({ mass: 34000 })], 380, 2.2, T.leafBits(3), 3);
  S.bodies.push(A, B);
  let p0 = 0, p1 = 0, merged = false;
  for (let i = 0; i < 4000 && !merged; i++) {
    p0 = S.bodies.reduce((a, b) => a + b.mass * b.v, 0);
    step(S, DT);
    if (S.bodies.length === 1) { merged = true; p1 = S.bodies[0].mass * S.bodies[0].v; }
  }
  const ev = S.events.find((e) => e.type === 'couple');
  row('coupling conserves momentum', merged && Math.abs(p1 / p0 - 1) < 0.01, `${p0.toFixed(0)} → ${p1.toFixed(0)} kg·m/s, graded ${ev?.cls} at ${(ev?.v * 3.6).toFixed(1)} km/h`);
}
// 5. An occupied switch refuses to throw, and the cut behind goes the wrong way.
{
  const mk = (blocker) => {
    const S = createSim(0);
    S.trains = []; S.train = null; S.bodies = []; S.switches.fill(0);
    if (blocker) S.bodies.push(body([car({ mass: 120000, rr: 0.004 })], 121, 0.3, [0, null, null], 0));
    const B = body([car({ mass: 30000, rr: 0.0015 })], 60, 6.5, [null, null, null], 7);
    B.manual = true;
    S.bodies.push(B);
    for (let i = 0; i < 400; i++) step(S, DT);
    return { S, B };
  };
  const a = mk(true), b = mk(false);
  const mis = a.S.events.some((e) => e.type === 'misroute');
  row('occupied switch is locked → misroute', a.B.bits[0] === 0 && mis && b.B.bits[0] === 1, `blocked: leg ${a.B.bits[0]}, clear: leg ${b.B.bits[0]}`);
}
// 6. Determinism.
{
  const h1 = hash(run(2)), h2 = hash(run(2));
  row('same seed, same final state', h1 === h2, `${h1} / ${h2}`);
}
// 7. Bots on every shift, plus the car ledger and radar accuracy.
for (let i = 0; i < SHIFTS.length; i++) {
  const S = run(i);
  const r = S.result;
  const ids = new Set();
  let dup = 0, n = 0;
  for (const b of S.bodies) for (const c of b.cars) { if (ids.has(c.id)) dup++; ids.add(c.id); if (!c.pre) n++; }
  row(`${SHIFTS[i].name}: car ledger`, !dup && n === S.nCars, `${n} of ${S.nCars} cars, ${dup} duplicates`);
  row(`${SHIFTS[i].name}: expert bot takes gold`, r.medal === 'gold', `${r.total}/${r.max} (${((r.total / r.max) * 100).toFixed(0)}%), damage ${r.damage}, gaps ${r.gapM.toFixed(0)} m`);
  const nb = run(i, 'nobrake').result, nr = run(i, 'noroute').result;
  row(`${SHIFTS[i].name}: no-brake bot damages freight`, nb.damage <= -300 && !nb.medal, `damage ${nb.damage}, total ${nb.total}`);
  row(`${SHIFTS[i].name}: no-route bot misroutes`, nr.misroute <= -300 && !nr.medal, `misroute ${nr.misroute}, total ${nr.total}`);
}
{
  let se = 0, n = 0;
  for (let i = 0; i < SHIFTS.length; i++) {
    const S = createSim(i), bot = makeBot(), seen = new Set();
    while (!S.done) {
      botStep(S, bot); step(S, DT);
      for (const b of S.bodies) if (b.radar?.done && !b.radar.guess && !seen.has(b.id) && !b.pre) {
        seen.add(b.id);
        const t = (b.cars.reduce((a, c) => a + c.mass * c.rr, 0) / b.mass) * S.coldF;
        se += (b.rrEst - t) ** 2; n++;
      }
    }
  }
  const rms = Math.sqrt(se / n);
  row('radar rr estimate within the noise it adds', rms < 3.5e-4, `rms error ${rms.toExponential(2)} over ${n} cuts`);
}
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
