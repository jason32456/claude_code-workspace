// Spectrum -> pitch salience -> chroma.
//
// The two stages that matter are whitening and harmonic summation, and they fix
// two different problems.
//
// WHITENING removes the spectral envelope. Two instruments playing the same
// chord have wildly different overall spectral shapes (that is what timbre is),
// and without flattening it the classifier ends up keying on the instrument
// rather than on the notes. Dividing by a running mean over a fixed span in
// LOG-frequency (a third of an octave) is the right shape of smoothing, because
// pitch is logarithmic and a linear-Hz window would be far too wide up high.
//
// HARMONIC SUMMATION is the thesis. A note at f0 puts energy at 2f0 (an octave),
// 3f0 (an octave + a fifth), 4f0, 5f0 (two octaves + a major third), 6f0...
// Folded into pitch classes, the 3rd harmonic of C lands on G and the 5th lands
// on E. So a single C note already produces a C-major-shaped chroma vector, and
// an actual C major chord is nearly indistinguishable from A minor or E minor by
// raw chroma alone. Summing each candidate pitch's harmonics back onto that
// pitch reverses the leak: real fundamentals accumulate support from their own
// overtones, while a pitch class that only ever appears AS an overtone gets no
// such reinforcement.

import { fft, hann } from './fft.js';

export const FRAME_SIZE = 8192;
export const HOP_SIZE = 1024;

// Chroma is computed over this MIDI range. The bottom is C2 — below that the FFT
// bins are too coarse to separate semitones, and those notes contribute through
// their harmonics anyway.
export const MIDI_LOW = 36;
export const MIDI_HIGH = 96;

const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

// Linear interpolation into the magnitude spectrum at an arbitrary frequency, so
// a partial that falls between bins is not silently rounded away.
function magAt(mag, freq, sampleRate, n) {
  const pos = (freq * n) / sampleRate;
  if (pos < 0 || pos >= mag.length - 1) return 0;
  const i = Math.floor(pos);
  const f = pos - i;
  return mag[i] * (1 - f) + mag[i + 1] * f;
}

// Running mean over +/- a third of an octave, evaluated in log-frequency.
//
// The band width grows with frequency, so the naive form is O(bins * bandwidth)
// and dominated the whole analysis. A prefix sum makes each band mean O(1),
// which took the 337-frame demo from ~1.8 s to well under a second.
export function whiten(mag, sampleRate, n) {
  const out = new Float64Array(mag.length);
  const prefix = new Float64Array(mag.length + 1);
  for (let i = 0; i < mag.length; i++) prefix[i + 1] = prefix[i] + mag[i];

  const ratio = 2 ** (1 / 3);
  const binsPerHz = n / sampleRate;
  for (let i = 1; i < mag.length; i++) {
    const f = (i * sampleRate) / n;
    const lo = Math.max(1, Math.floor((f / ratio) * binsPerHz));
    const hi = Math.min(mag.length - 1, Math.ceil(f * ratio * binsPerHz));
    const count = hi - lo + 1;
    const mean = (prefix[hi + 1] - prefix[lo]) / Math.max(1, count);
    out[i] = mag[i] / (mean + 1e-9);
  }
  return out;
}

// Salience per semitone. With harmonics=1 this is a plain pitch profile; with
// more it is the harmonic sum that pulls overtone energy back to its root.
export function pitchSalience(mag, sampleRate, n, harmonics, weight = 0.6) {
  const count = MIDI_HIGH - MIDI_LOW + 1;
  const out = new Float64Array(count);
  for (let p = 0; p < count; p++) {
    const f0 = midiToFreq(MIDI_LOW + p);
    let sum = 0;
    for (let h = 1; h <= harmonics; h++) {
      const f = f0 * h;
      if (f >= sampleRate / 2) break;
      // Take the local max over +/-35 cents so slight detune or inharmonicity
      // does not cause a partial to be missed entirely.
      let best = 0;
      for (const cents of [-35, -17, 0, 17, 35]) {
        best = Math.max(best, magAt(mag, f * 2 ** (cents / 1200), sampleRate, n));
      }
      sum += weight ** (h - 1) * best;
    }
    out[p] = sum;
  }
  return out;
}

export function foldToChroma(salience) {
  const chroma = new Float64Array(12);
  for (let p = 0; p < salience.length; p++) {
    chroma[(MIDI_LOW + p) % 12] += salience[p];
  }
  return chroma;
}

export function normalize(vec) {
  let max = 0;
  for (const v of vec) max = Math.max(max, v);
  if (max <= 0) return new Float64Array(vec.length);
  const out = new Float64Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / max;
  return out;
}

// Full analysis over a mono buffer. Returns per-frame spectra and chroma, with
// the harmonic-summation stage computed both ways so the UI can show the
// correction as a before/after rather than assert it.
export function analyse(samples, sampleRate, options = {}) {
  const {
    frameSize = FRAME_SIZE,
    hopSize = HOP_SIZE,
    harmonics = 6,
    harmonicWeight = 0.6,
    useWhitening = true,
  } = options;

  const win = hann(frameSize);
  const frames = Math.max(0, Math.floor((samples.length - frameSize) / hopSize) + 1);
  const bins = frameSize / 2;

  const spectra = [];
  const whitened = [];
  const chromaRaw = [];
  const chromaHarm = [];
  const times = new Float64Array(frames);

  const re = new Float64Array(frameSize);
  const im = new Float64Array(frameSize);

  for (let f = 0; f < frames; f++) {
    const start = f * hopSize;
    for (let i = 0; i < frameSize; i++) {
      re[i] = (samples[start + i] ?? 0) * win[i];
      im[i] = 0;
    }
    fft(re, im);

    const mag = new Float64Array(bins);
    for (let i = 0; i < bins; i++) mag[i] = Math.hypot(re[i], im[i]);

    const w = useWhitening ? whiten(mag, sampleRate, frameSize) : mag;

    // harmonics = 1 is the naive reading: energy at a pitch, and nothing about
    // where that energy came from.
    const rawSal = pitchSalience(w, sampleRate, frameSize, 1, harmonicWeight);
    const harmSal = pitchSalience(w, sampleRate, frameSize, harmonics, harmonicWeight);

    spectra.push(mag);
    whitened.push(w);
    chromaRaw.push(normalize(foldToChroma(rawSal)));
    chromaHarm.push(normalize(foldToChroma(harmSal)));
    times[f] = (start + frameSize / 2) / sampleRate;
  }

  return {
    frames, times, spectra, whitened, chromaRaw, chromaHarm,
    sampleRate, frameSize, hopSize,
    duration: samples.length / sampleRate,
  };
}

// Mixes to mono and resamples (linear) to the analysis rate. Dropped files
// arrive at whatever rate they were recorded at.
export function toMono(channels, inRate, outRate) {
  const len = channels[0].length;
  const mono = new Float32Array(len);
  for (const ch of channels) for (let i = 0; i < len; i++) mono[i] += ch[i];
  const inv = 1 / channels.length;
  for (let i = 0; i < len; i++) mono[i] *= inv;

  if (Math.abs(inRate - outRate) < 1) return mono;

  const ratio = inRate / outRate;
  const outLen = Math.floor(len / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const f = pos - j;
    out[i] = (mono[j] ?? 0) * (1 - f) + (mono[j + 1] ?? 0) * f;
  }
  return out;
}
