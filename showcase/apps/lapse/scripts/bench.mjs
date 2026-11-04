// Headless checks for the simulation. Run from the app folder: node scripts/bench.mjs
import { createSim, step, equilibriumTe, airAt, makeBalloon, addRival, predictMarker, DT, FUEL0, BURN_KG, V_ENV, G, mass } from '../src/sim.js';
import { FLIGHTS, bearingOf } from '../src/world.js';
import { createBot, botStep } from '../src/bot.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

function flyBot(i, skill = 'expert', seed = 1, onStep) {
  const sim = createSim(FLIGHTS[i], { seed });
  const bot = createBot(skill, seed); bot.takeoff = 0;
  while (!sim.result) { Object.assign(sim.input, botStep(sim, sim.player, bot)); step(sim); onStep?.(sim); sim.events.length = 0; }
  return sim;
}

// 1. Determinism.
{
  const a = flyBot(1), b = flyBot(1);
  check('determinism (same flight twice)', a.result.total === b.result.total && a.player.x === b.player.x, `${a.result.total} / ${b.result.total}`);
}

// 2. Float temperature: about 75 °C over a 9 °C morning for 620 kg and 2,600 m³.
{
  const sim = createSim(FLIGHTS[0]);
  const P = sim.player, Te = equilibriumTe(sim, P, P.y);
  const { rho } = airAt(sim, P.y);
  const lift = (rho - airAt(sim, P.y).p / (287.05 * Te)) * V_ENV;
  check('equilibrium envelope temperature', Te - 273.15 > 65 && Te - 273.15 < 95 && Math.abs(lift - mass(P)) < 1e-6, `${(Te - 273.15).toFixed(1)} °C, lift ${lift.toFixed(1)} kg vs mass ${mass(P).toFixed(1)} kg`);
}

// 3. Climb response: a 20 s burn from float should lift the balloon, with a lag.
{
  const sim = createSim(FLIGHTS[0]);
  const P = sim.player;
  sim.input.burn = true;
  let tLift = null;
  for (let k = 0; k < 20 * 30; k++) { step(sim); if (tLift == null && P.y - sim.world.L0 > 0.5) tLift = sim.t; }
  sim.input.burn = false;
  let vmax = 0;
  for (let k = 0; k < 60 * 30; k++) { step(sim); vmax = Math.max(vmax, P.vy); }
  check('burner lifts with a lag, climb rate a few m/s', tLift > 2 && vmax > 1 && vmax < 6, `lift-off after ${tLift?.toFixed(1)} s, peak climb ${vmax.toFixed(2)} m/s`);
}

// 4. Fuel ledger: propane used equals burner time × burn rate.
{
  const sim = flyBot(2);
  const P = sim.player;
  const err = Math.abs(FUEL0 - P.fuel - P.burnTime * BURN_KG);
  check('fuel ledger closes', err < 1e-6, `used ${(FUEL0 - P.fuel).toFixed(3)} kg, burn ${P.burnTime.toFixed(1)} s`);
}

// 5. Without heat the balloon cannot hold altitude: inversion-free hands-off run scores nothing.
{
  const sim = createSim(FLIGHTS[0]);
  while (!sim.result) { step(sim); sim.events.length = 0; }
  check('hands-off pilot scores nothing', sim.result.total === 0 && !sim.player.flying, `total ${sim.result.total}, reason ${sim.result.reason}`);
}

// 6. Marker drift: dropped from height, it lands downwind by about the integrated wind.
{
  const sim = createSim(FLIGHTS[0]);
  const P = sim.player, W = sim.world;
  P.y = W.L0 + 400; P.flying = true; P.vx = P.vz = P.vy = 0;
  const pred = predictMarker(sim, P, 0.05);
  let ix = 0, iz = 0;
  for (let h = P.y; h > W.ground(P.x, P.z); h -= 1) { const w = W.wind(P.x + ix, h, P.z + iz, 0); ix += w.x / 8; iz += w.z / 8; }
  const x0 = P.x, z0 = P.z;
  sim.input.drop = true;
  step(sim);
  const mk = sim.markers[0];
  while (!mk.landed) step(sim);
  const e1 = Math.hypot(mk.x - pred.x, mk.z - pred.z), e2 = Math.hypot(mk.x - x0 - ix, mk.z - z0 - iz);
  check('marker drift matches prediction and integrated wind', e1 < 15 && e2 < 60, `vs predictor ${e1.toFixed(1)} m, vs ∫wind dt ${e2.toFixed(1)} m, drift ${Math.hypot(mk.x - x0, mk.z - z0).toFixed(0)} m`);
}

// 7. Power lines: flying into one ends the flight with zero.
{
  const sim = createSim(FLIGHTS[1]);
  const P = sim.player, W = sim.world;
  const sp = W.lines[0][1];
  const mx = (sp.a[0] + sp.b[0]) / 2, mz = (sp.a[1] + sp.b[1]) / 2;
  P.x = mx; P.z = mz - 1; P.y = W.wireHeight(sp, 0.5) - 5; P.flying = true;
  P.score.tasks[0] = { d: 0, pts: 1000 };
  step(sim);
  check('power-line strike is detected and scores zero', P.done && P.endReason === 'strike' && P.score.total === 0);
}

// 8. Wind ladder: the green layer actually goes where the ladder says.
{
  const sim = createSim(FLIGHTS[0]);
  const W = sim.world;
  const L = sim.ladder[2];
  const w = W.wind(FLIGHTS[0].launch[0], W.L0 + 100, FLIGHTS[0].launch[1], 0);
  check('pibal ladder matches the field at launch', Math.abs(bearingOf(L.x, L.z) - bearingOf(w.x, w.z)) < 0.5, `${bearingOf(L.x, L.z).toFixed(1)}° vs ${bearingOf(w.x, w.z).toFixed(1)}°`);
}

// 9. The expert bot medals on every flight and lands legally.
for (let i = 0; i < FLIGHTS.length; i++) {
  const sim = flyBot(i);
  const r = sim.result;
  check(`expert bot medals on ${FLIGHTS[i].name}`, r.medal >= 2 && r.landing?.legal, `${r.total} pts, medal ${r.medal}, goals ${r.tasks.map((t) => t?.pts ?? 0).join('/')}, landed in ${r.landing?.field}`);
}

// 10. Rivals: a full field of bots, the expert should usually beat the rough one.
{
  let wins = 0;
  for (let i = 0; i < FLIGHTS.length; i++) {
    const sim = createSim(FLIGHTS[i]);
    const r = addRival(sim, makeBalloon(sim, FLIGHTS[i].launch[0] + 60, FLIGHTS[i].launch[1], { id: 'r' }));
    const be = createBot('expert', 1), br = createBot('rough', 2);
    be.takeoff = 0;
    for (let k = 0; k < 30 * 3600 && sim.balloons.some((b) => !b.done); k++) {
      Object.assign(sim.input, botStep(sim, sim.player, be));
      step(sim, new Map([['r', botStep(sim, r, br)]]));
      sim.events.length = 0;
    }
    if (sim.player.score.total > r.score.total) wins++;
    console.log(`      ${FLIGHTS[i].name}: expert ${sim.player.score.total} vs rough ${r.score.total}`);
  }
  check('expert beats a rough rival on most flights', wins >= 2, `${wins}/3`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
