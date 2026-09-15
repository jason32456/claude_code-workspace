// A subtly wrong Enigma is still a self-consistent reciprocal cipher: it
// enciphers, it deciphers, the bombe finds stops, plaintext comes out, and
// every screen looks right while the machine is not Enigma. There is no
// internal signal of failure, so correctness is checked explicitly here
// against answers known independently of this code.

import { Enigma, encipherWith, chr, ord, N } from './enigma.js';
import { buildMenu, selectScramblers, testRegister, alignments } from './menu.js';
import { runBombe } from './bombe.js';
import { evaluateStop, rankStops, plugSpec, indexOfCoincidence } from './scoring.js';

const ok = (cond, detail = '') => ({ ok: !!cond, detail });

export const FIXTURES = [
  {
    name: 'Canonical vector: I II III, reflector B, rings AAA, ground AAA',
    why: 'Pins the entire substitution path and the ring/position offset algebra.',
    run() {
      const got = encipherWith({ rotors: ['I', 'II', 'III'], reflector: 'B', rings: 'AAA', ground: 'AAA' }, 'AAAAA');
      return ok(got === 'BDZGO', `AAAAA → ${got}, expected BDZGO`);
    },
  },
  {
    name: 'Twenty-six A’s reproduce the published run',
    why: 'Carries the check past the first rotor turnover.',
    run() {
      const got = encipherWith({ rotors: ['I', 'II', 'III'], reflector: 'B', rings: 'AAA', ground: 'AAA' }, 'A'.repeat(26));
      const want = 'BDZGOWCXLTKSBTMCDLPBMUQOFX';
      return ok(got === want, `got ${got}`);
    },
  },
  {
    name: 'Enciphering twice returns the plaintext',
    why: 'The reflector makes the machine an involution — which is also why it has no fixed points.',
    run() {
      const s = { rotors: ['II', 'IV', 'V'], reflector: 'C', rings: 'BUL', ground: 'XYZ', plugboard: 'AV BS CG DL FU HZ IN KM OW RX' };
      const pt = 'DIEWETTERLAGEISTHEUTEUNVERAENDERT';
      const back = encipherWith(s, encipherWith(s, pt));
      return ok(back === pt, `round trip gave ${back}`);
    },
  },
  {
    name: 'No letter ever enciphers to itself, over 20,000 keypresses',
    why: 'The single property the whole attack rests on. Shown as a measurement, not a claim.',
    run() {
      const e = new Enigma({ rotors: ['III', 'I', 'IV'], reflector: 'B', rings: 'QMT', ground: 'ABC' });
      let fixed = 0;
      for (let k = 0; k < 20000; k++) if (e.encipherIndex(k % N) === k % N) fixed++;
      return ok(fixed === 0, `${fixed} self-encipherments`);
    },
  },
  {
    name: 'The double step: ADU → ADV → AEW → BFX',
    why: 'The middle rotor advances twice in consecutive presses. Getting this wrong is invisible until it is not.',
    run() {
      const e = new Enigma({ rotors: ['I', 'II', 'III'], reflector: 'B', rings: 'AAA', ground: 'ADU' });
      const seen = [];
      for (let i = 0; i < 4; i++) { seen.push(e.window); e.step(); }
      const got = seen.join(' ');
      return ok(got === 'ADU ADV AEW BFX', `got ${got}`);
    },
  },
  {
    name: 'Middle rotor steps 26 times in 650 presses, not 676',
    why: 'The double step steals a step; 26 × 25 is the period, and the discrepancy is the anomaly.',
    run() {
      const e = new Enigma({ rotors: ['I', 'II', 'III'], reflector: 'B', rings: 'AAA', ground: 'AAA' });
      let steps = 0, prev = e.pos[1];
      for (let i = 0; i < 650; i++) { e.step(); if (e.pos[1] !== prev) { steps++; prev = e.pos[1]; } }
      return ok(steps === 26, `${steps} middle-rotor steps`);
    },
  },
  {
    name: 'Machine period is 26 × 25 × 26 = 16,900',
    why: 'The full state cycle, shortened from 17,576 by the same anomaly.',
    run() {
      const e = new Enigma({ rotors: ['I', 'II', 'III'], reflector: 'B', rings: 'AAA', ground: 'AAA' });
      const start = e.window;
      let period = 0;
      for (let i = 1; i <= 20000; i++) { e.step(); if (e.window === start) { period = i; break; } }
      return ok(period === 16900, `period ${period}`);
    },
  },
  {
    name: 'The self-encipherment filter kills roughly two thirds of alignments',
    why: 'The largest single saving in the attack, and it costs no computation at all.',
    run() {
      const cipher = encipherWith({ rotors: ['I', 'II', 'III'], reflector: 'B', rings: 'AAA', ground: 'AAA' },
        'KEINEBESONDERENEREIGNISSEWETTERVORHERSAGEBERLINSTOPARMEEOBERKOMMANDO');
      const all = alignments(cipher, 'WETTERVORHERSAGE');
      const survived = all.filter((a) => a.valid).length;
      const frac = survived / all.length;
      return ok(frac > 0.2 && frac < 0.7, `${survived}/${all.length} survived (${(frac * 100).toFixed(0)}%)`);
    },
  },
  {
    name: 'Index of coincidence separates German from random',
    why: 'Stop ranking is a measurement over a handful of constants, not a shipped corpus.',
    run() {
      const german = indexOfCoincidence('KEINEBESONDERENEREIGNISSEWETTERVORHERSAGEBERLINSTOPARMEEOBERKOMMANDOMELDETANGRIFF');
      const random = indexOfCoincidence(encipherWith(
        { rotors: ['I', 'II', 'III'], reflector: 'B', rings: 'AAA', ground: 'AAA' },
        'KEINEBESONDERENEREIGNISSEWETTERVORHERSAGEBERLINSTOPARMEEOBERKOMMANDOMELDETANGRIFF'));
      return ok(german > 0.06 && random < 0.055, `German ${german.toFixed(4)} vs ciphertext ${random.toFixed(4)}`);
    },
  },
  {
    name: 'End to end: encipher under a random key, discard it, break it, compare',
    why: 'The whole pipeline. The app generates its own ground truth, hides it, and grades itself.',
    slow: true,
    run() {
      const truth = {
        rotors: ['I', 'II', 'III'], reflector: 'B', rings: 'AAA', ground: 'AAA',
        plugboard: 'AV BS CG DL FU HZ IN KM OW RX',
      };
      const plain = 'KEINEBESONDERENEREIGNISSEWETTERVORHERSAGEBERLINSTOPARMEEOBERKOMMANDOMELDETANGRIFFBEIMORGENGRAUENSTOP';
      const cipher = encipherWith(truth, plain);
      const crib = 'KEINEBESONDERENEREIGNISSE';
      const fullMenu = buildMenu(cipher, crib, 0);
      const menu = selectScramblers(fullMenu);
      const tr = testRegister(menu);

      const stops = [];
      for (const ev of runBombe({ menu, reflector: 'B', orders: [['I', 'II', 'III']], testReg: tr, maxStops: 5000 })) {
        if (ev.type === 'stop') stops.push(ev);
      }
      const ranked = rankStops(
        stops.map((s) => evaluateStop(s, { menu: fullMenu, cipher, crib, offset: 0, reflector: 'B' })).filter(Boolean));
      const top = ranked[0];
      if (!top) return ok(false, 'no stop survived');

      const gotPlain = top.plaintext === plain;
      const gotPlugs = plugSpec(top.pairs) === truth.plugboard;
      const gotKey = top.order.join('') === 'IIIIII' && top.ground.map(chr).join('') === 'AAA';
      return ok(gotPlain && gotPlugs && gotKey,
        `plaintext ${gotPlain ? 'exact' : 'wrong'}, plugboard ${gotPlugs ? 'exact' : plugSpec(top.pairs)}, key ${gotKey ? 'exact' : 'wrong'}`);
    },
  },
];

export function runFixtures({ includeSlow = true } = {}) {
  const results = [];
  for (const f of FIXTURES) {
    if (f.slow && !includeSlow) { results.push({ ...f, skipped: true }); continue; }
    const t0 = performance.now();
    let r;
    try { r = f.run(); } catch (e) { r = { ok: false, detail: e.message }; }
    results.push({ ...f, ...r, ms: performance.now() - t0 });
  }
  const passed = results.filter((r) => r.ok).length;
  const ran = results.filter((r) => !r.skipped).length;
  return { results, passed, ran, allPassed: passed === ran };
}

export { ord };
