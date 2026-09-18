// Subset construction and Hopcroft minimization.
//
// Both produce a COMPLETE DFA — every state has a transition on every symbol,
// with a trap state absorbing the rest. Completeness is not cosmetic: the
// product construction in equiv.js compares two machines step for step, and a
// missing transition on one side would be read as agreement rather than as the
// disagreement it is.
//
// The trap state is flagged so the renderer can hide it. Hidden, `(a|b)*abb`
// minimizes to the four states every textbook prints; shown, it is five,
// because this alphabet includes every character the pattern never mentions.

import { epsilonClosure } from './nfa.js';

export const MAX_DFA_STATES = 600;

export class DfaLimitError extends Error {
  constructor(limit) {
    super(`Determinizing this pattern passed ${limit} states.`);
    this.name = 'DfaLimitError';
    this.limit = limit;
  }
}

// states: [{ id, accepting, isTrap, nfaStates, trans: Int32Array(alphabet.size) }]
export function subsetConstruction(nfa, alphabet, { limit = MAX_DFA_STATES } = {}) {
  const size = alphabet.size;
  const states = [];
  const byKey = new Map();

  // Transition sets are read off the NFA once per symbol rather than per
  // character: an NFA edge covers a symbol iff its set intersects that class,
  // and because the partition was built from these very sets, intersecting is
  // the same as containing.
  const edgeSymbols = new Map();
  const symbolsOfEdge = (set) => {
    const k = set;
    if (!edgeSymbols.has(k)) edgeSymbols.set(k, alphabet.symbolsFor(set));
    return edgeSymbols.get(k);
  };

  const intern = (ids) => {
    const key = ids.join(',');
    if (byKey.has(key)) return byKey.get(key);
    if (states.length >= limit) throw new DfaLimitError(limit);
    const id = states.length;
    byKey.set(key, id);
    states.push({
      id,
      accepting: ids.includes(nfa.accept),
      isTrap: ids.length === 0,
      nfaStates: ids,
      trans: new Int32Array(size).fill(-1),
    });
    return id;
  };

  const start = intern(epsilonClosure(nfa, [nfa.start]));
  const trap = intern([]); // the empty subset: reached, and never leaves

  for (let i = 0; i < states.length; i++) {
    const st = states[i];
    if (st.nfaStates.length === 0) {
      st.trans.fill(trap);
      continue;
    }
    // move(): for each symbol, the NFA states reachable on any character of it.
    const moves = Array.from({ length: size }, () => new Set());
    for (const s of st.nfaStates) {
      for (const e of nfa.states[s].edges) {
        if (e.set === null) continue;
        for (const sym of symbolsOfEdge(e.set)) moves[sym].add(e.to);
      }
    }
    for (let sym = 0; sym < size; sym++) {
      const ids = moves[sym].size === 0 ? [] : epsilonClosure(nfa, [...moves[sym]]);
      st.trans[sym] = intern(ids);
    }
  }

  return { states, start, trap, alphabet };
}

