export const WORLD = 1600;
export const N = 160;
export const CELL = WORLD / N;
export const HN = N + 1;

export const MODEL = { ROCK: 0, GRASS: 1, BRUSH: 2, TIMBER: 3, WATER: 4 };

// burn: seconds a cell stays alight · heat: how hard it pre-heats neighbours
// ign: how much pre-heating it takes to catch — timber is slow to light and
// slow to let go, grass is the opposite.
export const FUELS = [
  { name: 'rock', fuel: 0.0, burn: 0, heat: 0, ign: 99 },
  { name: 'grass', fuel: 0.45, burn: 7, heat: 1.15, ign: 0.8 },
  { name: 'brush', fuel: 0.75, burn: 16, heat: 0.95, ign: 1.3 },
  { name: 'timber', fuel: 1.0, burn: 30, heat: 0.8, ign: 1.7 },
  { name: 'water', fuel: 0.0, burn: 0, heat: 0, ign: 99 },
];

export const SIM = {
  hz: 8,
  rate: 0.20, // base heat per second pushed into a neighbour
  windK: 0.115, // exponential wind response
  windMax: 6, // ceiling on the wind multiplier
  slopeK: 2.0, // exponential slope response — fire runs uphill
  slopeMax: 4,
  slurryBlock: 24, // ignition threshold multiplier at full coverage
  spotChance: 0.06, // per burning timber cell per second at high wind
  spotMin: 60,
  spotMax: 260,
};

export const PLANE = {
  vMin: 42,
  vMax: 92,
  vStart: 68,
  pitchRate: 0.55,
  rollRate: 1.9,
  rollMax: 1.15,
  capacity: 6000,
  dropRate: 1150,
  scoopRate: 3000,
  scoopAlt: 40,
  scoopSpeed: 62,
  crashAlt: 12,
  warnAlt: 40,
};

export const MISSIONS = [
  {
    id: 'first-light',
    name: 'First Light',
    subtitle: 'Grass and brush · steady wind',
    brief:
      'A lightning strike in the draw, six minutes old. Grass carries fire fast but it dies fast too — get a line across the valley ahead of it and the run stops itself.',
    seed: 20260417,
    relief: 75,
    ridge: 0.15,
    rockFrac: 0.03,
    mix: { grass: 0.5, brush: 0.34, timber: 0.16 },
    lake: { x: -520, z: 380, r: 150 },
    ignitions: [{ x: 180, z: -260 }],
    wind: { dir: 215, speed: 6.5, gust: 1.6 },
    shifts: [],
    towns: [{ x: -230, z: 190, n: 4, spread: 90 }],
    require: 3,
    par: { ha: 30, drops: 6 },
  },
  {
    id: 'ridge-run',
    name: 'Ridge Run',
    subtitle: 'Timber on a steep face · wind shifts once',
    brief:
      'It is below the ridge and climbing. Slope does to a fire what wind does, and this face is steep. The forecast has the wind backing to the north-east in four minutes — whatever is a flank now becomes the head then.',
    seed: 771102,
    relief: 175,
    ridge: 0.85,
    rockFrac: 0.09,
    mix: { grass: 0.14, brush: 0.36, timber: 0.5 },
    lake: { x: 470, z: 470, r: 135 },
    ignitions: [{ x: -240, z: -430 }],
    wind: { dir: 190, speed: 11, gust: 3 },
    shifts: [{ t: 240, dir: 250, speed: 13 }],
    towns: [
      { x: -330, z: 210, n: 5, spread: 105 },
      { x: -580, z: -60, n: 4, spread: 80 },
    ],
    require: 6,
    par: { ha: 38, drops: 10 },
  },
  {
    id: 'emberline',
    name: 'Emberline',
    subtitle: 'Heavy timber · two starts · spotting',
    brief:
      'Two starts, heavy timber, and a wind that will not hold still. At this speed the fire throws embers a quarter of a kilometre — your line will be jumped. Decide now which side of town you are willing to lose.',
    seed: 480931,
    relief: 165,
    ridge: 0.45,
    rockFrac: 0.05,
    mix: { grass: 0.06, brush: 0.26, timber: 0.68 },
    lake: { x: 120, z: 560, r: 140 },
    ignitions: [
      { x: -430, z: -180 },
      { x: -120, z: -430 },
    ],
    wind: { dir: 150, speed: 15, gust: 4.5 },
    shifts: [
      { t: 200, dir: 105, speed: 16 },
      { t: 420, dir: 60, speed: 13 },
    ],
    towns: [{ x: 300, z: 210, n: 22, spread: 165 }],
    require: 14,
    par: { ha: 75, drops: 18 },
  },
];
