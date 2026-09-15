// Turning a stop into a verdict.
//
// A stop gives a rotor order, a core position, and whatever steckers the
// closure forced. That is not yet a decrypt: the rest of the plugboard has to
// be recovered, and then the candidate has to be judged. Judgement here is a
// measurement, not a dictionary — index of coincidence and letter statistics
// are a couple of dozen constants, so the app ships no corpus.

import { N, ord, chr, Enigma, ROTORS } from './enigma.js';
import { posIndex, cribPositions, deduceSteckers } from './bombe.js';

/** German letter frequencies, per cent. The only "corpus" in the app. */
export const GERMAN_FREQ = [
  6.51, 1.89, 3.06, 5.08, 17.40, 1.66, 3.01, 4.76, 7.55, 0.27,
  1.21, 3.44, 2.53, 9.78, 2.51, 0.79, 0.02, 7.00, 7.27, 6.15,
  4.35, 0.67, 1.89, 0.03, 0.04, 1.13,
];

/** Random text sits near 0.0385 (1/26); natural German near 0.0762. */
export const IC_RANDOM = 1 / N;
export const IC_GERMAN = 0.0762;

export function indexOfCoincidence(text) {
  const counts = new Int32Array(N);
  let n = 0;
  for (const ch of text) {
    const c = ord(ch);
    if (c >= 0 && c < N) { counts[c]++; n++; }
  }
  if (n < 2) return 0;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += counts[i] * (counts[i] - 1);
  return sum / (n * (n - 1));
}

/** Log-likelihood of the text under German unigram statistics, per letter. */
export function germanScore(text) {
  let total = 0, n = 0;
  for (const ch of text) {
    const c = ord(ch);
    if (c < 0 || c >= N) continue;
    total += Math.log((GERMAN_FREQ[c] || 0.01) / 100);
    n++;
  }
  return n ? total / n : -Infinity;
}

/**
 * Recover the ground setting that reaches `position` after `offset` keypresses.
 *
 * Stepping backwards through the double step is fiddly and easy to get wrong,
 * so this searches the 17,576 candidates forwards instead. It runs once per
 * stop the user expands, never in the hot loop, and it cannot be subtly wrong.
 */
export function groundFor(order, position, offset) {
  if (offset === 0) return [...position];
  const target = posIndex(...position);
  const seq = new Int32Array(offset);
  for (let l = 0; l < N; l++) {
    for (let m = 0; m < N; m++) {
      for (let r = 0; r < N; r++) {
        cribPositions(order, l, m, r, offset, seq);
        if (seq[offset - 1] === target) return [l, m, r];
      }
    }
  }
  return null;
}

/**
 * Complete the plugboard from a stop.
 *
 * The closure forces some steckers outright. The rest follow from the crib
 * itself: if S is the scrambler at the offset where plaintext p produced
 * ciphertext c, then stecker(c) = S(stecker(p)). Chase that until it closes.
 * Contradictions are reported rather than papered over — a false stop usually
 * announces itself here, before anything is decrypted.
 */
export function completePlugboard(menu, order, reflector, position, testReg, hypothesis) {
  // known[v] = w means v is plugged to w. w === v is a real and common answer:
  // most letters are not plugged at all, and dropping that case starves the
  // propagation, because an unplugged letter still carries the chain forward.
  const known = new Int8Array(N).fill(-1);
  let consistent = true;

  const set = (a, b) => {
    if (known[a] >= 0 && known[a] !== b) { consistent = false; return false; }
    if (known[b] >= 0 && known[b] !== a) { consistent = false; return false; }
    if (known[a] === b && known[b] === a) return false;      // nothing new
    known[a] = b; known[b] = a;
    return true;
  };

  set(testReg, hypothesis);

  const cribLen = menu.edges.reduce((mx, e) => Math.max(mx, e.t), 0) + 1;
  const seq = cribPositions(order, position[0], position[1], position[2], cribLen, new Int32Array(cribLen));
  const e = new Enigma({ rotors: order, reflector, rings: 'AAA', ground: 'AAA' });

  const scrambleAt = (t, w) => {
    const idx = seq[t];
    e.pos[2] = idx % N;
    e.pos[1] = ((idx / N) | 0) % N;
    e.pos[0] = ((idx / (N * N)) | 0) % N;
    return e.scramble(w);
  };

  // stecker(c) = S_t(stecker(p)), and the scrambler is an involution so the
  // same relation runs backwards. Chase it to a fixpoint.
  for (let pass = 0; pass < N && consistent; pass++) {
    let changed = false;
    for (const edge of menu.edges) {
      if (known[edge.p] >= 0) changed = set(edge.c, scrambleAt(edge.t, known[edge.p])) || changed;
      if (!consistent) break;
      if (known[edge.c] >= 0) changed = set(edge.p, scrambleAt(edge.t, known[edge.c])) || changed;
      if (!consistent) break;
    }
    if (!changed) break;
  }

  const pairs = [];
  const seen = new Set();
  for (let v = 0; v < N; v++) {
    const w = known[v];
    if (w < 0 || w === v || seen.has(v) || seen.has(w)) continue;
    pairs.push([Math.min(v, w), Math.max(v, w)]);
    seen.add(v); seen.add(w);
  }
  return { pairs, consistent, known };
}

export const plugSpec = (pairs) => pairs.map(([a, b]) => chr(a) + chr(b)).join(' ');

/**
 * Score one stop end to end: complete the plugboard, decrypt, and measure.
 *
 * The decisive test is not the index of coincidence — it is whether the
 * decrypt reproduces the crib. A correct key must; a false stop almost never
 * does. IC and the German score then order what survives.
 */
export function evaluateStop(stop, { menu, cipher, crib, offset, reflector }) {
  const { order, position, testReg } = stop;
  const ground = groundFor(order, position, offset);
  if (!ground) return null;
  const groundStr = ground.map(chr).join('');

  // The closure narrows the test register's stecker but rarely pins it. There
  // are only 26 candidates, so try each, keep whichever actually reproduces
  // the crib. This is cheap and, unlike a heuristic, cannot pick a near miss.
  let best = null;
  for (let h = 0; h < N; h++) {
    const { pairs, consistent } = completePlugboard(menu, order, reflector, position, testReg, h);
    if (!consistent) continue;

    let plaintext;
    try {
      plaintext = new Enigma({
        rotors: order, reflector, rings: 'AAA', ground: groundStr, plugboard: plugSpec(pairs),
      }).encipher(cipher);
    } catch { continue; }

    const segment = plaintext.slice(offset, offset + crib.length);
    let cribHits = 0;
    for (let i = 0; i < crib.length; i++) if (segment[i] === crib[i]) cribHits++;

    if (!best || cribHits > best.cribHits) {
      best = { pairs, consistent, plaintext, cribHits, hypothesis: h };
      if (cribHits === crib.length) break;
    }
  }
  if (!best) return null;

  return {
    ...stop,
    ground,
    pairs: best.pairs,
    consistent: best.consistent,
    hypothesis: best.hypothesis,
    plaintext: best.plaintext,
    cribHits: best.cribHits,
    cribMatch: best.cribHits === crib.length,
    ic: indexOfCoincidence(best.plaintext),
    german: germanScore(best.plaintext),
  };
}

/** Best first: a full crib match outranks everything, then IC. */
export function rankStops(evaluated) {
  return [...evaluated].sort((a, b) => {
    if (a.cribMatch !== b.cribMatch) return a.cribMatch ? -1 : 1;
    if (b.cribHits !== a.cribHits) return b.cribHits - a.cribHits;
    return b.ic - a.ic;
  });
}

export { ROTORS };
