// Chord templates and Viterbi decoding.
//
// 25 states: 12 major triads, 12 minor triads, and a no-chord state. Sevenths
// and inversions are deliberately absent — every extra template shares more
// notes with the others, so a larger vocabulary makes the confusion worse rather
// than the output richer. 25 states you can trust beats 60 you cannot.

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const NO_CHORD = 24;
export const STATE_COUNT = 25;

// Index convention: root*2 + (minor ? 1 : 0). Matches synth.js truth encoding.
export const chordLabel = (i) =>
  (i === NO_CHORD ? 'N' : `${NAMES[i >> 1]}${i & 1 ? 'm' : ''}`);

export const chordNotes = (i) => {
  if (i === NO_CHORD) return [];
  const root = i >> 1;
  const third = (i & 1) ? 3 : 4;
  return [root, (root + third) % 12, (root + 7) % 12];
};

// Binary triad templates, L2-normalized so cosine similarity is a plain dot
// product. A flat template for no-chord: it wins only when nothing else fits.
const TEMPLATES = (() => {
  const t = [];
  for (let i = 0; i < 24; i++) {
    const v = new Float64Array(12);
    for (const n of chordNotes(i)) v[n] = 1;
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm);
    for (let k = 0; k < 12; k++) v[k] /= norm;
    t.push(v);
  }
  const flat = new Float64Array(12).fill(1 / Math.sqrt(12));
  t.push(flat);
  return t;
})();

export function scoreFrame(chroma) {
  let norm = 0;
  for (const x of chroma) norm += x * x;
  norm = Math.sqrt(norm);
  const out = new Float64Array(STATE_COUNT);
  if (norm <= 1e-9) {
    out[NO_CHORD] = 1;
    return out;
  }
  for (let s = 0; s < STATE_COUNT; s++) {
    let dot = 0;
    for (let k = 0; k < 12; k++) dot += (chroma[k] / norm) * TEMPLATES[s][k];
    out[s] = Math.max(0, dot);
  }
  return out;
}

// Cosine scores turned into a probability distribution. The temperature decides
// how confident a single frame is allowed to be; too sharp and Viterbi cannot
// overrule a bad frame, too flat and the transition prior decides everything.
export function posterior(scores, temperature = 0.09) {
  const out = new Float64Array(STATE_COUNT);
  let max = -Infinity;
  for (const s of scores) max = Math.max(max, s);
  let sum = 0;
  for (let i = 0; i < STATE_COUNT; i++) {
    out[i] = Math.exp((scores[i] - max) / temperature);
    sum += out[i];
  }
  for (let i = 0; i < STATE_COUNT; i++) out[i] /= sum;
  return out;
}

// Distance around the circle of fifths, 0..6. Chords a fifth apart are one step;
// C to F# is six. Real progressions move by small steps far more often than
// large ones, which is the prior the decoder leans on.
function fifthsDistance(a, b) {
  const pos = (pc) => (pc * 7) % 12;
  const d = Math.abs(pos(a) - pos(b));
  return Math.min(d, 12 - d);
}

// Log transition matrix. selfProb should reflect the frame rate: at a 46 ms hop
// and chords lasting ~2 s, a chord persists for ~43 frames, so staying put must
// be overwhelmingly more likely than moving.
export function buildTransitions(selfProb = 0.96) {
  const T = [];
  for (let i = 0; i < STATE_COUNT; i++) {
    const row = new Float64Array(STATE_COUNT);
    let sum = 0;
    for (let j = 0; j < STATE_COUNT; j++) {
      if (i === j) continue;
      let w;
      if (i === NO_CHORD || j === NO_CHORD) {
        w = 0.35;
      } else {
        const d = fifthsDistance(i >> 1, j >> 1);
        // Relative major/minor (same root distance 0, opposite quality) is the
        // single most common move in tonal music after a fifth.
        w = 1 / (1 + d * d) + ((i >> 1) === (j >> 1) ? 0.6 : 0);
      }
      row[j] = w;
      sum += w;
    }
    for (let j = 0; j < STATE_COUNT; j++) {
      row[j] = i === j ? selfProb : (row[j] / sum) * (1 - selfProb);
      row[j] = Math.log(row[j] + 1e-12);
    }
    T.push(row);
  }
  return T;
}

// Viterbi. Returns the decoded path plus the per-frame argmax, so the caller can
// report the difference rather than claim one.
export function viterbi(posteriors, transitions) {
  const n = posteriors.length;
  if (n === 0) return { path: [], argmax: [] };

  const delta = new Float64Array(STATE_COUNT);
  const next = new Float64Array(STATE_COUNT);
  const back = new Uint8Array(n * STATE_COUNT);

  const logObs = (f, s) => Math.log(posteriors[f][s] + 1e-12);

  const uniform = Math.log(1 / STATE_COUNT);
  for (let s = 0; s < STATE_COUNT; s++) delta[s] = uniform + logObs(0, s);

  for (let f = 1; f < n; f++) {
    for (let s = 0; s < STATE_COUNT; s++) {
      let best = -Infinity;
      let bestPrev = 0;
      for (let p = 0; p < STATE_COUNT; p++) {
        const v = delta[p] + transitions[p][s];
        if (v > best) { best = v; bestPrev = p; }
      }
      next[s] = best + logObs(f, s);
      back[f * STATE_COUNT + s] = bestPrev;
    }
    delta.set(next);
  }

  let end = 0;
  for (let s = 1; s < STATE_COUNT; s++) if (delta[s] > delta[end]) end = s;

  const path = new Array(n);
  path[n - 1] = end;
  for (let f = n - 1; f > 0; f--) path[f - 1] = back[f * STATE_COUNT + path[f]];

  const argmax = posteriors.map((p) => {
    let b = 0;
    for (let s = 1; s < STATE_COUNT; s++) if (p[s] > p[b]) b = s;
    return b;
  });

  return { path, argmax };
}

// Collapse a per-frame path into contiguous chord segments for the chart and
// for MIDI. Segments shorter than minFrames are absorbed into their neighbour,
// since a chord lasting 90 ms is a decoding artifact rather than music.
export function segment(path, times, minFrames = 3) {
  if (path.length === 0) return [];
  const raw = [];
  let start = 0;
  for (let i = 1; i <= path.length; i++) {
    if (i === path.length || path[i] !== path[start]) {
      raw.push({ chord: path[start], from: start, to: i });
      start = i;
    }
  }

  const merged = [];
  for (const seg of raw) {
    const len = seg.to - seg.from;
    const prev = merged[merged.length - 1];
    if (len < minFrames && prev) {
      prev.to = seg.to;
    } else if (prev && prev.chord === seg.chord) {
      prev.to = seg.to;
    } else {
      merged.push({ ...seg });
    }
  }

  const dt = times.length > 1 ? times[1] - times[0] : 0;
  return merged.map((s) => ({
    chord: s.chord,
    label: chordLabel(s.chord),
    startTime: times[s.from],
    endTime: (times[s.to - 1] ?? times[times.length - 1]) + dt,
  }));
}

export function accuracy(path, truth) {
  let correct = 0;
  let counted = 0;
  for (let i = 0; i < path.length; i++) {
    if (truth[i] < 0) continue;
    counted++;
    if (path[i] === truth[i]) correct++;
  }
  return counted === 0 ? 0 : correct / counted;
}
