// Pre-flight: things that make a plan impossible, each reported with its proof.
// "error" means no seating can satisfy it; "warn" means some wish must lose.

const name = (P, g) => P.guests[g].name;

function packable(sizes, caps, budget) {
  const items = [...sizes].sort((a, b) => b - a);
  const rem = [...caps];
  let nodes = 0;
  const go = (i) => {
    if (i === items.length) return true;
    if (++nodes > budget) throw new Error('budget');
    const tried = new Set();
    for (let t = 0; t < rem.length; t++) {
      if (rem[t] < items[i] || tried.has(rem[t])) continue;
      tried.add(rem[t]);
      rem[t] -= items[i];
      if (go(i + 1)) return true;
      rem[t] += items[i];
    }
    return false;
  };
  try { return go(0) ? 'yes' : 'no'; } catch { return 'unknown'; }
}

export function lint(P) {
  const out = [];
  const cap = P.tableSeats.map((s) => s.length);
  const maxCap = Math.max(0, ...cap);

  if (P.n > P.S) {
    out.push({ level: 'error', title: 'More guests than seats', detail: `${P.n} guests, ${P.S} seats. Add ${P.n - P.S} seat${P.n - P.S === 1 ? '' : 's'}.` });
  }

  const comps = new Map();
  for (let g = 0; g < P.n; g++) {
    if (!comps.has(P.comp[g])) comps.set(P.comp[g], []);
    comps.get(P.comp[g]).push(g);
  }
  const listNames = (gs) => {
    const ns = gs.map((g) => name(P, g));
    return ns.length > 4 ? `${ns.slice(0, 4).join(', ')} and ${ns.length - 4} more` : ns.join(', ');
  };

  for (const members of comps.values()) {
    if (members.length > maxCap && P.T > 0) {
      out.push({ level: 'error', title: `A group of ${members.length} must share one table`, detail: `${listNames(members)} are linked by parties and "must sit together", but the largest table seats ${maxCap}.`, guests: members });
    }
  }

  for (const [a, b] of P.neverPairs) {
    if (P.comp[a] === P.comp[b]) {
      out.push({ level: 'error', title: 'Contradiction', detail: `${name(P, a)} and ${name(P, b)} are "never together", but a chain of parties and "must" wishes puts them at the same table.`, guests: [a, b] });
    }
  }

  const tableLocks = new Array(P.T).fill(0);
  const seatTaken = new Map();
  for (let g = 0; g < P.n; g++) {
    if (P.lockTable[g] >= 0) tableLocks[P.lockTable[g]]++;
    const s = P.lockSeat[g];
    if (s >= 0) {
      if (seatTaken.has(s)) out.push({ level: 'error', title: 'Two guests locked to one seat', detail: `${name(P, seatTaken.get(s))} and ${name(P, g)} are both locked to ${P.seatKeys[s]}.`, guests: [seatTaken.get(s), g] });
      else seatTaken.set(s, g);
    }
  }
  tableLocks.forEach((k, t) => {
    if (k > cap[t]) out.push({ level: 'error', title: 'Table over-locked', detail: `${k} guests are locked to a table with ${cap[t]} seats.` });
  });
  for (const [a, b] of P.neverPairs) {
    if (P.lockTable[a] >= 0 && P.lockTable[a] === P.lockTable[b]) {
      out.push({ level: 'error', title: 'Locks force a "never" pair together', detail: `${name(P, a)} and ${name(P, b)} are both locked to the same table.`, guests: [a, b] });
    }
  }
  for (const members of comps.values()) {
    const pins = new Set(members.map((g) => P.lockTable[g]).filter((t) => t >= 0));
    if (pins.size > 1) out.push({ level: 'error', title: 'A must-together group is locked to different tables', detail: `${listNames(members)} must share a table, but their locks name ${pins.size} different tables.`, guests: members });
  }

  if (P.n <= P.S && P.T > 0 && !out.some((o) => o.level === 'error')) {
    const sizes = [...comps.values()].map((m) => m.length).filter((k) => k > 1);
    const singles = [...comps.values()].filter((m) => m.length === 1).length;
    // Singles fill any gap, so only the multi-person groups need packing, into
    // capacity that leaves room for the singles overall.
    const res = packable(sizes, cap, 200_000);
    if (res === 'no') {
      out.push({ level: 'error', title: 'Groups cannot be packed into these tables', detail: `Exhaustive search: the ${sizes.length} must-together groups (sizes ${sizes.sort((a, b) => b - a).join(', ')}) do not fit the tables (${cap.join(', ')}) without splitting one. ${singles} singles are unaffected.` });
    } else if (res === 'unknown') {
      out.push({ level: 'info', title: 'Packing not proven', detail: 'The group-packing search hit its budget; the solver will still try.' });
    }
  }

  const nextCount = new Array(P.n).fill(0);
  for (const w of P.wishList) if (w.type === 'next') { nextCount[w.a]++; nextCount[w.b]++; }
  nextCount.forEach((k, g) => {
    if (k > 2) out.push({ level: 'warn', title: `${name(P, g)} wants ${k} neighbours`, detail: 'A chair has two neighbours, so at least ' + (k - 2) + ' "next to" wish' + (k - 2 === 1 ? '' : 'es') + ' cannot be met.', guests: [g] });
  });

  return out;
}
