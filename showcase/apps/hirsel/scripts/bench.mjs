// Headless checks for the simulation. Run from the app folder: node scripts/bench.mjs
import { createSim, step, whistle, penGeometry } from '../src/sim.js';
import { COURSES } from '../src/courses.js';
import { createBot, botWhistle } from '../src/bot.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

function run(course, opts = {}, onStep) {
  const sim = createSim(course, { seed: opts.seed ?? 1 });
  const bot = createBot(opts);
  for (let k = 0; k < 60 * 900 && !sim.result; k++) {
    const c = botWhistle(sim, bot);
    if (c) whistle(sim, c);
    step(sim);
    onStep?.(sim);
  }
  return sim;
}

// 1. Determinism
{
  const a = run(COURSES[1]), b = run(COURSES[1]);
  const same = a.result.score === b.result.score && a.t === b.t && a.sheep.every((s, i) => s.x === b.sheep[i].x && s.z === b.sheep[i].z);
  check('Determinism: same seed, same run', same, `${a.result.score} pts at ${a.t.toFixed(2)} s both times`);
}

// 2. Flight zone
{
  const sim = createSim(COURSES[1]);
  sim.running = true; sim.phase = 'lift';
  const F0 = { ...sim.flock };
  Object.assign(sim.dog, { state: 'lie', x: F0.x, z: F0.z + 40 });
  for (let i = 0; i < 60 * 10; i++) step(sim);
  const calm = Math.max(...sim.sheep.map((s) => s.stress));
  check('Flight zone: a dog lying 40 m off leaves the sheep calm', calm < 0.05, `max stress ${calm.toFixed(3)}`);

  const sim2 = createSim(COURSES[1]);
  sim2.running = true; sim2.phase = 'lift';
  const G0 = { ...sim2.flock };
  Object.assign(sim2.dog, { state: 'walk', x: G0.x, z: G0.z - 22 });
  for (let i = 0; i < 60 * 12; i++) step(sim2);
  const moved = sim2.flock.z - G0.z;
  check('Flight zone: a dog walking up from the north pushes the flock south', moved > 8, `centroid moved ${moved.toFixed(1)} m away from the dog`);
}

// 3. Flank sense, seen from above with -z up the screen
{
  const turn = (cmd) => {
    const sim = createSim(COURSES[1]);
    sim.running = true; sim.phase = 'lift';
    const F = sim.flock;
    Object.assign(sim.dog, { state: 'lie', x: F.x, z: F.z + 25 });
    whistle(sim, cmd);
    const a0 = Math.atan2(sim.dog.z - F.z, sim.dog.x - F.x);
    for (let i = 0; i < 60 * 2; i++) step(sim);
    const a1 = Math.atan2(sim.dog.z - sim.flock.z, sim.dog.x - sim.flock.x);
    return Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
  };
  // With x right and z down the screen, a rising atan2(z, x) is clockwise.
  const cb = turn('comebye'), aw = turn('away');
  check('Flank sense: come bye goes clockwise, away to me anticlockwise', cb > 0.2 && aw < -0.2, `Δθ ${cb.toFixed(2)} / ${aw.toFixed(2)} rad`);
}

// 4 + 5. Bot runs every course; containment checked on every step
for (const c of COURSES) {
  const pg = penGeometry(c.pen), F = c.field;
  let breach = 0, worst = 0;
  const sim = run(c, {}, (s) => {
    for (const sh of s.sheep) {
      if (sh.x < F.x0 || sh.x > F.x1 || sh.z < F.z0 || sh.z > F.z1) breach++;
      // inside a pen hurdle: within 0.3 m of a hurdle line
      for (const [a, b] of [[pg.bl, pg.br], [pg.br, pg.fr], [pg.bl, pg.fl]]) {
        const ex = b[0] - a[0], ez = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((sh.x - a[0]) * ex + (sh.z - a[1]) * ez) / (ex * ex + ez * ez)));
        const d = Math.hypot(sh.x - a[0] - ex * t, sh.z - a[1] - ez * t);
        if (d < 0.3) { breach++; worst = Math.max(worst, 0.3 - d); }
      }
    }
  });
  check(`${c.name}: no sheep through a fence or a hurdle`, breach === 0, breach ? `${breach} breaches, worst ${worst.toFixed(2)} m` : 'every step clear');
  const R = sim.result;
  check(`${c.name}: the bot pens and places`, R.why === 'penned' && !!R.placing, `${R.why}, ${R.score}/${R.max} → ${R.placing ?? 'unplaced'} in ${Math.round(R.time)} s, ${sim.stats.whistles} whistles, ${sim.stats.breaks} breaks`);
}

// Robustness: the bot across other seeds
{
  const rows = [];
  for (const c of COURSES) {
    let placed = 0;
    for (let seed = 2; seed <= 7; seed++) if (run(c, { seed }).result.placing) placed++;
    rows.push(`${c.name} ${placed}/6`);
    check(`${c.name}: the bot places on at least 5 of 6 other seeds`, placed >= 5, rows[rows.length - 1]);
  }
}

// 6. Handling matters
{
  const good = run(COURSES[1]).result, bad = run(COURSES[1], { careless: true }).result;
  check('Handling matters: a careless handler scores worse on Glen Field', bad.score < good.score - 20, `careless ${bad.score} (${bad.why}) vs bot ${good.score}`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
