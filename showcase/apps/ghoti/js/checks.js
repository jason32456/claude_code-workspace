// In-page self-tests.
//
// Every check here is decided by something derived OUTSIDE the code it tests: a
// theorem, a brute-force oracle, a structural invariant, or a table that the routine
// under test does not read. A suite that only compares a function to itself proves
// nothing, and a subtly wrong aligner is still perfectly self-consistent -- every
// screen in this app would look plausible while the model was quietly not a model.

import { viterbiAlign, MOVES } from './align.js';
import { pronounce, pronounceExhaustive, distribution, ctxKey } from './model.js';
import { levenshtein } from './evaluate.js';
import { render, PHONES, splitPhone } from './synth.js';

const ok = (name, pass, detail) => ({ name, pass, detail });

// Magnitude spectrum by direct correlation. Deliberately not the same code path as
// anything in synth.js, so it can disagree with it. The step has to be fine enough to
// resolve formants that sit only a few hundred Hz apart -- at 25 Hz this measurement
// reported failures that turned out to be its own resolution rather than the synth's.
function spectrumPeaks(signal, sampleRate, maxHz = 3600, step = 10) {
  const n = Math.min(signal.length, 8192);
  const mags = [];
  for (let f = step; f <= maxHz; f += step) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * f) / sampleRate;
    for (let k = 0; k < n; k++) {
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (n - 1)); // Hann
      re += signal[k] * win * Math.cos(w * k);
      im += signal[k] * win * Math.sin(w * k);
    }
    mags.push({ f, m: Math.sqrt(re * re + im * im) });
  }
  const peaks = [];
  for (let i = 1; i < mags.length - 1; i++) {
    if (mags[i].m > mags[i - 1].m && mags[i].m >= mags[i + 1].m) peaks.push(mags[i]);
  }
  peaks.sort((a, b) => b.m - a.m);
  return peaks;
}

