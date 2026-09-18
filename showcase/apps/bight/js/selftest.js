// Checks against answers derived outside the code being checked.
//
// This app needs them more than most. A knot invariant that is subtly wrong is
// still perfectly self-consistent: the diagram extracts, the state sum
// converges, the polynomial is palindromic, and the answer is wrong. Three real
// bugs in this project produced exactly that, and every one was caught here
// rather than by reading the code:
//
//   - an inverted crossing sign (caught by the Jones divisibility constraint)
//   - projections chosen BECAUSE they silently dropped a crossing (caught by
//     projection-direction invariance)
//   - a KMT reducer passing strands through the cable (caught by Jones and
//     Alexander independently reporting det 7 -> det 5)

import * as L from './laurent.js';
import { buildCurve, curveInfo } from './curves.js';
import { buildDiagram, bestDiagram } from './diagram.js';
import { jones, jonesAtMinusOne, countLoops, kauffmanBracket } from './jones.js';
import { alexander, alexanderAtMinusOne, isPalindromic } from './alexander.js';
import { colourNullity, colourEnumerate } from './colour.js';
import { kmtReduce } from './simplify.js';
import { closedTangle } from './sampler.js';
import { v3 } from './geom.js';

const ok = (name, pass, detail) => ({ name, pass, detail });
const absBig = (x) => (x < 0n ? -x : x);

// Published values. These are the ONLY hand-entered mathematics in the app, and
// they are used exclusively as an oracle -- never in the pipeline -- so a bug in
// the extractor cannot agree with itself past them.
const PUBLISHED = {
  unknot: { V: '1', D: '1', det: 1n },
  trefoil: { V: 't⁻¹ + t⁻³ − t⁻⁴', D: 't² − t + 1', det: 3n },
  figure8: { V: 't² − t + 1 − t⁻¹ + t⁻²', D: 't² − 3t + 1', det: 5n },
  cinquefoil: { V: 't⁻² + t⁻⁴ − t⁻⁵ + t⁻⁶ − t⁻⁷', D: 't⁴ − t³ + t² − t + 1', det: 5n },
  sevenOne: { V: 't⁻³ + t⁻⁵ − t⁻⁶ + t⁻⁷ − t⁻⁸ + t⁻⁹ − t⁻¹⁰', D: 't⁶ − t⁵ + t⁴ − t³ + t² − t + 1', det: 7n },
};
// Minimum crossing numbers, so a reduction cannot claim the impossible.
const MIN_CROSSING = { unknot: 0, trefoil: 3, trefoilL: 3, figure8: 4, cinquefoil: 5, sevenOne: 7, granny: 3 };

