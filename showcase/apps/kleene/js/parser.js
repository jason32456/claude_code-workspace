// Recursive-descent parser for the supported regular-expression subset.
//
// Regex lexing is context sensitive — `-` and `]` mean different things inside
// a class, `*` is a quantifier outside one and a literal inside — so this is a
// character-level parser that emits a token record as a side product rather
// than a separate lexer phase that would have to duplicate the context rules.
//
// Precedence, loosest to tightest: alternation, concatenation, postfix.

import * as CS from './charset.js';

export class RegexError extends Error {
  constructor(message, pos, length = 1, hint = '') {
    super(message);
    this.name = 'RegexError';
    this.pos = pos;
    this.length = length;
    this.hint = hint;
  }
}

// The two rejections that are the app's thesis rather than missing work.
const NOT_REGULAR = {
  backref:
    'A backreference makes this pattern non-regular. No finite automaton can ' +
    'recognise it, so it cannot be compiled to a DFA, minimized, or decided ' +
    'for equivalence — the machinery this app is built on does not apply.',
  lookaround:
    'Lookaround is not supported. It cannot be expressed in the single-pass ' +
    'Thompson construction used here, and it is one of the features that ' +
    'forces an engine into the backtracking corner this app measures.',
};

const CLASS_ESCAPES = {
  d: () => CS.DIGIT(),
  D: () => CS.complement(CS.DIGIT()),
  w: () => CS.WORD(),
  W: () => CS.complement(CS.WORD()),
  s: () => CS.SPACE(),
  S: () => CS.complement(CS.SPACE()),
};

const CONTROL_ESCAPES = {
  n: 0x0a, r: 0x0d, t: 0x09, f: 0x0c, v: 0x0b, 0: 0x00,
};

class Parser {
  constructor(src) {
    this.src = Array.from(src); // code points, so astral characters stay whole
    this.i = 0;
    this.tokens = [];
    this.groupCount = 0;
    this.nextId = 0;
  }

  get done() { return this.i >= this.src.length; }
  peek(k = 0) { return this.src[this.i + k]; }
  eat() { return this.src[this.i++]; }

  token(kind, start, text, note) {
    this.tokens.push({ kind, start, end: this.i, text, note });
  }

  node(type, start, props) {
    return { type, id: this.nextId++, start, end: this.i, ...props };
  }

  parse() {
    const ast = this.parseAlt();
    if (!this.done) {
      const c = this.peek();
      if (c === ')') {
        throw new RegexError('Unmatched closing parenthesis.', this.i, 1);
      }
      throw new RegexError(`Unexpected ${JSON.stringify(c)}.`, this.i, 1);
    }
    return ast;
  }

  parseAlt() {
    const start = this.i;
    const options = [this.parseConcat()];
    while (!this.done && this.peek() === '|') {
      this.token('alt', this.i, this.eat());
      options.push(this.parseConcat());
    }
    if (options.length === 1) return options[0];
    return this.node('Alt', start, { options });
  }

  parseConcat() {
    const start = this.i;
    const parts = [];
    while (!this.done && this.peek() !== '|' && this.peek() !== ')') {
      parts.push(this.parseRepeat());
    }
    if (parts.length === 0) return this.node('Empty', start, {});
    if (parts.length === 1) return parts[0];
    return this.node('Concat', start, { parts });
  }

