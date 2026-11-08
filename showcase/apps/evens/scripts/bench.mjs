// Headless checks for the money core. Run: node scripts/bench.mjs
import { allocate, parseMinor, format, convert } from '../src/money.js';
import { currencyShares, baseEffect, validate } from '../src/split.js';
import { compute, naivePlan } from '../src/ledger.js';
import { greedy, optimal, apply } from '../src/settle.js';
import { pack, unpack, encode, decode } from '../src/codec.js';
import { demoGroup } from '../src/demo.js';

let seed = 0x2f6b3a1;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pickSome = (arr, min = 1) => {
  const out = arr.filter(() => rnd() < 0.6);
  while (out.length < min) { const x = arr[ri(0, arr.length - 1)]; if (!out.includes(x)) out.push(x); }
  return out;
};

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails++;
};

function randomExpense(ids, base, k) {
  const amount = ri(1, 500000);
  const cur = rnd() < 0.25 ? ['USD', 'GBP', 'JPY', 'KWD'][ri(0, 3)] : base;
  const mode = ['equal', 'shares', 'percent', 'exact', 'items'][k % 5];
  const who = pickSome(ids);
  let split;
  if (mode === 'equal') split = { mode, ids: who };
  else if (mode === 'shares') split = { mode, weights: Object.fromEntries(who.map((id) => [id, ri(1, 9) / (rnd() < 0.3 ? 2 : 1)])) };
  else if (mode === 'percent') {
    const p = allocate(10000, who.map(() => ri(1, 50)));
    split = { mode, weights: Object.fromEntries(who.map((id, i) => [id, p[i] / 100])) };
  } else if (mode === 'exact') {
    const p = allocate(amount, who.map(() => ri(1, 20)));
    split = { mode, amounts: Object.fromEntries(who.map((id, i) => [id, p[i]])) };
  } else {
    const nItems = ri(1, 6);
    const tax = ri(0, Math.floor(amount * 0.1));
    const tip = ri(0, Math.floor(amount * 0.1));
    const prices = allocate(amount - tax - tip, Array.from({ length: nItems }, () => ri(1, 10)));
    if (prices.every((p) => p === 0)) prices[0] = amount - tax - tip;
    split = { mode, tax, tip, items: prices.map((price, i) => ({ name: 'i' + i, price, ids: pickSome(ids) })) };
  }
  const payersIds = pickSome(ids);
  const pa = allocate(amount, payersIds.map(() => ri(1, 5)));
  return {
    id: 'x' + k, kind: rnd() < 0.08 ? 'transfer' : 'expense', title: 't' + k, date: '2026-01-01',
    amount, currency: cur, rate: cur === base ? 1 : [1.08, 0.0061, 1.17, 3.25][ri(0, 3)] * (0.8 + rnd() * 0.4),
    category: 'other', payers: payersIds.map((id, i) => ({ id, amount: pa[i] })).filter((p) => p.amount > 0), split,
  };
}

function randomGroup(nPeople, nExp) {
  const members = Array.from({ length: nPeople }, (_, i) => ({ id: 'p' + i, name: 'P' + i, color: '#000' }));
  const ids = members.map((m) => m.id);
  const base = ['EUR', 'USD', 'JPY'][ri(0, 2)];
  return { id: 'g', name: 'G', base, members, expenses: Array.from({ length: nExp }, (_, k) => randomExpense(ids, base, k)) };
}

// Exhaustive minimum over set partitions: n − max zero-sum blocks.
function bruteMin(vals) {
  const v = vals.filter((x) => x !== 0);
  let best = 0;
  const rec = (i, blocks) => {
    if (i === v.length) {
      if (blocks.every((b) => b === 0)) best = Math.max(best, blocks.length);
      return;
    }
    for (let k = 0; k < blocks.length; k++) { blocks[k] += v[i]; rec(i + 1, blocks); blocks[k] -= v[i]; }
    blocks.push(v[i]); rec(i + 1, blocks); blocks.pop();
  };
  rec(0, []);
  return v.length ? v.length - best : 0;
}

// 1. allocation sums
{
  let bad = 0, invalid = 0;
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  for (let k = 0; k < 2000; k++) {
    const ex = randomExpense(ids, 'EUR', k);
    const err = validate(ex, ids);
    if (err) { invalid++; continue; }
    const { shares } = currencyShares(ex, ids);
    const eff = baseEffect(ex, ids, 'EUR');
    const s1 = Object.values(shares).reduce((a, b) => a + b, 0);
    const s2 = Object.values(eff.owed).reduce((a, b) => a + b, 0);
    const s3 = Object.values(eff.paid).reduce((a, b) => a + b, 0);
    if (s1 !== ex.amount || s2 !== eff.total || s3 !== eff.total) bad++;
  }
  check('allocations sum exactly, 2000 expenses × 5 modes', bad === 0 && invalid === 0, `${bad} off, ${invalid} invalid`);
}

