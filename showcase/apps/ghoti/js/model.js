// The pronunciation model: what the aligner discovered, conditioned on spelling context.
//
// Training is counting. Every chunk decision in every Viterbi-aligned training word is
// recorded as a single joint outcome -- how many letters were consumed AND which phones
// came out -- keyed by a window of surrounding letters, at every context width from 0
// up to maxContext.
//
// Making the outcome joint matters. A model that conditions on the chunk and predicts
// only the phones is not normalised over segmentations, so a chunking with fewer pieces
// wins simply by having fewer factors in the product, and the decoder drifts toward
// swallowing two letters at a time. Predicting (length, phones) together at each
// position removes that bias: every hypothesis for a word has exactly one factor per
// position reached, and they are directly comparable.
//
// Backoff is recursive Dirichlet interpolation. A wide context is trusted in proportion
// to how often it was actually observed and always falls back through narrower contexts
// to the context-free distribution, so the decoder can never be cornered by a letter
// sequence it has not seen.

import { viterbiAlign } from './align.js';

// A window of 2L+1 letters centred on the position being decided, encoded as one
// integer in base 27 (26 letters plus a word-boundary symbol). It deliberately does
// not depend on how many letters the chunk will consume -- that is what is being
// predicted, so it cannot be part of the key.
//
// The widest window used is 11 symbols, so 27^11 is about 5.6e15 and every key is an
// exact float64 integer: no collisions, and a Map keyed by numbers rather than strings
// costs a fraction of the memory over the roughly 1.5 million contexts this builds.
const A_CODE = 'a'.charCodeAt(0);

export function ctxKey(word, i, L) {
  let code = 0;
  for (let k = i - L; k <= i + L; k++) {
    const c = k < 0 || k >= word.length ? 26 : word.charCodeAt(k) - A_CODE;
    code = code * 27 + (c < 0 || c > 26 ? 26 : c);
  }
  return code;
}

export function createPronouncer({ maxContext = 4, alpha = 1.0 } = {}) {
  return {
    maxContext,
    alpha,
    levels: Array.from({ length: maxContext + 1 }, () => new Map()),
    nDecisions: 0,
    nPhones: 0,
    pcMax: 0,
  };
}

export function outcomeId(pron, a, pc) {
  return (a - 1) * pron.pcMax + pc;
}
export function splitOutcome(pron, id) {
  return { a: Math.floor(id / pron.pcMax) + 1, pc: id % pron.pcMax };
}

export function decodePc(pc, nPhones) {
  if (pc === 0) return [];
  if (pc <= nPhones) return [pc - 1];
  const r = pc - 1 - nPhones;
  return [Math.floor(r / nPhones), r % nPhones];
}

// Buckets are flat [outcome, count, outcome, count, ...] arrays rather than Maps.
// Almost every context resolves to one or two outcomes, and a two-element array is far
// cheaper than a Map object; across ~1.5M contexts that difference is most of the
// process's memory.
function bump(map, key, outcome) {
  const bucket = map.get(key);
  if (bucket === undefined) {
    map.set(key, [outcome, 1]);
    return;
  }
  for (let k = 0; k < bucket.length; k += 2) {
    if (bucket[k] === outcome) { bucket[k + 1]++; return; }
  }
  bucket.push(outcome, 1);
}

export function observe(pron, word, chunks, phoneIds) {
  for (const c of chunks) {
    let pc = 0;
    if (c.b === 1) pc = 1 + phoneIds[c.j];
    else if (c.b === 2) {
      pc = 1 + pron.nPhones + phoneIds[c.j] * pron.nPhones + phoneIds[c.j + 1];
    }
    const out = outcomeId(pron, c.a, pc);
    for (let L = 0; L <= pron.maxContext; L++) bump(pron.levels[L], ctxKey(word, c.i, L), out);
    pron.nDecisions++;
  }
}

