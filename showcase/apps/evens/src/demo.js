// The first-run group. Built so the naive way needs a lot of transfers and
// greedy matching misses a hidden zero-sum pair that the optimal plan finds.
export const PALETTE = ['#d9480f', '#1971c2', '#2b8a3e', '#ae3ec9', '#e67700', '#0c8599', '#c2255c', '#5f3dc4', '#66a80f', '#495057'];

export function demoGroup(uid) {
  const people = ['Ana', 'Ben', 'Chloé', 'Dev', 'Emeka', 'Fran'];
  const members = people.map((name, i) => ({ id: uid(), name, color: PALETTE[i] }));
  const [A, B, C, D, E, F] = members.map((m) => m.id);
  const all = members.map((m) => m.id);
  const x = (o) => ({ id: uid(), kind: 'expense', currency: 'EUR', rate: 1, category: 'other', ...o });
  return {
    id: uid(),
    name: 'Lisbon trip',
    base: 'EUR',
    members,
    expenses: [
      x({ title: 'Flat in Alfama, 4 nights', date: '2026-10-02', amount: 96000, category: 'stay',
        payers: [{ id: A, amount: 60000 }, { id: E, amount: 36000 }],
        // Ben and Chloé share the double room, so they carry a bigger share.
        split: { mode: 'shares', weights: { [A]: 1, [B]: 1.5, [C]: 1.5, [D]: 1, [E]: 1, [F]: 1 } } }),
      x({ title: 'Airport taxi ×2', date: '2026-10-02', amount: 6425, category: 'travel',
        payers: [{ id: D, amount: 6425 }], split: { mode: 'equal', ids: all } }),
      x({ title: 'Pastéis & coffee', date: '2026-10-03', amount: 2370, category: 'food',
        payers: [{ id: C, amount: 2370 }], split: { mode: 'equal', ids: [B, C, E] } }),
      x({ title: 'Dinner at Taberna', date: '2026-10-03', amount: 21650, category: 'food',
        payers: [{ id: B, amount: 21650 }],
        split: { mode: 'items', tax: 1650, tip: 2000, items: [
          { name: 'Bacalhau', price: 2400, ids: [A] },
          { name: 'Polvo', price: 2800, ids: [B] },
          { name: 'Salad', price: 950, ids: [C] },
          { name: 'Steak', price: 3150, ids: [D] },
          { name: 'Sardines', price: 1900, ids: [E] },
          { name: 'Risotto', price: 2250, ids: [F] },
          { name: 'Vinho verde ×3', price: 4200, ids: [A, B, D, E, F] },
          { name: 'Shared starters', price: 350, ids: all },
        ] } }),
      x({ title: 'Sintra day trip tickets', date: '2026-10-04', amount: 13200, category: 'fun',
        payers: [{ id: E, amount: 8000 }, { id: F, amount: 5200 }], split: { mode: 'equal', ids: all } }),
      x({ title: 'Surf lesson (booked from UK)', date: '2026-10-05', amount: 12000, currency: 'GBP', rate: 1.1874,
        category: 'fun', payers: [{ id: F, amount: 12000 }], split: { mode: 'equal', ids: [A, D, F] } }),
      x({ title: 'Groceries, Pingo Doce', date: '2026-10-05', amount: 5336, category: 'groceries',
        payers: [{ id: D, amount: 5336 }],
        split: { mode: 'percent', weights: { [A]: 20, [B]: 15, [C]: 15, [D]: 20, [E]: 15, [F]: 15 } } }),
      x({ title: 'Fado night', date: '2026-10-05', amount: 9000, category: 'fun',
        payers: [{ id: C, amount: 9000 }], split: { mode: 'exact', amounts: { [B]: 3000, [C]: 3000, [E]: 3000 } } }),
      x({ title: 'Tram 28 + metro passes', date: '2026-10-04', amount: 4560, category: 'travel',
        payers: [{ id: A, amount: 4560 }], split: { mode: 'equal', ids: all } }),
      x({ title: 'eSIM data (USD)', date: '2026-10-02', amount: 2400, currency: 'USD', rate: 0.9213,
        category: 'other', payers: [{ id: B, amount: 2400 }], split: { mode: 'equal', ids: [B, C] } }),
      { id: uid(), kind: 'transfer', title: 'Dev paid Ana back', date: '2026-10-06', amount: 6000, currency: 'EUR', rate: 1,
        category: 'other', payers: [{ id: D, amount: 6000 }], split: { mode: 'exact', amounts: { [A]: 6000 } } },
    ],
  };
}