export function runAll() {
  const t = [];
  const cache = new Map();
  const load = (id) => {
    if (!cache.has(id)) {
      const pts = buildCurve(id);
      const d = bestDiagram(pts);
      cache.set(id, { pts, d, j: jones(d), a: alexander(d) });
    }
    return cache.get(id);
  };

  // 1. Jones against published values, computed from COORDINATES.
  {
    const bad = [];
    for (const [id, want] of Object.entries(PUBLISHED)) {
      const { j } = load(id);
      const got = j.jones ? L.format(j.jones, 't') : 'ERR';
      if (got !== want.V) bad.push(`${curveInfo(id).label}: got ${got}, published ${want.V}`);
    }
    t.push(ok('Jones polynomial matches published values for 0₁, 3₁, 4₁, 5₁, 7₁ — from geometry, no hand-typed PD codes',
      bad.length === 0, bad.length ? bad.join(' | ') : '5 of 5 exact'));
  }

  // 2. Alexander against published values, by machinery sharing no code.
  {
    const bad = [];
    for (const [id, want] of Object.entries(PUBLISHED)) {
      const { a } = load(id);
      const got = a.alexander ? L.format(a.alexander, 't') : 'ERR';
      if (got !== want.D) bad.push(`${curveInfo(id).label}: got ${got}, published ${want.D}`);
    }
    t.push(ok('Alexander polynomial matches published values, via Fox calculus — no bracket, no state sum, no shared code',
      bad.length === 0, bad.length ? bad.join(' | ') : '5 of 5 exact'));
  }

  // 3. The bridge theorem, on fixtures and on random tangles.
  {
    const bad = [];
    let checked = 0;
    for (const id of Object.keys(MIN_CROSSING)) {
      const { j, a } = load(id);
      if (!j.jones || !a.alexander) continue;
      const v = absBig(jonesAtMinusOne(j.jones));
      const dd = absBig(alexanderAtMinusOne(a.alexander));
      checked++;
      if (v !== dd) bad.push(`${curveInfo(id).label}: |V(-1)|=${v} vs |Δ(-1)|=${dd}`);
    }
    for (let s = 1; s <= 6; s++) {
      const tg = closedTangle({ n: 60, seed: s * 1013, moves: 600, thickness: 0.25, confine: 0.3 });
      const r = kmtReduce(tg.points);
      let d;
      try { d = bestDiagram(r.points, 20); } catch (e) { continue; }
      if (d.crossings.length > 16) continue;
      const j = jones(d);
      let a = null;
      try { a = alexander(d); } catch (e) { continue; }
      if (!j.jones || !a.alexander) continue;
      const v = absBig(jonesAtMinusOne(j.jones));
      const dd = absBig(alexanderAtMinusOne(a.alexander));
      checked++;
      if (v !== dd) bad.push(`tangle seed ${s}: |V(-1)|=${v} vs |Δ(-1)|=${dd}`);
    }
    t.push(ok('Bridge theorem |V(−1)| = |Δ(−1)| = det(K) holds on every fixture and on random tangles',
      bad.length === 0, bad.length ? bad.join(' | ') : `${checked} diagrams, all agree`));
  }

  // 4. KMT preserves both invariants, and never claims the impossible.
  {
    const bad = [];
    for (const id of Object.keys(MIN_CROSSING)) {
      const { pts, d, j, a } = load(id);
      const r = kmtReduce(pts);
      let d1;
      try { d1 = bestDiagram(r.points); } catch (e) { bad.push(`${id}: reduced curve will not project`); continue; }
      const j1 = jones(d1);
      let a1 = null;
      try { a1 = alexander(d1); } catch (e) { /* fallthrough */ }
      if (!j.jones || !j1.jones || !L.equal(j.jones, j1.jones)) {
        bad.push(`${curveInfo(id).label}: V changed under reduction`);
      } else if (!a1 || !a1.alexander || !L.equal(a.alexander, a1.alexander)) {
        bad.push(`${curveInfo(id).label}: Δ changed under reduction`);
      } else if (d1.crossings.length < MIN_CROSSING[id]) {
        bad.push(`${curveInfo(id).label}: ${d1.crossings.length} crossings below the minimum ${MIN_CROSSING[id]}`);
      }
    }
    t.push(ok('KMT reduction preserves V and Δ, and never returns a diagram below the knot’s minimum crossing number',
      bad.length === 0, bad.length ? bad.join(' | ') : `7 fixtures, all preserved`));
  }

  // 5. Colourings two ways, plus the p | det theorem.
  {
    const bad = [];
    let cmp = 0;
    for (const id of ['trefoil', 'figure8', 'cinquefoil', 'sevenOne']) {
      const { d, j } = load(id);
      const det = absBig(jonesAtMinusOne(j.jones));
      for (const p of [3, 5, 7]) {
        const byRank = colourNullity(d, p);
        const byEnum = colourEnumerate(d, p);
        if (!byEnum.tooBig) {
          cmp++;
          if (byRank.count !== byEnum.count) {
            bad.push(`${curveInfo(id).label} p=${p}: elimination ${byRank.count} vs enumeration ${byEnum.count}`);
          }
        }
        const nontrivial = byRank.count > p;
        const divides = (det % BigInt(p)) === 0n;
        if (nontrivial !== divides) {
          bad.push(`${curveInfo(id).label} p=${p}: nontrivial=${nontrivial} but p|det=${divides}`);
        }
      }
    }
    t.push(ok('Fox colourings: Gaussian elimination agrees with brute-force enumeration, and p-colourability ⟺ p | det(K)',
      bad.length === 0, bad.length ? bad.join(' | ') : `${cmp} enumeration comparisons, 12 theorem checks, all agree`));
  }

  // 6. Delta is palindromic. The code never enforces this, so it is free.
  {
    const bad = [];
    for (const id of Object.keys(MIN_CROSSING)) {
      const { a } = load(id);
      if (a.alexander && !isPalindromic(a.alexander)) bad.push(curveInfo(id).label);
    }
    t.push(ok('Δ(t) is palindromic on every fixture — an invariant the code never enforces',
      bad.length === 0, bad.length ? `not palindromic: ${bad.join(', ')}` : '7 of 7'));
  }

  // 7. The theorem-level asymmetry: Jones sees chirality, Alexander cannot.
  {
    const R = load('trefoil'), Lf = load('trefoilL');
    const vDiff = !L.equal(R.j.jones, Lf.j.jones);
    const aSame = L.equal(R.a.alexander, Lf.a.alexander);
    const isMirror = L.equal(Lf.j.jones, L.mirror(R.j.jones));
    t.push(ok('Jones separates the two trefoils and Alexander provably cannot — and the two Jones values are exact mirrors',
      vDiff && aSame && isMirror,
      `V differ: ${vDiff}, V is exact mirror: ${isMirror}, Δ identical: ${aSame} (both ${L.format(R.a.alexander, 't')})`));
  }

  // 8. Projection-direction invariance. This is the check that caught the
  //    crossing-dropping bug, because a bad projection changes the answer.
  {
    const bad = [], cover = [];
    for (const id of ['trefoil', 'figure8', 'cinquefoil', 'sevenOne']) {
      // Projected from the KMT-REDUCED curve, which is the same knot and the
      // thing the app actually measures. Sweeping directions on the full
      // 280-vertex curve cost 5.7 of this suite's 6.3 seconds: crossing
      // detection is O(n^2) per direction, and a grazing projection of 7_1 at
      // full resolution yields 15-16 crossings, so the bracket then sums tens
      // of thousands of states for a diagram nobody looks at. The invariance
      // being asserted is identical either way.
      const pts = kmtReduce(buildCurve(id)).points;
      const seen = new Set();
      let valid = 0, minN = Infinity, maxN = 0;
      for (let k = 0; k < 24; k++) {
        const y = 1 - (2 * k + 1) / 24;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const th = k * 2.399963229728653;
        let d;
        try { d = buildDiagram(pts, v3(r * Math.cos(th), y, r * Math.sin(th)), k * 0.41); } catch (e) { continue; }
        if (d.crossings.length > 16) continue;
        const j = jones(d);
        if (!j.jones) continue;
        valid++;
        minN = Math.min(minN, d.crossings.length);
        maxN = Math.max(maxN, d.crossings.length);
        seen.add(L.format(j.jones, 't'));
      }
      if (seen.size !== 1) bad.push(`${curveInfo(id).label}: ${seen.size} distinct V over ${valid} projections`);
      else if (valid < 3) bad.push(`${curveInfo(id).label}: only ${valid} valid projections`);
      else cover.push(`${curveInfo(id).label}: ${valid} projections, ${minN}–${maxN} crossings`);
    }
    t.push(ok('V is identical across every valid projection direction, though crossing counts differ widely',
      bad.length === 0, bad.length ? bad.join(' | ') : cover.join('; ')));
  }

  // 9. A perturbed embedding of the trefoil is still the trefoil.
  {
    const clean = load('trefoil'), loose = load('granny');
    const same = L.equal(clean.j.jones, loose.j.jones)
      && L.equal(clean.a.alexander, loose.a.alexander);
    t.push(ok('A deliberately perturbed, differently-coordinated trefoil returns identical V and Δ',
      same, `V ${L.format(loose.j.jones, 't')}, Δ ${L.format(loose.a.alexander, 't')}`));
  }

  // 10. The unknot: a geometric certificate AND bracket 1.
  {
    const pts = buildCurve('unknot');
    const r = kmtReduce(pts);
    const { j } = load('unknot');
    t.push(ok('The unknot reduces to a triangle — a geometric certificate — and its bracket is exactly 1',
      r.certificate && L.equal(j.jones, L.one()),
      `${pts.length} → ${r.points.length} vertices, V = ${L.format(j.jones, 't')}`));
  }

  // 11. Loop counting against an independent traversal. The state sum's loop
  //     count is the one quantity the whole bracket rests on.
  {
    const { d } = load('figure8');
    const n = d.crossings.length;
    let bad = 0, checkedStates = 0;
    for (let s = 0; s < (1 << n); s++) {
      const viaUnion = countLoops(d, s);
      // Independent: walk the alternating cycles explicitly, one at a time.
      const viaWalk = walkLoops(d, s);
      checkedStates++;
      if (viaUnion !== viaWalk) bad++;
    }
    t.push(ok('State-sum loop counts agree with an independently written cycle walk, over all 2ⁿ states',
      bad === 0, `${checkedStates} states, ${bad} disagreements`));
  }

  // 12. Exact Laurent arithmetic: mirror is an involution, and the bracket of
  //     the mirror knot is the mirror of the bracket.
  {
    const R = load('trefoil'), Lf = load('trefoilL');
    const involution = L.equal(L.mirror(L.mirror(R.j.jones)), R.j.jones);
    const brR = R.j.bracket, brL = Lf.j.bracket;
    const bracketMirrors = L.equal(brL, L.mirror(brR));
    t.push(ok('Laurent arithmetic is exact: mirror is an involution, and ⟨mirror K⟩ = mirror ⟨K⟩',
      involution && bracketMirrors,
      `involution ${involution}, ⟨3₁*⟩ = mirror⟨3₁⟩ ${bracketMirrors}`));
  }

  return t;
}

