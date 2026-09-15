import { renderProgression, DEMO_PROGRESSION, truthForFrame, SAMPLE_RATE, DEFAULTS } from './js/synth.js';
import { analyse } from './js/chroma.js';
import {
  scoreFrame, posterior, buildTransitions, viterbi, segment, accuracy,
  chordNotes, chordLabel,
} from './js/chords.js';
import { buildMidi } from './js/midi.js';
import { decodeFile, recordMic, play, stopPlayback, downloadBytes } from './js/audio.js';
import {
  drawSpectrogram, drawChromagram, drawPosterior, drawChromaBars,
  drawChordChart, drawPlayhead,
} from './js/render.js';
import { runSelfTest } from './js/selftest.js';

const $ = (id) => document.getElementById(id);

const state = {
  source: 'demo',
  clip: null,        // { samples, sampleRate, name? }
  truthProgression: null,
  secondsPerChord: 2,
  analysis: null,
  decoded: null,
  inspectFrame: 0,
  stopPlay: null,
};

const controls = {
  partials: () => +$('partials').value,
  decay: () => +$('decay').value,
  inharm: () => +$('inharm').value / 10000,
  noise: () => +$('noise').value / 1000,
  chordLen: () => +$('chordlen').value / 10,
  whiten: () => $('whiten').checked,
  harmsum: () => $('harmsum').checked,
  useViterbi: () => $('useviterbi').checked,
  selfProb: () => +$('selfprob').value / 1000,
};

function banner(text, kind = '') {
  const el = $('banner');
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `banner ${kind}`;
  el.textContent = text;
}

// ------------------------------------------------------------- analysis

function rebuildDemo() {
  const secondsPerChord = controls.chordLen();
  const clip = renderProgression(DEMO_PROGRESSION, {
    partials: controls.partials(),
    decay: controls.decay(),
    inharmonicity: controls.inharm(),
    noise: controls.noise(),
  }, secondsPerChord);
  state.clip = clip;
  state.truthProgression = DEMO_PROGRESSION;
  state.secondsPerChord = secondsPerChord;
}

function recompute() {
  if (!state.clip) return;
  const t0 = performance.now();

  state.analysis = analyse(state.clip.samples, state.clip.sampleRate, {
    harmonics: 6,
    useWhitening: controls.whiten(),
  });

  const chroma = controls.harmsum() ? state.analysis.chromaHarm : state.analysis.chromaRaw;
  const posteriors = chroma.map((c) => posterior(scoreFrame(c)));
  const transitions = buildTransitions(controls.selfProb());
  const { path, argmax } = viterbi(posteriors, transitions);
  const chosen = controls.useViterbi() ? path : argmax;

  // Ground truth exists only for the synthesized demo. For a dropped file or
  // the microphone there is none, and the app must report nothing rather than
  // invent a number.
  let truth = null;
  if (state.source === 'demo' && state.truthProgression) {
    truth = Array.from(state.analysis.times, (t) =>
      truthForFrame(t, state.truthProgression, state.secondsPerChord));
  }

  state.decoded = {
    posteriors, path, argmax, chosen, truth,
    segments: segment(chosen, state.analysis.times),
    accArgmax: truth ? accuracy(argmax, truth) : null,
    accViterbi: truth ? accuracy(path, truth) : null,
    elapsed: performance.now() - t0,
  };

  state.inspectFrame = Math.min(state.inspectFrame, Math.max(0, state.analysis.frames - 1));
  renderAll();
}

// --------------------------------------------------------------- render

function renderAll() {
  const a = state.analysis;
  const d = state.decoded;
  if (!a || !d) return;

  drawSpectrogram($('spectrogram'), a, { height: 150 });
  drawChromagram($('chromagram'), controls.harmsum() ? a.chromaHarm : a.chromaRaw, { height: 150 });
  drawPosterior($('posterior'), d.posteriors, controls.useViterbi() ? d.path : null, { height: 220 });

  let truthSegments = null;
  if (d.truth) {
    truthSegments = state.truthProgression.map((c, i) => ({
      chord: c.root * 2 + (c.quality === 'min' ? 1 : 0),
      label: chordLabel(c.root * 2 + (c.quality === 'min' ? 1 : 0)),
      startTime: i * state.secondsPerChord,
      endTime: (i + 1) * state.secondsPerChord,
    }));
  }
  drawChordChart($('chart'), d.segments, truthSegments);

  renderAccuracy();
  renderFrame();
}

