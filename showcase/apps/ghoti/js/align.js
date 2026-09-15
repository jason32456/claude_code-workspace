// Many-to-many monotone letter-to-phone alignment by Expectation-Maximisation.
//
// The dictionary says `knight -> N AY1 T` and never says which letters made which
// sounds. This recovers that correspondence with no supervision: start from a uniform
// distribution over every legal chunk pair, run forward-backward over the lattice of
// all alignments of every word, accumulate fractional counts, renormalise, repeat.
//
// EM's likelihood monotonicity is a theorem, so a decrease is a bug, not bad luck.
// run() reports the log-likelihood each iteration and the UI asserts the increase.

export const MAX_L = 2; // letters consumed per move
export const MAX_P = 2; // phones emitted per move (0 means a silent letter)

// Chunk pairs are interned to a single integer so the inner loop is pure arithmetic.
export const LC_MAX = 26 + 26 * 26; // 1- and 2-letter chunks
export function lcId(letters, i, a) {
  return a === 1 ? letters[i] : 26 + letters[i] * 26 + letters[i + 1];
}

export function makePcMax(nPhones) {
  return 1 + nPhones + nPhones * nPhones;
}
export function pcId(phones, j, b, nPhones) {
  if (b === 0) return 0;
  if (b === 1) return 1 + phones[j];
  return 1 + nPhones + phones[j] * nPhones + phones[j + 1];
}

// A letter may be silent, spell one sound, or spell two (x -> K S, u -> Y UW); two
// letters may spell one sound (sh, ch, kn, gh). Two letters spelling two sounds is
// excluded on purpose: it is almost never what English orthography is doing, and
// leaving it in lets EM absorb whole syllables into single chunks, which destroys
// every alignment downstream. That was measured, not assumed — see README.
export const MOVES = [
  [1, 0], [1, 1], [1, 2], [2, 1],
];

// Prior over move types. English is alphabetic until proven otherwise: one letter
// making one sound is the default, silent letters and digraphs are plausible, and a
// single letter spelling two phones is rare. EM is free to override all of this and
// does; without it EM converges on a different and much worse optimum.
export const MOVE_PRIOR = { '11': 1, '10': 0.2, '21': 0.2, '12': 0.005 };

// Initialised to 1 rather than 1/pcMax on purpose: that makes every alignment of a
// word equally weighted in the first E-step, which is the honest uninformative prior.
// The cost is that the initial parameters are NOT a normalised distribution, so the Z
// of the first pass is not a likelihood and is excluded from the monotonicity
// assertion. Every pass after the first runs on proper conditional distributions
// produced by maximise(), and those must increase without exception.
export function createModel(nPhones) {
  const pcMax = makePcMax(nPhones);
  const m = {
    nPhones,
    pcMax,
    size: LC_MAX * pcMax,
    prob: new Float64Array(LC_MAX * pcMax),
    // How many letters a chunk consumes is part of the model. Without this term the
    // probability of a word is not normalised over segmentations, so coarser chunkings
    // win by having fewer factors and the aligner produces nonsense like `to:T`.
    aProb: new Float64Array(2).fill(0.5),
    passes: 0,
  };
  return seedPrior(m);
}

// Seed prob[] from MOVE_PRIOR. Every legal chunk pair starts reachable, so nothing is
// permanently excluded by a zero it can never climb out of.
export function seedPrior(model) {
  const { pcMax, prob, nPhones } = model;
  for (let lc = 0; lc < LC_MAX; lc++) {
    const a = lc < 26 ? 1 : 2;
    for (let pc = 0; pc < pcMax; pc++) {
      const b = pc === 0 ? 0 : pc <= nPhones ? 1 : 2;
      prob[lc * pcMax + pc] = MOVE_PRIOR[`${a}${b}`] ?? 0;
    }
  }
  return model;
}