export function runChecks({ dict, model, pron, split, emHistory, forensics }) {
  const results = [];

  // 1. EM's likelihood is non-decreasing. This is a theorem, so a decrease is a bug.
  //    The first pass is excluded: its incoming parameters are the unnormalised prior.
  {
    const proper = emHistory.filter((h) => h.proper);
    let worst = 0;
    let bad = 0;
    for (let i = 1; i < proper.length; i++) {
      const d = proper[i].logLik - proper[i - 1].logLik;
      if (d < worst) worst = d;
      if (d < -1e-6) bad++;
    }
    results.push(ok(
      'EM log-likelihood never decreases',
      bad === 0 && proper.length >= 3,
      `${proper.length} scored passes, ${bad} decreases, worst step ${worst.toExponential(2)}`,
    ));
  }

  // 2. The beam must find what brute force finds. Exhaustive search over every chunking
  //    is exponential, so this runs on short words only -- but there it is exact.
  {
    const words = ['fish', 'cat', 'ghoti', 'note', 'sing', 'bead', 'lamp'];
    let agree = 0;
    const misses = [];
    for (const w of words) {
      const brute = pronounceExhaustive(pron, w);
      const beam = pronounce(pron, w, { beam: 24, branch: 12 });
      const a = brute ? brute.phones.join(' ') : null;
      const b = beam.length ? beam[0].phones.join(' ') : null;
      if (a === b) agree++;
      else misses.push(`${w}: beam ${b} vs exhaustive ${a}`);
    }
    results.push(ok(
      'beam search matches exhaustive argmax',
      agree === words.length,
      agree === words.length ? `${agree}/${words.length} short words` : misses.join('; '),
    ));
  }

  // 3. An alignment must tile the letters exactly and reproduce the phones exactly.
  //    If it does not, every count built on top of it is meaningless.
  {
    let checked = 0;
    let bad = 0;
    for (let k = 0; k < split.train.length && checked < 3000; k += 37) {
      const w = split.train[k];
      const letters = dict.letters(w);
      const phones = dict.phoneIds(w);
      const r = viterbiAlign(model, letters, phones);
      if (!r) continue;
      checked++;
      let li = 0;
      let pi = 0;
      let good = true;
      for (const c of r.chunks) {
        if (c.i !== li || c.j !== pi) { good = false; break; }
        li += c.a;
        pi += c.b;
      }
      if (li !== letters.length || pi !== phones.length) good = false;
      if (!good) bad++;
    }
    results.push(ok(
      'alignments tile letters and phones exactly',
      bad === 0 && checked > 100,
      `${checked} alignments verified, ${bad} malformed`,
    ));
  }

  // 4. The decoder's per-position distribution must be a distribution. If it does not
  //    sum to one, hypotheses of different lengths are not comparable and the whole
  //    beam ranking is meaningless.
  {
    let worst = 0;
    let n = 0;
    for (const w of ['pronunciation', 'ghoti', 'thorough', 'x', 'queueing']) {
      for (let i = 0; i < w.length; i++) {
        const d = distribution(pron, w, i);
        if (!d) continue;
        let s = 0;
        for (const v of d.values()) s += v;
        worst = Math.max(worst, Math.abs(s - 1));
        n++;
      }
    }
    results.push(ok(
      'decoder distributions sum to 1',
      worst < 1e-9 && n > 10,
      `${n} positions, max deviation ${worst.toExponential(2)}`,
    ));
  }

  // 5. Edit distance against values worked out by hand.
  {
    const cases = [
      [[], [], 0], [['a'], [], 1], [['a'], ['a'], 0], [['a'], ['b'], 1],
      [['k', 'i', 't', 't', 'e', 'n'], ['s', 'i', 't', 't', 'i', 'n', 'g'], 3],
      [['f', 'l', 'a', 'w'], ['l', 'a', 'w', 'n'], 2],
    ];
    const bad = cases.filter(([a, b, want]) => levenshtein(a, b) !== want);
    results.push(ok(
      'edit distance matches hand-computed values',
      bad.length === 0,
      `${cases.length} cases including kitten/sitting = 3`,
    ));
  }

  // 6. Held-out words must be genuinely unseen, or every accuracy on this page is a lie.
  {
    const trainSet = new Set(split.train);
    let leaked = 0;
    for (const h of split.heldOut) if (trainSet.has(h)) leaked++;
    results.push(ok(
      'held-out words never appear in training',
      leaked === 0,
      `${split.heldOut.length} held-out, ${split.train.length} train, ${leaked} leaked`,
    ));
  }

  // 7. Context keys are base-27 integers; a collision would silently merge two
  //    different spelling contexts into one set of counts.
  {
    const seen = new Map();
    let collisions = 0;
    let n = 0;
    for (let k = 0; k < 4000; k++) {
      const w = dict.words[(k * 29) % dict.nWords];
      for (let i = 0; i < w.length; i++) {
        for (let L = 0; L <= 3; L++) {
          const key = `${L}:${ctxKey(w, i, L)}`;
          let text = '';
          for (let q = i - L; q <= i + L; q++) text += q < 0 || q >= w.length ? '#' : w[q];
          n++;
          const prev = seen.get(key);
          if (prev === undefined) seen.set(key, text);
          else if (prev !== text) collisions++;
        }
      }
    }
    results.push(ok(
      'context keys are collision-free',
      collisions === 0,
      `${n} windows hashed, ${seen.size} distinct, ${collisions} collisions`,
    ));
  }

  // 8. The synthesiser's output must actually contain the formants the phone table
  //    asks for. The table is the ground truth here and the DSP is what is on trial --
  //    a synth that emits a buzz at the wrong frequencies would still "play a sound".
  {
    const sr = 22050;
    const tests = ['IY1', 'AA1', 'UW1', 'EH1'];
    const detail = [];
    let pass = 0;
    for (const label of tests) {
      const base = splitPhone(label).base;
      const want = PHONES[base].f;
      const sig = render([label, label, label], { sampleRate: sr });
      // Measure the steady middle only: the first third of every segment is the glide
      // into the target, so its formants are deliberately somewhere else.
      const seg = sig.subarray(Math.floor(sig.length * 0.35), Math.floor(sig.length * 0.75));
      const peaks = spectrumPeaks(seg, sr);
      const near = (target, tol) => peaks.slice(0, 8).some((p) => Math.abs(p.f - target) <= tol);
      // F1 and F2 identify a vowel; F3 is far weaker and not required.
      const f1 = near(want[0], 120);
      const f2 = near(want[1], 180);
      if (f1 && f2) pass++;
      detail.push(`${label} F1~${want[0]}${f1 ? '✓' : '✗'} F2~${want[1]}${f2 ? '✓' : '✗'}`);
    }
    results.push(ok(
      'synthesised vowels carry their formants',
      pass === tests.length,
      detail.join('  '),
    ));
  }

  // 9. Every phone the dictionary uses must be synthesisable, or some words are simply
  //    unplayable and the audible proof has a hole in it.
  {
    const missing = [];
    for (const p of dict.phones) {
      const s = splitPhone(p);
      if (!s || !PHONES[s.base]) missing.push(p);
    }
    results.push(ok(
      'every dictionary phone can be synthesised',
      missing.length === 0,
      `${dict.phones.length} symbols, ${dict.baseNames.length} base phones, missing: ${missing.join(' ') || 'none'}`,
    ));
  }

  // 10. The forensic span logic on a case whose answer is fixed by hand: `nation`
  //     aligned by any correct aligner must put SH on the letters `ti`, and `ti` must
  //     be word-medial there, not final.
  {
    const i = dict.words.indexOf('nation');
    const r = i >= 0 ? viterbiAlign(model, dict.letters(i), dict.phoneIds(i)) : null;
    const tiAt = 'nation'.indexOf('ti');
    const medial = tiAt > 0 && tiAt + 2 < 'nation'.length;
    let says = null;
    if (r) {
      const ids = [];
      let startOk = false;
      let endOk = false;
      for (const c of r.chunks) {
        if (c.i === tiAt) startOk = true;
        if (c.i + c.a === tiAt + 2) endOk = true;
        if (c.i >= tiAt && c.i + c.a <= tiAt + 2) for (let k = 0; k < c.b; k++) ids.push(c.j + k);
      }
      if (startOk && endOk) says = ids.map((j) => dict.base[dict.phoneIds(i)[j]]).join(' ');
    }
    results.push(ok(
      'forensic span finds SH on the "ti" of nation',
      says === 'SH' && medial,
      `ti at index ${tiAt} (${medial ? 'medial' : 'not medial'}) spells ${says || 'ambiguous'}`,
    ));
  }

  // 11. The headline claim, asserted rather than narrated: whatever the counts say,
  //     the page must be reporting the counts it actually measured.
  if (forensics) {
    const gh = forensics.find((v) => v.letters === 'gh');
    const ti = forensics.find((v) => v.letters === 'ti');
    const consistent = gh && ti
      && gh.timesInRequiredPosition === 0 === !gh.survives
      && ti.timesInRequiredPosition === 0 === !ti.survives;
    results.push(ok(
      'verdicts agree with the tallies they came from',
      !!consistent,
      `gh word-initial /f/: ${gh ? gh.timesInRequiredPosition : '?'} of ${gh ? gh.spanSeenInPosition : '?'}; `
      + `ti word-final /sh/: ${ti ? ti.timesInRequiredPosition : '?'} of ${ti ? ti.spanSeenInPosition : '?'}`,
    ));
  }

  // 12. The move set the aligner ran with, stated on the page so the constraint that
  //     shaped every alignment is visible rather than buried.
  results.push(ok(
    'aligner move set is the documented one',
    MOVES.length === 4 && !MOVES.some(([a, b]) => a === 2 && b === 2),
    MOVES.map(([a, b]) => `${a}->${b}`).join(' '),
  ));

  return results;
}
