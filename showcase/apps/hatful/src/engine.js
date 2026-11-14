import { makeRng, randomSeed } from './rng.js';
import { DP_MAX, rowMasks, backwardTable, countAndMarginals, sampleAny } from './count.js';
import { LOOP_EXACT_MAX, loopForward, loopCount, loopSample } from './loop.js';
import { hallViolator } from './hall.js';
import {
  REJECTION_TRIES,
  hasSwap,
  permOk,
  rejection,
  findStart,
  chainFrom,
  sampledMarginals,
} from './sampled.js';

const MODES = new Set(['any', 'noswap', 'loop']);
const EXACT_MAX = 18;
const NOSWAP_DP_TRIES = 5000;
const NOSWAP_ANALYSIS_SAMPLES = 6000;
// Fixed so identical edits give identical numbers while the user is typing.
const ANALYSIS_SEED = 'hatful-analysis';

const now = () => globalThis.performance.now();
const zeros = (n) => Array.from({ length: n }, () => new Array(n).fill(0));

function prepare(event) {
  const people = Array.isArray(event?.people) ? event.people : [];
  const n = people.length;
  const ids = people.map((p) => p.id);
  const names = people.map((p) => p.name);
  const index = new Map();
  ids.forEach((id, i) => index.set(String(id), i));
  const group = people.map((p) => (p.group == null || p.group === '' ? null : String(p.group)));
  const allowed = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => i !== j && !(group[i] !== null && group[i] === group[j]))
  );
  for (const ban of Array.isArray(event?.bans) ? event.bans : []) {
    const i = index.get(String(ban?.from));
    const j = index.get(String(ban?.to));
    if (i !== undefined && j !== undefined) allowed[i][j] = false;
  }
  const mode = MODES.has(event?.mode) ? event.mode : 'any';
  return { n, ids, names, index, allowed, mode };
}

function infeasible(message) {
  return Object.assign(new Error(message), { code: 'INFEASIBLE' });
}

function summarise(ids, marginals) {
  const n = ids.length;
  const leaks = [];
  let bits = Infinity;
  let weakest = null;
  for (let i = 0; i < n; i++) {
    let h = 0;
    for (let j = 0; j < n; j++) {
      const p = marginals[i][j];
      if (p <= 0) continue;
      h -= p * Math.log2(p);
      if (p >= 0.5) leaks.push({ kind: p >= 0.999 ? 'forced' : 'likely', from: ids[i], to: ids[j], p });
    }
    if (h < bits) {
      bits = h;
      weakest = ids[i];
    }
  }
  leaks.sort((a, b) => b.p - a.p);
  return { leaks, secrecy: { bits: Math.max(0, bits), maxBits: Math.log2(n - 1), weakest } };
}

function analyseNoswap({ n, allowed }, rng) {
  if (n > DP_MAX) return { ...sampledMarginals(allowed, 'noswap', rng), total: null };
  const rows = rowMasks(allowed, n);
  const b = backwardTable(rows, n);
  const total = b[0];
  if (total === 0) return { feasible: false, marginals: zeros(n), totalEstimate: 0 };
  const counts = zeros(n);
  let accepted = 0;
  for (let s = 0; s < NOSWAP_ANALYSIS_SAMPLES; s++) {
    const perm = sampleAny(rows, n, b, rng);
    if (hasSwap(perm)) continue;
    accepted++;
    for (let i = 0; i < n; i++) counts[i][perm[i]]++;
  }
  if (accepted > 0) {
    return {
      feasible: true,
      marginals: counts.map((r) => r.map((c) => c / accepted)),
      totalEstimate: (total * accepted) / NOSWAP_ANALYSIS_SAMPLES,
    };
  }
  const r = sampledMarginals(allowed, 'noswap', rng, { skipRejection: true });
  return { ...r, totalEstimate: null };
}

export function analyse(event) {
  const t0 = now();
  const ctx = prepare(event);
  const { n, ids, names, allowed, mode } = ctx;
  const out = {
    n,
    ids,
    names,
    allowed,
    feasible: false,
    method: 'exact',
    total: 0,
    totalEstimate: null,
    marginals: zeros(n),
    hall: null,
    leaks: [],
    secrecy: { bits: 0, maxBits: n > 2 ? Math.log2(n - 1) : 0, weakest: null },
    ms: 0,
  };
  if (n < 3) {
    out.ms = now() - t0;
    return out;
  }

  const rng = makeRng(ANALYSIS_SEED);
  let r;
  if (mode === 'any' && n <= DP_MAX) {
    r = countAndMarginals(rowMasks(allowed, n), n);
    out.method = n <= EXACT_MAX ? 'exact' : 'float';
    out.total = r.total;
    out.feasible = r.total > 0;
    out.marginals = r.marginals;
  } else if (mode === 'loop' && n <= LOOP_EXACT_MAX) {
    r = loopCount(allowed, n);
    out.total = r.total;
    out.feasible = r.total > 0;
    out.marginals = r.marginals;
  } else {
    r = mode === 'noswap' ? analyseNoswap(ctx, rng) : sampledMarginals(allowed, mode, rng);
    out.method = 'sampled';
    out.total = null;
    out.totalEstimate = r.totalEstimate;
    out.feasible = r.feasible;
    out.marginals = r.feasible ? r.marginals : zeros(n);
  }

  if (out.feasible) {
    Object.assign(out, summarise(ids, out.marginals));
  } else {
    const hall = hallViolator(allowed, n);
    if (hall) {
      out.hall = { givers: hall.givers.map((i) => ids[i]), receivers: hall.receivers.map((i) => ids[i]) };
      if (out.method === 'sampled') out.totalEstimate = 0;
    }
  }
  out.ms = now() - t0;
  return out;
}

