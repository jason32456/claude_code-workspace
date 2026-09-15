// The pipeline, in one place: source -> tokens -> AST -> NFA -> DFA -> minimal DFA.
//
// compilePair shares one alphabet partition between two patterns, which is a
// precondition for the product construction in equiv.js and not merely an
// optimization.

import { parse, expandedSize } from './parser.js';
import { buildNFA, charSets, nfaStats } from './nfa.js';
import { buildAlphabet } from './alphabet.js';
import { subsetConstruction, minimize, liveCount } from './dfa.js';

export const MAX_EXPANDED = 2000;

export function compile(pattern, { alphabet = null } = {}) {
  const { ast, tokens, groupCount } = parse(pattern);

  const expanded = expandedSize(ast);
  if (expanded > MAX_EXPANDED) {
    const err = new Error(
      `Expanding the bounded repeats in this pattern needs ${expanded.toLocaleString()} ` +
      `literals, over the ${MAX_EXPANDED.toLocaleString()} cap.`,
    );
    err.pos = 0;
    err.hint = 'Nested counted repeats multiply rather than add.';
    throw err;
  }

  const nfa = buildNFA(ast);
  const ab = alphabet ?? buildAlphabet(charSets(nfa));
  const dfa = subsetConstruction(nfa, ab);
  const minDfa = minimize(dfa);

  return {
    source: pattern,
    ast,
    tokens,
    groupCount,
    nfa,
    alphabet: ab,
    dfa,
    minDfa,
    stats: {
      nfa: nfaStats(nfa),
      dfaStates: dfa.states.length,
      minStates: minDfa.states.length,
      minLive: liveCount(minDfa),
      classes: ab.size,
    },
  };
}

// Both patterns, one alphabet. The partition is built from the character sets
// of both machines together so that a class split by one pattern is split in
// the other too, and the two transition tables are indexed by the same symbols.
export function compilePair(patternA, patternB) {
  const a = parse(patternA);
  const b = parse(patternB);
  const nfaA = buildNFA(a.ast);
  const nfaB = buildNFA(b.ast);
  const alphabet = buildAlphabet([...charSets(nfaA), ...charSets(nfaB)]);
  return {
    a: compile(patternA, { alphabet }),
    b: compile(patternB, { alphabet }),
    alphabet,
  };
}