  parseRepeat() {
    let node = this.parseAtom();
    // Loop, so `a*?` is a lazy star and `a**` is caught as a double quantifier.
    for (;;) {
      if (this.done) break;
      const c = this.peek();
      const qStart = this.i;
      let min;
      let max;
      let form;

      if (c === '*') { min = 0; max = Infinity; form = '*'; this.eat(); }
      else if (c === '+') { min = 1; max = Infinity; form = '+'; this.eat(); }
      else if (c === '?') { min = 0; max = 1; form = '?'; this.eat(); }
      else if (c === '{') {
        const braced = this.tryParseBraces();
        if (!braced) break; // a `{` that is not a valid repeat is a literal
        ({ min, max, form } = braced);
      } else break;

      if (node.type === 'Anchor') {
        throw new RegexError(
          'Nothing to repeat — an anchor matches a position, not a character.',
          qStart, this.i - qStart,
        );
      }
      if (node.type === 'Repeat') {
        throw new RegexError(
          'Double quantifier. Wrap the inner one in a group to say which you mean.',
          qStart, this.i - qStart,
          'For example `(a*)?` rather than `a*?` if you meant a group.',
        );
      }

      let lazy = false;
      if (!this.done && this.peek() === '?') { lazy = true; this.eat(); }
      this.token('quantifier', qStart, this.src.slice(qStart, this.i).join(''),
        lazy ? 'lazy' : 'greedy');
      node = this.node('Repeat', node.start, { node, min, max, form, lazy });
    }
    return node;
  }

  // `{2}` `{2,}` `{2,5}`. Returns null (and rewinds) if this `{` does not open
  // a well-formed repeat, in which case the caller treats it as a literal.
  tryParseBraces() {
    const save = this.i;
    this.eat(); // {
    const digits = (t) => { let s = ''; while (!this.done && /[0-9]/.test(this.peek())) s += this.eat(); return s; };
    const minStr = digits();
    if (minStr === '') { this.i = save; return null; }
    let maxStr = minStr;
    let open = false;
    if (!this.done && this.peek() === ',') {
      this.eat();
      maxStr = digits();
      open = maxStr === '';
    }
    if (this.done || this.peek() !== '}') { this.i = save; return null; }
    this.eat(); // }
    const min = Number(minStr);
    const max = open ? Infinity : Number(maxStr);
    if (max < min) {
      throw new RegexError(
        `Repeat range {${minStr},${maxStr}} counts down.`, save, this.i - save,
      );
    }
    return { min, max, form: 'brace' };
  }

  parseAtom() {
    const start = this.i;
    if (this.done) return this.node('Empty', start, {});
    const c = this.peek();

    if (c === '(') return this.parseGroup();
    if (c === '[') return this.parseClass();
    if (c === '*' || c === '+' || c === '?') {
      throw new RegexError(
        `Nothing to repeat before ${JSON.stringify(c)}.`, start, 1,
        c === '?' ? 'Escape it as \\? to match a literal question mark.' : '',
      );
    }
    if (c === '^' || c === '$') {
      this.eat();
      this.token('anchor', start, c, c === '^' ? 'start of string' : 'end of string');
      return this.node('Anchor', start, { kind: c === '^' ? 'start' : 'end' });
    }
    if (c === '.') {
      this.eat();
      this.token('dot', start, '.', 'any except newline');
      return this.node('Char', start, { set: CS.DOT(), display: '.' });
    }
    if (c === '\\') return this.parseEscape(false);

    this.eat();
    this.token('literal', start, c);
    return this.node('Char', start, { set: CS.fromChar(c.codePointAt(0)), display: c });
  }

  parseGroup() {
    const start = this.i;
    this.eat(); // (
    let capturing = true;
    let index = null;
    let name = null;

    if (this.peek() === '?') {
      const k = this.peek(1);
      if (k === ':') { this.i += 2; capturing = false; }
      else if (k === '=' || k === '!') {
        throw new RegexError('Lookahead is not supported.', start, 3, NOT_REGULAR.lookaround);
      } else if (k === '<' && (this.peek(2) === '=' || this.peek(2) === '!')) {
        throw new RegexError('Lookbehind is not supported.', start, 4, NOT_REGULAR.lookaround);
      } else if (k === '<') {
        this.i += 2;
        let n = '';
        while (!this.done && this.peek() !== '>') n += this.eat();
        if (this.done) throw new RegexError('Unterminated group name.', start, 2);
        this.eat(); // >
        name = n;
      } else {
        throw new RegexError(
          `Unsupported group modifier "(?${k ?? ''}".`, start, 3,
          'Supported groups: (...) capturing, (?:...) non-capturing, (?<name>...) named.',
        );
      }
    }
    if (capturing) index = ++this.groupCount;
    this.token('group-open', start, this.src.slice(start, this.i).join(''),
      capturing ? `group ${index}${name ? ` "${name}"` : ''}` : 'non-capturing');

    const inner = this.parseAlt();
    if (this.done || this.peek() !== ')') {
      throw new RegexError('Unclosed group — no matching ")".', start, 1);
    }
    const closeAt = this.i;
    this.eat(); // )
    this.token('group-close', closeAt, ')');
    return this.node('Group', start, { node: inner, capturing, index, name });
  }