// Hopcroft partition refinement. n is at most a few hundred here, so the
// blocks are plain Sets and the inner scans stay readable; the asymptotic
// worklist trick would not be observable.
export function minimize(dfa) {
  const n = dfa.states.length;
  const size = dfa.alphabet.size;

  // pred[sym] maps a target state to the states that reach it on that symbol.
  const pred = Array.from({ length: size }, () => Array.from({ length: n }, () => []));
  for (const st of dfa.states) {
    for (let sym = 0; sym < size; sym++) pred[sym][st.trans[sym]].push(st.id);
  }

  const accepting = new Set(dfa.states.filter((s) => s.accepting).map((s) => s.id));
  const rejecting = new Set(dfa.states.filter((s) => !s.accepting).map((s) => s.id));

  const partition = [accepting, rejecting].filter((b) => b.size > 0);
  const worklist = partition.map((b) => new Set(b));

  while (worklist.length) {
    const target = worklist.pop();
    for (let sym = 0; sym < size; sym++) {
      // X = states whose sym-transition lands inside `target`.
      const X = new Set();
      for (const q of target) for (const p of pred[sym][q]) X.add(p);
      if (X.size === 0) continue;

      for (let i = partition.length - 1; i >= 0; i--) {
        const Y = partition[i];
        let inter = null;
        let diff = null;
        for (const q of Y) {
          if (X.has(q)) (inter ??= new Set()).add(q);
          else (diff ??= new Set()).add(q);
        }
        if (!inter || !diff) continue; // Y is not split by X

        partition.splice(i, 1, inter, diff);
        const wi = worklist.findIndex((w) => w.size === Y.size && [...w].every((q) => Y.has(q)));
        if (wi >= 0) worklist.splice(wi, 1, inter, diff);
        else worklist.push(inter.size <= diff.size ? inter : diff);
      }
    }
  }

  // Rebuild, numbering blocks by BFS from the start block so the rendered
  // machine is laid out in reading order and the numbering is deterministic.
  const blockOf = new Int32Array(n).fill(-1);
  partition.forEach((block, i) => { for (const q of block) blockOf[q] = i; });

  const order = [];
  const seen = new Set();
  const queue = [blockOf[dfa.start]];
  seen.add(blockOf[dfa.start]);
  while (queue.length) {
    const b = queue.shift();
    order.push(b);
    const rep = [...partition[b]][0];
    for (let sym = 0; sym < size; sym++) {
      const nb = blockOf[dfa.states[rep].trans[sym]];
      if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
    }
  }
  // Any block unreachable from the start (possible only if the input DFA had
  // unreachable states) is dropped rather than renumbered into a hole.
  //
  // Trap blocks are numbered last so that hiding the trap leaves the visible
  // states numbered 0..n-1 with no gap where the hidden one used to be.
  const isTrapBlock = (b) => {
    const rep = dfa.states[[...partition[b]][0]];
    if (rep.accepting) return false;
    for (let sym = 0; sym < size; sym++) {
      if (blockOf[rep.trans[sym]] !== b) return false;
    }
    return true;
  };
  const ordered = [...order.filter((b) => !isTrapBlock(b)), ...order.filter(isTrapBlock)];
  order.length = 0;
  order.push(...ordered);
  const newIndex = new Map(order.map((b, i) => [b, i]));

  const states = order.map((b, i) => {
    const members = [...partition[b]].sort((a, c) => a - c);
    const rep = dfa.states[members[0]];
    return {
      id: i,
      accepting: rep.accepting,
      isTrap: members.every((q) => dfa.states[q].isTrap),
      merged: members,
      trans: new Int32Array(size),
    };
  });
  order.forEach((b, i) => {
    const rep = dfa.states[[...partition[b]][0]];
    for (let sym = 0; sym < size; sym++) {
      states[i].trans[sym] = newIndex.get(blockOf[rep.trans[sym]]);
    }
  });

  // A state is a trap if it rejects and every symbol loops back to itself.
  for (const st of states) {
    st.isTrap = !st.accepting && st.trans.every((t) => t === st.id);
  }

  const trap = states.find((s) => s.isTrap);
  return {
    states,
    start: newIndex.get(blockOf[dfa.start]),
    trap: trap ? trap.id : -1,
    alphabet: dfa.alphabet,
  };
}

export function accepts(dfa, text) {
  let q = dfa.start;
  for (const ch of text) {
    const sym = dfa.alphabet.indexOf(ch.codePointAt(0));
    if (sym < 0) return false;
    q = dfa.states[q].trans[sym];
  }
  return dfa.states[q].accepting;
}

// States excluding the trap — the count a textbook would quote, since a
// textbook fixes the alphabet to the characters the pattern actually uses.
export function liveCount(dfa) {
  return dfa.states.filter((s) => !s.isTrap).length;
}

// Group parallel edges so the renderer draws one arrow per state pair with a
// combined label rather than one per alphabet class.
export function groupedEdges(dfa, { hideTrap = true } = {}) {
  const out = [];
  for (const st of dfa.states) {
    if (hideTrap && st.isTrap) continue;
    const byTarget = new Map();
    for (let sym = 0; sym < dfa.alphabet.size; sym++) {
      const to = st.trans[sym];
      if (hideTrap && dfa.states[to].isTrap) continue;
      if (!byTarget.has(to)) byTarget.set(to, []);
      byTarget.get(to).push(sym);
    }
    for (const [to, syms] of byTarget) {
      out.push({
        from: st.id,
        to,
        symbols: syms,
        label: syms.map((s) => dfa.alphabet.labelFor(s)).join(', '),
      });
    }
  }
  return out;
}
