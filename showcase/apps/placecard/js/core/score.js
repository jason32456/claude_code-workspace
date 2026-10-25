import { HARD, WISHES } from './plan.js';

// Score of one table; total score is exactly the sum over tables, which is
// what lets the solver re-score only the tables a move touches.
export function tableScore(P, occ, t, buf) {
  const { n, wT, wA, wX, adjList, acrossOf, tie, hasTies, isolation } = P;
  const seats = P.tableSeats[t];
  let k = 0;
  for (let i = 0; i < seats.length; i++) if (occ[seats[i]] >= 0) buf[k++] = occ[seats[i]];
  let sc = 0;
  for (let i = 0; i < k; i++) {
    const ai = buf[i] * n;
    for (let j = i + 1; j < k; j++) sc += wT[ai + buf[j]];
  }
  for (let i = 0; i < seats.length; i++) {
    const s = seats[i], g = occ[s];
    if (g < 0) continue;
    if (P.homeBonus && P.homeSeat[g] === s) sc += P.homeBonus * 0.25;
    const gi = g * n;
    const nb = adjList[s];
    for (let j = 0; j < nb.length; j++) {
      const s2 = nb[j];
      if (s2 > s && occ[s2] >= 0) sc += wA[gi + occ[s2]];
    }
    const x = acrossOf[s];
    if (x > s && occ[x] >= 0) sc += wX[gi + occ[x]];
  }
  if (P.homeBonus) for (let i = 0; i < k; i++) if (P.homeTable[buf[i]] === t) sc += P.homeBonus;
  if (isolation) {
    for (let i = 0; i < k; i++) {
      const g = buf[i];
      if (!hasTies[g]) continue;
      let ok = false;
      for (let j = 0; j < k && !ok; j++) if (j !== i && tie[g * n + buf[j]]) ok = true;
      if (!ok) sc -= isolation;
    }
  }
  return sc;
}

export function totalScore(P, occ) {
  const buf = new Int32Array(Math.max(1, ...P.tableSeats.map((s) => s.length)));
  let sc = 0;
  for (let t = 0; t < P.T; t++) sc += tableScore(P, occ, t, buf);
  return sc;
}

export function seatOfFromOcc(P, occ) {
  const seatOf = new Int32Array(P.n).fill(-1);
  for (let s = 0; s < P.S; s++) if (occ[s] >= 0) seatOf[occ[s]] = s;
  return seatOf;
}

export function hardViolations(P, occ) {
  const seatOf = seatOfFromOcc(P, occ);
  const out = [];
  const tab = (g) => (seatOf[g] >= 0 ? P.seatTable[seatOf[g]] : -1);
  for (const [a, b, why] of P.mustPairs) {
    if (tab(a) >= 0 && tab(b) >= 0 && tab(a) !== tab(b)) out.push({ a, b, kind: why === 'party' ? 'party' : 'must' });
  }
  for (const [a, b] of P.neverPairs) {
    if (tab(a) >= 0 && tab(a) === tab(b)) out.push({ a, b, kind: 'never' });
  }
  for (let g = 0; g < P.n; g++) if (seatOf[g] < 0) out.push({ a: g, b: -1, kind: 'unseated' });
  return out;
}

// Score with hard terms taken out, so the number people see is the one they
// can actually trade against.
export function softScore(P, occ) {
  const total = totalScore(P, occ);
  const seatOf = seatOfFromOcc(P, occ);
  let hardPart = 0;
  const tab = (g) => (seatOf[g] >= 0 ? P.seatTable[seatOf[g]] : -2 - g);
  for (const [a, b] of P.mustPairs) if (tab(a) === tab(b)) hardPart += HARD;
  for (const [a, b] of P.neverPairs) if (tab(a) === tab(b)) hardPart -= HARD;
  return total - hardPart;
}

function relation(P, seatOf, a, b) {
  const sa = seatOf[a], sb = seatOf[b];
  if (sa < 0 || sb < 0) return { sameTable: false, adjacent: false, across: false };
  return {
    sameTable: P.seatTable[sa] === P.seatTable[sb],
    adjacent: P.adjList[sa].includes(sb),
    across: P.acrossOf[sa] === sb,
  };
}

// Per-guest list of wishes with ✓/✗ and a happiness fraction.
export function explain(P, occ) {
  const seatOf = seatOfFromOcc(P, occ);
  const rows = Array.from({ length: P.n }, () => ({ items: [], got: 0, want: 0, isolated: false }));
  const push = (g, item, weight) => {
    rows[g].items.push(item);
    rows[g].want += weight;
    if (item.ok) rows[g].got += weight;
  };

  const partyMembers = new Map();
  P.guests.forEach((g, i) => {
    if (!g.party) return;
    if (!partyMembers.has(g.party)) partyMembers.set(g.party, []);
    partyMembers.get(g.party).push(i);
  });
  for (const members of partyMembers.values()) {
    for (const a of members) {
      for (const b of members) {
        if (a === b) continue;
        const r = relation(P, seatOf, a, b);
        push(a, { type: 'party', other: b, ok: r.sameTable, near: r.adjacent, hard: true }, 3);
      }
    }
  }
  for (const w of P.wishList) {
    const r = relation(P, seatOf, w.a, w.b);
    let ok;
    switch (w.type) {
      case 'must': case 'prefer': ok = r.sameTable; break;
      case 'next': ok = r.adjacent; break;
      case 'apart': case 'never': ok = seatOf[w.a] >= 0 && seatOf[w.b] >= 0 && !r.sameTable; break;
    }
    const weight = WISHES[w.type].hard ? 3 : w.type === 'next' ? 2 : 1;
    const base = { type: w.type, ok, wishId: w.id, hard: WISHES[w.type].hard, near: r.sameTable, across: r.across };
    push(w.a, { ...base, other: w.b }, weight);
    push(w.b, { ...base, other: w.a }, weight);
  }

  for (let g = 0; g < P.n; g++) {
    const s = seatOf[g];
    const row = rows[g];
    row.seat = s;
    if (s >= 0 && P.hasTies[g]) {
      const mates = P.tableSeats[P.seatTable[s]].map((x) => occ[x]).filter((x) => x >= 0 && x !== g);
      row.isolated = !mates.some((m) => P.tie[g * P.n + m]);
      if (row.isolated) row.want += 2;
    }
    row.happiness = s < 0 ? 0 : row.want === 0 ? 1 : row.got / row.want;
    row.hardBroken = row.items.some((it) => it.hard && !it.ok);
  }
  return rows;
}