function renderAccuracy() {
  const d = state.decoded;
  const pct = (v) => `${(v * 100).toFixed(1)}%`;

  if (d.accArgmax === null) {
    for (const id of ['acc-argmax', 'acc-viterbi', 'acc-gain']) {
      const el = $(id);
      el.textContent = 'no ground truth';
      el.className = 'acc-value none';
    }
    $('acc-note').textContent =
      `This signal came from outside the app — ${state.clip.name ?? 'an external source'} `
      + '— so there is nothing to score against and no accuracy figure is shown. '
      + 'Switch to the synth demo to get measured numbers back.';
    return;
  }

  const gain = (d.accViterbi - d.accArgmax) * 100;
  $('acc-argmax').textContent = pct(d.accArgmax);
  $('acc-argmax').className = 'acc-value';
  $('acc-viterbi').textContent = pct(d.accViterbi);
  $('acc-viterbi').className = 'acc-value';
  const g = $('acc-gain');
  g.textContent = `${gain >= 0 ? '+' : ''}${gain.toFixed(1)} pts`;
  g.className = `acc-value${gain < 0 ? ' negative' : ''}`;

  let note;
  if (gain < -0.2) {
    note = 'Smoothing is now making it WORSE. The per-frame evidence has degraded '
      + 'far enough that a confident transition prior locks the decoder onto a '
      + 'coherent, smooth, wrong answer. A prior applied to noise is worse than no prior.';
  } else if (gain < 1) {
    note = 'The per-frame evidence is already clean, so the transition prior has '
      + 'almost nothing to fix. Viterbi is close to free here — and close to '
      + 'useless. Turn the difficulty up.';
  } else if (gain < 4) {
    note = 'The frames are getting noisy and the prior is starting to pay for '
      + 'itself, repairing isolated frames that flicker to a neighbouring chord.';
  } else {
    note = 'This is where smoothing earns its keep: the per-frame classifier is '
      + 'badly degraded, but chords still persist, and the transition prior '
      + 'recovers most of what the frames lost.';
  }
  if (controls.harmsum()) {
    note += ' Harmonic summation is ON — compare the number with it off.';
  }
  $('acc-note').textContent = note;
}

function renderFrame() {
  const a = state.analysis;
  const d = state.decoded;
  if (!a || a.frames === 0) return;
  const f = Math.max(0, Math.min(a.frames - 1, state.inspectFrame));
  const heard = d.chosen[f];
  const tones = chordNotes(heard);

  drawChromaBars($('bars'), a.chromaRaw[f], a.chromaHarm[f], tones, { height: 160 });

  const truthLabel = d.truth && d.truth[f] >= 0 ? chordLabel(d.truth[f]) : null;
  $('frame-label').textContent =
    `t=${a.times[f].toFixed(2)}s · heard ${chordLabel(heard)}`
    + (truthLabel ? ` · truth ${truthLabel}${truthLabel === chordLabel(heard) ? '' : '  MISS'}` : '');

  // Name the ghosts explicitly — a pitch class the summation invented that is
  // not in the chord is the whole argument against the technique.
  const ghosts = [];
  for (let p = 0; p < 12; p++) {
    if (!tones.includes(p) && a.chromaHarm[f][p] - a.chromaRaw[f][p] > 0.07) {
      ghosts.push(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][p]);
    }
  }
  $('ghost-note').textContent = ghosts.length
    ? `Harmonic summation invents energy at ${ghosts.join(', ')} — none of which is in this chord.`
    : 'No significant invented pitch classes in this frame.';
}

// ---------------------------------------------------------------- input

async function setSource(source) {
  for (const b of document.querySelectorAll('.src-btn')) {
    b.setAttribute('aria-pressed', String(b.dataset.source === source));
  }
  $('difficulty-group').hidden = source !== 'demo';
  stopPlayback();

  if (source === 'demo') {
    state.source = 'demo';
    banner('');
    $('src-label').textContent = 'synthesized demo';
    rebuildDemo();
    recompute();
    return;
  }

  if (source === 'file') {
    $('file-input').click();
    return;
  }

  if (source === 'mic') {
    if (!navigator.mediaDevices?.getUserMedia) {
      banner('This browser exposes no microphone API.', 'error');
      return;
    }
    banner('Recording 8 seconds — play or sing a chord…', 'busy');
    try {
      const clip = await recordMic(8, (peak, progress) => {
        banner(`Recording… ${(progress * 100).toFixed(0)}%   level ${'|'.repeat(Math.round(peak * 30))}`, 'busy');
      });
      state.source = 'mic';
      state.clip = clip;
      state.truthProgression = null;
      $('src-label').textContent = `microphone (${clip.sourceRate} Hz)`;
      banner('Recorded. No ground truth exists for this, so no accuracy is reported.');
      recompute();
    } catch (err) {
      banner(`Microphone unavailable: ${err.message}`, 'error');
      setSource('demo');
    }
  }
}

async function loadFile(file) {
  banner(`Decoding ${file.name}…`, 'busy');
  try {
    const clip = await decodeFile(file);
    state.source = 'file';
    state.clip = clip;
    state.truthProgression = null;
    $('src-label').textContent = `${clip.name} (${clip.sourceRate} Hz)`;
    banner(`Loaded ${clip.name} — ${(clip.samples.length / SAMPLE_RATE).toFixed(1)}s. `
      + 'No ground truth exists for this, so no accuracy is reported.');
    for (const b of document.querySelectorAll('.src-btn')) {
      b.setAttribute('aria-pressed', String(b.dataset.source === 'file'));
    }
    $('difficulty-group').hidden = true;
    recompute();
  } catch (err) {
    banner(`Could not decode that file: ${err.message}`, 'error');
  }
}

