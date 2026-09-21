// Liang's hyphenation algorithm, written from the description in his 1983
// thesis and Appendix H of The TeXbook. Only the pattern *data* is borrowed.
//
// The idea is a competition. Every pattern that matches anywhere in the word
// votes on every inter-letter position it covers, the highest vote at each
// position wins, and a position is a legal break if its winning vote is odd.
// Odd promotes, even forbids, and higher values are more specific patterns
// overruling more general ones — which is why `.ach4` can blanket-forbid a
// break that a shorter pattern allowed.

/** One pattern, split into the letters it matches and the votes it casts. */
function parsePattern(p) {
  const letters = [];
  const values = [];
  let i = 0;
  for (const ch of p) {
    if (ch >= '0' && ch <= '9') {
      values[i] = +ch;
    } else {
      letters.push(ch);
      i++;
    }
  }
  // values[j] is the vote for the gap immediately before letters[j]; the gap
  // after the final letter is values[letters.length].
  for (let j = 0; j <= letters.length; j++) values[j] ??= 0;
  return { letters: letters.join(''), values };
}

export class Hyphenator {
  /** @param {{patterns: string[], exceptions: Record<string,string>, leftmin?: number, rightmin?: number}} data */
  constructor(data) {
    this.leftmin = data.leftmin ?? 2;
    this.rightmin = data.rightmin ?? 3;
    this.exceptions = new Map();
    for (const [plain, spelled] of Object.entries(data.exceptions ?? {})) {
      // Store the exception as break positions so it reads like a pattern result.
      const points = [];
      let k = 0;
      for (const ch of spelled) {
        if (ch === '-') points.push(k);
        else k++;
      }
      this.exceptions.set(plain.toLowerCase(), points);
    }

    // Trie keyed by letter, each node optionally carrying the votes of the
    // pattern that ends there.
    this.root = new Map();
    this.patternCount = 0;
    for (const p of data.patterns) {
      const { letters, values } = parsePattern(p);
      let node = this.root;
      for (const ch of letters) {
        let next = node.get(ch);
        if (!next) {
          next = new Map();
          node.set(ch, next);
        }
        node = next;
      }
      node.set('$', values);
      this.patternCount++;
    }
  }

  /**
   * Break positions for a word, as indices into it: a value of 3 means a
   * hyphen may go between word[2] and word[3].
   */
  positions(word) {
    const lower = word.toLowerCase();
    if (lower.length < this.leftmin + this.rightmin) return [];

    const exception = this.exceptions.get(lower);
    if (exception) return exception.filter((k) => k >= this.leftmin && k <= word.length - this.rightmin);

    // `.` marks the word boundary and is matched like any other character, so
    // patterns can anchor to the start or end of a word.
    const padded = `.${lower}.`;
    const votes = new Array(padded.length + 1).fill(0);

    for (let start = 0; start < padded.length; start++) {
      let node = this.root;
      for (let i = start; i < padded.length; i++) {
        node = node.get(padded[i]);
        if (!node) break;
        const values = node.get('$');
        if (values) {
          for (let j = 0; j < values.length; j++) {
            if (values[j] > votes[start + j]) votes[start + j] = values[j];
          }
        }
      }
    }

    // votes[k] is the gap before padded[k]; padded[k] is word[k - 1].
    const out = [];
    for (let k = this.leftmin; k <= word.length - this.rightmin; k++) {
      if (votes[k + 1] % 2 === 1) out.push(k);
    }
    return out;
  }

  /** The word with soft hyphens shown, e.g. "hy-phen-ation" — for the bench. */
  spell(word, sep = '-') {
    const pts = new Set(this.positions(word));
    let out = '';
    for (let i = 0; i < word.length; i++) {
      if (pts.has(i)) out += sep;
      out += word[i];
    }
    return out;
  }
}
