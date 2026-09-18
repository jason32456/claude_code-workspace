// A doctrine is a SPECIFICATION, not a claim about the world and not a
// description of anyone's belief. The names here are structural — Wheel,
// Ladder, Mirror, Furnace, Terminal — because the object under test is the
// shape of a transition system, and giving it the name of a real tradition
// would be both inaccurate and rude. The app derives consequences from a spec.
// It does not adjudicate cosmology.
//
// Spec fields:
//   states     ordered station names, low to high
//   law        Gompertz-Makeham parameters per state
//   benefit    death benefit paid per life in that state
//   drift      where merit carries you: next station centres on i + drift[i]
//   sigma      dispersion of rebirth around that centre
//   liberate   per-state probability of leaving the cycle entirely
//   sealed     states that cannot reach liberation however it is specified

import { zeros } from './la.js';

const gm = (A, B, c) => ({ A, B, c });

// Mortality laws chosen so mean lifetimes differ substantially between
// stations. That spread is what the final result turns on.
const LAWS = {
  brief: gm(0.02, 4.0e-4, 1.14),
  short: gm(0.008, 1.6e-4, 1.11),
  human: gm(0.0008, 4.0e-5, 1.095),
  long: gm(0.0003, 8.0e-6, 1.072),
  vast: gm(0.00008, 1.2e-6, 1.055),
};

export const DOCTRINES = {
  wheel: {
    id: 'wheel',
    name: 'The Wheel',
    note: 'Six stations, no exit. Merit drifts you up or down and the cycle never terminates — the case the original insurability verdict said could not be priced.',
    states: ['Stone', 'Beast', 'Human', 'Warden', 'Regent', 'Radiant'],
    laws: ['brief', 'short', 'human', 'human', 'long', 'vast'],
    benefit: [1, 1, 1, 1, 1, 1],
    drift: [0.9, 0.6, 0.2, -0.1, -0.5, -1.1],
    sigma: 1.15,
    liberate: [0, 0, 0, 0, 0, 0],
  },
  ladder: {
    id: 'ladder',
    name: 'The Ladder',
    note: 'The same six stations with an absorbing seventh. Liberation is reachable from everywhere, so the expected number of lives is finite and the policy prices even at zero discount.',
    states: ['Stone', 'Beast', 'Human', 'Warden', 'Regent', 'Radiant'],
    laws: ['brief', 'short', 'human', 'human', 'long', 'vast'],
    benefit: [1, 1, 1, 1, 1, 1],
    drift: [0.9, 0.7, 0.5, 0.3, 0.2, 0.0],
    sigma: 1.0,
    liberate: [0.002, 0.01, 0.04, 0.06, 0.12, 0.3],
  },
  mirror: {
    id: 'mirror',
    name: 'The Mirror',
    note: 'Liberation exists and two stations provably cannot reach it. The zero-discount classification comes back mixed, which is the only place the original verdict survives — and it is decided by graph reachability, not arithmetic.',
    states: ['Stone', 'Beast', 'Human', 'Warden', 'Regent', 'Radiant'],
    laws: ['brief', 'short', 'human', 'human', 'long', 'vast'],
    benefit: [1, 1, 1, 1, 1, 1],
    drift: [0.4, 0.4, 0.4, 0.3, -0.2, -0.6],
    sigma: 0.9,
    liberate: [0, 0, 0.05, 0.08, 0, 0],
    sealed: [0, 1],
  },
  furnace: {
    id: 'furnace',
    name: 'The Furnace',
    note: 'Liberation is reachable only from the lowest station. Every soul must bottom out before it can leave, so the policy is finite but carries an enormous expected claim count.',
    states: ['Stone', 'Beast', 'Human', 'Warden', 'Regent', 'Radiant'],
    laws: ['brief', 'short', 'human', 'human', 'long', 'vast'],
    benefit: [1, 1, 1, 1, 1, 1],
    drift: [0.0, -0.3, -0.4, -0.5, -0.7, -1.0],
    sigma: 1.3,
    liberate: [0.05, 0, 0, 0, 0, 0],
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    note: 'One life, then liberation with certainty. The degenerate doctrine: ordinary whole-life insurance, and therefore the oracle that proves the machinery reduces to the textbook formula.',
    states: ['Human'],
    laws: ['human'],
    benefit: [1],
    drift: [0],
    sigma: 1,
    liberate: [1],
  },
};

export const lawFor = (key) => LAWS[key];

// Compile a spec to a stochastic matrix over n+1 states, where index n is the
// absorbing liberation state. Liberation is always present as a state; a
// doctrine with liberate all zero simply never enters it.
export function compile(spec) {
  const n = spec.states.length;
  const N = n + 1;
  const L = n;
  const P = zeros(N);
  const sealed = new Set(spec.sealed || []);

  for (let i = 0; i < n; i++) {
    // A sealed station cannot leave the cycle regardless of what liberate says.
    const lib = sealed.has(i) ? 0 : Math.min(1, Math.max(0, spec.liberate[i]));
    const centre = i + spec.drift[i];
    const w = new Float64Array(n);
    let total = 0;
    for (let j = 0; j < n; j++) {
      // A sealed station may not be exited toward the liberation-bearing part
      // of the cycle, and no unsealed station falls into the sealed set. That
      // is what makes the sealed block a genuine closed recurrent class.
      if (sealed.has(i) !== sealed.has(j)) continue;
      const z = (j - centre) / spec.sigma;
      w[j] = Math.exp(-0.5 * z * z);
      total += w[j];
    }
    if (total === 0) { w[i] = 1; total = 1; }
    for (let j = 0; j < n; j++) P[i][j] = (1 - lib) * (w[j] / total);
    P[i][L] = lib;
  }
  P[L][L] = 1;

  return {
    spec,
    n,
    N,
    liberationIndex: L,
    P,
    laws: spec.laws.map((k) => LAWS[k]),
    benefit: Float64Array.from(spec.benefit),
    names: [...spec.states, 'Liberation'],
  };
}

// Row sums, checked to machine precision. Self-test 5 asserts this over every
// shipped doctrine; a matrix that is not stochastic makes every number
// downstream meaningless, so it is verified rather than assumed.
export function rowSumError(P) {
  let worst = 0;
  for (let i = 0; i < P.length; i++) {
    let s = 0;
    for (let j = 0; j < P[i].length; j++) s += P[i][j];
    worst = Math.max(worst, Math.abs(s - 1));
  }
  return worst;
}
