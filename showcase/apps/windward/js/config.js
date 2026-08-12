export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const GRAVITY = 9.81;

export const BOAT = {
  length: 6.4,
  beam: 2.1,
  mass: 780,
  sailArea: 21.5,
  rigHeight: 7.6,

  // Aerodynamics. Lift peaks at ALPHA_OPT and decays to zero by 90 degrees,
  // where the sail is a pure drag device — which is exactly how a run works.
  clMax: 1.55,
  alphaOpt: 20,
  cd0: 0.09,
  cdAlpha: 1.75,
  cdFlog: 0.7,
  trimMin: 9,

  // Hydrodynamics. Lateral resistance is an order of magnitude above forward
  // drag; the gap between them is what leeway is made of.
  dragFwd: 10.2,
  dragSide: 6800,
  hullSpeed: 9.9,
  wavePenalty: 5.2,

  rudderRate: 2.6,
  rudderMax: 34,
  rudderReturn: 3.4,
  turnGain: 0.95,
  weatherHelm: 0.16,

  // Newtons of side force per radian of heel, and the newtons a hiking crew
  // cancels outright before any heel develops.
  heelStiffness: 3100,
  hikeRelief: 950,
  heelSpill: 20,
  heelSpillRate: 0.026,
  hikeDrain: 26,
  hikeRecover: 17,

  trimRate: 46,
  surfGain: 5.4,
};

export const WIND = {
  baseSpeed: 8.2,
  baseFrom: 0,            // radians; direction the wind blows FROM
  shiftAmp: 8 * DEG,
  shiftPeriodA: 47,
  shiftPeriodB: 29,
  gustCount: 8,
  gustRadiusMin: 34,
  gustRadiusMax: 78,
  gustStrengthMin: 1.24,
  gustStrengthMax: 1.62,
  lullStrength: 0.72,
  gustDriftMul: 0.36,
  gustBias: 7 * DEG,
  fieldSize: 620,
  noGo: 36,
};

// Deep-water Gerstner set. Evaluated identically on GPU and CPU so the boat
// floats on the surface it is actually drawn on.
export const WAVES = [
  { dir: -0.22, len: 64, steep: 0.105, phase: 0.0 },
  { dir: 0.55, len: 31, steep: 0.088, phase: 1.7 },
  { dir: -1.02, len: 17.5, steep: 0.062, phase: 3.4 },
  { dir: 2.15, len: 8.5, steep: 0.042, phase: 5.1 },
];

export const RACE = {
  laps: 3,
  roundRadius: 20,
  hitRadius: 3.5,
  penaltySeconds: 2.0,
  courseScale: 1,
};

export const RIVALS = [
  { name: 'AZURE', color: 0x4bd6ff, trimError: 2.5, laylineSlop: 6, gustSeek: 46, tackLoss: 0.86, reaction: 0.9 },
  { name: 'EMBER', color: 0xff8a4b, trimError: 5.0, laylineSlop: 13, gustSeek: 26, tackLoss: 0.8, reaction: 1.5 },
  { name: 'VERDE', color: 0x8ce86b, trimError: 8.0, laylineSlop: 21, gustSeek: 12, tackLoss: 0.74, reaction: 2.2 },
];

export const PLAYER_COLOR = 0xffd76b;
