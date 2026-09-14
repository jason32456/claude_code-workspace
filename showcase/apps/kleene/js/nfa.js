// Thompson construction: AST -> epsilon-NFA.
//
// Every fragment gets its own start and accept state. That is a few more
// states than the patch-list formulation, but each state then belongs to
// exactly one AST node, which is what makes selecting a node in the tree able
// to highlight the states it produced.
//
// Anchors compile to epsilon. Under whole-string semantics a leading `^` and a
// trailing `$` are satisfied by definition, so that is exact — but only at the
// boundaries, which is why checkAnchors below refuses them anywhere else
// rather than emitting an automaton that would quietly accept the wrong
// language.

import * as CS from './charset.js';
import { RegexError, expandedSize } from './parser.js';

export const MAX_NFA_STATES = 4000;

class Builder {
  constructor() {
    this.states = [];
  }

  add(astId) {
    if (this.states.length >= MAX_NFA_STATES) {
      throw new RegexError(
        `This pattern needs more than ${MAX_NFA_STATES} NFA states.`, 0, 1,
        'Bounded repeats multiply: {100}{100} is ten thousand copies.',
      );
    }
    const id = this.states.length;
    this.states.push({ id, astId, edges: [] });
    return id;
  }

  edge(from, to, set = null) {
    this.states[from].edges.push({ to, set });
  }

  // Returns {start, accept}.
  build(node) {
    switch (node.type) {
      case 'Empty':
      case 'Anchor': {
        const s = this.add(node.id);
        const a = this.add(node.id);
        this.edge(s, a);
        return { start: s, accept: a };
      }
      case 'Char': {
        const s = this.add(node.id);
        const a = this.add(node.id);
        this.edge(s, a, node.set);
        return { start: s, accept: a };
      }
      case 'Group':
        return this.build(node.node);
      case 'Concat': {
        const frags = node.parts.map((p) => this.build(p));
        for (let i = 0; i + 1 < frags.length; i++) {
          this.edge(frags[i].accept, frags[i + 1].start);
        }
        return { start: frags[0].start, accept: frags[frags.length - 1].accept };
      }
      case 'Alt': {
        const s = this.add(node.id);
        const a = this.add(node.id);
        for (const opt of node.options) {
          const f = this.build(opt);
          this.edge(s, f.start);
          this.edge(f.accept, a);
        }
        return { start: s, accept: a };
      }
      case 'Repeat':
        return this.buildRepeat(node);
      default:
        throw new Error(`Unknown AST node ${node.type}`);
    }
  }

  star(node, inner) {
    const s = this.add(node.id);
    const a = this.add(node.id);
    const f = this.build(inner);
    this.edge(s, f.start);
    this.edge(s, a);
    this.edge(f.accept, f.start);
    this.edge(f.accept, a);
    return { start: s, accept: a };
  }

  plus(node, inner) {
    const s = this.add(node.id);
    const a = this.add(node.id);
    const f = this.build(inner);
    this.edge(s, f.start);
    this.edge(f.accept, f.start);
    this.edge(f.accept, a);
    return { start: s, accept: a };
  }

  opt(node, inner) {
    const s = this.add(node.id);
    const a = this.add(node.id);
    const f = this.build(inner);
    this.edge(s, f.start);
    this.edge(s, a);
    this.edge(f.accept, a);
    return { start: s, accept: a };
  }

