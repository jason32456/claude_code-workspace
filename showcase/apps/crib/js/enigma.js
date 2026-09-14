// The Wehrmacht Enigma I, as a permutation you can ask questions of.
//
// Everything downstream depends on this being exactly right, and a subtly
// wrong Enigma is still a self-consistent reciprocal cipher — it would
// encipher, decipher, and yield plaintext under the bombe while not being
// Enigma. So the invariants live in fixtures.js and are checked in-page.

export const A = 65;
export const N = 26;

export const ord = (ch) => ch.charCodeAt(0) - A;
export const chr = (i) => String.fromCharCode(A + (((i % N) + N) % N));

// Historical wirings. `turnover` is the letter visible in the window at the
// moment the rotor carries its neighbour on the NEXT keypress.
export const ROTORS = {
  I:   { wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', turnover: 'Q' },
  II:  { wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', turnover: 'E' },
  III: { wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', turnover: 'V' },
  IV:  { wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB', turnover: 'J' },
  V:   { wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK', turnover: 'Z' },
};

export const ROTOR_NAMES = ['I', 'II', 'III', 'IV', 'V'];

export const REFLECTORS = {
  B: 'YRUHQSLDPXNGOKMIEBFZCWVJAT',
  C: 'FVPJIAOYEDRZXWGCTKUQSBNMHL',
};

const toPerm = (s) => Int8Array.from([...s].map(ord));

function invert(perm) {
  const out = new Int8Array(N);
  for (let i = 0; i < N; i++) out[perm[i]] = i;
  return out;
}

const ROTOR_CACHE = new Map();
function rotorData(name) {
  let d = ROTOR_CACHE.get(name);
  if (!d) {
    const r = ROTORS[name];
    if (!r) throw new Error(`unknown rotor: ${name}`);
    const fwd = toPerm(r.wiring);
    d = { fwd, rev: invert(fwd), turnover: ord(r.turnover) };
    ROTOR_CACHE.set(name, d);
  }
  return d;
}

/**
 * Parse "AB CD EF" into an involution on 0..25. A letter may appear at most
 * once; a plug is its own inverse, which is the fact the diagonal board is
 * built out of.
 */
export function parsePlugboard(spec) {
  const perm = new Int8Array(N);
  for (let i = 0; i < N; i++) perm[i] = i;
  const pairs = [];
  const seen = new Set();
  const text = (spec || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (text.length % 2 !== 0) throw new Error('plugboard needs an even number of letters');
  for (let i = 0; i < text.length; i += 2) {
    const a = ord(text[i]);
    const b = ord(text[i + 1]);
    if (a === b) throw new Error(`${text[i]} cannot be plugged to itself`);
    if (seen.has(a)) throw new Error(`${text[i]} is already plugged`);
    if (seen.has(b)) throw new Error(`${text[i + 1]} is already plugged`);
    seen.add(a); seen.add(b);
    perm[a] = b; perm[b] = a;
    pairs.push([a, b]);
  }
  if (pairs.length > 13) throw new Error('at most 13 plugs');
  return { perm, pairs };
}

export function formatPlugboard(pairs) {
  return pairs.map(([a, b]) => chr(a) + chr(b)).join(' ');
}

/**
 * A machine is (rotor order, reflector, ring settings, ground setting,
 * plugboard). Rotor order is given LEFT to RIGHT, as it is written on a key
 * sheet — the right-hand rotor is the fast one.
 */
export class Enigma {
  constructor({ rotors, reflector = 'B', rings = 'AAA', ground = 'AAA', plugboard = '' }) {
    if (!rotors || rotors.length !== 3) throw new Error('need exactly three rotors');
    if (new Set(rotors).size !== 3) throw new Error('a rotor cannot be used twice');
    this.rotorNames = [...rotors];
    this.reflectorName = reflector;
    this.reflector = toPerm(REFLECTORS[reflector]);
    if (!REFLECTORS[reflector]) throw new Error(`unknown reflector: ${reflector}`);
    this.data = rotors.map(rotorData);
    this.rings = [...rings.toUpperCase()].map(ord);
    if (this.rings.length !== 3) throw new Error('need three ring settings');
    this.setGround(ground);
    const pb = parsePlugboard(plugboard);
    this.plug = pb.perm;
    this.plugPairs = pb.pairs;
    this.keypresses = 0;
    this.selfEncipherments = 0;
  }

  setGround(ground) {
    const g = [...ground.toUpperCase()].map(ord);
    if (g.length !== 3) throw new Error('need three ground letters');
    this.pos = g;               // [left, middle, right]
    return this;
  }

  get window() {
    return this.pos.map(chr).join('');
  }

  /**
   * The stepping mechanism, including the double step. The pawls read the
   * notch on the rotor to their right; the middle rotor's own pawl can engage
   * its notch, which advances the middle rotor a second time and carries the
   * left rotor with it. That is why the middle rotor's period is 26 × 25.
   */
  step() {
    const [, mid, right] = this.data;
    const atRightNotch = this.pos[2] === right.turnover;
    const atMidNotch = this.pos[1] === mid.turnover;

    if (atMidNotch) {                       // double step
      this.pos[1] = (this.pos[1] + 1) % N;
      this.pos[0] = (this.pos[0] + 1) % N;
    } else if (atRightNotch) {
      this.pos[1] = (this.pos[1] + 1) % N;
    }
    this.pos[2] = (this.pos[2] + 1) % N;
    return { steppedMiddle: atRightNotch || atMidNotch, doubleStep: atMidNotch };
  }

  /** The scrambler alone — no plugboard, no stepping. */
  scramble(c) {
    let x = c;
    for (let i = 2; i >= 0; i--) {
      const shift = this.pos[i] - this.rings[i];
      x = (this.data[i].fwd[(x + shift + N * 2) % N] - shift + N * 2) % N;
    }
    x = this.reflector[x];
    for (let i = 0; i < 3; i++) {
      const shift = this.pos[i] - this.rings[i];
      x = (this.data[i].rev[(x + shift + N * 2) % N] - shift + N * 2) % N;
    }
    return x;
  }

  /** One keypress: step, then through plugboard, scrambler, plugboard. */
  encipherIndex(c) {
    this.step();
    const out = this.plug[this.scramble(this.plug[c])];
    this.keypresses++;
    if (out === c) this.selfEncipherments++;   // must never happen
    return out;
  }

  encipher(text) {
    const clean = (text || '').toUpperCase().replace(/[^A-Z]/g, '');
    let out = '';
    for (const ch of clean) out += chr(this.encipherIndex(ord(ch)));
    return out;
  }

  clone() {
    const e = new Enigma({
      rotors: this.rotorNames,
      reflector: this.reflectorName,
      rings: this.rings.map(chr).join(''),
      ground: this.pos.map(chr).join(''),
    });
    e.plug = this.plug;
    e.plugPairs = this.plugPairs;
    return e;
  }
}

/** Convenience: encipher `text` under a fresh machine. */
export function encipherWith(settings, text) {
  return new Enigma(settings).encipher(text);
}

/**
 * The full substitution at a given position, as a permutation — used by the
 * bombe, which needs the scrambler as a function rather than a keypress.
 * Ring settings are folded in; the plugboard is deliberately NOT, because
 * that is exactly what the bombe is solving for.
 */
export function scramblerPermutation(rotorNames, reflectorName, rings, pos) {
  const e = new Enigma({
    rotors: rotorNames,
    reflector: reflectorName,
    rings,
    ground: 'AAA',
  });
  e.pos = [...pos];
  const perm = new Int8Array(N);
  for (let i = 0; i < N; i++) perm[i] = e.scramble(i);
  return perm;
}

/** All 60 orderings of three distinct rotors drawn from I–V. */
export function allRotorOrders(names = ROTOR_NAMES) {
  const out = [];
  for (const a of names) {
    for (const b of names) {
      if (b === a) continue;
      for (const c of names) {
        if (c === a || c === b) continue;
        out.push([a, b, c]);
      }
    }
  }
  return out;
}
