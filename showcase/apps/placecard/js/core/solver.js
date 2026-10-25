import { HARD } from './plan.js';
import { tableScore, totalScore } from './score.js';
import { mulberry32, shuffle } from './rng.js';

export const EFFORT = { quick: 150_000, normal: 600_000, thorough: 2_500_000 };

const canGo = (P, g, s) => g < 0 || (P.lockSeat[g] < 0 && (P.lockTable[g] < 0 || P.lockTable[g] === P.seatTable[s]));

// Honour what is already seated where it is legal, then place the rest a whole
// must-together group at a time, so the solver starts without split couples.
export function initialOcc(P, occ0, rand) {
  const occ = new Int32Array(P.S).fill(-1);
  const placed = new Uint8Array(P.n);
  for (let g = 0; g < P.n; g++) {
    const s = P.lockSeat[g];
    if (s >= 0 && occ[s] < 0) { occ[s] = g; placed[g] = 1; }
  }
  if (occ0) {
    for (let s = 0; s < P.S; s++) {
      const g = occ0[s];
      if (g < 0 || placed[g] || occ[s] >= 0) continue;
      if (P.lockSeat[g] >= 0) continue;
      if (P.lockTable[g] >= 0 && P.lockTable[g] !== P.seatTable[s]) continue;
      occ[s] = g; placed[g] = 1;
    }
  }
  const free = P.tableSeats.map((list) => list.filter((s) => occ[s] < 0));
  const groups = new Map();
  for (let g = 0; g < P.n; g++) {
    if (placed[g]) continue;
    const c = P.comp[g];
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(g);
  }
  const pinOf = (members) => members.map((g) => P.lockTable[g]).find((t) => t >= 0);
  const order = shuffle([...groups.values()], rand)
    .sort((a, b) => (pinOf(b) !== undefined) - (pinOf(a) !== undefined) || b.length - a.length);
  for (const members of order) {
    const pinned = pinOf(members);
    let best = -1;
    for (let t = 0; t < P.T; t++) {
      if (pinned !== undefined && t !== pinned) continue;
      if (free[t].length >= members.length && (best < 0 || free[t].length > free[best].length)) best = t;
    }
    for (const g of members) {
      let t = best;
      if (t < 0 || free[t].length === 0) {
        t = -1;
        for (let u = 0; u < P.T; u++) {
          if (P.lockTable[g] >= 0 && u !== P.lockTable[g]) continue;
          if (free[u].length && (t < 0 || free[u].length > free[t].length)) t = u;
        }
      }
      if (t < 0) continue;
      occ[free[t].shift()] = g;
      placed[g] = 1;
    }
  }
  // A table-locked guest whose table filled up evicts an unlocked guest from it,
  // who then takes any free seat. Seats never trade with "unseated", so anyone
  // left out here would stay out.
  const anyFree = () => { for (const f of free) if (f.length) return f.shift(); return -1; };
  for (let g = 0; g < P.n; g++) {
    if (placed[g]) continue;
    const t = P.lockTable[g];
    if (t < 0) { const s = anyFree(); if (s >= 0) { occ[s] = g; placed[g] = 1; } continue; }
    const victim = P.tableSeats[t].find((s) => occ[s] >= 0 && P.lockTable[occ[s]] < 0);
    if (victim === undefined) continue;
    const s = anyFree();
    if (s < 0) continue;
    occ[s] = occ[victim];
    occ[victim] = g;
    placed[g] = 1;
  }
  return occ;
}

