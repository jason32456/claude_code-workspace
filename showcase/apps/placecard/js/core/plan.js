// The plan is plain JSON (what gets saved); compile() turns it into flat typed
// arrays the solver and scorer can hammer without touching objects.

export const HARD = 1000;

export const WISHES = {
  must:   { label: 'Must sit together', short: 'must be with', hard: true },
  next:   { label: 'Next to',           short: 'next to',      hard: false },
  prefer: { label: 'Prefer together',   short: 'with',         hard: false },
  apart:  { label: 'Prefer apart',      short: 'away from',    hard: false },
  never:  { label: 'Never together',    short: 'never with',   hard: true },
};

export const DEFAULT_SETTINGS = {
  isolation: 8,
  groupBonus: 0.6,
  seed: 1,
  effort: 'normal',
};

const W = {
  partyAdj: 6,
  nextAdj: 10,
  nextTable: 4,
  nextAcross: 3,
  prefer: 5,
  apart: 5,
};

export function emptyPlan() {
  return {
    version: 1,
    name: 'Untitled event',
    guests: [],
    tables: [],
    wishes: [],
    locks: {},
    seating: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

export const seatKey = (tableId, i) => `${tableId}:${i}`;

// Seat order, neighbours and "across" for each shape. Geometry (x, y) lives in
// the UI; this is only who-touches-whom.
export function tableTopology(table) {
  const n = table.seats;
  const adj = Array.from({ length: n }, () => []);
  const across = new Array(n).fill(-1);
  if (table.shape === 'round') {
    if (n >= 2) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (j !== i && !adj[i].includes(j)) { adj[i].push(j); adj[j].push(i); }
      }
    }
    if (n >= 6 && n % 2 === 0) for (let i = 0; i < n; i++) across[i] = (i + n / 2) % n;
  } else if (table.shape === 'long') {
    const top = Math.ceil(n / 2);
    for (let i = 0; i + 1 < top; i++) { adj[i].push(i + 1); adj[i + 1].push(i); }
    for (let i = top; i + 1 < n; i++) { adj[i].push(i + 1); adj[i + 1].push(i); }
    for (let i = top; i < n; i++) { across[i] = i - top; across[i - top] = i; }
  } else {
    for (let i = 0; i + 1 < n; i++) { adj[i].push(i + 1); adj[i + 1].push(i); }
  }
  return { adj, across };
}

class DSU {
  constructor(n) { this.p = Array.from({ length: n }, (_, i) => i); }
  find(x) { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; }
  union(a, b) { a = this.find(a); b = this.find(b); if (a !== b) this.p[a] = b; }
}

