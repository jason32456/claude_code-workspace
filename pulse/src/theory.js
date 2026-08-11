export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES = {
  minorPent: { name: 'Minor Pentatonic', steps: [0, 3, 5, 7, 10] },
  minor: { name: 'Natural Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  major: { name: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  majorPent: { name: 'Major Pentatonic', steps: [0, 2, 4, 7, 9] },
  blues: { name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
};

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi) {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/** Ascending list of `count` midi notes drawn from a scale, starting at rootMidi. */
export function scaleLadder(rootMidi, scaleKey, count) {
  const steps = (SCALES[scaleKey] || SCALES.minorPent).steps;
  const out = [];
  for (let i = 0; i < count; i++) {
    const octave = Math.floor(i / steps.length);
    out.push(rootMidi + octave * 12 + steps[i % steps.length]);
  }
  return out;
}

/**
 * Bjorklund's algorithm — spread `pulses` as evenly as possible across `steps`.
 * The classic Euclidean rhythms: (3,8) is the tresillo, (5,8) the cinquillo.
 */
export function euclid(pulses, steps, rotate = 0) {
  const k = Math.max(0, Math.min(pulses, steps));
  if (k === 0) return new Array(steps).fill(false);
  if (k === steps) return new Array(steps).fill(true);

  let a = new Array(k).fill(null).map(() => [true]);
  let b = new Array(steps - k).fill(null).map(() => [false]);

  while (b.length > 1) {
    const pairs = Math.min(a.length, b.length);
    const merged = [];
    for (let i = 0; i < pairs; i++) merged.push(a[i].concat(b[i]));
    const restA = a.slice(pairs);
    const restB = b.slice(pairs);
    const remainder = restA.length ? restA : restB;
    if (!remainder.length) { a = merged; b = []; break; }
    a = merged;
    b = remainder;
  }

  const flat = a.concat(b).flat();
  const r = ((rotate % steps) + steps) % steps;
  return flat.map((_, i) => flat[(i + r) % steps]);
}
