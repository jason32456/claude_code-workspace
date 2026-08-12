import { ALL_TRACKS, DRUM_TRACKS, SYNTH_TRACKS, kitParams } from './kits.js';

export const STEPS = 16;
export const PATTERN_COUNT = 4;
export const PATTERN_NAMES = ['A', 'B', 'C', 'D'];

export const VEL_LEVELS = [0.42, 0.78, 1.0];
export const VEL_NAMES = ['ghost', 'normal', 'accent'];
export const PROB_LEVELS = [1, 0.75, 0.5, 0.25];

export const DELAY_DIVS = {
  '1/16': 0.25,
  '1/8': 0.5,
  '1/8.': 0.75,
  '1/4': 1,
};

export function emptyStep() {
  return { on: false, v: 1, p: 0, d: 0 };
}

export function emptyPattern() {
  const tracks = {};
  for (const t of ALL_TRACKS) {
    tracks[t.id] = Array.from({ length: STEPS }, emptyStep);
  }
  return { tracks };
}

// Levels are set so the kick does not swamp the mix: a sine kick carries far more
// energy per hit than a band-passed tick, so the drums above it start much louder
// than their peak amplitudes would suggest.
const DEFAULT_MIX = {
  kick: { vol: 0.8, pan: 0, delay: 0, reverb: 0.03 },
  snare: { vol: 1.05, pan: 0, delay: 0.08, reverb: 0.22 },
  clap: { vol: 0.95, pan: 0.08, delay: 0.1, reverb: 0.28 },
  chat: { vol: 0.9, pan: -0.18, delay: 0.05, reverb: 0.1 },
  ohat: { vol: 0.75, pan: 0.2, delay: 0.08, reverb: 0.16 },
  tom: { vol: 0.8, pan: -0.25, delay: 0.12, reverb: 0.2 },
  rim: { vol: 0.85, pan: 0.3, delay: 0.22, reverb: 0.18 },
  bell: { vol: 0.75, pan: -0.3, delay: 0.25, reverb: 0.2 },
  bass: { vol: 0.68, pan: 0, delay: 0.03, reverb: 0.05 },
  lead: { vol: 0.85, pan: 0.05, delay: 0.3, reverb: 0.3 },
};

export function createProject() {
  const mix = {};
  for (const t of ALL_TRACKS) mix[t.id] = { ...DEFAULT_MIX[t.id], mute: false, solo: false };
  return {
    v: 1,
    bpm: 112,
    swing: 0.16,
    kit: '808',
    key: { root: 9, scale: 'minorPent' },
    patternIndex: 0,
    songMode: false,
    song: [0, 0, 1, 0],
    selected: 'kick',
    melodic: 'bass',
    mix,
    voice: kitParams('808'),
    fx: {
      filter: 18000,
      drive: 0.14,
      delayDiv: '1/8.',
      delayFb: 0.34,
      delayMix: 0.2,
      reverbSize: 2.1,
      reverbMix: 0.18,
      master: 0.95,
    },
    patterns: Array.from({ length: PATTERN_COUNT }, emptyPattern),
  };
}

/** `spec` maps track id → step list; a number is a plain hit, `[step, vel, prob, deg]` is detailed. */
function writePattern(pattern, spec) {
  for (const [id, hits] of Object.entries(spec)) {
    const lane = pattern.tracks[id];
    if (!lane) continue;
    for (const hit of hits) {
      const [i, v = 1, p = 0, d = 0] = Array.isArray(hit) ? hit : [hit];
      lane[i] = { on: true, v, p, d };
    }
  }
}

export function loadDemo(project) {
  writePattern(project.patterns[0], {
    kick: [[0, 2], 4, [8, 2], 12, [14, 0, 1]],
    clap: [[4, 1], [12, 1]],
    chat: [[2, 0], [3, 0, 2], [6, 1], [10, 0], [11, 0, 1], [14, 1]],
    ohat: [[7, 1], [15, 0]],
    rim: [[6, 0, 2], [13, 0, 1]],
    bass: [
      [0, 2, 0, 0], [3, 1, 0, 0], [6, 1, 0, 2], [8, 2, 0, 3],
      [11, 1, 0, 2], [14, 1, 0, 1],
    ],
    lead: [[8, 1, 1, 7], [10, 0, 1, 9], [12, 1, 2, 10]],
  });

  writePattern(project.patterns[1], {
    kick: [[0, 2], [6, 1], [8, 2], [10, 0, 1], 12],
    snare: [[4, 2], [12, 2]],
    chat: [0, 2, [4, 0], 6, 8, 10, [12, 0], 14],
    ohat: [[3, 1], [11, 1]],
    bell: [[5, 0, 2], [13, 0, 2]],
    bass: [
      [0, 2, 0, 3], [2, 1, 0, 3], [5, 1, 0, 5], [8, 2, 0, 4],
      [10, 1, 0, 2], [13, 1, 0, 0],
    ],
    lead: [[0, 1, 1, 9], [4, 1, 1, 7], [9, 0, 2, 11], [14, 1, 1, 8]],
  });

  return project;
}

