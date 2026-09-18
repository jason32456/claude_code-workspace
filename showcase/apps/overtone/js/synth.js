// Additive synthesizer for the demo clip.
//
// This exists to be HARD to transcribe, not easy. A bank of pure sines would
// make the estimator look brilliant and prove nothing, because the entire
// problem this app is about — that a C major chord's spectrum already contains
// a strong E and G as overtones of the C — only exists if the partials are
// really there.
//
// So: a real overtone series with per-partial decay (high partials die first,
// as they do on a real string), string-like inharmonicity that stretches upper
// partials sharp, per-note detune, an ADSR envelope, and a noise floor. Every
// one of those is exposed as a control, so the difficulty can be turned up until
// the estimator visibly breaks.

export const SAMPLE_RATE = 22050;

export const DEFAULTS = {
  partials: 6,
  inharmonicity: 0.0004, // B in f_h = f0*h*sqrt(1+B*h^2); real pianos are 1e-4..1e-3
  decay: 0.55,           // amplitude ratio between successive partials
  noise: 0.012,
  release: 0.55,         // fraction of a beat the note rings past the chord change
  detune: 4,             // cents of random detune per note
};

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

// Root-position triads. Quality is 'maj' or 'min'; the intervals are what the
// templates in chords.js will later have to recognise.
const INTERVALS = { maj: [0, 4, 7], min: [0, 3, 7] };

// A progression chosen for its confusions rather than its prettiness. C/Am and
// Em/G each share two of three notes, which is exactly where a per-frame
// classifier flickers and where Viterbi has to earn its place.
export const DEMO_PROGRESSION = [
  { root: 0, quality: 'maj' },  // C
  { root: 9, quality: 'min' },  // Am  — shares C and E with C major
  { root: 5, quality: 'maj' },  // F
  { root: 7, quality: 'maj' },  // G
  { root: 4, quality: 'min' },  // Em  — shares E and G with C major
  { root: 9, quality: 'min' },  // Am
  { root: 2, quality: 'min' },  // Dm
  { root: 7, quality: 'maj' },  // G
];

export const chordName = (root, quality) =>
  `${PITCH_CLASSES[root]}${quality === 'min' ? 'm' : ''}`;

// Deterministic PRNG so the demo clip, the accuracy figure and the screenshots
// are identical on every run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One note, summed into `out` starting at `start`.
function addNote(out, start, lengthSamples, midi, gain, opts, rand) {
  const { partials, inharmonicity, decay, detune } = opts;
  const cents = (rand() * 2 - 1) * detune;
  const f0 = midiToFreq(midi) * 2 ** (cents / 1200);
  const phase0 = rand() * Math.PI * 2;
  const n = Math.min(lengthSamples, out.length - start);
  if (n <= 0) return;

  const attack = Math.floor(SAMPLE_RATE * 0.012);

  for (let h = 1; h <= partials; h++) {
    // Stiff-string inharmonicity: upper partials run progressively sharp, which
    // is what stops them lining up into a tidy integer series.
    const fh = f0 * h * Math.sqrt(1 + inharmonicity * h * h);
    if (fh >= SAMPLE_RATE / 2) break;
    const amp = gain * decay ** (h - 1);
    // Higher partials decay faster — the reason a struck note gets duller as it
    // rings, and the reason the chroma of a chord changes over its own duration.
    const tau = (0.9 / h ** 0.6) * SAMPLE_RATE;
    const w = (2 * Math.PI * fh) / SAMPLE_RATE;
    const ph = phase0 + h * 0.7;
    for (let i = 0; i < n; i++) {
      const env = Math.exp(-i / tau) * (i < attack ? i / attack : 1);
      out[start + i] += amp * env * Math.sin(w * i + ph);
    }
  }
}

// Renders the progression to a Float32Array plus the frame-accurate ground
// truth. `secondsPerChord` times the progression length is the clip duration.
export function renderProgression(progression, options = {}, secondsPerChord = 2) {
  const opts = { ...DEFAULTS, ...options };
  const rand = mulberry32(0x0e701e);
  const chordSamples = Math.floor(SAMPLE_RATE * secondsPerChord);
  const total = chordSamples * progression.length;
  const out = new Float32Array(total);

  progression.forEach((chord, i) => {
    const start = i * chordSamples;
    // Ring past the chord change, so boundaries are genuinely smeared rather
    // than conveniently silent.
    const len = Math.floor(chordSamples * (1 + opts.release));
    const bass = 36 + chord.root; // C2..B2
    addNote(out, start, len, bass, 0.5, opts, rand);
    for (const iv of INTERVALS[chord.quality]) {
      addNote(out, start, len, 60 + chord.root + iv, 0.42, opts, rand);
    }
  });

  if (opts.noise > 0) {
    for (let i = 0; i < total; i++) out[i] += (rand() * 2 - 1) * opts.noise;
  }

  // Normalize to -3 dBFS without clipping.
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const g = 0.707 / peak;
    for (let i = 0; i < total; i++) out[i] *= g;
  }

  return {
    samples: out,
    sampleRate: SAMPLE_RATE,
    secondsPerChord,
    truth: progression.map((c) => ({ ...c, name: chordName(c.root, c.quality) })),
  };
}

// Ground-truth chord index for a given frame, or -1 before/after the clip.
// Chord indices match the ordering in chords.js: root*2 + (min?1:0).
export function truthForFrame(frameTimeSec, progression, secondsPerChord) {
  const i = Math.floor(frameTimeSec / secondsPerChord);
  if (i < 0 || i >= progression.length) return -1;
  const c = progression[i];
  return c.root * 2 + (c.quality === 'min' ? 1 : 0);
}
