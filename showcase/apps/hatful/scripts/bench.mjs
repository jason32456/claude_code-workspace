import { analyse, draw, cyclesOf, isValid } from '../src/engine.js';
import { makeRng, randomSeed } from '../src/rng.js';
import { sealOf } from '../src/seal.js';
import {
  makeTicket,
  openTicket,
  ticketNeedsPin,
  makeEnvelope,
  readEnvelope,
  verifyEnvelope,
} from '../src/links.js';

// Pins the generator so a platform or refactor change that alters draws is caught.
const GOLDEN = '403,54,751,195';

let passed = 0;
let failed = 0;

async function check(id, name, fn) {
  const t0 = performance.now();
  let res;
  try {
    res = await fn();
  } catch (err) {
    res = { ok: false, detail: `threw ${err?.code ?? ''} ${err?.message ?? err}` };
  }
  const ok = res === true || res?.ok === true;
  const detail = res && typeof res === 'object' && res.detail ? `  [${res.detail}]` : '';
  const secs = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(4)} ${name}${detail}  (${secs}s)`);
  if (ok) passed++;
  else failed++;
}

// ---------------------------------------------------------------- helpers

const rng = makeRng('hatful-bench');

function makeEvent(n, { mode = 'any', groups = [], bans = [] } = {}) {
  return {
    id: 'ev',
    title: 'Bench',
    date: '',
    budget: '',
    note: '',
    mode,
    people: Array.from({ length: n }, (_, i) => ({
      id: 'p' + i,
      name: 'Person' + i,
      group: groups[i] ?? null,
      hint: '',
    })),
    bans: bans.map(([a, b]) => ({ from: 'p' + a, to: 'p' + b })),
    usePin: false,
    draw: null,
  };
}

function randomEvent(n, mode, banP, groupP) {
  const groups = [];
  for (let i = 0; i < n; i++) {
    groups.push(rng.next() < groupP ? 'g' + rng.int(Math.max(1, Math.ceil(n / 2))) : null);
  }
  const bans = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && rng.next() < banP) bans.push([i, j]);
  const ev = makeEvent(n, { mode, groups, bans });
  if (rng.next() < 0.2) ev.bans.push({ from: 'ghost', to: 'p0' }, { from: 'p0', to: 'nobody' });
  return ev;
}

// Independent of the engine: the rules read straight from the event.
function ruleAllowed(ev) {
  const n = ev.people.length;
  const idx = new Map(ev.people.map((p, i) => [p.id, i]));
  const A = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const gi = ev.people[i].group;
      return i !== j && !(gi != null && gi === ev.people[j].group);
    })
  );
  for (const b of ev.bans) {
    if (idx.has(b.from) && idx.has(b.to)) A[idx.get(b.from)][idx.get(b.to)] = false;
  }
  return A;
}

function modeOk(perm, mode) {
  const n = perm.length;
  if (mode === 'noswap') return perm.every((j, i) => perm[j] !== i);
  if (mode === 'loop') {
    let x = perm[0];
    let c = 1;
    while (x !== 0) {
      x = perm[x];
      c++;
    }
    return c === n;
  }
  return true;
}

function enumerate(A, mode) {
  const n = A.length;
  const out = [];
  const perm = new Array(n);
  const used = new Array(n).fill(false);
  (function rec(i) {
    if (i === n) {
      if (modeOk(perm, mode)) out.push(perm.slice());
      return;
    }
    for (let j = 0; j < n; j++) {
      if (!used[j] && A[i][j]) {
        used[j] = true;
        perm[i] = j;
        rec(i + 1);
        used[j] = false;
      }
    }
  })(0);
  return out;
}

function bruteMarginals(perms, n) {
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const p of perms) for (let i = 0; i < n; i++) m[i][p[i]] += 1 / perms.length;
  return m;
}

function maxDiff(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a.length; j++) d = Math.max(d, Math.abs(a[i][j] - b[i][j]));
  return d;
}

function assignKey(asg, ids) {
  return ids.map((id) => asg[id]).join(',');
}

function lgamma(xx) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = xx;
  let tmp = xx + 5.5;
  tmp -= (xx + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / xx);
}

function chiSquareP(chi, df) {
  if (chi <= 0) return 1;
  const a = df / 2;
  const x = chi / 2;
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 2000; n++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 2000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

function chiSquare(counts, expected) {
  let chi = 0;
  for (const c of counts) chi += (c - expected) ** 2 / expected;
  return { chi, df: counts.length - 1, p: chiSquareP(chi, counts.length - 1) };
}

const fmtP = (p) => (p < 1e-300 ? '<1e-300' : p.toExponential(2));

const derangements = (() => {
  const D = [0n, 0n, 1n];
  for (let n = 3; n <= 30; n++) D[n] = BigInt(n - 1) * (D[n - 1] + D[n - 2]);
  return D;
})();
const factorial = (n) => (n <= 1 ? 1n : BigInt(n) * factorial(n - 1));

// ---------------------------------------------------------------- 1

await check('1', 'count equals brute force, 300 random rule sets, n=3..8', () => {
  let bad = 0;
  let feasibleSets = 0;
  let first = '';
  for (let t = 0; t < 300; t++) {
    const n = 3 + rng.int(6);
    const ev = randomEvent(n, 'any', rng.next() * 0.35, rng.next() * 0.6);
    const A = ruleAllowed(ev);
    const perms = enumerate(A, 'any');
    const a = analyse(ev);
    const sameAllowed = JSON.stringify(a.allowed) === JSON.stringify(A);
    if (perms.length > 0) feasibleSets++;
    if (a.total !== perms.length || a.feasible !== perms.length > 0 || a.method !== 'exact' || !sameAllowed) {
      bad++;
      first ||= `n=${n} brute=${perms.length} engine=${a.total}`;
    }
  }
  return { ok: bad === 0, detail: `${feasibleSets} feasible of 300, mismatches ${bad} ${first}`.trim() };
});

// ---------------------------------------------------------------- 2

await check('2', 'unrestricted counts equal derangement numbers, n=3..18', () => {
  let bad = '';
  for (let n = 3; n <= 18; n++) {
    const a = analyse(makeEvent(n));
    if (a.method !== 'exact' || !Number.isInteger(a.total) || BigInt(a.total) !== derangements[n]) {
      bad += ` n=${n}:${a.total}!=${derangements[n]}`;
    }
  }
  return { ok: bad === '', detail: bad || `D(18) = ${derangements[18]}` };
});

await check('2b', 'float tier (n=19..22) totals match D(n) within 1e-12 relative', () => {
  let worst = 0;
  for (const n of [19, 22]) {
    const a = analyse(makeEvent(n));
    const rel = Math.abs(a.total - Number(derangements[n])) / Number(derangements[n]);
    worst = Math.max(worst, rel);
    if (a.method !== 'float') return { ok: false, detail: `n=${n} method ${a.method}` };
  }
  return { ok: worst < 1e-12, detail: `worst relative error ${worst.toExponential(1)}` };
});

// ---------------------------------------------------------------- 3

await check('3', 'marginal rows and columns sum to 1; equal brute force for n<=7', () => {
  let worstSum = 0;
  let worstDiff = 0;
  let compared = 0;
  const sets = [];
  for (let t = 0; t < 120; t++) sets.push(randomEvent(3 + rng.int(5), 'any', rng.next() * 0.3, rng.next() * 0.5));
  for (let t = 0; t < 30; t++) sets.push(randomEvent(8 + rng.int(6), 'any', rng.next() * 0.2, rng.next() * 0.4));
  for (const ev of sets) {
    const a = analyse(ev);
    if (!a.feasible) continue;
    const n = a.n;
    for (let i = 0; i < n; i++) {
      worstSum = Math.max(worstSum, Math.abs(a.marginals[i].reduce((s, x) => s + x, 0) - 1));
      let col = 0;
      for (let k = 0; k < n; k++) col += a.marginals[k][i];
      worstSum = Math.max(worstSum, Math.abs(col - 1));
    }
    if (n <= 7) {
      worstDiff = Math.max(worstDiff, maxDiff(a.marginals, bruteMarginals(enumerate(ruleAllowed(ev), 'any'), n)));
      compared++;
    }
  }
  const sym = analyse(makeEvent(18)).marginals;
  const symOk = Math.abs(sym[0][1] - 1 / 17) < 1e-12 && sym[0][0] === 0;
  return {
    ok: worstSum < 1e-9 && worstDiff < 1e-9 && symOk,
    detail: `max |sum-1| ${worstSum.toExponential(1)}, max |brute diff| ${worstDiff.toExponential(1)} over ${compared} sets, n=18 symmetric ${symOk}`,
  };
});

// ---------------------------------------------------------------- 4

const couples5 = makeEvent(5, { groups: ['x', 'x', 'y', 'y', null] });
const ids5 = couples5.people.map((p) => p.id);
const perms5 = enumerate(ruleAllowed(couples5), 'any');
const keys5 = perms5.map((p) => p.map((j) => ids5[j]).join(','));

function naiveDraw(A, r) {
  const n = A.length;
  for (;;) {
    const recv = r.shuffle(Array.from({ length: n }, (_, i) => i));
    const used = new Set();
    const perm = [];
    let ok = true;
    for (let i = 0; i < n; i++) {
      const j = recv.find((x) => !used.has(x) && A[i][x]);
      if (j === undefined) {
        ok = false;
        break;
      }
      used.add(j);
      perm.push(j);
    }
    if (ok) return perm;
  }
}

const DRAWS4 = 200000;
let chiEngine;
await check('4a', `sampler uniform: 5 people, 2 couples, ${DRAWS4} draws, chi-square p>0.001`, () => {
  const tally = new Map(keys5.map((k) => [k, 0]));
  for (let i = 0; i < DRAWS4; i++) {
    const k = assignKey(draw(couples5, 'u' + i).assignment, ids5);
    if (!tally.has(k)) return { ok: false, detail: 'draw outside the valid set ' + k };
    tally.set(k, tally.get(k) + 1);
  }
  chiEngine = chiSquare([...tally.values()], DRAWS4 / keys5.length);
  return {
    ok: chiEngine.p > 0.001,
    detail: `${keys5.length} valid draws, chi2=${chiEngine.chi.toFixed(1)}, df=${chiEngine.df}, p=${fmtP(chiEngine.p)}`,
  };
});

await check('4b', 'foil: naive "first allowed remaining" sampler FAILS the same test', () => {
  const A = ruleAllowed(couples5);
  const r = makeRng('foil');
  const tally = new Map(keys5.map((k) => [k, 0]));
  for (let i = 0; i < DRAWS4; i++) {
    const k = naiveDraw(A, r).map((j) => ids5[j]).join(',');
    tally.set(k, tally.get(k) + 1);
  }
  const foil = chiSquare([...tally.values()], DRAWS4 / keys5.length);
  return {
    ok: foil.p < 0.001,
    detail: `foil chi2=${foil.chi.toFixed(1)} p=${fmtP(foil.p)}; engine chi2=${chiEngine?.chi.toFixed(1)} p=${fmtP(chiEngine?.p ?? NaN)}`,
  };
});

// ---------------------------------------------------------------- 5

await check('5a', 'loop mode: count equals brute force, n<=8, 150 random rule sets', () => {
  let bad = 0;
  let feasible = 0;
  let first = '';
  for (let t = 0; t < 150; t++) {
    const n = 3 + rng.int(6);
    const ev = randomEvent(n, 'loop', rng.next() * 0.3, rng.next() * 0.4);
    const perms = enumerate(ruleAllowed(ev), 'loop');
    const a = analyse(ev);
    if (perms.length) feasible++;
    if (a.total !== perms.length || a.feasible !== perms.length > 0 || a.method !== 'exact') {
      bad++;
      first ||= `n=${n} brute=${perms.length} engine=${a.total}`;
    }
  }
  return { ok: bad === 0, detail: `${feasible} feasible of 150, mismatches ${bad} ${first}`.trim() };
});

await check('5b', 'loop mode: marginals equal brute force (n<=7); unrestricted total = (n-1)! to n=16', () => {
  let worst = 0;
  let compared = 0;
  for (let t = 0; t < 100; t++) {
    const n = 3 + rng.int(5);
    const ev = randomEvent(n, 'loop', rng.next() * 0.3, rng.next() * 0.4);
    const perms = enumerate(ruleAllowed(ev), 'loop');
    if (!perms.length) continue;
    worst = Math.max(worst, maxDiff(analyse(ev).marginals, bruteMarginals(perms, n)));
    compared++;
  }
  let fact = '';
  for (let n = 3; n <= 16; n++) {
    const a = analyse(makeEvent(n, { mode: 'loop' }));
    if (BigInt(a.total) !== factorial(n - 1)) fact += ` n=${n}:${a.total}`;
  }
  return { ok: worst < 1e-9 && fact === '', detail: `max diff ${worst.toExponential(1)} over ${compared} sets${fact ? ', bad totals' + fact : ''}` };
});

await check('5c', 'loop mode: every sample is one n-cycle and valid (exact tier, n<=16 and sampled tier, n=20)', () => {
  let samples = 0;
  for (let t = 0; t < 40; t++) {
    const n = 3 + rng.int(8);
    const ev = randomEvent(n, 'loop', rng.next() * 0.25, rng.next() * 0.4);
    if (!analyse(ev).feasible) continue;
    for (let s = 0; s < 15; s++) {
      const d = draw(ev, `loop${t}-${s}`);
      const cyc = cyclesOf(d.assignment);
      if (cyc.length !== 1 || cyc[0].length !== n || !isValid(ev, d.assignment) || d.method !== 'exact') {
        return { ok: false, detail: `bad sample t=${t} n=${n}` };
      }
      samples++;
    }
  }
  const big = makeEvent(20, { mode: 'loop', groups: Array.from({ length: 20 }, (_, i) => 'c' + (i >> 1)) });
  for (let s = 0; s < 30; s++) {
    const d = draw(big, 'big' + s);
    if (cyclesOf(d.assignment).length !== 1 || !isValid(big, d.assignment) || d.method !== 'sampled') {
      return { ok: false, detail: 'bad sampled-tier loop sample' };
    }
    samples++;
  }
  return { ok: true, detail: `${samples} samples` };
});

await check('5d', 'loop mode uniform by chi-square (n=5, 4!=24 cycles minus rules)', () => {
  const ev = makeEvent(5, { mode: 'loop', groups: ['a', 'a', null, null, null], bans: [[2, 3]] });
  const ids = ev.people.map((p) => p.id);
  const perms = enumerate(ruleAllowed(ev), 'loop');
  const tally = new Map(perms.map((p) => [p.map((j) => ids[j]).join(','), 0]));
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const k = assignKey(draw(ev, 'lu' + i).assignment, ids);
    tally.set(k, tally.get(k) + 1);
  }
  const r = chiSquare([...tally.values()], N / perms.length);
  return { ok: r.p > 0.001, detail: `${perms.length} cycles, chi2=${r.chi.toFixed(1)}, p=${fmtP(r.p)}` };
});

// ---------------------------------------------------------------- 6

await check('6a', 'noswap: no sample has a 2-cycle (500 draws over random rule sets)', () => {
  let samples = 0;
  for (let t = 0; t < 60; t++) {
    const n = 3 + rng.int(10);
    const ev = randomEvent(n, 'noswap', rng.next() * 0.2, rng.next() * 0.3);
    if (!analyse(ev).feasible) continue;
    for (let s = 0; s < 9; s++) {
      const d = draw(ev, `ns${t}-${s}`);
      const perm = d.assignment;
      if (Object.keys(perm).some((g) => perm[perm[g]] === g) || !isValid(ev, perm)) {
        return { ok: false, detail: `2-cycle or invalid at t=${t}` };
      }
      samples++;
    }
  }
  return { ok: samples > 300, detail: `${samples} samples` };
});

const noswapEv = makeEvent(6, { mode: 'noswap', groups: ['a', 'a', null, null, null, null], bans: [[2, 4]] });
await check('6b', 'noswap: uniform by chi-square, 120000 draws on a 6-person case', () => {
  const ids = noswapEv.people.map((p) => p.id);
  const perms = enumerate(ruleAllowed(noswapEv), 'noswap');
  const tally = new Map(perms.map((p) => [p.map((j) => ids[j]).join(','), 0]));
  const N = 120000;
  for (let i = 0; i < N; i++) {
    const k = assignKey(draw(noswapEv, 'nsu' + i).assignment, ids);
    if (!tally.has(k)) return { ok: false, detail: 'draw outside the valid set' };
    tally.set(k, tally.get(k) + 1);
  }
  const r = chiSquare([...tally.values()], N / perms.length);
  return { ok: r.p > 0.001, detail: `${perms.length} valid draws, chi2=${r.chi.toFixed(1)}, df=${r.df}, p=${fmtP(r.p)}` };
});

await check('6c', 'noswap analysis: totalEstimate within 5% and marginals within 0.04 of brute force', () => {
  const perms = enumerate(ruleAllowed(noswapEv), 'noswap');
  const a = analyse(noswapEv);
  const rel = Math.abs(a.totalEstimate - perms.length) / perms.length;
  const diff = maxDiff(a.marginals, bruteMarginals(perms, 6));
  return {
    ok: a.method === 'sampled' && a.total === null && a.feasible && rel < 0.05 && diff < 0.04,
    detail: `brute ${perms.length}, estimate ${a.totalEstimate?.toFixed(1)}, rel ${rel.toFixed(3)}, marginal diff ${diff.toFixed(3)}`,
  };
});

// ---------------------------------------------------------------- 7

await check('7', 'Hall: 200 random infeasible sets give a valid violator with the true neighbourhood', () => {
  let found = 0;
  let tried = 0;
  while (found < 200 && tried < 20000) {
    tried++;
    const n = 3 + rng.int(10);
    const ev = randomEvent(n, 'any', 0.25 + rng.next() * 0.55, rng.next() * 0.8);
    const a = analyse(ev);
    if (a.feasible) continue;
    found++;
    const A = ruleAllowed(ev);
    const h = a.hall;
    if (!h || !h.givers.length) return { ok: false, detail: 'infeasible without a hall set' };
    const gi = h.givers.map((id) => ev.people.findIndex((p) => p.id === id));
    const nb = new Set();
    for (const i of gi) for (let j = 0; j < n; j++) if (A[i][j]) nb.add(ev.people[j].id);
    const given = new Set(h.receivers);
    const same = nb.size === given.size && [...nb].every((id) => given.has(id));
    if (!(nb.size < gi.length) || !same || new Set(h.givers).size !== h.givers.length) {
      return { ok: false, detail: `bad violator: |S|=${gi.length} |N(S)|=${nb.size} same=${same}` };
    }
  }
  return { ok: found === 200, detail: `${found} infeasible sets from ${tried} generated` };
});

// ---------------------------------------------------------------- 8

await check('8', 'sampled tier: n=26, 13 couples, 200 draws all valid', () => {
  const ev = makeEvent(26, { groups: Array.from({ length: 26 }, (_, i) => 'c' + (i >> 1)) });
  const a = analyse(ev);
  const rowsOk = a.marginals.every((r) => Math.abs(r.reduce((s, x) => s + x, 0) - 1) < 1e-9);
  if (a.method !== 'sampled' || a.total !== null || !a.feasible || !(a.totalEstimate > 0) || !rowsOk) {
    return { ok: false, detail: `analyse method=${a.method} total=${a.total} est=${a.totalEstimate} rowsOk=${rowsOk}` };
  }
  for (let i = 0; i < 200; i++) {
    const d = draw(ev, 's26-' + i);
    if (!isValid(ev, d.assignment) || d.method !== 'sampled') return { ok: false, detail: 'invalid draw ' + i };
  }
  return { ok: true, detail: `analyse ${a.ms.toFixed(0)} ms, estimate ${a.totalEstimate.toExponential(3)}` };
});

await check('8b', 'sampled tier, other modes: n=26 loop and noswap, 50 draws each, plus n=17 loop analysis', () => {
  const groups = Array.from({ length: 26 }, (_, i) => 'c' + (i >> 1));
  for (const mode of ['loop', 'noswap']) {
    const ev = makeEvent(26, { mode, groups });
    const a = analyse(ev);
    if (!a.feasible || a.method !== 'sampled') return { ok: false, detail: `${mode}: ${a.method} feasible=${a.feasible}` };
    for (let i = 0; i < 50; i++) {
      const d = draw(ev, `${mode}-${i}`);
      if (!isValid(ev, d.assignment)) return { ok: false, detail: `${mode} invalid draw` };
    }
  }
  const a17 = analyse(makeEvent(17, { mode: 'loop' }));
  const near = Math.abs(a17.totalEstimate - Number(factorial(16))) / Number(factorial(16)) < 1e-9;
  return { ok: a17.method === 'sampled' && a17.feasible && near, detail: `n=17 loop method ${a17.method}` };
});

await check('8c', 'sampled tier survives tight rules: forced structure via Markov chain still valid', () => {
  // A ring of bans leaves exactly one allowed receiver per giver except a few: rejection cannot find it.
  const n = 24;
  const bans = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && j !== (i + 1) % n && j !== (i + 2) % n) bans.push([i, j]);
  const ev = makeEvent(n, { bans });
  const a = analyse(ev);
  if (!a.feasible) return { ok: false, detail: 'should be feasible' };
  const d = draw(ev, 'tight');
  return { ok: isValid(ev, d.assignment) && d.uniform === false, detail: `uniform=${d.uniform} method=${d.method}` };
});

// ---------------------------------------------------------------- 9

await check('9', 'determinism: same seed same assignment, different seeds differ (all modes, both tiers)', () => {
  const cases = [
    makeEvent(10, { groups: ['a', 'a', 'b', 'b', null, null, null, null, null, null] }),
    makeEvent(10, { mode: 'noswap' }),
    makeEvent(10, { mode: 'loop' }),
    makeEvent(26, { groups: Array.from({ length: 26 }, (_, i) => 'c' + (i >> 1)) }),
  ];
  for (const ev of cases) {
    const a1 = draw(ev, 'alpha');
    const a2 = draw(ev, 'alpha');
    const b = draw(ev, 'beta');
    if (JSON.stringify(a1.assignment) !== JSON.stringify(a2.assignment)) return { ok: false, detail: `${ev.mode} n=${ev.people.length} not reproducible` };
    if (JSON.stringify(a1.assignment) === JSON.stringify(b.assignment)) return { ok: false, detail: `${ev.mode} n=${ev.people.length} seeds collide` };
  }
  const g = makeRng('hatful-golden');
  const golden = [g.int(1000), g.int(1000), g.int(1000), g.int(1000)].join(',');
  const seedA = randomSeed();
  const seedOk = /^[0-9a-f]{32}$/.test(seedA) && seedA !== randomSeed();
  const again = analyse(cases[0]);
  const stable = JSON.stringify(again.marginals) === JSON.stringify(analyse(cases[0]).marginals);
  return { ok: golden === GOLDEN && seedOk && stable, detail: `rng golden ${golden}` };
});

// ---------------------------------------------------------------- 10

const demo = makeEvent(8, { groups: ['a', 'a', 'b', 'b', null, null, null, null], bans: [[4, 5]] });
const payload = {
  t: 'Office swap',
  g: 'Alexandra',
  r: 'Bartholomew',
  h: 'size M, likes tea ☕',
  b: '£15',
  d: '2026-12-18',
  n: 'Bring wrapping',
  s: 'ABCD-EFGH',
};

const ticketPlain = await makeTicket(payload);
const ticketPin = await makeTicket(payload, '4821');

const errCode = async (fn) => {
  try {
    await fn();
    return 'none';
  } catch (e) {
    return e.code ?? 'other';
  }
};

await check('10a', 'ticket round trip without PIN', async () => {
  const back = await openTicket(ticketPlain);
  return {
    ok: JSON.stringify(back) === JSON.stringify(payload) && !ticketNeedsPin(ticketPlain) && ticketPlain.startsWith('h1.k.'),
    detail: `${ticketPlain.length} chars`,
  };
});

await check('10b', 'ticket round trip with PIN, NEED_PIN without one', async () => {
  const back = await openTicket(ticketPin, '4821');
  const need = await errCode(() => openTicket(ticketPin));
  return {
    ok: JSON.stringify(back) === JSON.stringify(payload) && ticketNeedsPin(ticketPin) && ticketPin.startsWith('h1.p.') && need === 'NEED_PIN',
    detail: `${ticketPin.length} chars`,
  };
});

await check('10c', 'wrong PIN gives BAD_PIN', async () => {
  const code = await errCode(() => openTicket(ticketPin, '0000'));
  return { ok: code === 'BAD_PIN', detail: code };
});

await check('10d', 'a flipped character gives BAD_TICKET (every section of both ticket kinds)', async () => {
  const swapChar = (s, i) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
  let tested = 0;
  for (const [ticket, pin] of [[ticketPlain, undefined], [ticketPin, '4821']]) {
    const dots = [];
    for (let i = 0; i < ticket.length; i++) if (ticket[i] === '.') dots.push(i);
    const spots = [0, 1, 3, 5, dots[1] + 1, dots[2] - 1, dots[2] + 2, dots[3] - 1, dots[3] + 1, ticket.length - 1, ticket.length - 2, Math.floor((dots[3] + ticket.length) / 2)];
    for (const i of spots) {
      const code = await errCode(() => openTicket(swapChar(ticket, i), pin));
      tested++;
      if (code !== 'BAD_TICKET') return { ok: false, detail: `index ${i} of ${ticket.slice(0, 5)} gave ${code}` };
    }
  }
  const extra = [await errCode(() => openTicket('')), await errCode(() => openTicket('hello')), await errCode(() => openTicket(ticketPlain.slice(0, -6)))];
  return { ok: extra.every((c) => c === 'BAD_TICKET'), detail: `${tested} flips, junk -> ${extra.join('/')}` };
});

await check('10e', 'ticket text does not contain the receiver name, raw or in base64', async () => {
  const name = payload.r;
  const variants = [name, btoa(name).replace(/=+$/, '')];
  for (let off = 1; off <= 2; off++) {
    const b = btoa('.'.repeat(off) + name).replace(/=+$/, '');
    variants.push(b.slice(off + 1, -2));
  }
  const all = [...variants, ...variants.map((v) => v.replace(/\+/g, '-').replace(/\//g, '_'))];
  const hit = all.find((v) => ticketPlain.includes(v) || ticketPin.includes(v));
  return { ok: !hit, detail: hit ? 'found ' + hit : `${all.length} variants checked` };
});

const demoDraw = draw(demo, 'demo-seed');
const demoSeal = await sealOf(demo, demoDraw.assignment, demoDraw.seed);

await check('10f', 'seal: stable, well formed, changes with one pair / seed / name', async () => {
  const again = await sealOf(demo, demoDraw.assignment, demoDraw.seed);
  const ids = Object.keys(demoDraw.assignment);
  const changed = { ...demoDraw.assignment };
  [changed[ids[0]], changed[ids[1]]] = [changed[ids[1]], changed[ids[0]]];
  const s2 = await sealOf(demo, changed, demoDraw.seed);
  const s3 = await sealOf(demo, demoDraw.assignment, 'other-seed');
  const renamed = { ...demo, people: demo.people.map((p, i) => (i === 0 ? { ...p, name: 'Someone else' } : p)) };
  const s4 = await sealOf(renamed, demoDraw.assignment, demoDraw.seed);
  const shaped = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(demoSeal);
  return { ok: shaped && again === demoSeal && new Set([demoSeal, s2, s3, s4]).size === 4, detail: `${demoSeal}` };
});

await check('10g', 'envelope: export, read, verify; tampering is caught; PINs are not exported', async () => {
  const ev = { ...demo, usePin: true, draw: { seed: demoDraw.seed, assignment: demoDraw.assignment, seal: demoSeal, pins: { p0: '1234' }, sent: { p0: true }, opened: true, at: 1760000000000 } };
  const env = makeEnvelope(ev);
  if (JSON.stringify(env).includes('1234')) return { ok: false, detail: 'PIN leaked into envelope' };
  const read = readEnvelope(JSON.stringify(env));
  const good = await verifyEnvelope(read);
  const tampered = JSON.parse(JSON.stringify(env));
  const ids = Object.keys(tampered.draw.assignment);
  [tampered.draw.assignment[ids[0]], tampered.draw.assignment[ids[1]]] = [tampered.draw.assignment[ids[1]], tampered.draw.assignment[ids[0]]];
  const badRun = await verifyEnvelope(tampered);
  const garbage = [await errCode(() => readEnvelope('{')), await errCode(() => readEnvelope({ v: 2 })), await errCode(() => readEnvelope({ ...env, draw: { ...env.draw, assignment: {} } }))];
  const noDraw = await errCode(() => makeEnvelope({ ...demo, draw: null }));
  return {
    ok: good.ok && !badRun.ok && garbage.every((c) => c === 'BAD_ENVELOPE') && noDraw === 'NO_DRAW',
    detail: `valid ${good.ok}, tampered caught ${!badRun.ok} (valid=${badRun.validAssignment} seal=${badRun.sealMatches} repro=${badRun.reproducible})`,
  };
});

// ---------------------------------------------------------------- 11

await check('11', 'timing: analyse() n=18 unrestricted, mode any, under 1500 ms', () => {
  analyse(makeEvent(12));
  const a = analyse(makeEvent(18));
  return { ok: a.ms < 1500 && a.total === Number(derangements[18]), detail: `${a.ms.toFixed(1)} ms (${a.method})` };
});

await check('11b', 'timing: n=16 noswap and loop under 1000 ms each; n=22 any (float) under 4000 ms', () => {
  const ns = analyse(makeEvent(16, { mode: 'noswap' }));
  const lp = analyse(makeEvent(16, { mode: 'loop' }));
  const big = analyse(makeEvent(22));
  return {
    ok: ns.ms < 1000 && lp.ms < 1000 && big.ms < 4000,
    detail: `noswap ${ns.ms.toFixed(0)} ms, loop ${lp.ms.toFixed(0)} ms, n=22 ${big.ms.toFixed(0)} ms`,
  };
});

// ---------------------------------------------------------------- extras

await check('12', 'edge cases: <3 people tolerated, unknown-id bans ignored, leaks and secrecy sane', () => {
  for (const n of [0, 1, 2]) {
    const ev = makeEvent(n);
    const a = analyse(ev);
    if (a.feasible || a.marginals.length !== n || a.leaks.length || a.hall !== null) return { ok: false, detail: `analyse n=${n}` };
    let code = '';
    try {
      draw(ev, 'x');
    } catch (e) {
      code = e.code;
    }
    if (code !== 'INFEASIBLE') return { ok: false, detail: `draw n=${n} gave ${code}` };
  }
  if (analyse({ people: null, bans: null }).feasible) return { ok: false, detail: 'garbage event' };
  const base = makeEvent(6, { groups: ['a', 'a', null, null, null, null] });
  const noisy = { ...base, bans: [{ from: 'ghost', to: 'p1' }, { from: 'p2', to: 'ghost' }] };
  if (analyse(noisy).total !== analyse(base).total) return { ok: false, detail: 'unknown bans changed the count' };
  // Two couples plus a single: the single's receiver is forced to be a couple member, no leaks needed; check a true forced case.
  const forced = makeEvent(3, { bans: [[0, 1], [1, 2], [2, 0]] });
  const af = analyse(forced);
  const forcedLeaks = af.leaks.filter((l) => l.kind === 'forced').length;
  const open = analyse(makeEvent(5));
  const maxBits = Math.log2(4);
  const secOk = af.secrecy.bits === 0 && Math.abs(open.secrecy.bits - maxBits) < 1e-9 && open.leaks.length === 0 && af.total === 1;
  const impossible = analyse(makeEvent(4, { bans: [[0, 1], [0, 2], [0, 3]] }));
  const hallOk = !impossible.feasible && impossible.hall?.givers.includes('p0') && impossible.hall.receivers.length < impossible.hall.givers.length;
  return { ok: forcedLeaks === 3 && secOk && hallOk, detail: `forced leaks ${forcedLeaks}, open-hat secrecy ${open.secrecy.bits.toFixed(3)}/${maxBits}` };
});

await check('12b', 'cyclesOf / isValid reject wrong assignments', () => {
  const ev = makeEvent(4, { groups: ['a', 'a', null, null] });
  const good = { p0: 'p2', p1: 'p3', p2: 'p0', p3: 'p1' };
  const selfAsg = { p0: 'p0', p1: 'p3', p2: 'p1', p3: 'p2' };
  const house = { p0: 'p1', p1: 'p0', p2: 'p3', p3: 'p2' };
  const dup = { p0: 'p2', p1: 'p2', p2: 'p0', p3: 'p1' };
  const missing = { p0: 'p2', p1: 'p3', p2: 'p0' };
  const noswapEv4 = { ...ev, mode: 'noswap' };
  const loopEv4 = { ...ev, mode: 'loop' };
  const ok =
    isValid(ev, good) && !isValid(ev, selfAsg) && !isValid(ev, house) && !isValid(ev, dup) && !isValid(ev, missing) &&
    !isValid(noswapEv4, good) && !isValid(loopEv4, good) &&
    isValid(loopEv4, { p0: 'p2', p2: 'p1', p1: 'p3', p3: 'p0' }) &&
    cyclesOf(good).length === 2 && cyclesOf({ p0: 'p2', p2: 'p1', p1: 'p3', p3: 'p0' })[0].length === 4;
  return ok;
});

console.log('');
console.log(`${failed === 0 ? 'ALL PASSED' : 'FAILED'}: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