// --------------------------------------------------------------- wiring

function onStripClick(ev) {
  const rect = ev.currentTarget.getBoundingClientRect();
  const frac = (ev.clientX - rect.left) / rect.width;
  state.inspectFrame = Math.round(frac * (state.analysis?.frames ?? 1));
  renderFrame();
  for (const id of ['spectrogram', 'chromagram', 'posterior']) {
    const c = $(id);
    if (id === 'spectrogram') drawSpectrogram(c, state.analysis, { height: 150 });
    if (id === 'chromagram') {
      drawChromagram(c, controls.harmsum() ? state.analysis.chromaHarm : state.analysis.chromaRaw, { height: 150 });
    }
    if (id === 'posterior') {
      drawPosterior(c, state.decoded.posteriors, controls.useViterbi() ? state.decoded.path : null, { height: 220 });
    }
    drawPlayhead(c, frac);
  }
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function syncLabels() {
  $('v-partials').textContent = controls.partials();
  $('v-decay').textContent = controls.decay().toFixed(2);
  $('v-inharm').textContent = controls.inharm().toExponential(0).replace('e-4', 'e-4');
  $('v-noise').textContent = controls.noise().toFixed(3);
  $('v-len').textContent = `${controls.chordLen().toFixed(1)}s`;
  $('v-self').textContent = controls.selfProb().toFixed(3);
}

function init() {
  for (const b of document.querySelectorAll('.src-btn')) {
    b.addEventListener('click', () => setSource(b.dataset.source));
  }

  $('file-input').addEventListener('change', (ev) => {
    const f = ev.target.files?.[0];
    if (f) loadFile(f);
    ev.target.value = '';
  });

  // Whole-window drop target, since a file is the most interesting input here.
  let dragDepth = 0;
  window.addEventListener('dragenter', (ev) => {
    ev.preventDefault();
    if (++dragDepth === 1) $('drop-overlay').hidden = false;
  });
  window.addEventListener('dragover', (ev) => ev.preventDefault());
  window.addEventListener('dragleave', (ev) => {
    ev.preventDefault();
    if (--dragDepth <= 0) { dragDepth = 0; $('drop-overlay').hidden = true; }
  });
  window.addEventListener('drop', (ev) => {
    ev.preventDefault();
    dragDepth = 0;
    $('drop-overlay').hidden = true;
    const f = ev.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });

  const onDifficulty = debounce(() => { syncLabels(); rebuildDemo(); recompute(); }, 140);
  for (const id of ['partials', 'decay', 'inharm', 'noise', 'chordlen']) {
    $(id).addEventListener('input', () => { syncLabels(); onDifficulty(); });
  }
  const onStage = debounce(() => { syncLabels(); recompute(); }, 90);
  for (const id of ['whiten', 'harmsum', 'useviterbi']) $(id).addEventListener('change', onStage);
  $('selfprob').addEventListener('input', () => { syncLabels(); onStage(); });

  for (const id of ['spectrogram', 'chromagram', 'posterior']) {
    $(id).addEventListener('click', onStripClick);
  }

  $('play').addEventListener('click', () => {
    if (!state.clip) return;
    state.stopPlay = play(state.clip.samples, state.clip.sampleRate, (t) => {
      const frac = t / (state.clip.samples.length / state.clip.sampleRate);
      state.inspectFrame = Math.round(frac * state.analysis.frames);
      renderFrame();
      for (const id of ['spectrogram', 'chromagram', 'posterior']) {
        const c = $(id);
        if (id === 'spectrogram') drawSpectrogram(c, state.analysis, { height: 150 });
        if (id === 'chromagram') drawChromagram(c, controls.harmsum() ? state.analysis.chromaHarm : state.analysis.chromaRaw, { height: 150 });
        if (id === 'posterior') drawPosterior(c, state.decoded.posteriors, controls.useViterbi() ? state.decoded.path : null, { height: 220 });
        drawPlayhead(c, frac);
      }
    }, () => renderAll());
  });
  $('stop').addEventListener('click', () => { stopPlayback(); renderAll(); });

  $('export-midi').addEventListener('click', () => {
    if (!state.decoded) return;
    const bytes = buildMidi(state.decoded.segments, { bpm: 100 });
    downloadBytes(bytes, 'overtone-transcription.mid', 'audio/midi');
  });

  $('run-tests').addEventListener('click', () => {
    const host = $('test-output');
    host.replaceChildren();
    const results = runSelfTest();
    for (const r of results.lines) {
      const div = document.createElement('div');
      div.className = r.pass ? 'pass' : 'fail';
      div.textContent = `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  ${r.detail}` : ''}`;
      host.append(div);
    }
    const sum = document.createElement('div');
    sum.className = `summary ${results.passed === results.total ? 'pass' : 'fail'}`;
    sum.textContent = `${results.passed} / ${results.total} passed`;
    host.append(sum);
  });

  window.addEventListener('resize', debounce(() => renderAll(), 180));

  syncLabels();
  rebuildDemo();
  recompute();
}

init();