// An explicitly sequential walk of the alternating cycles, written separately
// from the union-find in jones.js so the two can disagree.
function walkLoops(diagram, stateBits) {
  const { crossings, arcs } = diagram;
  const n = crossings.length;
  if (n === 0) return 1;
  const key = (c, s) => c * 4 + s;
  const partner = new Int32Array(n * 4).fill(-1);
  const across = new Int32Array(n * 4).fill(-1);
  // Rebuild the pairings without importing smoothingPairs' caller.
  for (let c = 0; c < n; c++) {
    const which = (stateBits >> c) & 1 ? 'B' : 'A';
    for (const [s1, s2] of smoothingPairsLocal(crossings[c], which)) {
      partner[key(c, s1)] = key(c, s2);
      partner[key(c, s2)] = key(c, s1);
    }
  }
  for (const a of arcs) {
    const k1 = key(a.from.crossing, a.from.slot);
    const k2 = key(a.to.crossing, a.to.slot);
    across[k1] = k2; across[k2] = k1;
  }
  const seen = new Uint8Array(n * 4);
  let loops = 0;
  for (let start = 0; start < n * 4; start++) {
    if (seen[start]) continue;
    loops++;
    let cur = start;
    do {
      seen[cur] = 1;
      const p = partner[cur];
      if (p < 0) break;
      seen[p] = 1;
      cur = across[p];
      if (cur < 0) break;
    } while (!seen[cur]);
  }
  return loops;
}

function smoothingPairsLocal(c, which) {
  const dirs = [
    { slot: 0, d: { x: -c.underDir.x, y: -c.underDir.y } },
    { slot: 1, d: { x: -c.overDir.x, y: -c.overDir.y } },
    { slot: 2, d: { x: c.underDir.x, y: c.underDir.y } },
    { slot: 3, d: { x: c.overDir.x, y: c.overDir.y } },
  ];
  dirs.forEach((e) => { e.ang = Math.atan2(e.d.y, e.d.x); });
  dirs.sort((a, b) => a.ang - b.ang);
  const order = dirs.map((e) => e.slot);
  const p = order.indexOf(3);
  const rot = [order[p % 4], order[(p + 1) % 4], order[(p + 2) % 4], order[(p + 3) % 4]];
  return which === 'A'
    ? [[rot[0], rot[1]], [rot[2], rot[3]]]
    : [[rot[1], rot[2]], [rot[3], rot[0]]];
}
