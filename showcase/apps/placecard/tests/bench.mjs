// node tests/bench.mjs — checks the scorer, solver and pre-flight lint.
import { compile, emptyPlan } from '../js/core/plan.js';
import { totalScore, hardViolations, explain } from '../js/core/score.js';
import { Annealer, EFFORT } from '../js/core/solver.js';
import { lint } from '../js/core/lint.js';
import { whatIf } from '../js/core/whatif.js';
import { demoPlan } from '../js/core/demo.js';
import { mulberry32, shuffle } from '../js/core/rng.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const guests = (k) => Array.from({ length: k }, (_, i) => ({ id: `g${i}`, name: `Guest ${i}`, party: '', tag: '', diet: '' }));
const rounds = (count, seats) => Array.from({ length: count }, (_, i) => ({ id: `t${i}`, name: `T${i}`, shape: 'round', seats, x: 0, y: 0, rot: 0 }));

// 1. Incremental score equals a full recomputation after many random moves.
{
  const plan = demoPlan();
  const P = compile(plan);
  const ann = new Annealer(P, null, { seed: 11, iterations: 50_000 });
  ann.T0 = 1e9; ann.Tend = 1e9;
  ann.step(50_000);
  const { running, full } = ann.recomputeCheck();
  check('incremental score = full recompute (50k random moves)', Math.abs(running - full) < 1e-6, `${running.toFixed(3)} vs ${full.toFixed(3)}`);
}

// 2. Planted optimum: wishes generated only from one seating; solver must match it.
{
  const rand = mulberry32(5);
  const plan = emptyPlan();
  plan.guests = guests(60);
  plan.tables = rounds(6, 10);
  plan.settings.groupBonus = 0;
  const planted = shuffle(plan.guests.map((g) => g.id), rand);
  const seatOf = new Map(planted.map((id, i) => [id, `t${Math.floor(i / 10)}:${i % 10}`]));
  const tableOf = (id) => seatOf.get(id).split(':')[0];
  const local = (id) => +seatOf.get(id).split(':')[1];
  let w = 0;
  for (let i = 0; i < 160; i++) {
    const a = planted[Math.floor(rand() * 60)], b = planted[Math.floor(rand() * 60)];
    if (a === b) continue;
    const same = tableOf(a) === tableOf(b);
    const adj = same && ((local(a) - local(b) + 10) % 10 === 1 || (local(b) - local(a) + 10) % 10 === 1);
    const type = adj ? 'next' : same ? (rand() < 0.3 ? 'must' : 'prefer') : rand() < 0.3 ? 'never' : 'apart';
    plan.wishes.push({ id: `w${w++}`, type, a, b });
  }
  const P = compile(plan);
  const occPlanted = new Int32Array(P.S).fill(-1);
  for (const [id, key] of seatOf) occPlanted[P.seatIndex.get(key)] = P.gIndex.get(id);
  const target = totalScore(P, occPlanted);
  const ann = new Annealer(P, null, { seed: 3, iterations: EFFORT.thorough });
  const r = ann.run();
  const hv = hardViolations(P, r.occ).length;
  check('planted instance: zero hard violations', hv === 0, `${hv} violations`);
  check('planted instance: score ≥ planted seating', r.score >= target - 1e-6, `found ${r.score.toFixed(1)}, planted ${target.toFixed(1)}`);
}

// 3. Brute force: 8 guests, two round tables of four, every permutation.
{
  const rand = mulberry32(9);
  const plan = emptyPlan();
  plan.guests = guests(8);
  plan.tables = rounds(2, 4);
  plan.settings.groupBonus = 0;
  plan.guests[0].party = plan.guests[1].party = 'p0';
  const types = ['next', 'prefer', 'apart', 'never', 'prefer', 'next'];
  for (let i = 0; i < 14; i++) {
    const a = Math.floor(rand() * 8), b = Math.floor(rand() * 8);
    if (a !== b) plan.wishes.push({ id: `w${i}`, type: types[i % types.length], a: `g${a}`, b: `g${b}` });
  }
  const P = compile(plan);
  let best = -Infinity;
  const perm = [0, 1, 2, 3, 4, 5, 6, 7];
  const occ = new Int32Array(8);
  const heap = (k) => {
    if (k === 1) { occ.set(perm); const s = totalScore(P, occ); if (s > best) best = s; return; }
    for (let i = 0; i < k; i++) {
      heap(k - 1);
      const j = k % 2 ? 0 : i;
      [perm[j], perm[k - 1]] = [perm[k - 1], perm[j]];
    }
  };
  heap(8);
  const r = new Annealer(P, null, { seed: 1, iterations: 100_000 }).run();
  check('brute force: solver hits the true optimum over 40,320 seatings', Math.abs(r.score - best) < 1e-6, `solver ${r.score.toFixed(1)}, optimum ${best.toFixed(1)}`);
}