// Forward-backward over one word, accumulating fractional counts.
// Returns log Z, or null when the word admits no alignment at all.
function accumulate(model, letters, phones, counts, aCounts) {
  const n = letters.length;
  const m = phones.length;
  const { prob, pcMax, nPhones } = model;
  const W = m + 1;
  const alpha = new Float64Array((n + 1) * W);
  const beta = new Float64Array((n + 1) * W);
  alpha[0] = 1;

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const av = alpha[i * W + j];
      if (av === 0) continue;
      for (let k = 0; k < MOVES.length; k++) {
        const a = MOVES[k][0];
        const b = MOVES[k][1];
        if (i + a > n || j + b > m) continue;
        const p = model.aProb[a - 1] * prob[lcId(letters, i, a) * pcMax + pcId(phones, j, b, nPhones)];
        if (p === 0) continue;
        alpha[(i + a) * W + j + b] += av * p;
      }
    }
  }
  const Z = alpha[n * W + m];
  if (!(Z > 0)) return null;

  beta[n * W + m] = 1;
  for (let i = n; i >= 0; i--) {
    for (let j = m; j >= 0; j--) {
      if (i === n && j === m) continue;
      let acc = 0;
      for (let k = 0; k < MOVES.length; k++) {
        const a = MOVES[k][0];
        const b = MOVES[k][1];
        if (i + a > n || j + b > m) continue;
        const bv = beta[(i + a) * W + j + b];
        if (bv === 0) continue;
        const p = model.aProb[a - 1] * prob[lcId(letters, i, a) * pcMax + pcId(phones, j, b, nPhones)];
        if (p === 0) continue;
        acc += p * bv;
      }
      beta[i * W + j] = acc;
    }
  }

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const av = alpha[i * W + j];
      if (av === 0) continue;
      for (let k = 0; k < MOVES.length; k++) {
        const a = MOVES[k][0];
        const b = MOVES[k][1];
        if (i + a > n || j + b > m) continue;
        const bv = beta[(i + a) * W + j + b];
        if (bv === 0) continue;
        const id = lcId(letters, i, a) * pcMax + pcId(phones, j, b, nPhones);
        const p = model.aProb[a - 1] * prob[id];
        if (p === 0) continue;
        const post = (av * p * bv) / Z;
        counts[id] += post;
        aCounts[a - 1] += post;
      }
    }
  }
  return Math.log(Z);
}

function maximise(model, counts, aCounts) {
  const aTotal = aCounts[0] + aCounts[1];
  if (aTotal > 0) {
    model.aProb[0] = aCounts[0] / aTotal;
    model.aProb[1] = aCounts[1] / aTotal;
  }
  const { pcMax, prob } = model;
  for (let lc = 0; lc < LC_MAX; lc++) {
    const base = lc * pcMax;
    let total = 0;
    for (let pc = 0; pc < pcMax; pc++) total += counts[base + pc];
    if (total === 0) {
      // Chunk never observed; leave it unreachable rather than inventing mass.
      for (let pc = 0; pc < pcMax; pc++) prob[base + pc] = 0;
      continue;
    }
    for (let pc = 0; pc < pcMax; pc++) prob[base + pc] = counts[base + pc] / total;
  }
}

// One EM pass over `indices` of the dictionary.
// `logLik` is measured under the parameters going IN, so the value returned by pass t
// scores the model produced by pass t-1. `proper` is false only for the very first
// pass, whose incoming parameters are the unnormalised uniform init.
export function emIteration(model, dict, indices) {
  const counts = new Float64Array(model.size);
  const aCounts = new Float64Array(2);
  let logLik = 0;
  let skipped = 0;
  for (let t = 0; t < indices.length; t++) {
    const w = indices[t];
    const letters = dict.letters(w);
    const phones = dict.phoneIds(w);
    if (letters.length === 0 || letters.length > 250) { skipped++; continue; }
    if (phones.length > letters.length * MAX_P) { skipped++; continue; }
    const ll = accumulate(model, letters, phones, counts, aCounts);
    if (ll === null) { skipped++; continue; }
    logLik += ll;
  }
  const proper = model.passes > 0;
  maximise(model, counts, aCounts);
  model.passes++;
  return { logLik, skipped, proper };
}

// Best single alignment under the current parameters. Returns the chunk sequence
// [{ i, a, j, b, logp }] or null if the word cannot be aligned.
export function viterbiAlign(model, letters, phones) {
  const n = letters.length;
  const m = phones.length;
  const { prob, pcMax, nPhones } = model;
  const W = m + 1;
  const best = new Float64Array((n + 1) * W).fill(-Infinity);
  const backA = new Int8Array((n + 1) * W);
  const backB = new Int8Array((n + 1) * W);
  best[0] = 0;

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const bv = best[i * W + j];
      if (bv === -Infinity) continue;
      for (let k = 0; k < MOVES.length; k++) {
        const a = MOVES[k][0];
        const b = MOVES[k][1];
        if (i + a > n || j + b > m) continue;
        const p = model.aProb[a - 1] * prob[lcId(letters, i, a) * pcMax + pcId(phones, j, b, nPhones)];
        if (p === 0) continue;
        const cand = bv + Math.log(p);
        const idx = (i + a) * W + j + b;
        if (cand > best[idx]) {
          best[idx] = cand;
          backA[idx] = a;
          backB[idx] = b;
        }
      }
    }
  }
  if (best[n * W + m] === -Infinity) return null;

  const out = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const idx = i * W + j;
    const a = backA[idx];
    const b = backB[idx];
    out.push({ i: i - a, a, j: j - b, b });
    i -= a;
    j -= b;
  }
  out.reverse();
  return { chunks: out, logp: best[n * W + m] };
}
