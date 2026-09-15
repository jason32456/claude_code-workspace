// A parallel formant synthesiser, ARPAbet in and audio out.
//
// This exists so correctness is audible. A word the model gets right sounds like the
// word; a word it gets wrong is wrong in a way nobody needs a number to grade. That is
// the whole job -- it is not trying to sound good, it is trying to sound *unambiguous*.
//
// Source-filter, written sample by sample rather than as a node graph so the formant
// trajectories can be driven continuously: a voiced impulse train or shaped noise is
// run through three two-pole resonators in parallel, whose centre frequencies glide
// from the previous phone's targets to this one's. Those glides are most of what makes
// speech intelligible -- holding formants steady per phone produces something that
// sounds like a robot reading a table, because that is exactly what it is.

const VOWEL = 'vowel';
const STOP = 'stop';
const FRIC = 'fricative';
const NASAL = 'nasal';
const LIQUID = 'liquid';
const GLIDE = 'glide';
const AFFRIC = 'affricate';
const ASPIRATE = 'aspirate';

// [F1, F2, F3] in Hz. Vowel values are the classic Peterson-Barney measurements.
const V = (f1, f2, f3) => [f1, f2, f3];

export const PHONES = {
  IY: { type: VOWEL, f: V(270, 2290, 3010) },
  IH: { type: VOWEL, f: V(390, 1990, 2550) },
  EH: { type: VOWEL, f: V(530, 1840, 2480) },
  AE: { type: VOWEL, f: V(660, 1720, 2410) },
  AA: { type: VOWEL, f: V(730, 1090, 2440) },
  AO: { type: VOWEL, f: V(570, 840, 2410) },
  UH: { type: VOWEL, f: V(440, 1020, 2240) },
  UW: { type: VOWEL, f: V(300, 870, 2240) },
  AH: { type: VOWEL, f: V(640, 1190, 2390) },
  ER: { type: VOWEL, f: V(490, 1350, 1690) },
  // Diphthongs glide from one target to another inside a single segment.
  AY: { type: VOWEL, f: V(730, 1090, 2440), glideTo: V(340, 2100, 2800) },
  EY: { type: VOWEL, f: V(530, 1840, 2480), glideTo: V(330, 2200, 2900) },
  OY: { type: VOWEL, f: V(570, 840, 2410), glideTo: V(340, 2100, 2800) },
  AW: { type: VOWEL, f: V(730, 1090, 2440), glideTo: V(320, 900, 2250) },
  OW: { type: VOWEL, f: V(570, 900, 2410), glideTo: V(330, 800, 2240) },

  M: { type: NASAL, f: V(250, 1000, 2200) },
  N: { type: NASAL, f: V(250, 1600, 2600) },
  NG: { type: NASAL, f: V(250, 2000, 2800) },

  L: { type: LIQUID, f: V(400, 1000, 2600) },
  R: { type: LIQUID, f: V(400, 1200, 1600) },
  W: { type: GLIDE, f: V(300, 700, 2200) },
  Y: { type: GLIDE, f: V(280, 2200, 3000) },

  P: { type: STOP, f: V(400, 900, 2200), voiced: false },
  B: { type: STOP, f: V(300, 900, 2200), voiced: true },
  T: { type: STOP, f: V(400, 1800, 2600), voiced: false },
  D: { type: STOP, f: V(300, 1800, 2600), voiced: true },
  K: { type: STOP, f: V(400, 2000, 2600), voiced: false },
  G: { type: STOP, f: V(300, 2000, 2600), voiced: true },

  F: { type: FRIC, f: V(1000, 4000, 6500), voiced: false, amp: 0.35 },
  V: { type: FRIC, f: V(1000, 4000, 6500), voiced: true, amp: 0.35 },
  TH: { type: FRIC, f: V(1200, 4500, 7000), voiced: false, amp: 0.3 },
  DH: { type: FRIC, f: V(1200, 4500, 7000), voiced: true, amp: 0.3 },
  S: { type: FRIC, f: V(1500, 5500, 7500), voiced: false, amp: 0.8 },
  Z: { type: FRIC, f: V(1500, 5500, 7500), voiced: true, amp: 0.7 },
  SH: { type: FRIC, f: V(1800, 2600, 4200), voiced: false, amp: 0.9 },
  ZH: { type: FRIC, f: V(1800, 2600, 4200), voiced: true, amp: 0.8 },
  HH: { type: ASPIRATE, f: V(600, 1400, 2500), voiced: false, amp: 0.25 },

  CH: { type: AFFRIC, f: V(1800, 2600, 4200), voiced: false, amp: 0.9 },
  JH: { type: AFFRIC, f: V(1800, 2600, 4200), voiced: true, amp: 0.8 },
};

const BANDWIDTH = [80, 110, 170];

function durationOf(spec, stress) {
  switch (spec.type) {
    case VOWEL: return stress === 1 ? 0.19 : stress === 2 ? 0.15 : 0.11;
    case STOP: return 0.085;
    case AFFRIC: return 0.13;
    case FRIC: return 0.12;
    case NASAL: return 0.09;
    case LIQUID: return 0.085;
    case GLIDE: return 0.075;
    case ASPIRATE: return 0.07;
    default: return 0.1;
  }
}