// extra: optional [{a, b, type}] of guest ids promoted to hard (for cost queries).
// home: optional occupancy whose tables earn a small bonus for staying put, so a
// what-if re-solve does not relabel whole tables at zero cost.
export function compile(plan, extra = [], { home = null, homeBonus = 0 } = {}) {
  const s = { ...DEFAULT_SETTINGS, ...plan.settings };
  const guests = plan.guests;
  const n = guests.length;
  const gIndex = new Map(guests.map((g, i) => [g.id, i]));

  const tIndex = new Map();
  const seatTable = [], seatLocal = [], seatKeys = [], tableSeats = [];
  const adjList = [], acrossOf = [];
  plan.tables.forEach((t, ti) => {
    tIndex.set(t.id, ti);
    const topo = tableTopology(t);
    const base = seatTable.length;
    const list = [];
    for (let i = 0; i < t.seats; i++) {
      seatTable.push(ti); seatLocal.push(i); seatKeys.push(seatKey(t.id, i));
      list.push(base + i);
    }
    for (let i = 0; i < t.seats; i++) {
      adjList.push(topo.adj[i].map((j) => base + j));
      acrossOf.push(topo.across[i] >= 0 ? base + topo.across[i] : -1);
    }
    tableSeats.push(list);
  });
  const S = seatTable.length;
  const seatIndex = new Map(seatKeys.map((k, i) => [k, i]));

  const wT = new Float64Array(n * n);
  const wA = new Float64Array(n * n);
  const wX = new Float64Array(n * n);
  const tie = new Uint8Array(n * n);
  const add = (arr, a, b, v) => { arr[a * n + b] += v; arr[b * n + a] += v; };

  const dsu = new DSU(n);
  const mustPairs = [], neverPairs = [];

  const byParty = new Map();
  guests.forEach((g, i) => {
    if (!g.party) return;
    if (!byParty.has(g.party)) byParty.set(g.party, []);
    byParty.get(g.party).push(i);
  });
  for (const members of byParty.values()) {
    for (let x = 0; x < members.length; x++) {
      for (let y = x + 1; y < members.length; y++) {
        const a = members[x], b = members[y];
        add(wT, a, b, HARD); add(wA, a, b, W.partyAdj);
        tie[a * n + b] = tie[b * n + a] = 1;
        dsu.union(a, b);
        mustPairs.push([a, b, 'party']);
      }
    }
  }

  const wishList = [];
  const apply = (w, promoted) => {
    const a = gIndex.get(w.a), b = gIndex.get(w.b);
    if (a === undefined || b === undefined || a === b) return;
    if (!promoted) wishList.push({ a, b, type: w.type, id: w.id });
    switch (w.type) {
      case 'must':
        add(wT, a, b, HARD); dsu.union(a, b); mustPairs.push([a, b, 'must']);
        tie[a * n + b] = tie[b * n + a] = 1; break;
      case 'never':
        add(wT, a, b, -HARD); neverPairs.push([a, b]); break;
      case 'next':
        if (promoted) { add(wA, a, b, HARD); break; }
        add(wA, a, b, W.nextAdj); add(wT, a, b, W.nextTable); add(wX, a, b, W.nextAcross);
        tie[a * n + b] = tie[b * n + a] = 1; break;
      case 'prefer':
        add(wT, a, b, promoted ? HARD : W.prefer);
        tie[a * n + b] = tie[b * n + a] = 1; break;
      case 'apart':
        add(wT, a, b, promoted ? -HARD : -W.apart); break;
    }
  };
  for (const w of plan.wishes) apply(w, false);
  for (const w of extra) apply(w, true);

  if (s.groupBonus) {
    for (let a = 0; a < n; a++) {
      const ta = guests[a].tag;
      if (!ta) continue;
      for (let b = a + 1; b < n; b++) if (guests[b].tag === ta) add(wT, a, b, s.groupBonus);
    }
  }

  const hasTies = new Uint8Array(n);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (tie[a * n + b]) { hasTies[a] = 1; break; }

  const comp = new Int32Array(n);
  for (let i = 0; i < n; i++) comp[i] = dsu.find(i);

  const lockSeat = new Int32Array(n).fill(-1);
  const lockTable = new Int32Array(n).fill(-1);
  for (const [gid, lk] of Object.entries(plan.locks || {})) {
    const g = gIndex.get(gid);
    if (g === undefined) continue;
    if (lk.seat && seatIndex.has(lk.seat)) {
      lockSeat[g] = seatIndex.get(lk.seat);
      lockTable[g] = seatTable[lockSeat[g]];
    } else if (lk.table && tIndex.has(lk.table)) {
      lockTable[g] = tIndex.get(lk.table);
    }
  }

  const homeTable = new Int32Array(n).fill(-1);
  const homeSeat = new Int32Array(n).fill(-1);
  if (home) {
    for (let x = 0; x < home.length && x < S; x++) {
      if (home[x] >= 0) { homeTable[home[x]] = seatTable[x]; homeSeat[home[x]] = x; }
    }
  }

  return {
    n, S, T: plan.tables.length, homeTable, homeSeat, homeBonus,
    guests, gIndex, tIndex, seatIndex, seatKeys, seatTable, seatLocal, tableSeats,
    adjList, acrossOf, wT, wA, wX, tie, hasTies, comp,
    mustPairs, neverPairs, wishList, lockSeat, lockTable,
    isolation: s.isolation,
  };
}

// occ[s] = guest index or -1, from the plan's seating map.
export function occupancyFromPlan(P, plan) {
  const occ = new Int32Array(P.S).fill(-1);
  for (const [gid, key] of Object.entries(plan.seating || {})) {
    const g = P.gIndex.get(gid), s = P.seatIndex.get(key);
    if (g === undefined || s === undefined || occ[s] !== -1) continue;
    occ[s] = g;
  }
  return occ;
}

export function seatingFromOcc(P, occ) {
  const out = {};
  for (let s = 0; s < P.S; s++) if (occ[s] >= 0) out[P.guests[occ[s]].id] = P.seatKeys[s];
  return out;
}