  parseEscape(inClass) {
    const start = this.i;
    this.eat(); // backslash
    if (this.done) throw new RegexError('Pattern ends with a dangling backslash.', start, 1);
    const c = this.eat();

    if (!inClass && /[1-9]/.test(c)) {
      throw new RegexError(`Backreference \\${c} is not supported.`, start, 2, NOT_REGULAR.backref);
    }
    if (!inClass && c === 'k') {
      throw new RegexError('Named backreference is not supported.', start, 2, NOT_REGULAR.backref);
    }
    if (c === 'b' && !inClass) {
      throw new RegexError(
        'Word boundary \\b is not supported.', start, 2,
        'It is a zero-width assertion that depends on both neighbours, which ' +
        'the whole-string automaton semantics here do not model.',
      );
    }
    if (c === 'b' && inClass) {
      this.token('escape', start, '\\b', 'backspace');
      return this.node('Char', start, { set: CS.fromChar(0x08), display: '\\b' });
    }

    if (CLASS_ESCAPES[c]) {
      this.token('escape-class', start, `\\${c}`);
      return this.node('Char', start, { set: CLASS_ESCAPES[c](), display: `\\${c}` });
    }
    if (Object.prototype.hasOwnProperty.call(CONTROL_ESCAPES, c)) {
      this.token('escape', start, `\\${c}`, 'control');
      return this.node('Char', start, { set: CS.fromChar(CONTROL_ESCAPES[c]), display: `\\${c}` });
    }
    if (c === 'x' || c === 'u') {
      const cp = this.parseHexEscape(c, start);
      const text = this.src.slice(start, this.i).join('');
      this.token('escape', start, text, `U+${cp.toString(16).toUpperCase()}`);
      return this.node('Char', start, { set: CS.fromChar(cp), display: text });
    }
    // Anything else is the literal character, which covers every metacharacter.
    this.token('escape', start, `\\${c}`, 'literal');
    return this.node('Char', start, { set: CS.fromChar(c.codePointAt(0)), display: `\\${c}` });
  }

  parseHexEscape(kind, start) {
    const hex = (n) => {
      let s = '';
      for (let k = 0; k < n; k++) {
        if (this.done || !/[0-9a-fA-F]/.test(this.peek())) {
          throw new RegexError(`\\${kind} needs ${n} hex digits.`, start, this.i - start + 1);
        }
        s += this.eat();
      }
      return parseInt(s, 16);
    };
    if (kind === 'x') return hex(2);
    if (this.peek() === '{') {
      this.eat();
      let s = '';
      while (!this.done && this.peek() !== '}') s += this.eat();
      if (this.done) throw new RegexError('Unterminated \\u{...} escape.', start, 3);
      this.eat();
      const cp = parseInt(s, 16);
      if (!/^[0-9a-fA-F]+$/.test(s) || !Number.isFinite(cp) || cp > CS.MAX_CP) {
        throw new RegexError('Invalid code point in \\u{...}.', start, this.i - start);
      }
      return cp;
    }
    return hex(4);
  }