function drawAny({ n, allowed }, rng) {
  if (n <= DP_MAX) {
    const rows = rowMasks(allowed, n);
    const b = backwardTable(rows, n);
    if (b[0] === 0) throw infeasible('No valid draw exists for these rules');
    return {
      perm: sampleAny(rows, n, b, rng),
      method: n <= EXACT_MAX ? 'exact' : 'float',
      attempts: 1,
      uniform: true,
    };
  }
  return drawByRejection(allowed, 'any', rng);
}

function drawByRejection(allowed, mode, rng) {
  const hit = rejection(allowed, mode, rng, REJECTION_TRIES);
  if (hit) return { perm: hit.perm, method: 'sampled', attempts: hit.attempts, uniform: true };
  return drawByChain(allowed, mode, rng, REJECTION_TRIES);
}

// Not uniform, and reported as such through `uniform: false`.
function drawByChain(allowed, mode, rng, attempts) {
  const start = findStart(allowed, mode, rng);
  if (!start) throw infeasible('No valid draw exists for these rules');
  return { perm: chainFrom(allowed, mode, start, rng), method: 'sampled', attempts, uniform: false };
}

function drawNoswap(ctx, rng) {
  const { n, allowed } = ctx;
  if (n > DP_MAX) return drawByRejection(allowed, 'noswap', rng);
  const rows = rowMasks(allowed, n);
  const b = backwardTable(rows, n);
  if (b[0] === 0) throw infeasible('No valid draw exists for these rules');
  for (let t = 1; t <= NOSWAP_DP_TRIES; t++) {
    const perm = sampleAny(rows, n, b, rng);
    if (!hasSwap(perm)) return { perm, method: 'sampled', attempts: t, uniform: true };
  }
  return drawByChain(allowed, 'noswap', rng, NOSWAP_DP_TRIES);
}

function drawLoop(ctx, rng) {
  const { n, allowed } = ctx;
  if (n > LOOP_EXACT_MAX) return drawByRejection(allowed, 'loop', rng);
  const fw = loopForward(allowed, n);
  const perm = loopSample(allowed, n, fw, rng);
  if (!perm) throw infeasible('No valid draw exists for these rules');
  return { perm, method: 'exact', attempts: 1, uniform: true };
}

export function draw(event, seed) {
  const ctx = prepare(event);
  if (ctx.n < 3) throw infeasible('At least 3 people are needed');
  const used = seed === undefined || seed === null ? randomSeed() : String(seed);
  const rng = makeRng(used);
  const r = ctx.mode === 'loop' ? drawLoop(ctx, rng) : ctx.mode === 'noswap' ? drawNoswap(ctx, rng) : drawAny(ctx, rng);
  const assignment = {};
  r.perm.forEach((j, i) => {
    assignment[ctx.ids[i]] = ctx.ids[j];
  });
  return { assignment, seed: used, method: r.method, attempts: r.attempts, uniform: r.uniform };
}

export function cyclesOf(assignment) {
  const seen = new Set();
  const cycles = [];
  for (const start of Object.keys(assignment)) {
    if (seen.has(start)) continue;
    const cycle = [];
    let x = start;
    while (x !== undefined && !seen.has(String(x))) {
      seen.add(String(x));
      cycle.push(x);
      x = assignment[x];
    }
    cycles.push(cycle);
  }
  return cycles;
}

export function isValid(event, assignment) {
  const { n, index, allowed, mode } = prepare(event);
  if (!assignment || typeof assignment !== 'object' || n === 0) return false;
  const keys = Object.keys(assignment);
  if (keys.length !== n) return false;
  const perm = new Array(n).fill(-1);
  const taken = new Uint8Array(n);
  for (const k of keys) {
    const i = index.get(k);
    const j = index.get(String(assignment[k]));
    if (i === undefined || j === undefined || taken[j]) return false;
    taken[j] = 1;
    perm[i] = j;
  }
  return permOk(allowed, perm, mode);
}