// money primitives
{
  const cases = [['12.345', 'EUR', 1235], ['12,5', 'EUR', 1250], ['1,234.5', 'USD', 123450], ['1500', 'JPY', 1500], ['0.115', 'EUR', 12], ['abc', 'EUR', NaN], ['1.2345', 'KWD', 1235]];
  const ok = cases.every(([t, c, want]) => Object.is(parseMinor(t, c), want));
  check('parseMinor handles commas, rounding and garbage', ok);
  check('format', format(-123456, 'EUR') === '−€1,234.56' && format(1500, 'JPY') === '¥1,500' && format(5, 'USD', { sign: true }) === '+$0.05');
  check('allocate 100 / 3', JSON.stringify(allocate(10000, [1, 1, 1])) === '[3334,3333,3333]');
  check('convert JPY→EUR', convert(150000, 'JPY', 'EUR', 0.0061) === 91500);
}

// 2–5. balances, plans
{
  let sumBad = 0, optBad = 0, orderBad = 0, applyBad = 0, beat = 0, groups = 0;
  for (let k = 0; k < 300; k++) {
    const g = randomGroup(ri(2, 8), ri(1, 14));
    const s = compute(g);
    if (s.invalid.length) { sumBad++; continue; }
    const total = Object.values(s.balance).reduce((a, b) => a + b, 0);
    if (total !== 0) sumBad++;
    const pairs = s.ids.map((id) => [id, s.balance[id]]);
    const o = optimal(pairs).plan, gr = greedy(pairs), nv = naivePlan(s);
    if (o.length !== bruteMin(pairs.map((p) => p[1]))) optBad++;
    if (!(o.length <= gr.length && gr.length <= Math.max(nv.length, gr.length))) orderBad++;
    if (o.length > gr.length) orderBad++;
    if (o.length < gr.length) beat++;
    for (const plan of [o, gr, nv]) {
      const after = apply(pairs, plan);
      if (Object.values(after).some((v) => v !== 0) || plan.some((t) => !(t.amount > 0))) applyBad++;
    }
    groups++;
  }
  check('balances sum to zero, 300 random groups', sumBad === 0, `${sumBad} bad`);
  check('optimal = brute-force minimum (≤8 people)', optBad === 0, `${optBad} mismatches`);
  check('optimal ≤ greedy on every group', orderBad === 0, `optimal beat greedy in ${beat}/${groups}`);
  check('every plan zeroes every balance', applyBad === 0);
}

// Hidden zero-sum pairs: greedy matches the big ones first and misses them.
{
  const pairs = [['a', 1000], ['b', 700], ['c', -600], ['d', -400], ['e', -700]];
  const g = greedy(pairs).length, o = optimal(pairs).plan.length;
  check('known case: optimal beats greedy', o < g, `greedy ${g}, optimal ${o}`);
}

// Large group stays fast and exact.
{
  const vals = Array.from({ length: 20 }, () => ri(-50000, 50000));
  vals[19] = -vals.slice(0, 19).reduce((a, b) => a + b, 0);
  const t0 = performance.now();
  const r = optimal(vals.map((v, i) => ['p' + i, v]));
  const ms = performance.now() - t0;
  check('20 non-zero balances solved exactly', r.exact && ms < 3000, `${ms.toFixed(0)} ms, ${r.plan.length} transfers`);
  const r21 = optimal([...vals.map((v, i) => ['p' + i, v]), ['x', 1], ['y', -1]]);
  check('over the limit falls back to greedy', !r21.exact);
}

// 6. codec
{
  let bad = 0;
  for (let k = 0; k < 120; k++) {
    const g = randomGroup(ri(2, 8), ri(1, 10));
    const back = await decode(await encode(g), (i) => 'p' + i);
    const a = JSON.stringify(pack(g)), b = JSON.stringify(pack(back));
    const ba = compute(g).balance, bb = compute(back).balance;
    if (a !== b || JSON.stringify(ba) !== JSON.stringify(bb)) bad++;
  }
  check('codec round-trips 120 random groups', bad === 0, `${bad} differ`);
  let n = 0;
  const demo = demoGroup(() => 'd' + n++);
  const link = await encode(demo);
  check('demo share link is compact', link.length < 1500, `${link.length} chars`);
  let threw = false;
  try { unpack({ v: 9 }); } catch { threw = true; }
  check('rejects foreign payloads', threw);
}

// 7. demo snapshot
{
  let n = 0;
  const g = demoGroup(() => 'd' + n++);
  const s = compute(g);
  const pairs = s.ids.map((id) => [id, s.balance[id]]);
  const name = Object.fromEntries(g.members.map((m) => [m.id, m.name]));
  const bal = g.members.map((m) => `${m.name} ${s.balance[m.id]}`).join(', ');
  const o = optimal(pairs);
  const counts = [naivePlan(s).length, greedy(pairs).length, o.plan.length];
  console.log('      demo balances:', bal);
  console.log('      demo plan:', o.plan.map((t) => `${name[t.from]}→${name[t.to]} ${t.amount}`).join(', '));
  check('demo snapshot', bal === 'Ana 31030, Ben -10888, Chloé -20142, Dev -10670, Emeka 18300, Fran -7630' && counts.join('/') === '15/5/4' && s.invalid.length === 0, `naive/greedy/optimal = ${counts.join('/')}`);
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
