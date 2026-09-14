// Character sets as sorted, disjoint, merged code-point ranges.
//
// The DFA alphabet is never Unicode itself — it is a partition of the
// code-point space induced by the sets a pattern actually mentions (see
// alphabet.js). Everything here exists to make that partition cheap and exact.

export const MAX_CP = 0x10ffff;

// A CharSet is an array of [lo, hi] inclusive pairs, ascending and
// non-adjacent: [[97,99],[120,120]] is `[a-cx]`.

export function normalize(ranges) {
  const sorted = ranges
    .filter(([lo, hi]) => hi >= lo)
    .slice()
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const [lo, hi] of sorted) {
    const last = out[out.length - 1];
    // Merge touching ranges too: [a-c] and [d-f] are one range [a-f].
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

export const EMPTY = [];
export const ANY = [[0, MAX_CP]];

export const fromChar = (cp) => [[cp, cp]];
export const fromRange = (lo, hi) => (hi >= lo ? [[lo, hi]] : []);
export const isEmpty = (s) => s.length === 0;

export function size(s) {
  let n = 0;
  for (const [lo, hi] of s) n += hi - lo + 1;
  return n;
}

export function contains(s, cp) {
  let lo = 0;
  let hi = s.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < s[mid][0]) hi = mid - 1;
    else if (cp > s[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

export function union(a, b) {
  return normalize([...a, ...b]);
}

export function intersect(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]);
    const hi = Math.min(a[i][1], b[j][1]);
    if (lo <= hi) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return out;
}

export function complement(s) {
  const out = [];
  let cursor = 0;
  for (const [lo, hi] of s) {
    if (lo > cursor) out.push([cursor, lo - 1]);
    cursor = hi + 1;
  }
  if (cursor <= MAX_CP) out.push([cursor, MAX_CP]);
  return out;
}

export function subtract(a, b) {
  return intersect(a, complement(b));
}

export function equals(a, b) {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r[0] === b[i][0] && r[1] === b[i][1]);
}

// A stable key for use in Maps — sets are normalized, so this is canonical.
export const key = (s) => s.map(([lo, hi]) => `${lo}-${hi}`).join(',');

// The first code point in the set. Used to build distinguishing strings, so it
// prefers a printable ASCII character when the set contains one: a witness
// string of "a" reads better than one of U+0000.
export function sample(s) {
  if (s.length === 0) return null;
  const printable = intersect(s, [[0x20, 0x7e]]);
  return printable.length ? printable[0][0] : s[0][0];
}

const ESCAPES = new Map([
  [0x09, '\\t'],
  [0x0a, '\\n'],
  [0x0d, '\\r'],
  [0x0c, '\\f'],
  [0x0b, '\\v'],
  [0x00, '\\0'],
]);

export function charLabel(cp) {
  if (ESCAPES.has(cp)) return ESCAPES.get(cp);
  if (cp >= 0x20 && cp <= 0x7e) return String.fromCodePoint(cp);
  if (cp > MAX_CP) return '?';
  return `\\u{${cp.toString(16)}}`;
}

// Named sets are recognised by value so a transition can be labelled `\d`
// rather than `[0-9]`, and `.` rather than a three-range complement.
let NAMED = null;
function namedSets() {
  if (!NAMED) {
    const d = fromRange(0x30, 0x39);
    const w = normalize([
      [0x30, 0x39],
      [0x41, 0x5a],
      [0x5f, 0x5f],
      [0x61, 0x7a],
    ]);
    const s = normalize([
      [0x09, 0x0d],
      [0x20, 0x20],
      [0xa0, 0xa0],
      [0x1680, 0x1680],
      [0x2000, 0x200a],
      [0x2028, 0x2029],
      [0x202f, 0x202f],
      [0x205f, 0x205f],
      [0x3000, 0x3000],
      [0xfeff, 0xfeff],
    ]);
    NAMED = [
      ['\\d', d],
      ['\\D', complement(d)],
      ['\\w', w],
      ['\\W', complement(w)],
      ['\\s', s],
      ['\\S', complement(s)],
      ['.', complement(normalize([[0x0a, 0x0a], [0x0d, 0x0d], [0x2028, 0x2029]]))],
    ];
  }
  return NAMED;
}

export const DIGIT = () => namedSets()[0][1];
export const WORD = () => namedSets()[2][1];
export const SPACE = () => namedSets()[4][1];
export const DOT = () => namedSets()[6][1];

// Human-readable label for a transition edge or a class. Complements are
// rendered as complements so an "everything else" edge stays short.
export function label(s, { maxParts = 4 } = {}) {
  if (isEmpty(s)) return 'none';
  for (const [name, set] of namedSets()) if (equals(s, set)) return name;
  if (equals(s, ANY)) return 'ANY';

  const comp = complement(s);
  // Prefer whichever side is shorter to write.
  const useComp = comp.length > 0 && comp.length < s.length;
  const target = useComp ? comp : s;

  const parts = [];
  for (const [lo, hi] of target.slice(0, maxParts)) {
    if (lo === hi) parts.push(charLabel(lo));
    else if (hi === lo + 1) parts.push(charLabel(lo) + charLabel(hi));
    else parts.push(`${charLabel(lo)}-${charLabel(hi)}`);
  }
  const more = target.length > maxParts ? '...' : '';
  const body = parts.join('') + more;
  if (!useComp && target.length === 1 && target[0][0] === target[0][1]) return body;
  return `[${useComp ? '^' : ''}${body}]`;
}
