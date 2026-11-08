// Balances come in as [id, minor] pairs, positive = is owed money.
// Every plan returns [{from, to, amount}] with amount > 0, debtor → creditor.

export const OPTIMAL_LIMIT = 20;

export function greedyWithin(pairs) {
  const cred = pairs.filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debt = pairs.filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const out = [];
  const pick = (arr) => {
    let best = -1;
    for (let i = 0; i < arr.length; i++) if (arr[i].v > 0 && (best < 0 || arr[i].v > arr[best].v)) best = i;
    return best;
  };
  for (;;) {
    const c = pick(cred);
    const d = pick(debt);
    if (c < 0 || d < 0) break;
    const amt = Math.min(cred[c].v, debt[d].v);
    out.push({ from: debt[d].id, to: cred[c].id, amount: amt });
    cred[c].v -= amt;
    debt[d].v -= amt;
  }
  return out;
}

export const greedy = (pairs) => greedyWithin(pairs.filter(([, v]) => v !== 0));

// Fewest transfers = n − (max number of disjoint zero-sum groups). dp over
// masks: dp[m] = max_i dp[m without i] + (sum[m] === 0). Walking an argmax
// path back from the full mask yields an ordering whose zero-sum prefixes are
// the groups; each group is then settled greedily inside itself, which takes
// exactly size − 1 transfers because a maximal group has no zero-sum subgroup.
export function optimal(pairs) {
  const nz = pairs.filter(([, v]) => v !== 0);
  const n = nz.length;
  if (n === 0) return { plan: [], groups: [], exact: true };
  if (n > OPTIMAL_LIMIT) return { plan: greedy(nz), groups: null, exact: false };
  const N = 1 << n;
  const sum = new Float64Array(N);
  const dp = new Int8Array(N);
  for (let m = 1; m < N; m++) {
    const low = m & -m;
    sum[m] = sum[m ^ low] + nz[31 - Math.clz32(low)][1];
  }
  for (let m = 1; m < N; m++) {
    let best = 0;
    for (let r = m; r; r &= r - 1) {
      const v = dp[m ^ (r & -r)];
      if (v > best) best = v;
    }
    dp[m] = best + (sum[m] === 0 ? 1 : 0);
  }
  const order = [];
  let m = N - 1;
  while (m) {
    const want = dp[m] - (sum[m] === 0 ? 1 : 0);
    let pickBit = 0;
    for (let r = m; r; r &= r - 1) {
      const b = r & -r;
      if (dp[m ^ b] === want) { pickBit = b; break; }
    }
    order.unshift(31 - Math.clz32(pickBit));
    m ^= pickBit;
  }
  const groups = [];
  let cur = [];
  let mask = 0;
  for (const i of order) {
    cur.push(nz[i]);
    mask |= 1 << i;
    if (sum[mask] === 0) { groups.push(cur); cur = []; }
  }
  const plan = groups.flatMap((g) => greedyWithin(g));
  return { plan, groups: groups.map((g) => g.map(([id]) => id)), exact: true };
}

export function apply(pairs, plan) {
  const b = Object.fromEntries(pairs);
  for (const t of plan) { b[t.from] += t.amount; b[t.to] -= t.amount; }
  return b;
}

// Cash rounding: each transfer rounded to a multiple of `step` minor units.
// What it leaves over is returned per person so the UI can show it.
export function roundPlan(plan, step) {
  if (!(step > 1)) return { plan, residue: {} };
  const residue = {};
  const out = [];
  for (const t of plan) {
    const r = Math.max(step, Math.round(t.amount / step) * step);
    out.push({ ...t, amount: r, exactAmount: t.amount });
    const diff = r - t.amount;
    if (diff) {
      residue[t.from] = (residue[t.from] || 0) + diff;
      residue[t.to] = (residue[t.to] || 0) - diff;
    }
  }
  return { plan: out, residue };
}
