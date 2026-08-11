import { STEPS, emptyPattern } from './state.js';

/**
 * Each track gets a 16-long weight vector — the chance that step carries a hit.
 * Weights encode the genre's feel far more legibly than a hand-written pattern,
 * and re-rolling gives variations that still sound like the genre.
 */
export const GENRES = {
  house: {
    name: 'House',
    bpm: [122, 126],
    swing: [0.03, 0.14],
    scale: 'minorPent',
    tracks: {
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0.2],
      clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      chat: [0.25, 0.1, 0.75, 0.1, 0.25, 0.1, 0.75, 0.15, 0.25, 0.1, 0.75, 0.1, 0.25, 0.15, 0.75, 0.35],
      ohat: [0, 0, 0.85, 0, 0, 0, 0.5, 0, 0, 0, 0.85, 0, 0, 0, 0.6, 0.15],
      rim: [0, 0.15, 0, 0, 0, 0.2, 0, 0.1, 0, 0.15, 0, 0, 0, 0.25, 0, 0.1],
      bell: [0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0],
    },
    bass: [0.9, 0, 0.3, 0.5, 0.15, 0, 0.5, 0.2, 0.85, 0, 0.3, 0.5, 0.15, 0.2, 0.5, 0.3],
    lead: [0.3, 0, 0.1, 0.15, 0.25, 0, 0.15, 0.1, 0.3, 0, 0.1, 0.2, 0.25, 0.1, 0.2, 0.15],
  },
  techno: {
    name: 'Techno',
    bpm: [130, 138],
    swing: [0, 0.06],
    scale: 'phrygian',
    tracks: {
      kick: [1, 0, 0, 0.1, 1, 0, 0, 0.1, 1, 0, 0, 0.1, 1, 0, 0, 0.25],
      snare: [0, 0, 0, 0, 0.35, 0, 0, 0, 0, 0, 0, 0, 0.45, 0, 0, 0],
      chat: [0.15, 0.6, 0.3, 0.6, 0.15, 0.6, 0.3, 0.6, 0.15, 0.6, 0.3, 0.6, 0.15, 0.6, 0.35, 0.7],
      ohat: [0, 0, 0.7, 0, 0, 0, 0.3, 0, 0, 0, 0.7, 0, 0, 0, 0.45, 0.2],
      rim: [0, 0.2, 0, 0.15, 0, 0.2, 0, 0.15, 0, 0.2, 0, 0.15, 0, 0.3, 0, 0.2],
      tom: [0, 0, 0, 0, 0, 0, 0.15, 0, 0, 0, 0, 0, 0, 0, 0.2, 0],
    },
    bass: [0.95, 0.2, 0.6, 0.2, 0.9, 0.2, 0.6, 0.2, 0.95, 0.2, 0.6, 0.2, 0.9, 0.2, 0.6, 0.35],
    lead: [0.15, 0.05, 0.1, 0.05, 0.15, 0.05, 0.1, 0.05, 0.15, 0.05, 0.1, 0.05, 0.2, 0.1, 0.15, 0.1],
  },
  trap: {
    name: 'Trap',
    bpm: [68, 78],
    swing: [0, 0.1],
    scale: 'minor',
    tracks: {
      kick: [1, 0, 0.15, 0.35, 0, 0, 0.5, 0.2, 0.3, 0, 0.15, 0.4, 0, 0.2, 0.35, 0.15],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.2, 0],
      clap: [0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0, 0, 0.15, 0],
      chat: [0.9, 0.5, 0.9, 0.55, 0.9, 0.5, 0.95, 0.7, 0.9, 0.5, 0.9, 0.55, 0.9, 0.6, 0.95, 0.8],
      ohat: [0, 0, 0, 0, 0, 0, 0.25, 0, 0, 0, 0, 0, 0, 0, 0.35, 0],
      bell: [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 0, 0, 0.15, 0, 0, 0, 0.1],
    },
    bass: [0.95, 0, 0, 0.25, 0, 0, 0.55, 0, 0.7, 0, 0, 0.3, 0, 0, 0.45, 0.2],
    lead: [0.35, 0, 0.15, 0, 0.3, 0.1, 0.15, 0, 0.35, 0, 0.15, 0.1, 0.3, 0, 0.2, 0.15],
  },
  breaks: {
    name: 'Breaks',
    bpm: [148, 172],
    swing: [0, 0.12],
    scale: 'dorian',
    tracks: {
      kick: [1, 0, 0, 0.3, 0, 0, 0.6, 0, 0, 0.35, 0, 0, 0.5, 0, 0.25, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0.2, 0, 0, 0.3, 0, 1, 0, 0.25, 0.3],
      chat: [0.7, 0.35, 0.6, 0.35, 0.7, 0.35, 0.6, 0.4, 0.7, 0.35, 0.6, 0.35, 0.7, 0.4, 0.6, 0.5],
      ohat: [0, 0, 0.5, 0, 0, 0, 0.35, 0, 0, 0, 0.5, 0, 0, 0, 0.4, 0.2],
      tom: [0, 0, 0, 0, 0, 0.15, 0, 0, 0, 0.2, 0, 0, 0, 0.15, 0, 0.2],
      rim: [0, 0.2, 0, 0, 0, 0.15, 0, 0.2, 0, 0.15, 0, 0, 0, 0.2, 0, 0.15],
    },
    bass: [0.85, 0, 0.35, 0.4, 0, 0.25, 0.5, 0, 0.7, 0, 0.35, 0.4, 0, 0.3, 0.5, 0.25],
    lead: [0.25, 0.1, 0.2, 0.1, 0.25, 0.1, 0.2, 0.15, 0.25, 0.1, 0.2, 0.1, 0.3, 0.15, 0.25, 0.2],
  },
  lofi: {
    name: 'Lo-Fi',
    bpm: [78, 92],
    swing: [0.24, 0.42],
    scale: 'dorian',
    tracks: {
      kick: [1, 0, 0, 0.2, 0, 0, 0.35, 0, 0.6, 0, 0, 0.25, 0, 0, 0.3, 0],
      snare: [0, 0, 0, 0, 0.9, 0, 0, 0.15, 0, 0, 0, 0, 0.9, 0, 0.2, 0.15],
      chat: [0.6, 0.25, 0.55, 0.25, 0.6, 0.25, 0.55, 0.3, 0.6, 0.25, 0.55, 0.25, 0.6, 0.3, 0.55, 0.35],
      ohat: [0, 0, 0.35, 0, 0, 0, 0.25, 0, 0, 0, 0.35, 0, 0, 0, 0.3, 0.15],
      rim: [0, 0.2, 0, 0.15, 0, 0.2, 0, 0.15, 0, 0.25, 0, 0.15, 0, 0.2, 0, 0.2],
    },
    bass: [0.85, 0, 0.2, 0.35, 0, 0.2, 0.45, 0, 0.65, 0, 0.2, 0.35, 0, 0.25, 0.4, 0.2],
    lead: [0.4, 0.1, 0.2, 0.15, 0.35, 0.1, 0.25, 0.15, 0.4, 0.1, 0.2, 0.15, 0.35, 0.15, 0.3, 0.2],
  },
};