export class Annealer {
  constructor(P, occ0, { seed = 1, iterations = EFFORT.normal, rounds = 3, heat = 1 } = {}) {
    this.P = P;
    this.rand = mulberry32(seed);
    this.occ = initialOcc(P, occ0, this.rand);
    this.seatOf = new Int32Array(P.n).fill(-1);
    for (let s = 0; s < P.S; s++) if (this.occ[s] >= 0) this.seatOf[this.occ[s]] = s;
    this.buf = new Int32Array(Math.max(1, ...P.tableSeats.map((s) => s.length)));
    this.tScore = new Float64Array(P.T);
    for (let t = 0; t < P.T; t++) this.tScore[t] = tableScore(P, this.occ, t, this.buf);
    this.score = this.tScore.reduce((a, b) => a + b, 0);
    this.best = this.score;
    this.bestOcc = this.occ.slice();
    this.iterations = iterations;
    this.rounds = rounds;
    this.perRound = Math.ceil(iterations / rounds);
    this.iter = 0;
    this.accepted = 0;
    this.movable = [];
    for (let s = 0; s < P.S; s++) this.movable.push(s);
    this.compMembers = new Map();
    for (let g = 0; g < P.n; g++) {
      const c = P.comp[g];
      if (!this.compMembers.has(c)) this.compMembers.set(c, []);
      this.compMembers.get(c).push(g);
    }
    this.saved = [];
    this.T0 = this.estimateT0() * heat;
    this.Tend = 0.02;
    this.T = this.T0;
  }

  get done() { return this.iter >= this.iterations; }

  estimateT0() {
    let sum = 0, k = 0;
    for (let i = 0; i < 400; i++) {
      const d = this.propose();
      if (d === null) continue;
      if (Math.abs(d) < HARD / 2 && d !== 0) { sum += Math.abs(d); k++; }
      this.revert();
    }
    return Math.max(1, k ? (sum / k) * 1.5 : 5);
  }

  // Applies a random move and returns its delta, keeping enough to revert().
  propose() {
    if (this.P.S < 2 || this.P.n === 0) return null;
    const r = this.rand();
    return r < 0.12 ? this.proposeGroup() : r < 0.24 ? this.proposeBlock() : r < 0.32 ? this.proposeCycle() : this.proposeSwap();
  }

  // Swap a run of 2–4 neighbouring seats with a run at another table, order
  // kept, so a chain of "next to" wishes can change tables in one move.
  proposeBlock() {
    const { P, occ, rand } = this;
    const ta = Math.floor(rand() * P.T), tb = Math.floor(rand() * P.T);
    if (ta === tb) return null;
    const la = P.tableSeats[ta], lb = P.tableSeats[tb];
    const k = 2 + Math.floor(rand() * 3);
    if (la.length < k || lb.length < k) return null;
    const ia = Math.floor(rand() * la.length), ib = Math.floor(rand() * lb.length);
    const flip = rand() < 0.5;
    const moves = [];
    for (let i = 0; i < k; i++) {
      const sa = la[(ia + i) % la.length];
      const sb = lb[(ib + (flip ? k - 1 - i : i)) % lb.length];
      if (!canGo(P, occ[sa], sb) || !canGo(P, occ[sb], sa)) return null;
      moves.push([sb, occ[sa]], [sa, occ[sb]]);
    }
    return this.applyMoves(moves);
  }

  // Three guests rotate seats: escapes optima where every single swap hurts.
  proposeCycle() {
    const { P, occ, rand } = this;
    const a = Math.floor(rand() * P.S), b = Math.floor(rand() * P.S), c = Math.floor(rand() * P.S);
    if (a === b || b === c || a === c) return null;
    const ga = occ[a], gb = occ[b], gc = occ[c];
    if (!canGo(P, ga, b) || !canGo(P, gb, c) || !canGo(P, gc, a)) return null;
    return this.applyMoves([[b, ga], [c, gb], [a, gc]]);
  }

  proposeSwap() {
    const { P, occ, rand } = this;
    const s1 = Math.floor(rand() * P.S);
    let s2;
    if (rand() < 0.35) {
      const list = P.tableSeats[P.seatTable[s1]];
      s2 = list[Math.floor(rand() * list.length)];
    } else {
      s2 = Math.floor(rand() * P.S);
    }
    if (s1 === s2) return null;
    const g1 = occ[s1], g2 = occ[s2];
    if (g1 < 0 && g2 < 0) return null;
    if (!canGo(P, g1, s2) || !canGo(P, g2, s1)) return null;
    return this.applyMoves([[s1, g2], [s2, g1]]);
  }

