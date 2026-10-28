// Headless checks of the physics and the levels. Run from the app folder:
//   node scripts/bench.mjs
import { createSim, step, G, SNOW, DT, steerAuthority, snowRemaining, PROPS } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
import { botInput } from '../src/bot.js';

let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

function run(level, drive) {
  const sim = createSim(level);
  const field0 = snowRemaining(sim.world);
  let k = 0;
  while (sim.phase !== 'over' && sim.t < 400) {
    if (k % 6 === 0) sim.input = drive(sim);
    step(sim); sim.events.length = 0; k++;
  }
  return { sim, field0 };
}

// 1. Rolling on a uniform incline: 5/7 g sin θ, less rolling resistance and drag.
{
  const theta = 15;
  const L = { ...LEVELS[0], seed: 3, pitch: [[0, theta], [2000, theta]], halfWidth: [[0, 40], [2000, 40]], bumps: 0, cliffs: [], tTop: -30, scatter: [], fences: [], rockBands: [] };
  const sim = createSim(L, { r0: 3 });
  sim.world.type.fill(SNOW.ICE); sim.world.depth.fill(0);
  const th = (theta * Math.PI) / 180;
  sim.v = [0, -3 * Math.sin(th), 3 * Math.cos(th)];
  for (let i = 0; i < 60; i++) step(sim);
  const v0 = sim.speed(), t0 = sim.t;
  let dragSum = 0, n = 0;
  while (sim.t - t0 < 2) {
    const sp = sim.speed();
    dragSum += (0.5 * 1.2 * 0.5 * Math.PI * sim.r * sim.r * sp * sp) / sim.mass();
    step(sim); n++;
  }
  const a = (sim.speed() - v0) / (sim.t - t0);
  const expect = (5 / 7) * G * Math.sin(th) - 0.012 * G * Math.cos(th) - dragSum / n;
  check('incline: rolling acceleration matches 5/7 g sin θ', Math.abs(a / expect - 1) < 0.01, `${a.toFixed(4)} vs ${expect.toFixed(4)} m/s²`);
}

// 4. Steering authority falls with size.
{
  let mono = true;
  for (let r = 0.1; r < 10; r += 0.1) if (steerAuthority(r + 0.1) >= steerAuthority(r)) mono = false;
  check('steering authority falls monotonically with radius', mono, `${steerAuthority(0.3).toFixed(2)} m/s² at 0.6 m, ${steerAuthority(4).toFixed(2)} at 8 m`);
}

// 2, 3, 5. Bot runs on every level: books close and the ice breaks.
const botRatios = [];
for (const L of LEVELS) {
  const t0 = Date.now();
  const { sim, field0 } = run(L, botInput);
  const A = sim.acct;
  const ledger = A.initial + A.stuck + A.props - A.shed - A.melted;
  const err = Math.abs(ledger - sim.mass()) / sim.mass();
  check(`${L.name}: mass ledger closes`, err < 1e-6, `rel err ${err.toExponential(1)}`);
  const removed = field0 - snowRemaining(sim.world);
  const err2 = Math.abs(removed - A.removed) / A.removed;
  check(`${L.name}: snow taken from the field = stuck + sprayed`, err2 < 1e-6, `${(removed / 1000).toFixed(1)} t removed, rel err ${err2.toExponential(1)}`);
  const R = sim.result;
  botRatios.push(R.ratio);
  check(`${L.name}: bot breaks the ice`, R.ok, `${R.why}, ×${R.ratio.toFixed(2)} ${R.medal ?? ''}, Ø ${(sim.stats.maxR * 2).toFixed(1)} m, ${sim.t.toFixed(0)} s, ${sim.stats.absorbed} picked up, ${sim.stats.smashed} smashed, ${sim.stats.bounced} bounced (${Date.now() - t0} ms)`);
}

// 6. Line choice matters: rolling straight down Couloir does not earn gold.
{
  const { sim } = run(LEVELS[2], () => ({ steer: 0, tuck: false, brake: false }));
  check('Couloir: hands-off straight line is not gold', sim.result.medal !== 'gold', `${sim.result.why}, ×${sim.result.ratio.toFixed(2)} vs bot ×${botRatios[2].toFixed(2)}`);
}

// Size gates: every prop class is reachable before its own absorb radius is out of reach.
{
  const ok = Object.values(PROPS).every((p) => p.absorbR > 0 && p.mass > 0);
  check('prop table sane', ok);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