class Resonator {
  constructor() { this.y1 = 0; this.y2 = 0; }
  step(x, freq, bw, sampleRate) {
    const r = Math.exp((-Math.PI * bw) / sampleRate);
    const theta = (2 * Math.PI * freq) / sampleRate;
    const b = 2 * r * Math.cos(theta);
    const c = -r * r;
    const a = 1 - b - c;
    const y = a * x + b * this.y1 + c * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// Parse "AY1" into a base phone and a stress level.
export function splitPhone(label) {
  const m = /^([A-Z]+)(\d)?$/.exec(label);
  if (!m) return null;
  return { base: m[1], stress: m[2] === undefined ? -1 : Number(m[2]) };
}

export function isKnownPhone(label) {
  const s = splitPhone(label);
  return !!(s && PHONES[s.base]);
}

// Build the segment plan: one entry per phone with its targets, duration and role.
function plan(labels) {
  const out = [];
  for (const label of labels) {
    const s = splitPhone(label);
    if (!s || !PHONES[s.base]) continue;
    const spec = PHONES[s.base];
    out.push({
      label,
      base: s.base,
      stress: s.stress,
      spec,
      duration: durationOf(spec, s.stress),
    });
  }
  return out;
}

export function estimateDuration(labels) {
  return plan(labels).reduce((t, seg) => t + seg.duration, 0.12);
}

// Render to a mono Float32Array.
export function render(labels, { sampleRate = 22050, f0 = 118 } = {}) {
  const segs = plan(labels);
  if (!segs.length) return new Float32Array(0);

  const total = segs.reduce((t, s) => t + s.duration, 0) + 0.08;
  const out = new Float32Array(Math.ceil(total * sampleRate));
  const res = [new Resonator(), new Resonator(), new Resonator()];
  let glottal = 0;
  let phase = 0;
  let cursor = 0;

  // Formants glide from wherever the previous segment ended, which is what carries
  // place of articulation for the consonants -- a stop is mostly its transitions.
  let cur = segs[0].spec.f.slice();
  const nSeg = segs.length;

  for (let si = 0; si < nSeg; si++) {
    const seg = segs[si];
    const n = Math.floor(seg.duration * sampleRate);
    const from = cur.slice();
    const to = seg.spec.glideTo ? seg.spec.f : seg.spec.f;
    const end = seg.spec.glideTo ? seg.spec.glideTo : seg.spec.f;
    const { type } = seg.spec;
    const voiced = type === VOWEL || type === NASAL || type === LIQUID || type === GLIDE
      ? true
      : !!seg.spec.voiced;
    const noisy = type === FRIC || type === AFFRIC || type === ASPIRATE
      || (type === STOP);

    // Falling declination over the word, plus a lift on the stressed vowel.
    const progress = si / Math.max(1, nSeg - 1);
    const pitch = f0 * (1.06 - 0.16 * progress) * (seg.stress === 1 ? 1.1 : 1);

    for (let k = 0; k < n; k++) {
      const t = k / n;
      // Transition into the target over the first 35%, then move toward the glide end.
      const blend = t < 0.35 ? t / 0.35 : 1;
      const f = [0, 0, 0];
      for (let b = 0; b < 3; b++) {
        const target = to[b] + (end[b] - to[b]) * Math.max(0, (t - 0.35) / 0.65);
        f[b] = from[b] + (target - from[b]) * blend;
      }

      let excite = 0;
      if (voiced) {
        phase += pitch / sampleRate;
        if (phase >= 1) {
          phase -= 1;
          glottal = 1;
        }
        // One-pole decay approximates the glottal pulse shape and its spectral tilt.
        glottal *= 0.72;
        excite += glottal * (type === NASAL ? 0.55 : 1);
      }
      if (noisy) {
        let amp = seg.spec.amp === undefined ? 0.5 : seg.spec.amp;
        if (type === STOP) {
          // Silence for the closure, then a burst at release.
          const releaseAt = 0.62;
          amp = t < releaseAt ? 0 : 0.7 * Math.exp(-(t - releaseAt) * 22);
        } else if (type === AFFRIC) {
          amp = t < 0.35 ? 0 : amp;
        }
        excite += (Math.random() * 2 - 1) * amp * 0.6;
      }
      if (type === STOP && voiced && t < 0.62) excite *= 0.25; // voice bar

      let y = 0;
      const gains = [1, 0.7, 0.45];
      for (let b = 0; b < 3; b++) y += gains[b] * res[b].step(excite, f[b], BANDWIDTH[b], sampleRate);

      // Short fades at segment edges suppress the clicks that discontinuities produce.
      let env = 1;
      const edge = Math.min(0.08, 0.5);
      if (t < edge) env = t / edge;
      else if (t > 1 - edge) env = (1 - t) / edge;

      if (cursor < out.length) out[cursor++] = y * env * 0.5;
    }
    cur = end.slice();
  }

  // Normalise so quiet words and loud words are equally gradeable by ear.
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const g = 0.9 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  return out;
}

let ctx = null;
export function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function speak(labels, opts = {}) {
  const ac = audioContext();
  const data = render(labels, { sampleRate: ac.sampleRate, ...opts });
  if (!data.length) return null;
  const buf = ac.createBuffer(1, data.length, ac.sampleRate);
  buf.copyToChannel(data, 0);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(ac.destination);
  src.start();
  return { source: src, data, duration: data.length / ac.sampleRate };
}