const STRONG = new Set([0, 4, 8, 12]);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function velocityFor(step, weight) {
  if (STRONG.has(step) && weight > 0.6) return 2;
  if (weight < 0.3) return Math.random() < 0.6 ? 0 : 1;
  return Math.random() < 0.15 ? 2 : 1;
}

function probabilityFor(weight) {
  if (weight > 0.7) return 0;
  if (Math.random() < 0.25) return weight < 0.3 ? 2 : 1;
  return 0;
}

/** Walks a short motif so the bassline moves instead of hammering one note. */
function makeMotif(length) {
  const shapes = [
    [0, 0, 2, 3],
    [0, 3, 2, 0],
    [0, 0, 0, 4],
    [0, 2, 0, 1],
    [0, 5, 3, 2],
    [0, 0, 1, 3],
  ];
  const shape = pick(shapes);
  return Array.from({ length }, (_, i) => shape[i % shape.length]);
}

export function generatePattern(project, genreKey, { drums = true, melody = true } = {}) {
  const genre = GENRES[genreKey] || GENRES.house;
  const pattern = emptyPattern();
  const previous = project.patterns[project.patternIndex];

  if (!drums) {
    for (const id of Object.keys(pattern.tracks)) {
      if (id !== 'bass' && id !== 'lead') pattern.tracks[id] = previous.tracks[id];
    }
  } else {
    for (const [id, weights] of Object.entries(genre.tracks)) {
      const lane = pattern.tracks[id];
      for (let i = 0; i < STEPS; i++) {
        const w = weights[i];
        if (w > 0 && Math.random() < w) {
          lane[i] = { on: true, v: velocityFor(i, w), p: probabilityFor(w), d: 0 };
        }
      }
    }
  }

  if (!melody) {
    pattern.tracks.bass = previous.tracks.bass;
    pattern.tracks.lead = previous.tracks.lead;
  } else {
    const motif = makeMotif(8);
    let m = 0;
    for (let i = 0; i < STEPS; i++) {
      const w = genre.bass[i];
      if (w > 0 && Math.random() < w) {
        pattern.tracks.bass[i] = {
          on: true,
          v: STRONG.has(i) ? 2 : 1,
          p: 0,
          d: motif[m++ % motif.length],
        };
      }
    }
    const leadPool = [4, 5, 7, 9, 10, 11];
    for (let i = 0; i < STEPS; i++) {
      const w = genre.lead[i];
      if (w > 0 && Math.random() < w * 0.7) {
        pattern.tracks.lead[i] = {
          on: true,
          v: Math.random() < 0.3 ? 2 : 1,
          p: Math.random() < 0.4 ? 1 : 0,
          d: pick(leadPool),
        };
      }
    }
  }

  return { pattern, genre };
}

export function applyGenre(project, genreKey, options) {
  const { pattern, genre } = generatePattern(project, genreKey, options);
  project.patterns[project.patternIndex] = pattern;
  project.bpm = Math.round(rand(genre.bpm[0], genre.bpm[1]));
  project.swing = Number(rand(genre.swing[0], genre.swing[1]).toFixed(2));
  project.key.scale = genre.scale;
  return genre;
}
