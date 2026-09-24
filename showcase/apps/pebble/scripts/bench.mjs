// Physics, rules and AI checks. Run: node scripts/bench.mjs
import * as P from '../src/physics.js';
import * as C from '../src/constants.js';
import { scoreEnd, adjudicate } from '../src/rules.js';
import { chooseShot, aiSweep } from '../src/ai.js';

const rows = [];
function check(name, ok, detail) {
  rows.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

function lone(broom, v0, spin, sweep = 0) {
  const s = P.makeStone(0, 'red');
  P.deliver(s, broom, v0, spin);
  let tn = null;
  let tf = null;
  P.simulate([s], 0, {
    sweepFn: () => sweep,
    trace: (_, t) => {
      if (tn === null && s.y >= C.NEAR_HOG) tn = t;
      if (tf === null && s.y >= C.FAR_HOG) tf = t;
    },
  });
  return { s, h2h: tn !== null && tf !== null ? tf - tn : null };
}

function speedFor(targetY, spin) {
  let lo = 1.5;
  let hi = 3;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    const { s } = lone(0, m, spin);
    if (s.inPlay && s.y < targetY) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

// 1. draw weight and hog-to-hog time
const vDraw = speedFor(C.FAR_TEE, 1);
const draw = lone(0, vDraw, 1);
check('Draw weight hog-to-hog', draw.h2h > 12.5 && draw.h2h < 15, `v0 ${vDraw.toFixed(3)} m/s, hog-to-hog ${draw.h2h.toFixed(2)} s (curlers call 13–15 s draw weight)`);

// 2. curl
const curlDraw = Math.abs(draw.s.x);
check('Draw curl', curlDraw > 0.9 && curlDraw < 1.6, `${curlDraw.toFixed(2)} m lateral with the broom on the centre line`);
const hitStone = P.makeStone(0, 'red');
P.deliver(hitStone, 0, 3.2, 1);
let xAtTee = null;
P.simulate([hitStone], 0, { trace: () => { if (xAtTee === null && hitStone.y >= C.FAR_TEE) xAtTee = hitStone.x; } });
check('Takeout curl', Math.abs(xAtTee) < 0.4, `${Math.abs(xAtTee).toFixed(3)} m at the tee line at 3.2 m/s`);

// 3. sweeping
const light = lone(0, vDraw - 0.12, 1);
const lightSwept = lone(0, vDraw - 0.12, 1, 1);
const g2 = lightSwept.s.y - light.s.y;
check('Full-length sweep distance', g2 > 2.5 && g2 < 5, `+${g2.toFixed(2)} m on a stone thrown 0.12 m/s light`);
check('Sweeping straightens', Math.abs(lightSwept.s.x) < Math.abs(light.s.x), `curl ${Math.abs(light.s.x).toFixed(2)} m unswept vs ${Math.abs(lightSwept.s.x).toFixed(2)} m swept despite travelling ${g2.toFixed(1)} m further`);

// 4. collision
const a = P.makeStone(0, 'red');
const b = P.makeStone(1, 'yellow');
a.x = 0; a.y = 30; a.vy = 2; a.inPlay = a.moving = true;
b.x = 0; b.y = 30.5; b.inPlay = true;
const ctx = P.newCtx(0);
const pBefore = a.vy + b.vy;
while (!ctx.impacts.length) P.step([a, b], P.DT, 0, -1, ctx);
const ratio = b.vy / (a.vy + b.vy);
const expected = (1 + P.RESTITUTION) / 2;
const pAfter = a.vy + b.vy;
check('Head-on momentum', Math.abs(pAfter - pBefore) < 0.02, `p before ${pBefore.toFixed(3)} after ${pAfter.toFixed(3)} (per unit mass, friction during approach included)`);
check('Struck-stone speed', Math.abs(ratio - expected) < 0.01, `struck/shooter share ${ratio.toFixed(3)} vs (1+e)/2 = ${expected.toFixed(3)}`);

// 5. rules
function at(id, team, x, y) { const s = P.makeStone(id, team); s.x = x; s.y = y; s.inPlay = true; return s; }
let sc = scoreEnd([at(0, 'red', 0, C.FAR_TEE + 0.1), at(1, 'red', 0.5, C.FAR_TEE), at(2, 'yellow', 0.8, C.FAR_TEE), at(3, 'red', 1.2, C.FAR_TEE)]);
check('Scoring counts to opponent', sc.team === 'red' && sc.points === 2, `red ${sc.points} (expected 2)`);
sc = scoreEnd([at(0, 'red', 0, C.FAR_TEE - 2.2), at(1, 'yellow', 2.1, C.FAR_TEE)]);
check('Blank end', sc.team === null, 'no stone biting the house scores nothing');
sc = scoreEnd([at(0, 'yellow', 1.95, C.FAR_TEE)]);
check('Biter counts', sc.team === 'yellow' && sc.points === 1, 'stone edge 2 cm inside the 12-foot counts');

{
  const sh = P.makeStone(5, 'red');
  const world = [sh];
  const before = P.cloneStones(world);
  P.deliver(sh, 0, 1.9, 1);
  const c = P.simulate(world, 5);
  const ev = adjudicate(world, before, sh, c, 3);
  check('Hog line', !sh.inPlay && ev.some((e) => e.type === 'hog'), `stone stopped at y=${sh.y.toFixed(2)} (hog ${C.FAR_HOG.toFixed(2)}) removed`);
}
{
  const guard = at(1, 'yellow', 0, C.FAR_TEE - 3);
  const sh = P.makeStone(2, 'red');
  const world = [guard, sh];
  const before = P.cloneStones(world);
  P.deliver(sh, 0, 4, 0);
  const c = P.simulate(world, 2);
  const guardWasOut = !world[0].inPlay || world[0].y > C.BACK_LINE;
  const ev = adjudicate(world, before, sh, c, 2);
  const g = world[0];
  check('Free guard zone', ev.some((e) => e.type === 'fgz') && g.inPlay && Math.abs(g.y - (C.FAR_TEE - 3)) < 1e-9 && !sh.inPlay, `peel on a centre guard with stone 3 of the end: guard ${guardWasOut ? 'was removed, then ' : ''}restored, shooter removed`);
}

// 6. AI
async function aiTrial(setup, n, test) {
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const world = setup();
    const shooter = world.find((s) => s.id === 99);
    const plan = await chooseShot({ stones: world, shooter, team: 'yellow', hammer: 'yellow', thrownCount: 8, level: 'olympic', seed: 1000 + i * 7 });
    const before = P.cloneStones(world);
    P.deliver(shooter, plan.exec.broom, plan.exec.v0, plan.spin);
    let clock = 0;
    let sweeping = false;
    const c = P.simulate(world, 99, {
      sweepFn: (s, t) => {
        if (t - clock > 0.25) { clock = t; sweeping = aiSweep(world, s, plan); }
        return sweeping ? 1 : 0;
      },
    });
    adjudicate(world, before, shooter, c, 8);
    if (test(world, plan)) ok++;
  }
  return ok / n;
}
const house = (s) => s.inPlay && Math.hypot(s.x, s.y - C.FAR_TEE) - C.STONE_R < C.HOUSE_R;
const drawRate = await aiTrial(() => [P.makeStone(99, 'yellow')], 20, (w) => house(w[0]));
check('AI draws into an empty house', drawRate >= 0.8, `${(drawRate * 100).toFixed(0)}% of 20 Olympic throws`);
const hitRate = await aiTrial(() => [at(1, 'red', 0.05, C.FAR_TEE + 0.05), P.makeStone(99, 'yellow')], 20, (w) => !w[0].inPlay || !house(w[0]) || scoreEnd(w).team === 'yellow');
check('AI removes a stone on the button', hitRate >= 0.7, `${(hitRate * 100).toFixed(0)}% of 20 Olympic throws (removed, or outcounted)`);

const failed = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - failed}/${rows.length} passed`);
process.exit(failed ? 1 : 0);