// 4. Lint soundness.
{
  const base = () => { const p = emptyPlan(); p.guests = guests(12); p.tables = rounds(2, 6); return p; };
  const fires = (plan, title) => lint(compile(plan)).some((f) => f.level === 'error' && f.title.includes(title));

  let p = base(); p.guests.push(...guests(13).slice(12));
  check('lint: more guests than seats', fires(p, 'More guests than seats'));

  p = base(); for (let i = 0; i < 7; i++) p.guests[i].party = 'big';
  check('lint: group larger than any table', fires(p, 'must share one table'));

  p = base(); p.guests[0].party = p.guests[1].party = 'x';
  p.wishes.push({ id: 'a', type: 'must', a: 'g1', b: 'g2' }, { id: 'b', type: 'never', a: 'g0', b: 'g2' });
  check('lint: never-pair inside a must chain', fires(p, 'Contradiction'));

  p = base();
  for (let i = 0; i < 4; i++) p.guests[i].party = 'a';
  for (let i = 4; i < 8; i++) p.guests[i].party = 'b';
  for (let i = 8; i < 12; i++) p.guests[i].party = 'c';
  check('lint: three groups of 4 cannot pack into two tables of 6', fires(p, 'cannot be packed'));

  p = base(); p.locks = { g0: { seat: 't0:0' }, g1: { seat: 't0:0' } };
  check('lint: two guests locked to one seat', fires(p, 'locked to one seat'));

  p = base();
  for (let i = 1; i <= 3; i++) p.wishes.push({ id: `n${i}`, type: 'next', a: 'g0', b: `g${i}` });
  check('lint: three "next to" wishes warn', lint(compile(p)).some((f) => f.level === 'warn'));

  const demoFindings = lint(compile(demoPlan())).filter((f) => f.level === 'error');
  check('lint: silent on the demo plan', demoFindings.length === 0, demoFindings.map((f) => f.title).join('; '));
}

// 5. Locks hold, 6. determinism.
{
  const plan = demoPlan();
  const P = compile(plan);
  const a = new Annealer(P, null, { seed: 42, iterations: 300_000 }).run();
  const b = new Annealer(P, null, { seed: 42, iterations: 300_000 }).run();
  let held = true;
  for (let g = 0; g < P.n; g++) {
    const s = a.occ.indexOf(g);
    if (P.lockSeat[g] >= 0 && s !== P.lockSeat[g]) held = false;
    if (P.lockTable[g] >= 0 && P.seatTable[s] !== P.lockTable[g]) held = false;
  }
  check('locks hold after solving the demo', held);
  check('same seed → identical seating', a.occ.every((v, i) => v === b.occ[i]));
  const hv = hardViolations(P, a.occ);
  check('demo solves with zero hard violations', hv.length === 0, `${hv.length}`);

  // 7. What-if answers: a satisfiable wish becomes satisfied.
  const ex = explain(P, a.occ);
  let target = null;
  ex.forEach((row, g) => row.items.forEach((it) => {
    if (!target && !it.ok && it.type === 'prefer' && P.lockTable[g] < 0 && P.lockTable[it.other] < 0) target = { a: P.guests[g].id, b: P.guests[it.other].id, type: 'prefer' };
  }));
  if (target) {
    const r = whatIf(plan, a.occ, target);
    check('what-if: an unmet unlocked wish can be met, and the cost is reported', r.satisfied && Number.isFinite(r.cost), `cost ${r.cost.toFixed(1)}, lost ${r.lost.length}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
