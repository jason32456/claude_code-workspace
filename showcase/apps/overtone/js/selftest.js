// In-page self-test.
//
// Two components here have exact oracles and both are checked rather than
// assumed: the FFT against an independently written naive DFT, and the MIDI
// writer against a reader that parses its own bytes back. The chord estimator
// has no exact oracle — that is the honest part — so what is checked there is
// internal consistency and the invariants that must hold whatever the accuracy.

import { magnitudeSpectrum, naiveDFT, fft } from './fft.js';
import { writeVLQ, readVLQ, buildMidi, readMidi } from './midi.js';
import { renderProgression, DEMO_PROGRESSION, truthForFrame } from './synth.js';
import { analyse } from './chroma.js';
import {
  scoreFrame, posterior, buildTransitions, viterbi, segment, accuracy,
  STATE_COUNT, NO_CHORD,
} from './chords.js';

export function runSelfTest() {
  const lines = [];
  const check = (name, pass, detail = '') => lines.push({ name, pass: !!pass, detail });

  // --- FFT against the naive DFT. The one exact oracle in the pipeline.
  for (const N of [64, 256, 1024]) {
    const s = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      s[i] = Math.sin((2 * Math.PI * 5 * i) / N) + 0.5 * Math.cos((2 * Math.PI * 17 * i) / N);
    }
    const a = magnitudeSpectrum(s);
    const b = naiveDFT(s);
    let max = 0;
    for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
    check(`FFT matches naive DFT at N=${N}`, max < 1e-9, `max diff ${max.toExponential(2)}`);
  }

  // --- Parseval: energy is conserved between time and frequency.
  {
    const N = 1024;
    const s = new Float64Array(N);
    for (let i = 0; i < N; i++) s[i] = Math.sin(i * 0.31) * 0.7 + Math.cos(i * 1.7) * 0.3;
    const re = Float64Array.from(s);
    const im = new Float64Array(N);
    fft(re, im);
    let te = 0;
    let fe = 0;
    for (let i = 0; i < N; i++) { te += s[i] * s[i]; fe += (re[i] * re[i] + im[i] * im[i]) / N; }
    check('Parseval energy conservation', Math.abs(te - fe) < 1e-6,
      `time ${te.toFixed(3)} vs freq ${fe.toFixed(3)}`);
  }

  // --- VLQ against the canonical table from the SMF specification.
  {
    const spec = [
      [0x00000000, '00'], [0x0000007f, '7F'], [0x00000080, '8100'],
      [0x00002000, 'C000'], [0x00003fff, 'FF7F'], [0x00004000, '818000'],
      [0x00100000, 'C08000'], [0x001fffff, 'FFFF7F'], [0x0fffffff, 'FFFFFF7F'],
    ];
    let ok = 0;
    for (const [v, hex] of spec) {
      const got = writeVLQ(v).map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join('');
      if (got === hex && readVLQ(writeVLQ(v), 0).value === v) ok++;
    }
    check('MIDI variable-length quantities match the SMF spec table',
      ok === spec.length, `${ok}/${spec.length}`);
  }

  // --- MIDI round-trip through an independent reader.
  {
    const segs = [
      { chord: 0, startTime: 0, endTime: 2 },
      { chord: 19, startTime: 2, endTime: 4 },
      { chord: NO_CHORD, startTime: 4, endTime: 5 },
      { chord: 14, startTime: 5, endTime: 7 },
    ];
    const bytes = buildMidi(segs, { bpm: 100 });
    let parsed = null;
    let err = '';
    try { parsed = readMidi(bytes); } catch (e) { err = e.message; }
    check('MIDI file parses back', !!parsed, parsed ? `${bytes.length} bytes` : err);
    if (parsed) {
      const ons = parsed.events.filter((e) => e.type === 'on');
      const offs = parsed.events.filter((e) => e.type === 'off');
      check('every note-on has a matching note-off', ons.length === offs.length,
        `${ons.length} on / ${offs.length} off`);
      check('no-chord segments emit no notes', ons.length === 12,
        `${ons.length} notes for 3 chords`);
      check('header is SMF type 0, one track', parsed.format === 0 && parsed.tracks === 1,
        `format ${parsed.format}, ${parsed.tracks} track`);
      const open = new Map();
      let overlap = 0;
      for (const e of parsed.events) {
        if (e.type === 'on') { if (open.get(e.note)) overlap++; open.set(e.note, true); }
        else if (e.type === 'off') open.set(e.note, false);
      }
      check('no note is retriggered before release', overlap === 0, `${overlap} overlaps`);
    }
  }

  // --- Pipeline invariants. No exact oracle here, so what is asserted is what
  // must hold regardless of how well the estimator performs.
  {
    const clip = renderProgression(DEMO_PROGRESSION, {}, 1.2);
    const a = analyse(clip.samples, clip.sampleRate, {});
    check('analysis produced frames', a.frames > 20, `${a.frames} frames`);

    const posts = a.chromaRaw.map((c) => posterior(scoreFrame(c)));
    let worstSum = 0;
    for (const p of posts) {
      let s = 0;
      for (let i = 0; i < STATE_COUNT; i++) s += p[i];
      worstSum = Math.max(worstSum, Math.abs(s - 1));
    }
    check('every posterior sums to 1', worstSum < 1e-9, `max deviation ${worstSum.toExponential(2)}`);

    const T = buildTransitions(0.96);
    let rowErr = 0;
    for (const row of T) {
      let s = 0;
      for (let j = 0; j < STATE_COUNT; j++) s += Math.exp(row[j]);
      rowErr = Math.max(rowErr, Math.abs(s - 1));
    }
    check('every transition row is a distribution', rowErr < 1e-6,
      `max deviation ${rowErr.toExponential(2)}`);

    const { path, argmax } = viterbi(posts, T);
    check('Viterbi path covers every frame', path.length === a.frames);
    check('Viterbi path is in range',
      path.every((s) => s >= 0 && s < STATE_COUNT));

    // Viterbi must never be more fragmented than raw argmax — that is what
    // smoothing means, and it holds even when accuracy does not improve.
    const runs = (p) => p.reduce((n, v, i) => n + (i > 0 && v !== p[i - 1] ? 1 : 0), 1);
    check('Viterbi is no more fragmented than argmax',
      runs(path) <= runs(argmax), `${runs(path)} runs vs ${runs(argmax)}`);

    const truth = Array.from(a.times, (t) => truthForFrame(t, DEMO_PROGRESSION, 1.2));
    const acc = accuracy(path, truth);
    check('decoded accuracy beats chance by a wide margin', acc > 0.6,
      `${(acc * 100).toFixed(1)}% vs 4% chance`);

    const segs = segment(path, a.times);
    check('segments are contiguous and ordered',
      segs.every((s, i) => s.endTime > s.startTime && (i === 0 || s.startTime >= segs[i - 1].startTime)),
      `${segs.length} segments`);
  }

  const passed = lines.filter((l) => l.pass).length;
  return { lines, passed, total: lines.length };
}