  // Bounded repeats are expanded by rebuilding the inner fragment per copy:
  //   a{2,}  ->  a a+        a{2,4} -> a a (a (a)?)?        a{0,} -> a*
  buildRepeat(node) {
    const { min, max, node: inner } = node;

    if (min === 0 && max === Infinity) return this.star(node, inner);
    if (min === 1 && max === Infinity) return this.plus(node, inner);
    if (min === 0 && max === 1) return this.opt(node, inner);

    if (max === Infinity) {
      // min copies, the last of which is a plus.
      const frags = [];
      for (let i = 0; i < min - 1; i++) frags.push(this.build(inner));
      frags.push(this.plus(node, inner));
      for (let i = 0; i + 1 < frags.length; i++) this.edge(frags[i].accept, frags[i + 1].start);
      return { start: frags[0].start, accept: frags[frags.length - 1].accept };
    }

    if (max === 0) {
      const s = this.add(node.id);
      const a = this.add(node.id);
      this.edge(s, a);
      return { start: s, accept: a };
    }

    // min mandatory copies, then (max - min) nested optionals so that stopping
    // early is allowed at every step.
    const mandatory = [];
    for (let i = 0; i < min; i++) mandatory.push(this.build(inner));

    let tail = null;
    for (let i = 0; i < max - min; i++) {
      const s = this.add(node.id);
      const a = this.add(node.id);
      const f = this.build(inner);
      this.edge(s, f.start);
      this.edge(s, a); // skip the rest
      if (tail) {
        this.edge(f.accept, tail.start);
        this.edge(tail.accept, a);
      } else {
        this.edge(f.accept, a);
      }
      tail = { start: s, accept: a };
    }

    const frags = tail ? [...mandatory, tail] : mandatory;
    for (let i = 0; i + 1 < frags.length; i++) this.edge(frags[i].accept, frags[i + 1].start);
    return { start: frags[0].start, accept: frags[frags.length - 1].accept };
  }
}

// An anchor is exact only where it is redundant: `^` where nothing before it
// can have consumed a character, `$` where nothing after it can. Anywhere else
// it depends on the position within the subject, which a plain NFA state does
// not carry — so it is refused rather than approximated.
export function checkAnchors(node, atStart = true, atEnd = true) {
  switch (node.type) {
    case 'Anchor': {
      const ok = node.kind === 'start' ? atStart : atEnd;
      if (!ok) {
        const where = node.kind === 'start' ? 'start' : 'end';
        throw new RegexError(
          `"${node.kind === 'start' ? '^' : '$'}" here can never be satisfied.`,
          node.start, 1,
          `Matching is whole-string, so "${node.kind === 'start' ? '^' : '$'}" ` +
          `only holds at the ${where} of the pattern. In the middle it is ` +
          'unsatisfiable, and an automaton state cannot tell you which ' +
          'position it was reached at.',
        );
      }
      return;
    }
    case 'Concat': {
      const parts = node.parts;
      // Zero-width parts do not move the boundary, so `^^a` and `a$$` are fine.
      const consumes = parts.map((p) => expandedSize(p) > 0);
      for (let i = 0; i < parts.length; i++) {
        const beforeConsumes = consumes.slice(0, i).some(Boolean);
        const afterConsumes = consumes.slice(i + 1).some(Boolean);
        checkAnchors(parts[i], atStart && !beforeConsumes, atEnd && !afterConsumes);
      }
      return;
    }
    case 'Alt':
      for (const o of node.options) checkAnchors(o, atStart, atEnd);
      return;
    case 'Group':
      checkAnchors(node.node, atStart, atEnd);
      return;
    case 'Repeat':
      // A repeated anchor could land at any iteration, so neither boundary
      // survives into the body.
      checkAnchors(node.node, false, false);
      return;
    default:
  }
}

export function buildNFA(ast) {
  checkAnchors(ast);
  const b = new Builder();
  const { start, accept } = b.build(ast);
  return { states: b.states, start, accept };
}

// Epsilon closure of a set of state ids, returned sorted for canonical keys.
export function epsilonClosure(nfa, ids) {
  const seen = new Set(ids);
  const stack = [...ids];
  while (stack.length) {
    const s = stack.pop();
    for (const e of nfa.states[s].edges) {
      if (e.set === null && !seen.has(e.to)) {
        seen.add(e.to);
        stack.push(e.to);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

// Every non-epsilon set appearing anywhere in the machine.
export function charSets(nfa) {
  const out = [];
  const seen = new Set();
  for (const st of nfa.states) {
    for (const e of st.edges) {
      if (e.set === null) continue;
      const k = CS.key(e.set);
      if (!seen.has(k)) { seen.add(k); out.push(e.set); }
    }
  }
  return out;
}

export function nfaStats(nfa) {
  let eps = 0;
  let chars = 0;
  for (const st of nfa.states) {
    for (const e of st.edges) (e.set === null ? eps++ : chars++);
  }
  return { states: nfa.states.length, epsilon: eps, char: chars };
}
