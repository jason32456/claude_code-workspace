// Alphabet partitioning.
//
// A DFA over Unicode would need 1.1 million transitions per state. Instead the
// code-point space is partitioned into the coarsest set of disjoint classes
// such that every character set the pattern mentions is exactly a union of
// classes. Two characters in the same class are indistinguishable to the
// pattern, so one transition per class loses nothing.
//
// For `(a|b)*abb` the partition is {a}, {b}, everything-else — three symbols
// instead of a million, and the resulting DFA is the textbook one.
//
// For equivalence the partition MUST be built from both patterns together. A
// class that is split in one machine and not the other would make the product
// construction compare transitions that are not on the same input, which is
// exactly how a checker returns a confident wrong answer.

import * as CS from './charset.js';

export const MAX_CLASSES = 200;

export function buildAlphabet(sets) {
  let classes = [CS.ANY];

  for (const s of sets) {
    const next = [];
    for (const c of classes) {
      const inside = CS.intersect(c, s);
      const outside = CS.subtract(c, s);
      if (!CS.isEmpty(inside)) next.push(inside);
      if (!CS.isEmpty(outside)) next.push(outside);
    }
    classes = next;
    if (classes.length > MAX_CLASSES) {
      throw new Error(
        `This pattern splits the alphabet into more than ${MAX_CLASSES} classes.`,
      );
    }
  }

  // Sort by first code point so class indices are stable and the rendered
  // transition order matches reading order.
  classes.sort((a, b) => a[0][0] - b[0][0]);

  const symbols = classes.map((set, index) => ({
    index,
    set,
    label: CS.label(set, { maxParts: 3 }),
    sample: CS.sample(set),
  }));

  return new Alphabet(symbols);
}

export class Alphabet {
  constructor(symbols) {
    this.symbols = symbols;
    // Flat boundary table for binary search: starts[i] is the first code point
    // of a run, owner[i] the symbol index covering it (-1 for a gap, which
    // cannot happen because the partition always covers the whole space).
    const edges = [];
    for (const sym of symbols) {
      for (const [lo, hi] of sym.set) edges.push([lo, hi, sym.index]);
    }
    edges.sort((a, b) => a[0] - b[0]);
    this.starts = Int32Array.from(edges.map((e) => e[0]));
    this.ends = Int32Array.from(edges.map((e) => e[1]));
    this.owner = Int32Array.from(edges.map((e) => e[2]));
  }

  get size() { return this.symbols.length; }

  // Symbol index covering a code point, or -1 if none (unreachable in a
  // well-formed partition, but checked rather than assumed).
  indexOf(cp) {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cp < this.starts[mid]) hi = mid - 1;
      else if (cp > this.ends[mid]) lo = mid + 1;
      else return this.owner[mid];
    }
    return -1;
  }

  // Which symbols a character set covers. The set is a union of classes by
  // construction, so this is exact rather than approximate.
  symbolsFor(set) {
    const out = [];
    for (const sym of this.symbols) {
      if (!CS.isEmpty(CS.intersect(sym.set, set))) out.push(sym.index);
    }
    return out;
  }

  // A representative character for a symbol, used to spell out the witness
  // string that distinguishes two languages.
  charFor(index) {
    const cp = this.symbols[index].sample;
    return cp === null ? '' : String.fromCodePoint(cp);
  }

  labelFor(index) { return this.symbols[index].label; }
}