  // Exchange a guest's whole must-together group with a contiguous run of seats
  // at another table; single swaps can never move a couple across tables.
  proposeGroup() {
    const { P, occ, seatOf, rand } = this;
    const g = Math.floor(rand() * P.n);
    const sg = seatOf[g];
    if (sg < 0) return null;
    const ta = P.seatTable[sg];
    const members = this.compMembers.get(P.comp[g]).filter((m) => seatOf[m] >= 0 && P.seatTable[seatOf[m]] === ta);
    if (members.length < 2) return null;
    const tb = Math.floor(rand() * P.T);
    if (tb === ta) return null;
    const list = P.tableSeats[tb];
    const k = members.length;
    if (list.length < k) return null;
    const start = Math.floor(rand() * list.length);
    const dest = [];
    for (let i = 0; i < k; i++) dest.push(list[(start + i) % list.length]);
    const src = members.map((m) => seatOf[m]).sort((a, b) => a - b);
    for (let i = 0; i < k; i++) {
      if (!canGo(P, occ[src[i]], dest[i]) || !canGo(P, occ[dest[i]], src[i])) return null;
    }
    const moves = [];
    for (let i = 0; i < k; i++) {
      moves.push([dest[i], occ[src[i]]], [src[i], occ[dest[i]]]);
    }
    return this.applyMoves(moves);
  }

  applyMoves(moves) {
    const { P, occ, seatOf } = this;
    const saved = this.saved;
    saved.length = 0;
    const tables = new Set();
    for (const [s] of moves) { saved.push([s, occ[s]]); tables.add(P.seatTable[s]); }
    for (const [s, g] of moves) { occ[s] = g; if (g >= 0) seatOf[g] = s; }
    let delta = 0;
    this.touched = [];
    for (const t of tables) {
      const ns = tableScore(P, occ, t, this.buf);
      this.touched.push([t, this.tScore[t]]);
      delta += ns - this.tScore[t];
      this.tScore[t] = ns;
    }
    this.score += delta;
    this.lastDelta = delta;
    return delta;
  }

  revert() {
    const { occ, seatOf } = this;
    for (const [s, g] of this.saved) { occ[s] = g; if (g >= 0) seatOf[g] = s; }
    for (const [t, v] of this.touched) this.tScore[t] = v;
    this.score -= this.lastDelta;
  }

  step(count) {
    const end = Math.min(this.iterations, this.iter + count);
    while (this.iter < end) {
      const r = Math.floor(this.iter / this.perRound);
      const local = (this.iter - r * this.perRound) / this.perRound;
      if (this.iter % this.perRound === 0 && r > 0) {
        this.occ.set(this.bestOcc);
        for (let s = 0; s < this.P.S; s++) if (this.occ[s] >= 0) this.seatOf[this.occ[s]] = s;
        for (let t = 0; t < this.P.T; t++) this.tScore[t] = tableScore(this.P, this.occ, t, this.buf);
        this.score = this.best;
      }
      const top = r === 0 ? this.T0 : this.T0 * 0.3;
      this.T = top * Math.pow(this.Tend / top, local);
      this.iter++;
      const d = this.propose();
      if (d === null) continue;
      if (d >= 0 || this.rand() < Math.exp(d / this.T)) {
        this.accepted++;
        if (this.score > this.best + 1e-9) { this.best = this.score; this.bestOcc.set(this.occ); }
      } else {
        this.revert();
      }
    }
    return this.done;
  }

  run() {
    while (!this.step(50_000));
    return { occ: this.bestOcc, score: this.best };
  }

  recomputeCheck() {
    return { running: this.score, full: totalScore(this.P, this.occ) };
  }
}