export function activePattern(project) {
  return project.patterns[project.patternIndex];
}

export function trackDef(id) {
  return ALL_TRACKS.find((t) => t.id === id);
}

export function isMelodic(id) {
  return SYNTH_TRACKS.some((t) => t.id === id);
}

export function audibleTracks(project) {
  const soloed = ALL_TRACKS.filter((t) => project.mix[t.id].solo);
  if (soloed.length) return new Set(soloed.map((t) => t.id));
  return new Set(ALL_TRACKS.filter((t) => !project.mix[t.id].mute).map((t) => t.id));
}

export function clearPattern(project, index) {
  project.patterns[index] = emptyPattern();
}

export function copyPattern(project, from, to) {
  project.patterns[to] = JSON.parse(JSON.stringify(project.patterns[from]));
}

// ---------------------------------------------------------------------------
// Compact serialization. Two base64url chars per step keeps a full 4-pattern
// project short enough to survive being pasted into a chat window.
// ---------------------------------------------------------------------------

const A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encodeLane(lane) {
  let out = '';
  for (const s of lane) {
    out += A64[s.on ? 1 + s.v + s.p * 3 : 0];
    out += A64[Math.min(63, s.d)];
  }
  return out;
}

function decodeLane(str) {
  const lane = Array.from({ length: STEPS }, emptyStep);
  for (let i = 0; i < STEPS; i++) {
    const c1 = A64.indexOf(str[i * 2]);
    const c2 = A64.indexOf(str[i * 2 + 1]);
    if (c1 < 0 || c2 < 0) continue;
    if (c1 > 0) {
      const n = c1 - 1;
      lane[i] = { on: true, v: n % 3, p: Math.floor(n / 3), d: Math.max(0, c2) };
    }
  }
  return lane;
}

export function serialize(project) {
  const pats = project.patterns.map((pat) => {
    const lanes = {};
    for (const t of ALL_TRACKS) lanes[t.id] = encodeLane(pat.tracks[t.id]);
    return lanes;
  });
  return {
    v: 1,
    bpm: project.bpm,
    swing: project.swing,
    kit: project.kit,
    key: project.key,
    song: project.song,
    songMode: project.songMode,
    patternIndex: project.patternIndex,
    mix: project.mix,
    voice: project.voice,
    fx: project.fx,
    pats,
  };
}

const num = (val, fallback, lo, hi) =>
  typeof val === 'number' && Number.isFinite(val) ? Math.min(hi, Math.max(lo, val)) : fallback;

export function deserialize(raw) {
  const project = createProject();
  if (!raw || typeof raw !== 'object') return project;

  project.bpm = num(raw.bpm, project.bpm, 40, 240);
  project.swing = num(raw.swing, project.swing, 0, 0.7);
  if (typeof raw.kit === 'string') project.kit = raw.kit;
  if (raw.key && typeof raw.key === 'object') {
    project.key = {
      root: num(raw.key.root, 9, 0, 11),
      scale: typeof raw.key.scale === 'string' ? raw.key.scale : 'minorPent',
    };
  }
  if (Array.isArray(raw.song) && raw.song.length) {
    project.song = raw.song
      .map((n) => num(n, 0, 0, PATTERN_COUNT - 1))
      .slice(0, 16)
      .map(Math.round);
  }
  project.songMode = !!raw.songMode;
  project.patternIndex = Math.round(num(raw.patternIndex, 0, 0, PATTERN_COUNT - 1));

  for (const t of ALL_TRACKS) {
    const m = raw.mix && raw.mix[t.id];
    if (m) {
      Object.assign(project.mix[t.id], {
        vol: num(m.vol, project.mix[t.id].vol, 0, 1.4),
        pan: num(m.pan, project.mix[t.id].pan, -1, 1),
        delay: num(m.delay, project.mix[t.id].delay, 0, 1),
        reverb: num(m.reverb, project.mix[t.id].reverb, 0, 1),
        mute: !!m.mute,
        solo: !!m.solo,
      });
    }
    const v = raw.voice && raw.voice[t.id];
    if (v && typeof v === 'object') Object.assign(project.voice[t.id], v);
  }
  if (raw.fx && typeof raw.fx === 'object') Object.assign(project.fx, raw.fx);

  if (Array.isArray(raw.pats)) {
    raw.pats.slice(0, PATTERN_COUNT).forEach((lanes, i) => {
      if (!lanes) return;
      for (const t of ALL_TRACKS) {
        if (typeof lanes[t.id] === 'string') {
          project.patterns[i].tracks[t.id] = decodeLane(lanes[t.id]);
        }
      }
    });
  }
  return project;
}

export { DRUM_TRACKS, SYNTH_TRACKS, ALL_TRACKS };
