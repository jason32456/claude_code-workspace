// Deciding language equivalence.
//
// Two regular languages are equal iff no reachable state of the product
// automaton disagrees on acceptance. Breadth-first search settles it, and
// because BFS reaches every pair by a shortest path, the first disagreement it
// finds yields the SHORTEST string on which the two patterns differ.
//
// This is a decision procedure, not a sample: "equal" here means equal on all
// infinitely many strings, which no amount of testing can establish.

import { compilePair } from './compile.js';
import { accepts } from './dfa.js';

export function decide(patternA, patternB) {
  const { a, b, alphabet } = compilePair(patternA, patternB);
  const A = a.minDfa;
  const B = b.minDfa;
  const size = alphabet.size;

  const pairKey = (qa, qb) => qa * B.states.length + qb;
  const parent = new Map(); // pairKey -> { from, symbol }
  const startKey = pairKey(A.start, B.start);

  const queue = [[A.start, B.start]];
  const seen = new Set([startKey]);
  let explored = 0;

  const witnessFor = (key) => {
    const symbols = [];
    let cur = key;
    while (cur !== startKey) {
      const step = parent.get(cur);
      symbols.push(step.symbol);
      cur = step.from;
    }
    symbols.reverse();
    return {
      symbols,
      text: symbols.map((s) => alphabet.charFor(s)).join(''),
    };
  };

  while (queue.length) {
    const [qa, qb] = queue.shift();
    explored++;
    const key = pairKey(qa, qb);

    if (A.states[qa].accepting !== B.states[qb].accepting) {
      const witness = witnessFor(key);
      return {
        equal: false,
        witness: witness.text,
        acceptedBy: A.states[qa].accepting ? 'a' : 'b',
        explored,
        a,
        b,
        alphabet,
        // The witness is re-checked against both machines independently, so a
        // bug in the BFS bookkeeping surfaces as a failed self-check rather
        // than as a confident wrong answer.
        verified:
          accepts(A, witness.text) !== accepts(B, witness.text)
          && accepts(A, witness.text) === A.states[qa].accepting,
      };
    }

    for (let sym = 0; sym < size; sym++) {
      const na = A.states[qa].trans[sym];
      const nb = B.states[qb].trans[sym];
      const nk = pairKey(na, nb);
      if (seen.has(nk)) continue;
      seen.add(nk);
      parent.set(nk, { from: key, symbol: sym });
      queue.push([na, nb]);
    }
  }

  return { equal: true, explored, a, b, alphabet, verified: true };
}

// Language emptiness and universality fall out of the same minimal machine:
// the canonical DFA for the empty language is a single rejecting state, and
// for "everything" a single accepting one.
export function describe(compiled) {
  const d = compiled.minDfa;
  const reachesAccept = d.states.some((s) => s.accepting);
  if (!reachesAccept) return 'matches nothing';
  if (d.states.length === 1 && d.states[0].accepting) return 'matches every string';
  if (d.states[d.start].accepting) return 'matches the empty string, among others';
  return null;
}

// A handful of short strings the language accepts, in shortest-first order.
// Used to make an "equal" verdict tangible next to the proof.
export function sampleStrings(compiled, limit = 6, maxLength = 12) {
  const d = compiled.minDfa;
  const ab = compiled.alphabet;
  const out = [];
  const queue = [[d.start, '']];
  const seen = new Set([`${d.start}|`]);

  while (queue.length && out.length < limit) {
    const [q, text] = queue.shift();
    if (d.states[q].accepting) out.push(text);
    if (text.length >= maxLength) continue;
    for (let sym = 0; sym < ab.size; sym++) {
      const n = d.states[q].trans[sym];
      if (d.states[n].isTrap) continue;
      const next = text + ab.charFor(sym);
      const k = `${n}|${next.length}`;
      // Bound the frontier: one representative per (state, length) is enough
      // to enumerate short members without blowing up on wide alphabets.
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([n, next]);
    }
  }
  return out;
}
