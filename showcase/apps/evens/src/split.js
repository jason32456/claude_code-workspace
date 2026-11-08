import { allocate, convert, format } from './money.js';

export const MODES = ['equal', 'shares', 'percent', 'exact', 'items'];
export const MODE_LABEL = {
  equal: 'Equally',
  shares: 'By shares',
  percent: 'By percent',
  exact: 'Exact amounts',
  items: 'Itemised receipt',
};

const sumOf = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// Each expense's amount and the split inputs are in the expense's own currency.
// Validation returns a message or null; it never throws.
export function validate(ex, memberIds) {
  const known = new Set(memberIds);
  if (!(Number.isInteger(ex.amount) && ex.amount > 0)) return 'Amount must be more than zero';
  if (!ex.payers?.length) return 'Pick who paid';
  for (const p of ex.payers) if (!known.has(p.id)) return 'A payer is no longer in the group';
  if (ex.payers.length > 1) {
    const s = ex.payers.reduce((a, p) => a + (p.amount || 0), 0);
    if (s !== ex.amount) return `Payers cover ${s} of ${ex.amount} — they must add up to the total`;
  }
  if (ex.currency !== undefined && !(ex.rate > 0)) return 'Exchange rate must be positive';
  const sp = ex.split;
  if (!sp || !MODES.includes(sp.mode)) return 'Unknown split';
  const ids = (o) => Object.keys(o || {});
  const unknown = (list) => list.some((id) => !known.has(id));
  switch (sp.mode) {
    case 'equal':
      if (!sp.ids?.length) return 'Pick at least one person to split between';
      if (unknown(sp.ids)) return 'Split includes someone who left';
      return null;
    case 'shares': {
      const w = sp.weights || {};
      if (unknown(ids(w))) return 'Split includes someone who left';
      if (Object.values(w).some((v) => !(v >= 0) || !Number.isFinite(v))) return 'Shares must be zero or more';
      if (!(sumOf(w) > 0)) return 'Give at least one person a share';
      return null;
    }
    case 'percent': {
      const w = sp.weights || {};
      if (unknown(ids(w))) return 'Split includes someone who left';
      if (Object.values(w).some((v) => !(v >= 0))) return 'Percentages must be zero or more';
      const s = sumOf(w);
      if (Math.abs(s - 100) > 1e-6) return `Percentages total ${+s.toFixed(4)}%, not 100%`;
      return null;
    }
    case 'exact': {
      const w = sp.amounts || {};
      if (unknown(ids(w))) return 'Split includes someone who left';
      if (Object.values(w).some((v) => !Number.isInteger(v) || v < 0)) return 'Amounts must be zero or more';
      const s = sumOf(w);
      if (s !== ex.amount) return `Amounts total ${s} of ${ex.amount}`;
      return null;
    }
    case 'items': {
      const items = sp.items || [];
      if (!items.length) return 'Add at least one receipt line';
      for (const it of items) {
        if (!(Number.isInteger(it.price) && it.price >= 0)) return `“${it.name || 'Item'}” needs a price`;
        if (!it.ids?.length) return `“${it.name || 'Item'}” isn’t assigned to anyone`;
        if (unknown(it.ids)) return 'An item is assigned to someone who left';
      }
      const sub = items.reduce((a, it) => a + it.price, 0);
      const extra = (sp.tax || 0) + (sp.tip || 0);
      if (!(sub > 0)) return 'Receipt lines must cost something';
      if (sub + extra !== ex.amount) return `Lines + tax + tip come to ${sub + extra}, not ${ex.amount}`;
      return null;
    }
  }
  return null;
}

// Shares in the expense currency: { shares: {id: minor}, notes: {id: string} }.
// The shares always sum to ex.amount.
export function currencyShares(ex, memberIds) {
  const cur = ex.currency;
  const sp = ex.split;
  const shares = {};
  const notes = {};
  const order = (list) => memberIds.filter((id) => list.includes(id));
  const put = (ids, vals) => ids.forEach((id, i) => { shares[id] = (shares[id] || 0) + vals[i]; });

  if (sp.mode === 'equal') {
    const ids = order(sp.ids);
    put(ids, allocate(ex.amount, ids.map(() => 1)));
    ids.forEach((id) => (notes[id] = `1 of ${ids.length} equal parts`));
  } else if (sp.mode === 'shares') {
    const ids = order(Object.keys(sp.weights).filter((id) => sp.weights[id] > 0));
    const w = ids.map((id) => sp.weights[id]);
    const tot = w.reduce((a, b) => a + b, 0);
    put(ids, allocate(ex.amount, w));
    ids.forEach((id, i) => (notes[id] = `${+w[i].toFixed(3)} of ${+tot.toFixed(3)} shares`));
  } else if (sp.mode === 'percent') {
    const ids = order(Object.keys(sp.weights).filter((id) => sp.weights[id] > 0));
    const w = ids.map((id) => sp.weights[id]);
    put(ids, allocate(ex.amount, w));
    ids.forEach((id, i) => (notes[id] = `${+w[i].toFixed(4)}%`));
  } else if (sp.mode === 'exact') {
    const ids = order(Object.keys(sp.amounts).filter((id) => sp.amounts[id] > 0));
    put(ids, ids.map((id) => sp.amounts[id]));
    ids.forEach((id) => (notes[id] = 'set by hand'));
  } else if (sp.mode === 'items') {
    const sub = {};
    const lines = {};
    for (const it of sp.items) {
      const ids = order(it.ids);
      const parts = allocate(it.price, ids.map(() => 1));
      ids.forEach((id, i) => {
        sub[id] = (sub[id] || 0) + parts[i];
        (lines[id] ||= []).push(
          `${it.name || 'Item'} ${format(parts[i], cur)}${ids.length > 1 ? ` (1/${ids.length})` : ''}`,
        );
      });
    }
    const ids = order(Object.keys(sub));
    const subs = ids.map((id) => sub[id]);
    const extra = (sp.tax || 0) + (sp.tip || 0);
    const ex2 = extra ? allocate(extra, subs) : subs.map(() => 0);
    const subTotal = subs.reduce((a, b) => a + b, 0);
    put(ids, subs.map((s, i) => s + ex2[i]));
    ids.forEach((id, i) => {
      let n = lines[id].join(' + ');
      if (extra) n += ` + ${((subs[i] / subTotal) * 100).toFixed(1)}% of tax & tip (${format(ex2[i], cur)})`;
      notes[id] = n;
    });
  }
  return { shares, notes };
}

// Base-currency effect of one expense: paid and owed per member, each summing
// to the same converted total. Conversion happens once, on the total, and both
// sides are re-allocated over it so a foreign expense can never leave a cent
// unaccounted for.
export function baseEffect(ex, memberIds, base) {
  const cur = ex.currency || base;
  const total = convert(ex.amount, cur, base, cur === base ? 1 : ex.rate);
  const { shares, notes } = currencyShares(ex, memberIds);
  const owIds = memberIds.filter((id) => shares[id]);
  const owed = {};
  allocate(total, owIds.map((id) => shares[id])).forEach((v, i) => (owed[owIds[i]] = v));

  const payers = ex.payers.length === 1 ? [{ id: ex.payers[0].id, amount: ex.amount }] : ex.payers;
  const pIds = memberIds.filter((id) => payers.some((p) => p.id === id && p.amount > 0));
  const paid = {};
  allocate(total, pIds.map((id) => payers.find((p) => p.id === id).amount)).forEach((v, i) => (paid[pIds[i]] = v));
  return { total, paid, owed, notes, shares };
}
