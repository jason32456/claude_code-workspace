// The Turing–Welchman bombe.
//
// The machine does not search the plugboard. It assumes one stecker, follows
// every consequence, and asks whether the consequences contradict themselves.
// Welchman's diagonal board is what makes that worth doing: steckering is an
// involution, so "A is plugged to G" and "G is plugged to A" are the same
// statement, and wiring that identity into the machine turns one assumption
// into a flood of implications. A wrong assumption implies everything — all 26
// wires of the test register light — and everything is a contradiction.

import { N, ROTORS, REFLECTORS, ord, Enigma, allRotorOrders } from './enigma.js';

const FULL = (1 << N) - 1;
const POSITIONS = N * N * N;           // 17,576 core positions per rotor order

export const posIndex = (l, m, r) => ((l * N) + m) * N + r;

/**
 * Every scrambler permutation for one rotor order, indexed by core position.
 *
 * Ring settings are held at AAA throughout. Only the difference between ring
 * and position affects the scrambler, so searching positions at rings AAA
 * covers every (ring, position) pair producing the same scrambler sequence —
 * which is precisely why the bombe cannot recover the Ringstellung.
 *
 * 17,576 × 26 bytes is 457 KB, built once per rotor order and reused across
 * every position, which is what keeps a million closures affordable.
 */
export function buildPermTable(order, reflector) {
  const table = new Int8Array(POSITIONS * N);
  const e = new Enigma({ rotors: order, reflector, rings: 'AAA', ground: 'AAA' });
  for (let l = 0; l < N; l++) {
    for (let m = 0; m < N; m++) {
      for (let r = 0; r < N; r++) {
        e.pos[0] = l; e.pos[1] = m; e.pos[2] = r;
        const base = posIndex(l, m, r) * N;
        for (let w = 0; w < N; w++) table[base + w] = e.scramble(w);
      }
    }
  }
  return table;
}

/**
 * The positions the machine actually occupies while enciphering a crib.
 *
 * This is the part a naive bombe gets wrong. If the crib is long enough to
 * carry the right rotor past its turnover, the middle rotor steps in the
 * middle of the menu and every scrambler after that point moves. Holding the
 * middle rotor fixed — the obvious optimisation — makes the true key
 * unrepresentable, and the search silently fails to find the answer it was
 * built to find. So the stepping is simulated exactly, double step included.
 */
export function cribPositions(order, l, m, r, length, out) {
  const midNotch = ord(ROTORS[order[1]].turnover);
  const rightNotch = ord(ROTORS[order[2]].turnover);
  let pl = l, pm = m, pr = r;
  for (let t = 0; t < length; t++) {
    const atRight = pr === rightNotch;
    const atMid = pm === midNotch;
    if (atMid) { pm = (pm + 1) % N; pl = (pl + 1) % N; }
    else if (atRight) { pm = (pm + 1) % N; }
    pr = (pr + 1) % N;
    out[t] = posIndex(pl, pm, pr);
  }
  return out;
}

/**
 * One closure. Energise (testReg, hypothesis) and propagate through the menu's
 * scramblers and the diagonal board until nothing new lights.
 *
 * Returns the live wire mask of the test register. A full mask means the
 * hypothesis implied every stecker for that letter at once — a contradiction,
 * and the position is rejected. Anything short of full is a stop.
 *
 * `live` and `queue` are caller-owned scratch so the hot loop allocates nothing.
 */
export function closure(adj, table, offsets, testReg, hypothesis, live, queue) {
  const { start, count, edge, other } = adj;
  live.fill(0);
  let head = 0, tail = 0;
  queue[tail++] = (testReg << 5) | hypothesis;

  while (head < tail) {
    const item = queue[head++];
    const v = item >> 5;
    const w = item & 31;
    const bit = 1 << w;
    if (live[v] & bit) continue;
    live[v] |= bit;

    // The whole point: cable v wire w is the same claim as cable w wire v.
    if (!(live[w] & (1 << v))) queue[tail++] = (w << 5) | v;

    // Only the scramblers actually touching v can carry the implication.
    const s = start[v], n = count[v];
    for (let i = 0; i < n; i++) {
      const o = other[s + i];
      const img = table[offsets[edge[s + i]] + w];
      if (!(live[o] & (1 << img))) queue[tail++] = (o << 5) | img;
    }

    // Once the test register saturates the answer is "no stop", and most wrong
    // positions saturate almost at once. This is what makes a million closures
    // affordable in a browser tab.
    if (live[testReg] === FULL) return FULL;
  }
  return live[testReg];
}

