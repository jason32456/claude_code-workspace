// Approximate tier: rejection sampling (uniform when it succeeds) with a Markov-chain fallback.
import { maxMatching } from './hall.js';

export const REJECTION_TRIES = 20000;
const ANALYSIS_TRIES = 40000;
const ANALYSIS_SAMPLES = 3000;
const MIN_REJECTION_SAMPLES = 300;
const SEARCH_BUDGET = 300000;

export function hasSwap(perm) {
  for (let i = 0; i < perm.length; i++) if (perm[perm[i]] === i) return true;
  return false;
}

export function permOk(allowed, perm, mode) {
  const n = perm.length;
  for (let i = 0; i < n; i++) {
    if (!allowed[i][perm[i]]) return false;
    if (mode === 'noswap' && perm[perm[i]] === i) return false;
  }
  if (mode === 'loop') {
    let x = perm[0];
    let c = 1;
    while (x !== 0 && c <= n) {
      x = perm[x];
      c++;
    }
    return c === n;
  }
  return true;
}

function randomPerm(n, rng) {
  return rng.shuffle(Array.from({ length: n }, (_, i) => i));
}

function randomCycle(n, rng) {
  const order = randomPerm(n, rng);
  const perm = new Array(n);
  for (let i = 0; i < n; i++) perm[order[i]] = order[(i + 1) % n];
  return perm;
}

export function rejection(allowed, mode, rng, tries = REJECTION_TRIES) {
  const n = allowed.length;
  for (let t = 1; t <= tries; t++) {
    const perm = mode === 'loop' ? randomCycle(n, rng) : randomPerm(n, rng);
    if (permOk(allowed, perm, mode)) return { perm, attempts: t };
  }
  return null;
}

// Any valid permutation, or null if none was found within the budget.
export function findStart(allowed, mode, rng, budget = SEARCH_BUDGET) {
  const n = allowed.length;
  if (mode === 'any') {
    const { matchG, size } = maxMatching(allowed, n);
    return size === n ? Array.from(matchG) : null;
  }
  let nodes = 0;
  if (mode === 'noswap') {
    const perm = new Array(n).fill(-1);
    const used = new Uint8Array(n);
    const rec = (i) => {
      if (i === n) return true;
      const cand = [];
      for (let j = 0; j < n; j++) if (allowed[i][j] && !used[j] && perm[j] !== i) cand.push(j);
      rng.shuffle(cand);
      for (const j of cand) {
        if (++nodes > budget) return false;
        used[j] = 1;
        perm[i] = j;
        if (rec(i + 1)) return true;
        used[j] = 0;
        perm[i] = -1;
      }
      return false;
    };
    return rec(0) ? perm : null;
  }
  const path = [0];
  const vis = new Uint8Array(n);
  vis[0] = 1;
  const rec = () => {
    const last = path[path.length - 1];
    if (path.length === n) return Boolean(allowed[last][0]);
    const cand = [];
    for (let u = 0; u < n; u++) if (allowed[last][u] && !vis[u]) cand.push(u);
    rng.shuffle(cand);
    for (const u of cand) {
      if (++nodes > budget) return false;
      vis[u] = 1;
      path.push(u);
      if (rec()) return true;
      path.pop();
      vis[u] = 0;
    }
    return false;
  };
  if (!rec()) return null;
  const perm = new Array(n);
  for (let i = 0; i < n; i++) perm[path[i]] = path[(i + 1) % n];
  return perm;
}

