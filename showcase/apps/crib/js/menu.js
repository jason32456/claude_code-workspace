// A crib is a guess at some plaintext. Placing it against the ciphertext
// produces a constraint graph — the "menu" — and the shape of that graph, not
// its size, is what decides whether the bombe finds the key or drowns in false
// stops.

import { N, ord, chr } from './enigma.js';

/** A bombe bank drives twelve scramblers, so a menu may use at most twelve edges. */
export const SCRAMBLER_BUDGET = 12;

/**
 * Every offset at which `crib` could sit against `cipher`.
 *
 * The reflector guarantees no letter ever enciphers to itself, so any offset
 * where crib[i] === cipher[offset+i] is impossible — not unlikely, impossible.
 * That kills roughly two thirds of offsets before any rotor turns, and it is
 * the single largest saving in the whole attack.
 */
export function alignments(cipher, crib) {
  const out = [];
  const last = cipher.length - crib.length;
  for (let off = 0; off <= last; off++) {
    const clashes = [];
    for (let i = 0; i < crib.length; i++) {
      if (crib[i] === cipher[off + i]) clashes.push(i);
    }
    out.push({ offset: off, valid: clashes.length === 0, clashes });
  }
  return out;
}

/**
 * Build the constraint graph for one alignment.
 *
 * Vertices are letters. An edge joins plaintext letter p to ciphertext letter c
 * and is tagged with the scrambler offset at which the pairing was observed —
 * position `offset + i + 1`, because the machine steps before enciphering.
 */
export function buildMenu(cipher, crib, offset) {
  const edges = [];
  for (let i = 0; i < crib.length; i++) {
    const p = ord(crib[i]);
    const c = ord(cipher[offset + i]);
    if (p === c) throw new Error('invalid alignment: a letter would encipher to itself');
    edges.push({ p, c, t: offset + i, id: i });
  }
  return withStats({ edges, offset, cipher, crib });
}

function componentsOf(edges) {
  const parent = new Int8Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const used = new Set();
  for (const e of edges) {
    used.add(e.p); used.add(e.c);
    const a = find(e.p), b = find(e.c);
    if (a !== b) parent[a] = b;
  }
  const roots = new Set([...used].map(find));
  return { vertices: used, components: roots.size, find };
}

/**
 * Cycle rank r = E − V + C. Each independent loop is an extra constraint that
 * a wrong hypothesis must also satisfy, so it divides the surviving positions
 * by roughly 26. This is the number that matters.
 */
export function withStats(menu) {
  const { edges } = menu;
  const { vertices, components } = componentsOf(edges);
  const E = edges.length;
  const V = vertices.size;
  const C = components || 1;
  const closures = Math.max(0, E - V + C);

  const degree = new Int8Array(N);
  for (const e of edges) { degree[e.p]++; degree[e.c]++; }

  return { ...menu, E, V, C, closures, vertices: [...vertices].sort((a, b) => a - b), degree };
}

/**
 * Expected false stops over `positions` tested, given the cycle rank.
 *
 * Each closure is an independent 1-in-26 coincidence a wrong hypothesis has to
 * survive, so the estimate is positions / 26^closures. A menu with no closures
 * divides by one — it is not a filter at all, and the search returns
 * essentially everything. That is the lesson the Crib mode exists to teach.
 */
export function predictStops(closures, positions) {
  return positions / Math.pow(N, closures);
}

/**
 * Pick at most `budget` edges, maximising cycle rank.
 *
 * Greedy and deliberately simple: grow one connected component, always
 * preferring an edge whose endpoints are both already in the component
 * (which closes a loop, +1 rank) over one that merely adds a vertex (+0).
 * Runs on every drag of the crib, so it has to be cheap.
 */
export function selectScramblers(menu, budget = SCRAMBLER_BUDGET) {
  const { edges } = menu;
  if (edges.length <= budget) return withStats({ ...menu, edges: [...edges], selected: edges.map((e) => e.id) });

  // Seed from the busiest vertex so the dense part of the graph is kept.
  const degree = new Int8Array(N);
  for (const e of edges) { degree[e.p]++; degree[e.c]++; }
  let seed = edges[0];
  let best = -1;
  for (const e of edges) {
    const score = degree[e.p] + degree[e.c];
    if (score > best) { best = score; seed = e; }
  }

  const inSet = new Set([seed.p, seed.c]);
  const chosen = [seed];
  const remaining = edges.filter((e) => e !== seed);

  while (chosen.length < budget && remaining.length) {
    let pick = -1;
    let pickClosing = false;
    for (let i = 0; i < remaining.length; i++) {
      const e = remaining[i];
      const hasP = inSet.has(e.p), hasC = inSet.has(e.c);
      if (!hasP && !hasC) continue;                 // would disconnect the menu
      const closing = hasP && hasC;
      if (closing) { pick = i; pickClosing = true; break; }
      if (pick < 0) pick = i;
    }
    if (pick < 0) break;                            // nothing else is reachable
    const e = remaining.splice(pick, 1)[0];
    chosen.push(e);
    inSet.add(e.p); inSet.add(e.c);
    void pickClosing;
  }

  return withStats({ ...menu, edges: chosen, selected: chosen.map((e) => e.id) });
}

/**
 * The test register: the letter carrying the most constraints, so a wrong
 * hypothesis has the most ways to contradict itself.
 */
export function testRegister(menu) {
  let best = menu.edges.length ? menu.edges[0].p : 0;
  let bestDeg = -1;
  for (const v of menu.vertices ?? []) {
    if (menu.degree[v] > bestDeg) { bestDeg = menu.degree[v]; best = v; }
  }
  return best;
}

export const letters = (menu) => menu.vertices.map(chr);