/** Flatten the menu into per-vertex adjacency so the hot loop never scans. */
export function buildAdjacency(edges) {
  const count = new Int32Array(N);
  for (const e of edges) { count[e.p]++; count[e.c]++; }
  const start = new Int32Array(N);
  let acc = 0;
  for (let v = 0; v < N; v++) { start[v] = acc; acc += count[v]; }
  const cursor = Int32Array.from(start);
  const edge = new Int32Array(acc);
  const other = new Int32Array(acc);
  edges.forEach((e, i) => {
    edge[cursor[e.p]] = i; other[cursor[e.p]] = e.c; cursor[e.p]++;
    edge[cursor[e.c]] = i; other[cursor[e.c]] = e.p; cursor[e.c]++;
  });
  return { start, count, edge, other };
}

/**
 * Run the bombe over the requested rotor orders.
 *
 * A generator, so the worker can pump it and report progress without the
 * search knowing anything about the UI.
 */
export function* runBombe({ menu, reflector = 'B', orders = null, testReg, maxStops = 400 }) {
  const rotorOrders = orders && orders.length ? orders : allRotorOrders();
  if (!REFLECTORS[reflector]) throw new Error(`unknown reflector: ${reflector}`);

  const edges = menu.edges;
  const nEdges = edges.length;
  const cribLen = edges.reduce((mx, e) => Math.max(mx, e.t), 0) + 1;
  const adj = buildAdjacency(edges);

  const live = new Int32Array(N);
  const queue = new Int32Array(N * N * 4);
  const seq = new Int32Array(cribLen);
  const offsets = new Int32Array(nEdges);

  const totalPositions = rotorOrders.length * POSITIONS;
  let tested = 0;
  let stopCount = 0;

  for (let oi = 0; oi < rotorOrders.length; oi++) {
    const order = rotorOrders[oi];
    const table = buildPermTable(order, reflector);
    yield { type: 'order', order: [...order], index: oi, of: rotorOrders.length, tested, totalPositions };

    for (let l = 0; l < N; l++) {
      for (let m = 0; m < N; m++) {
        for (let r = 0; r < N; r++) {
          cribPositions(order, l, m, r, cribLen, seq);
          for (let k = 0; k < nEdges; k++) offsets[k] = seq[edges[k].t] * N;

          const mask = closure(adj, table, offsets, testReg, 0, live, queue);
          tested++;

          if (mask !== FULL && stopCount < maxStops) {
            stopCount++;
            yield {
              type: 'stop',
              order: [...order],
              reflector,
              position: [l, m, r],
              testReg,
              mask,
              live: Int32Array.from(live),
              tested,
            };
          }

          if ((tested & 0x1fff) === 0) {
            yield { type: 'progress', tested, totalPositions, order: [...order], position: [l, m, r], stops: stopCount };
          }
        }
      }
    }
  }

  yield { type: 'done', tested, totalPositions, stops: stopCount };
}

/**
 * From a stop's live wires, read off the steckers the closure actually forced.
 *
 * A cable with exactly one live wire is a deduction: that letter is plugged to
 * that one. A cable with 25 live wires is the same deduction read the other
 * way round — every other partner was excluded. Anything in between is
 * undetermined, and is reported as such rather than guessed at.
 */
export function deduceSteckers(live) {
  const partner = new Int8Array(N).fill(-1);
  for (let v = 0; v < N; v++) {
    const mask = live[v] & FULL;
    if (!mask) continue;
    const bits = popcount(mask);
    if (bits === 1) partner[v] = lowestBit(mask);
    else if (bits === N - 1) partner[v] = lowestBit(~mask & FULL);
  }
  const pairs = [];
  const seen = new Set();
  for (let v = 0; v < N; v++) {
    const w = partner[v];
    if (w < 0 || w === v || seen.has(v) || seen.has(w)) continue;
    if (partner[w] === v) {                    // trust it only if mutual
      pairs.push([Math.min(v, w), Math.max(v, w)]);
      seen.add(v); seen.add(w);
    }
  }
  return pairs;
}

function lowestBit(mask) {
  return 31 - Math.clz32(mask & -mask);
}

export function popcount(x) {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}