  parseClass() {
    const start = this.i;
    this.eat(); // [
    let negated = false;
    if (!this.done && this.peek() === '^') { this.eat(); negated = true; }

    let set = CS.EMPTY;
    let first = true;
    for (;;) {
      if (this.done) throw new RegexError('Unclosed character class — no matching "]".', start, 1);
      // A `]` in the first position is a literal, as in POSIX and JS.
      if (this.peek() === ']' && !first) { this.eat(); break; }
      first = false;

      const lo = this.classAtom(start);
      // A range only exists if `-` is followed by something other than `]`.
      if (!this.done && this.peek() === '-' && this.peek(1) !== ']' && this.peek(1) !== undefined) {
        const dashAt = this.i;
        this.eat();
        const hi = this.classAtom(start);
        if (lo.cp === null || hi.cp === null) {
          throw new RegexError(
            'A character-class range needs single characters on both sides.',
            dashAt, 1,
            'Class escapes like \\d cannot be a range endpoint.',
          );
        }
        if (hi.cp < lo.cp) {
          throw new RegexError(
            `Range ${CS.charLabel(lo.cp)}-${CS.charLabel(hi.cp)} runs backwards.`,
            dashAt - 1, 3,
          );
        }
        set = CS.union(set, CS.fromRange(lo.cp, hi.cp));
      } else {
        set = CS.union(set, lo.set);
      }
    }

    if (negated) set = CS.complement(set);
    if (CS.isEmpty(set)) {
      throw new RegexError(
        'This class matches nothing, so the whole pattern matches nothing.',
        start, this.i - start,
      );
    }
    const text = this.src.slice(start, this.i).join('');
    this.token('class', start, text, CS.label(set, { maxParts: 3 }));
    return this.node('Char', start, { set, display: text });
  }

  // One member of a class. Returns its set, plus its code point when it is a
  // single character (only single characters can be a range endpoint).
  classAtom(classStart) {
    if (this.peek() === '\\') {
      const before = this.tokens.length;
      const node = this.parseEscape(true);
      this.tokens.length = before; // class members are reported as one token
      const single = CS.size(node.set) === 1 ? node.set[0][0] : null;
      return { set: node.set, cp: single };
    }
    const c = this.eat();
    return { set: CS.fromChar(c.codePointAt(0)), cp: c.codePointAt(0) };
  }
}

export function parse(source) {
  const p = new Parser(source);
  const ast = p.parse();
  return { ast, tokens: p.tokens, groupCount: p.groupCount };
}

// Total number of Char nodes after bounded repeats are expanded. Used to
// refuse `a{1000}{1000}` before it becomes 10^6 NFA states.
export function expandedSize(node) {
  switch (node.type) {
    case 'Empty':
    case 'Anchor':
      return 0;
    case 'Char':
      return 1;
    case 'Concat':
      return node.parts.reduce((n, p) => n + expandedSize(p), 0);
    case 'Alt':
      return node.options.reduce((n, o) => n + expandedSize(o), 0);
    case 'Group':
      return expandedSize(node.node);
    case 'Repeat': {
      const inner = expandedSize(node.node);
      const copies = node.max === Infinity ? Math.max(node.min, 1) : node.max;
      return inner * Math.max(copies, 1);
    }
    default:
      return 0;
  }
}

const QUANT_LABEL = (n) => {
  if (n.form === '*') return '*';
  if (n.form === '+') return '+';
  if (n.form === '?') return '?';
  if (n.max === Infinity) return `{${n.min},}`;
  if (n.min === n.max) return `{${n.min}}`;
  return `{${n.min},${n.max}}`;
};

// Label shown on an AST node in the tree view.
export function astLabel(node) {
  switch (node.type) {
    case 'Empty': return 'empty';
    case 'Char': return node.display;
    case 'Concat': return 'concat';
    case 'Alt': return 'alternate';
    case 'Group':
      return node.capturing ? `group ${node.index}` : 'group';
    case 'Anchor': return node.kind === 'start' ? 'anchor ^' : 'anchor $';
    case 'Repeat': return `repeat ${QUANT_LABEL(node)}${node.lazy ? ' lazy' : ''}`;
    default: return node.type;
  }
}

export function astChildren(node) {
  switch (node.type) {
    case 'Concat': return node.parts;
    case 'Alt': return node.options;
    case 'Group':
    case 'Repeat': return [node.node];
    default: return [];
  }
}
