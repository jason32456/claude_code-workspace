import { compile, WISHES } from './plan.js';
import { softScore, hardViolations, explain } from './score.js';
import { Annealer } from './solver.js';

const keyOf = (it, g) => `${it.type}|${Math.min(g, it.other)}|${Math.max(g, it.other)}`;

// Promote one wish to hard, re-solve warm from the current seating, and say
// what the room gives up to get it.
export function whatIf(plan, occ, wish, { seed = 7, iterations = 250_000 } = {}) {
  const P = compile(plan);
  const Q = compile(plan, [wish], { home: occ, homeBonus: 2 });
  const a = P.gIndex.get(wish.a), b = P.gIndex.get(wish.b);

  const ok = (o) => {
    const ex = explain(P, o);
    return ex[a].items.some((it) => it.other === b && it.type === wish.type && it.ok);
  };
  // The home bonus keeps the answer an edit of the current seating rather than
  // a relabelled one. A cool run stays local; a warmer one finds cheaper
  // rearrangements. The cheaper satisfying answer wins.
  const tries = [0.06, 0.3].map((heat, i) => {
    const o = new Annealer(Q, occ, { seed: seed + i, iterations, rounds: 2, heat }).run().occ;
    return { o, good: ok(o) && hardViolations(P, o).length <= hardViolations(P, occ).length, soft: softScore(P, o) };
  });
  tries.sort((x, y) => (y.good - x.good) || (y.soft - x.soft));
  const next = tries[0].o;
  const before = softScore(P, occ), after = softScore(P, next);
  const hardBefore = hardViolations(P, occ).length, hardAfter = hardViolations(P, next).length;
  const satisfied = ok(next);

  const exB = explain(P, occ), exA = explain(P, next);
  const status = (ex) => {
    const m = new Map();
    ex.forEach((row, g) => row.items.forEach((it) => { if (it.type !== 'party') m.set(keyOf(it, g), { ...it, g }); }));
    return m;
  };
  const sb = status(exB), sa = status(exA);
  const lost = [], gained = [];
  for (const [k, v] of sb) {
    const w = sa.get(k);
    if (!w) continue;
    if (v.ok && !w.ok) lost.push(v);
    if (!v.ok && w.ok && !(k === keyOf({ type: wish.type, other: b }, a))) gained.push(w);
  }
  const moved = [], changedTable = [];
  for (let g = 0; g < P.n; g++) {
    const s0 = occ.indexOf(g), s1 = next.indexOf(g);
    if (s0 === s1) continue;
    moved.push(g);
    if (s0 < 0 || s1 < 0 || P.seatTable[s0] !== P.seatTable[s1]) changedTable.push(g);
  }
  return {
    satisfied,
    feasible: satisfied && hardAfter <= hardBefore,
    cost: before - after,
    before, after, hardBefore, hardAfter,
    lost: lost.map((it) => ({ a: it.g, b: it.other, type: it.type, label: WISHES[it.type]?.short })),
    gained: gained.map((it) => ({ a: it.g, b: it.other, type: it.type, label: WISHES[it.type]?.short })),
    moved,
    changedTable,
    occ: next,
  };
}