export function trainPronouncer(pron, model, dict, indices, onProgress) {
  pron.nPhones = dict.nPhones;
  pron.pcMax = model.pcMax;
  let aligned = 0;
  let failed = 0;
  for (let t = 0; t < indices.length; t++) {
    const w = indices[t];
    const r = viterbiAlign(model, dict.letters(w), dict.phoneIds(w));
    if (!r) { failed++; continue; }
    observe(pron, dict.words[w], r.chunks, dict.phoneIds(w));
    aligned++;
    if (onProgress && (t & 4095) === 0) onProgress(t / indices.length);
  }
  return { aligned, failed };
}

// Distribution over joint outcomes at one position, as a Map outcomeId -> probability.
export function distribution(pron, word, i, upto = pron.maxContext) {
  let dist = null;
  for (let L = 0; L <= upto; L++) {
    const bucket = pron.levels[L].get(ctxKey(word, i, L));
    if (L === 0) {
      if (!bucket) return null;
      let total = 0;
      for (let k = 1; k < bucket.length; k += 2) total += bucket[k];
      dist = new Map();
      for (let k = 0; k < bucket.length; k += 2) dist.set(bucket[k], bucket[k + 1] / total);
      continue;
    }
    if (!bucket) continue;
    let total = 0;
    for (let k = 1; k < bucket.length; k += 2) total += bucket[k];
    const denom = total + pron.alpha;
    const out = new Map();
    for (const [o, pv] of dist) out.set(o, (pron.alpha * pv) / denom);
    for (let k = 0; k < bucket.length; k += 2) {
      out.set(bucket[k], (out.get(bucket[k]) || 0) + bucket[k + 1] / denom);
    }
    dist = out;
  }
  return dist;
}

// Beam search over positions. Returns ranked hypotheses, each carrying the phone ids it
// produced and the chunk trace that produced them.
export function pronounce(pron, word, { beam = 16, topK = 4, branch = 8, upto } = {}) {
  const n = word.length;
  if (n === 0) return [];
  const limit = upto === undefined ? pron.maxContext : upto;
  let states = [{ i: 0, score: 0, phones: [], trace: [] }];
  const done = [];

  while (states.length) {
    const next = [];
    for (const st of states) {
      const dist = distribution(pron, word, st.i, limit);
      if (!dist) continue;
      const ranked = [...dist.entries()].sort((x, y) => y[1] - x[1]);
      let taken = 0;
      for (const [o, p] of ranked) {
        if (p <= 0 || taken >= branch) break;
        const { a, pc } = splitOutcome(pron, o);
        if (st.i + a > n) continue;
        taken++;
        const emitted = decodePc(pc, pron.nPhones);
        const cand = {
          i: st.i + a,
          score: st.score + Math.log(p),
          phones: st.phones.concat(emitted),
          trace: st.trace.concat([{ i: st.i, a, pc, p, emitted }]),
        };
        if (cand.i >= n) done.push(cand);
        else next.push(cand);
      }
    }
    next.sort((x, y) => y.score - x.score);
    states = next.slice(0, beam);
  }

  done.sort((x, y) => y.score - x.score);
  const seen = new Set();
  const out = [];
  for (const d of done) {
    const k = d.phones.join(' ');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
    if (out.length >= topK) break;
  }
  return out;
}

// Exhaustive argmax over every chunking. Used only as an independent oracle in the
// self-tests: on short words the beam must return exactly what this returns.
export function pronounceExhaustive(pron, word, { upto } = {}) {
  const n = word.length;
  const limit = upto === undefined ? pron.maxContext : upto;
  let best = null;
  const walk = (i, score, phones) => {
    if (i >= n) {
      if (!best || score > best.score) best = { score, phones: phones.slice() };
      return;
    }
    const dist = distribution(pron, word, i, limit);
    if (!dist) return;
    for (const [o, p] of dist) {
      if (p <= 0) continue;
      const { a, pc } = splitOutcome(pron, o);
      if (i + a > n) continue;
      walk(i + a, score + Math.log(p), phones.concat(decodePc(pc, pron.nPhones)));
    }
  };
  walk(0, 0, []);
  return best;
}
