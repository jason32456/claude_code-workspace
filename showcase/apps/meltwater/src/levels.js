// Six seasons. Each one is a valley shape plus the four numbers that make it a
// puzzle: how much earth you may move, how much spoil you start with, how much
// water is coming, and how long it takes to arrive.

const sin = Math.sin;

export const LEVELS = [
  {
    name: 'First Thaw',
    subtitle: 'Season 1 · Aldergill',
    brief:
      'A quiet melt. The water already knows its way down the middle of the valley — your problem is the barley terrace on the east bank, which it has no reason to visit.',
    hint: 'Dig a diversion off the main line high up, where the channel bed still sits above the terrace.',
    seed: 1207,
    work: 1500,
    spoil: 260,
    timber: 0,
    erosion: false,
    melt: { total: 620, duration: 72, shape: 'ramp' },
    valley: {
      drop: 30,
      floor: 1.5,
      grain: 2.0,
      centre: (z) => 52 + 6 * sin(z * 0.045),
      halfWidth: (z) => 22 + z * 0.17,
    },
    shape: [],
    sources: [{ x: 47, z: 1, w: 10, d: 3 }],
    fields: [{ x: 70, z: 62, w: 18, d: 14, need: 16, name: 'Barley terrace' }],
    villages: [{ x: 16, z: 94, w: 22, d: 16, houses: 9, tolerance: 70, name: 'Aldergill' }],
    reservoirs: [],
    bankTarget: 0,
  },

  {
    name: 'Two Mouths',
    subtitle: 'Season 2 · Fennholt',
    brief:
      'One glacier, one spur of rock, two hungry terraces. Whatever you give the west fork, you take from the east — and the village sits at the confluence where both forks meet again.',
    hint: 'Split the flow at the nose of the spur. A levee across half the channel is a cheaper split than two new channels.',
    seed: 4415,
    work: 1900,
    spoil: 300,
    timber: 0,
    erosion: false,
    melt: { total: 950, duration: 80, shape: 'ramp' },
    valley: {
      drop: 31,
      floor: 1.5,
      grain: 1.9,
      centre: () => 62,
      halfWidth: (z) => 24 + z * 0.19,
    },
    shape: [
      { kind: 'ridge', x0: 62, z0: 30, x1: 58, z1: 96, height: 7.5, width: 11, taper: true },
      { kind: 'ridge', x0: 30, z0: 60, x1: 26, z1: 78, height: 2.6, width: 8 },
    ],
    sources: [{ x: 57, z: 1, w: 10, d: 3 }],
    fields: [
      { x: 22, z: 66, w: 16, d: 14, need: 12, name: 'West terrace' },
      { x: 88, z: 62, w: 16, d: 14, need: 12, name: 'East terrace' },
    ],
    villages: [{ x: 50, z: 102, w: 22, d: 15, houses: 10, tolerance: 85, name: 'Fennholt' }],
    reservoirs: [],
    bankTarget: 0,
  },

  {
    name: 'The Basin',
    subtitle: 'Season 3 · Kirn',
    brief:
      'The old tarn above Kirn fills every spring and spills straight down the high street. Wall the lip, bank the water, and take what the terrace needs out of the side.',
    hint: 'A dam holds until the head behind it beats its strength. Give the tarn somewhere else to go before it gets that deep.',
    seed: 8802,
    work: 2100,
    spoil: 340,
    timber: 220,
    erosion: false,
    melt: { total: 1050, duration: 84, shape: 'ramp' },
    valley: {
      drop: 30,
      floor: 1.4,
      grain: 1.8,
      centre: (z) => 58 + 5 * sin(z * 0.05),
      halfWidth: (z) => 25 + z * 0.17,
    },
    shape: [
      { kind: 'basin', x: 58, z: 48, r: 16, depth: 2.1, rim: 0.9 },
      { kind: 'ridge', x0: 88, z0: 34, x1: 96, z1: 70, height: 2.4, width: 9 },
    ],
    sources: [{ x: 53, z: 1, w: 10, d: 3 }],
    fields: [{ x: 74, z: 54, w: 16, d: 13, need: 14, name: 'Kirn terrace' }],
    villages: [{ x: 42, z: 94, w: 24, d: 16, houses: 11, tolerance: 55, name: 'Kirn' }],
    reservoirs: [{ x: 58, z: 48, r: 15, name: 'Kirn tarn' }],
    bankTarget: 240,
  },

  {
    name: 'Terraces',
    subtitle: 'Season 4 · Stairhead',
    brief:
      'Three paddies down one flank, and not enough water to fill them at once. Hold it, then let it down the stair a step at a time.',
    hint: 'Gates open and close with 1–4 during the melt. Fill the top step, close it off, spill to the next.',
    seed: 6621,
    work: 2200,
    spoil: 360,
    timber: 260,
    erosion: false,
    melt: { total: 1150, duration: 92, shape: 'flat' },
    valley: {
      drop: 32,
      floor: 1.4,
      grain: 1.7,
      centre: (z) => 46 + 4 * sin(z * 0.04),
      halfWidth: (z) => 26 + z * 0.16,
    },
    shape: [
      { kind: 'ridge', x0: 96, z0: 20, x1: 92, z1: 100, height: 4.0, width: 10 },
      { kind: 'shelf', rect: { x: 62, z: 28, w: 34, d: 70 }, raise: 0.6, feather: 7 },
    ],
    sources: [{ x: 42, z: 1, w: 10, d: 3 }],
    fields: [
      { x: 70, z: 32, w: 15, d: 12, need: 13, name: 'Top step' },
      { x: 68, z: 56, w: 15, d: 12, need: 13, name: 'Middle step' },
      { x: 66, z: 80, w: 15, d: 12, need: 13, name: 'Low step' },
    ],
    villages: [{ x: 18, z: 92, w: 22, d: 16, houses: 10, tolerance: 60, name: 'Stairhead' }],
    reservoirs: [],
    bankTarget: 0,
  },

  {
    name: 'Soft Ground',
    subtitle: 'Season 5 · Marrow Flats',
    brief:
      'The flats are silt and old moraine. Fast water eats them, and a channel that was perfect at the release is not the channel you have forty seconds later.',
    hint: 'Wide and shallow runs slow, and slow water does not dig. Speed is what widens a channel — and what moves it.',
    seed: 3390,
    work: 2400,
    spoil: 380,
    timber: 180,
    erosion: true,
    melt: { total: 1250, duration: 90, shape: 'ramp' },
    valley: {
      drop: 29,
      floor: 1.3,
      grain: 2.4,
      centre: (z) => 58 + 9 * sin(z * 0.055),
      halfWidth: (z) => 27 + z * 0.15,
    },
    shape: [{ kind: 'ridge', x0: 20, z0: 44, x1: 24, z1: 70, height: 3.0, width: 9 }],
    soft: [{ x: 30, z: 36, w: 70, d: 52, amount: 0.55 }],
    sources: [{ x: 53, z: 1, w: 10, d: 3 }],
    fields: [
      { x: 20, z: 74, w: 16, d: 13, need: 12, name: 'West flat' },
      { x: 84, z: 56, w: 16, d: 13, need: 12, name: 'East flat' },
    ],
    villages: [{ x: 48, z: 100, w: 24, d: 15, houses: 11, tolerance: 55, name: 'Marrow' }],
    reservoirs: [],
    bankTarget: 0,
  },

  {
    name: 'The Big Thaw',
    subtitle: 'Season 6 · Vantwater',
    brief:
      'Two mouths, soft ground, a village in the middle of the floor, and an ice dam up on the shoulder that will let go at some point in the second half. Bank what you can.',
    hint: 'Build for the burst, not for the flow you can see. When it comes it arrives all at once.',
    seed: 9174,
    work: 2800,
    spoil: 420,
    timber: 320,
    erosion: true,
    melt: {
      total: 1750,
      duration: 100,
      shape: 'flat',
      bursts: [{ t: 0.52, dur: 9, volume: 420 }],
    },
    valley: {
      drop: 30,
      floor: 1.3,
      grain: 2.1,
      centre: (z) => 60 + 7 * sin(z * 0.048),
      halfWidth: (z) => 28 + z * 0.15,
    },
    shape: [
      { kind: 'ridge', x0: 60, z0: 26, x1: 56, z1: 62, height: 5.5, width: 10, taper: true },
      { kind: 'basin', x: 96, z: 78, r: 15, depth: 4.5, rim: 1.0 },
    ],
    soft: [{ x: 26, z: 40, w: 76, d: 50, amount: 0.4 }],
    sources: [
      { x: 40, z: 1, w: 9, d: 3, share: 0.55 },
      { x: 76, z: 1, w: 9, d: 3, share: 0.45, burst: true },
    ],
    fields: [
      { x: 16, z: 62, w: 15, d: 13, need: 13, name: 'North croft' },
      { x: 20, z: 88, w: 15, d: 12, need: 13, name: 'South croft' },
      { x: 84, z: 46, w: 15, d: 12, need: 13, name: 'Shoulder croft' },
    ],
    villages: [{ x: 50, z: 74, w: 22, d: 15, houses: 12, tolerance: 45, name: 'Vantwater' }],
    reservoirs: [{ x: 96, z: 78, r: 12, name: 'Shoulder tarn' }],
    bankTarget: 300,
  },
];

// Melt rate in m³/s at time t, normalised so the integral over the season is
// exactly the season's total volume.
export function meltRate(level, t) {
  const m = level.melt;
  const T = m.duration;
  if (t < 0 || t > T) return 0;
  const u = t / T;
  let shape;
  if (m.shape === 'flat') shape = Math.min(1, u * 6) * Math.min(1, (1 - u) * 5);
  else shape = Math.sin(Math.PI * Math.min(1, u ** 0.85)) ** 0.8;
  const mean = m.shape === 'flat' ? 0.86 : 0.68;
  let rate = (m.total / T) * (shape / mean);

  for (const b of m.bursts || []) {
    const start = b.t * T;
    if (t >= start && t <= start + b.dur) {
      const bu = (t - start) / b.dur;
      rate += (b.volume / b.dur) * (Math.sin(Math.PI * bu) ** 0.6 / 0.72);
    }
  }
  return rate;
}

export function burstWindow(level) {
  const m = level.melt;
  if (!m.bursts || !m.bursts.length) return null;
  const b = m.bursts[0];
  return { start: b.t * m.duration, end: b.t * m.duration + b.dur };
}