// Symmetric proposals that only ever move between valid states, so the stationary
// distribution is uniform over the connected component of the start.
export function makeChain(allowed, mode, start, rng) {
  const n = allowed.length;
  if (mode === 'loop') {
    const order = [0];
    for (let x = start[0]; x !== 0; x = start[x]) order.push(x);
    const fits = () => {
      for (let i = 0; i < n; i++) if (!allowed[order[i]][order[(i + 1) % n]]) return false;
      return true;
    };
    return {
      run(steps) {
        for (let s = 0; s < steps; s++) {
          const p = rng.int(n);
          const q = rng.int(n);
          if (p === q) continue;
          if (rng.next() < 0.5) {
            [order[p], order[q]] = [order[q], order[p]];
            if (!fits()) [order[p], order[q]] = [order[q], order[p]];
          } else {
            const v = order.splice(p, 1)[0];
            order.splice(q, 0, v);
            if (!fits()) {
              order.splice(q, 1);
              order.splice(p, 0, v);
            }
          }
        }
      },
      perm() {
        const perm = new Array(n);
        for (let i = 0; i < n; i++) perm[order[i]] = order[(i + 1) % n];
        return perm;
      },
    };
  }
  const perm = start.slice();
  const noswap = mode === 'noswap';
  const good = (x) => allowed[x][perm[x]] && !(noswap && perm[perm[x]] === x);
  const other = (not) => {
    let v = rng.int(n - 1);
    for (const x of not) if (v >= x) v++;
    return v;
  };
  return {
    run(steps) {
      for (let s = 0; s < steps; s++) {
        if (rng.next() < 0.7) {
          const a = rng.int(n);
          const b = other([a]);
          [perm[a], perm[b]] = [perm[b], perm[a]];
          if (!(good(a) && good(b))) [perm[a], perm[b]] = [perm[b], perm[a]];
        } else {
          const a = rng.int(n);
          const b = other([a]);
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          let c = rng.int(n - 2);
          if (c >= lo) c++;
          if (c >= hi) c++;
          const [pa, pb, pc] = [perm[a], perm[b], perm[c]];
          perm[a] = pc;
          perm[b] = pa;
          perm[c] = pb;
          if (!(good(a) && good(b) && good(c))) {
            perm[a] = pa;
            perm[b] = pb;
            perm[c] = pc;
          }
        }
      }
    },
    perm: () => perm.slice(),
  };
}

export function chainFrom(allowed, mode, start, rng) {
  const chain = makeChain(allowed, mode, start, rng);
  chain.run(4000 * allowed.length);
  return chain.perm();
}

const factorial = (n) => {
  let f = 1;
  for (let k = 2; k <= n; k++) f *= k;
  return f;
};

export function sampledMarginals(allowed, mode, rng, { skipRejection = false } = {}) {
  const n = allowed.length;
  const counts = Array.from({ length: n }, () => new Array(n).fill(0));
  const add = (perm) => {
    for (let i = 0; i < n; i++) counts[i][perm[i]]++;
  };
  const finish = (used) =>
    counts.map((row) => row.map((c) => c / used));

  let accepted = 0;
  let tries = 0;
  let first = null;
  if (!skipRejection) {
    while (tries < ANALYSIS_TRIES && accepted < ANALYSIS_SAMPLES) {
      tries++;
      const perm = mode === 'loop' ? randomCycle(n, rng) : randomPerm(n, rng);
      if (!permOk(allowed, perm, mode)) continue;
      accepted++;
      add(perm);
      first ??= perm;
    }
  }
  const space = mode === 'loop' ? factorial(n - 1) : factorial(n);
  const totalEstimate = accepted > 0 ? (space * accepted) / tries : null;
  if (accepted >= MIN_REJECTION_SAMPLES) {
    return { feasible: true, marginals: finish(accepted), totalEstimate, usedChain: false };
  }

  const start = first ?? findStart(allowed, mode, rng);
  if (!start) return { feasible: false, marginals: finish(1), totalEstimate: null, usedChain: false };
  for (const row of counts) row.fill(0);
  const chain = makeChain(allowed, mode, start, rng);
  chain.run(4000 * n);
  for (let s = 0; s < ANALYSIS_SAMPLES; s++) {
    chain.run(2 * n);
    add(chain.perm());
  }
  return { feasible: true, marginals: finish(ANALYSIS_SAMPLES), totalEstimate, usedChain: true };
}
