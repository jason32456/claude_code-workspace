// Putting Shaw's joke on trial.
//
// "gh as in tough, o as in women, ti as in nation, therefore ghoti spells fish."
// Each substitution is checked against every Viterbi alignment in the dictionary, and
// crucially against WHERE in the word it occurs, because position is the part the joke
// leaves out.
//
// The test is span-based rather than chunk-based on purpose. Asking "is there a chunk
// whose letters are exactly gh" would let the joke off on a technicality: the aligner
// segments `ghost` as g:G h:-, so no chunk named `gh` exists there and word-initial gh
// would look like it never occurs. Instead every occurrence of the LETTERS is found in
// every word, and the phones emitted across that letter span are collected, whatever
// chunking the aligner chose. A span whose ends do not fall on chunk boundaries is
// ambiguous and is counted separately rather than guessed at.
//
// This pass is descriptive rather than predictive, so it runs over all 117,493 words
// rather than the training split. No accuracy number is computed here.

import { viterbiAlign } from './align.js';

export const POSITIONS = ['initial', 'medial', 'final'];

export function positionOf(i, len, wordLength) {
  if (i === 0) return 'initial';
  if (i + len === wordLength) return 'final';
  return 'medial';
}

// Each probe is a letter sequence plus the base phones the joke claims it makes.
export const GHOTI_PROBES = [
  { letters: 'gh', phones: ['F'], claim: 'as in tough', says: 'f', needs: 'initial' },
  { letters: 'o', phones: ['IH'], claim: 'as in women', says: 'i', needs: 'medial' },
  { letters: 'ti', phones: ['SH'], claim: 'as in nation', says: 'sh', needs: 'final' },
];

// Phones emitted by the chunks covering letters [from, to), or null when that span does
// not begin and end on chunk boundaries.
export function spanPhones(chunks, from, to) {
  const out = [];
  let startOk = false;
  let endOk = false;
  for (const c of chunks) {
    if (c.i === from) startOk = true;
    if (c.i + c.a === to) endOk = true;
    if (c.i >= from && c.i + c.a <= to) {
      for (let k = 0; k < c.b; k++) out.push(c.j + k);
    }
  }
  if (!startOk || !endOk) return null;
  return out;
}

function blank() {
  return { initial: 0, medial: 0, final: 0 };
}

export function runForensics(model, dict, indices, probes = GHOTI_PROBES, onProgress) {
  const tallies = probes.map((probe) => ({
    probe,
    total: 0,
    ambiguous: 0,
    matches: 0,
    byPosition: blank(),
    matchByPosition: blank(),
    examples: { initial: [], medial: [], final: [] },
    outcomesByPosition: { initial: new Map(), medial: new Map(), final: new Map() },
    outcomes: new Map(),
  }));

  for (let t = 0; t < indices.length; t++) {
    const w = indices[t];
    const word = dict.words[w];
    const phoneIds = dict.phoneIds(w);
    const r = viterbiAlign(model, dict.letters(w), phoneIds);
    if (!r) continue;

    for (let pi = 0; pi < probes.length; pi++) {
      const probe = probes[pi];
      const L = probe.letters.length;
      const tally = tallies[pi];
      let from = word.indexOf(probe.letters);
      while (from !== -1) {
        const pos = positionOf(from, L, word.length);
        const span = spanPhones(r.chunks, from, from + L);
        tally.total++;
        tally.byPosition[pos]++;
        if (span === null) {
          tally.ambiguous++;
        } else {
          const made = span.map((j) => dict.base[phoneIds[j]]);
          const key = made.length ? made.join(' ') : '(silent)';
          tally.outcomes.set(key, (tally.outcomes.get(key) || 0) + 1);
          const pm = tally.outcomesByPosition[pos];
          pm.set(key, (pm.get(key) || 0) + 1);
          const want = probe.phones;
          if (made.length === want.length && made.every((p, k) => p === want[k])) {
            tally.matches++;
            tally.matchByPosition[pos]++;
            if (tally.examples[pos].length < 24) tally.examples[pos].push(word);
          }
        }
        from = word.indexOf(probe.letters, from + 1);
      }
    }
    if (onProgress && (t & 8191) === 0) onProgress(t / indices.length);
  }

  for (const tally of tallies) {
    tally.topOutcomes = [...tally.outcomes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    for (const pos of POSITIONS) {
      tally[`${pos}Outcomes`] = [...tally.outcomesByPosition[pos].entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    }
  }
  return tallies;
}

// The verdict. `ghoti` needs gh word-initially, o word-medially and ti word-finally.
export function verdict(tallies) {
  return tallies.map((t) => {
    const pos = t.probe.needs;
    const inPosition = t.matchByPosition[pos];
    const seenInPosition = t.byPosition[pos];
    const positionCounts = {};
    for (const q of POSITIONS) {
      positionCounts[q] = { seen: t.byPosition[q], hit: t.matchByPosition[q] };
    }
    return {
      letters: t.probe.letters,
      claim: t.probe.claim,
      positionCounts,
      says: t.probe.says,
      requiredPosition: pos,
      timesAnywhere: t.matches,
      timesInRequiredPosition: inPosition,
      spanSeenInPosition: seenInPosition,
      rateInPosition: seenInPosition ? inPosition / seenInPosition : 0,
      examples: t.examples,
      topOutcomes: t.topOutcomes,
      positionOutcomes: t[`${pos}Outcomes`],
      survives: inPosition > 0,
    };
  });
}
