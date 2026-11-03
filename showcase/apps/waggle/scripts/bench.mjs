// Headless checks for the simulation. Run from the app folder: node scripts/bench.mjs
import { createSim, step, toggleHive, setDanceFor, colonyCounts, circMean, ENTRANCE, M_PER_S, LOAD_MG } from '../src/sim.js';
import { DAYS, sunAt, wrap180 } from '../src/world.js';
import { createBot, botStep } from '../src/bot.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

function runDay(d, mode, seed = 1, onStep) {
  const sim = createSim(DAYS[d], { seed });
  const bot = createBot({ mode });
  while (!sim.result) { botStep(sim, bot); step(sim); onStep?.(sim); sim.events.length = 0; }
  return sim;
}

// Taste a patch by hovering on it, then go straight into the hive.
function tasteAndEnter(sim, id) {
  const p = sim.patches.find((p) => p.id === id), P = sim.player;
  Object.assign(sim.input, { fwd: -1, climb: 0, turn: 0 });
  P.x = p.x; P.z = p.z; P.y = sim.ground(p.x, p.z) + 2; P.speed = 3;
  for (let k = 0; k < 90 && !P.mem[id]; k++) step(sim);
  P.x = ENTRANCE.x; P.z = ENTRANCE.z + 10; P.y = 3;
  toggleHive(sim);
  setDanceFor(sim, id);
  return P.mem[id];
}

// Dance for `seconds`, fighting the jostle. `angleOf` may follow the real sun.
function dance(sim, angleOf, dur, seconds) {
  const D = sim.dance, I = sim.input, recruits = [];
  for (let k = 0; k < seconds * 60; k++) {
    const angle = typeof angleOf === 'function' ? angleOf() : angleOf;
    if (D.state === 'ready') { I.aim = angle; I.waggle = Math.abs(wrap180(D.th - angle)) < 3; }
    else if (D.state === 'run') { I.aim = angle + 0.8 * wrap180(angle - D.th); I.waggle = D.t < dur; }
    else I.waggle = false;
    step(sim);
    for (const e of sim.events) if (e.type === 'recruit') recruits.push(e);
    sim.events.length = 0;
  }
  return recruits;
}

// 1. Determinism
{
  const a = runDay(1, 'expert', 4), b = runDay(1, 'expert', 4);
  const same = a.nectar === b.nectar && a.bees.every((x, i) => x.x === b.bees[i].x && x.z === b.bees[i].z && x.s === b.bees[i].s);
  check('Determinism: same seed, same day', same, `${a.nectar} mg both times`);
}

// 2. Solar track
for (const day of DAYS) {
  const noon = sunAt(12, day.lat, day.dec);
  let mono = true, prev = sunAt(day.start, day.lat, day.dec).az, maxRate = 0, maxAt = 0;
  for (let h = day.start + 0.05; h <= day.end; h += 0.05) {
    const az = sunAt(h, day.lat, day.dec).az, r = wrap180(az - prev) / 0.05;
    if (r <= 0) mono = false;
    if (r > maxRate) { maxRate = r; maxAt = h; }
    prev = az;
  }
  check(`Sun (${day.id}): 180° at noon, always clockwise, fastest at noon`,
    Math.abs(noon.az - 180) < 1e-6 && mono && Math.abs(maxAt - 12) < 0.1,
    `peak ${maxRate.toFixed(1)}°/h at ${maxAt.toFixed(2)} h, ${(maxRate / 60).toFixed(2)}°/sim-s`);
}

// 3. Decoding: a fresh, careful dance
{
  const sim = createSim(DAYS[0], { seed: 3 });
  const m = tasteAndEnter(sim, 'rape');
  const rec = dance(sim, () => wrap180(m.bearing - sim.sun.az), m.dist / M_PER_S, 120);
  const { mean } = circMean(rec.map((r) => r.bearing));
  const md = rec.reduce((a, r) => a + r.dist, 0) / rec.length;
  const eb = Math.abs(wrap180(mean - m.bearing)), ed = Math.abs(md / m.dist - 1);
  check('Decoding: recruits read a careful dance', rec.length >= 8 && eb < 3 && ed < 0.05,
    `${rec.length} recruits, mean bearing off ${eb.toFixed(1)}°, distance off ${(ed * 100).toFixed(1)}%`);
}

// 4. Stale sun near noon
{
  const sim = createSim(DAYS[1], { seed: 5 });
  while (sim.hour < 11.6) step(sim);
  const m = tasteAndEnter(sim, 'clover');
  const seen = sim.player.sunSeen.az;
  while (sim.hour < 12.3) step(sim);
  const rec = dance(sim, wrap180(m.bearing - seen), m.dist / M_PER_S, 40);
  const { mean } = circMean(rec.map((r) => r.bearing));
  const drift = wrap180(sim.sun.az - seen), err = Math.abs(wrap180(mean - m.bearing));
  check('Stale sun: a dance 40 min after the last sighting misses', err > 10,
    `sun moved ${drift.toFixed(1)}°, recruits off by ${err.toFixed(1)}°`);
}

// 5. Poison
{
  const sim = createSim(DAYS[1], { seed: 2 });
  const m = tasteAndEnter(sim, 'sprayed');
  dance(sim, wrap180(m.bearing - sim.sun.az), m.dist / M_PER_S, 40);
  toggleHive(sim);
  for (let k = 0; k < 60 * 120; k++) { step(sim); sim.events.length = 0; }
  const honest = [1, 2, 3].map((s) => runDay(1, 'honest', s).lost);
  check('Poison: dancing the sprayed field kills bees; tasting first avoids it', sim.lost > 5 && honest.every((l) => l === 0),
    `${sim.lost} lost after dancing it; honest bot lost ${honest.join(', ')}`);
}

// 6. Conservation
{
  let ok = true, worst = '';
  const sim = runDay(2, 'expert', 1, (s) => {
    const c = colonyCounts(s);
    if (c.idle + c.out + c.dead !== s.day.colony) { ok = false; worst = `t=${s.t.toFixed(2)}`; }
  });
  const ledger = sim.patches.reduce((a, p) => a + p.loads * p.q * LOAD_MG * (p.toxic ? 0 : 1), 0);
  check('Conservation: every bee accounted for on every step; nectar ledger closes', ok && Math.abs(ledger - sim.nectar) < 1e-6,
    ok ? `${sim.day.colony} bees, ledger ${ledger.toFixed(1)} = ${sim.nectar.toFixed(1)} mg` : worst);
}

// 7. Strategy
for (let d = 0; d < DAYS.length; d++) {
  const seeds = [1, 2, 3];
  const h = seeds.map((s) => runDay(d, 'honest', s).nectar);
  const x = seeds.map((s) => runDay(d, 'expert', s).nectar);
  const r = seeds.map((s) => runDay(d, 'random', s).nectar);
  const z = runDay(d, 'lazy', 1).nectar;
  const avg = (a) => a.reduce((p, q) => p + q, 0) / a.length;
  const tg = DAYS[d].targets;
  check(`Strategy (${DAYS[d].id}): honest ≥ bronze, expert ≫ random, idle = 0`,
    Math.min(...h) >= tg[0] && avg(x) > 5 * Math.max(1, avg(r)) && z === 0,
    `honest ${h.map(Math.round).join('/')}, expert ${x.map(Math.round).join('/')}, random ${r.map(Math.round).join('/')}, targets ${tg.join('/')}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
