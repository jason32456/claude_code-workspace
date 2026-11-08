import { baseEffect, validate, MODE_LABEL } from './split.js';
import { greedyWithin } from './settle.js';

export const CATEGORIES = [
  { id: 'food', label: 'Food & drink', icon: '🍽' },
  { id: 'stay', label: 'Lodging', icon: '🛏' },
  { id: 'travel', label: 'Transport', icon: '🚆' },
  { id: 'fun', label: 'Activities', icon: '🎟' },
  { id: 'groceries', label: 'Groceries', icon: '🛒' },
  { id: 'home', label: 'Home & bills', icon: '💡' },
  { id: 'other', label: 'Other', icon: '•' },
];
export const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// Every expense is folded into base-currency balances. Invalid expenses are
// skipped and reported, never half-applied.
export function compute(group) {
  const ids = group.members.map((m) => m.id);
  const balance = Object.fromEntries(ids.map((id) => [id, 0]));
  const paid = Object.fromEntries(ids.map((id) => [id, 0]));
  const consumed = Object.fromEntries(ids.map((id) => [id, 0]));
  const byCategory = {};
  const effects = [];
  const invalid = [];
  let spend = 0;
  for (const ex of group.expenses) {
    const err = validate(ex, ids);
    if (err) { invalid.push({ ex, err }); continue; }
    const eff = baseEffect(ex, ids, group.base);
    effects.push({ ex, eff });
    for (const [id, v] of Object.entries(eff.paid)) balance[id] += v;
    for (const [id, v] of Object.entries(eff.owed)) balance[id] -= v;
    if (ex.kind !== 'transfer') {
      for (const [id, v] of Object.entries(eff.paid)) paid[id] += v;
      for (const [id, v] of Object.entries(eff.owed)) consumed[id] += v;
      byCategory[ex.category || 'other'] = (byCategory[ex.category || 'other'] || 0) + eff.total;
      spend += eff.total;
    }
  }
  return { ids, balance, paid, consumed, byCategory, effects, invalid, spend };
}

// What people would do without an app: square each expense on its own, then
// cancel out debts running in both directions between the same pair.
export function naivePlan(state) {
  const pair = new Map();
  for (const { eff } of state.effects) {
    const net = {};
    for (const [id, v] of Object.entries(eff.paid)) net[id] = (net[id] || 0) + v;
    for (const [id, v] of Object.entries(eff.owed)) net[id] = (net[id] || 0) - v;
    for (const t of greedyWithin(state.ids.filter((id) => net[id]).map((id) => [id, net[id]]))) {
      const k = t.from + '>' + t.to;
      pair.set(k, (pair.get(k) || 0) + t.amount);
    }
  }
  const out = [];
  const seen = new Set();
  for (const [k, v] of pair) {
    if (seen.has(k)) continue;
    const [a, b] = k.split('>');
    const rk = b + '>' + a;
    seen.add(k); seen.add(rk);
    const net = v - (pair.get(rk) || 0);
    if (net > 0) out.push({ from: a, to: b, amount: net });
    else if (net < 0) out.push({ from: b, to: a, amount: -net });
  }
  return out;
}

export function explain(group, state, id) {
  const rows = [];
  let run = 0;
  for (const { ex, eff } of state.effects) {
    const p = eff.paid[id] || 0;
    const o = eff.owed[id] || 0;
    if (!p && !o) continue;
    run += p - o;
    let how;
    if (ex.kind === 'transfer') how = p ? 'payment sent' : 'payment received';
    else if (!o) how = 'not part of the split';
    else how = `${MODE_LABEL[ex.split.mode]}: ${eff.notes[id] || ''}`;
    rows.push({ ex, paid: p, owed: o, net: p - o, run, how, total: eff.total });
  }
  return rows;
}
