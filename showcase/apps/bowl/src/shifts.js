// Car types, blocks and the three shifts. Everything random is seeded.

export function rng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.gauss = () => {
    const u = Math.max(1e-9, r()), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return r;
}

// len m, tare t, payload t, CdA m², height m
export const TYPES = {
  hopper:   { len: 16.5, tare: 30, load: 100, cda: 8,  h: 3.7, letter: 'H' },
  tank:     { len: 18.0, tare: 32, load: 88,  cda: 7,  h: 3.4, letter: 'T' },
  box:      { len: 19.0, tare: 34, load: 64,  cda: 10, h: 4.3, letter: 'B' },
  autorack: { len: 27.5, tare: 50, load: 24,  cda: 15, h: 5.6, letter: 'A' },
};

export const BLOCKS = [
  { id: 'CHI', name: 'Chicago',     color: '#e8b130' },
  { id: 'MEM', name: 'Memphis',     color: '#3fa7d6' },
  { id: 'KCY', name: 'Kansas City', color: '#d6453f' },
  { id: 'DEN', name: 'Denver',      color: '#7bc96f' },
  { id: 'PIT', name: 'Pittsburgh',  color: '#b07cd8' },
  { id: 'HOU', name: 'Houston',     color: '#f07f3c' },
];
export const blockById = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));

export const SHIFTS = [
  {
    name: 'First Shift',
    blurb: 'Mild and calm. One train, five blocks, an empty bowl. Learn what a free roller and a stiff one look like on the radar.',
    seed: 11,
    temp: 12, windMean: 0, gust: 0, night: false,
    trains: [26],
    blocks: ['CHI', 'MEM', 'KCY', 'DEN', 'PIT'],
    weights: [1, 1, 1, 1, 1],
    assign: { 1: 'CHI', 2: 'MEM', 3: 'KCY', 4: 'DEN', 5: 'PIT' },
    mix: { hopper: 3, tank: 2, box: 4, autorack: 1 },
    loaded: 0.5,
    standing: [],
    hump: 0.9,
    deadline: 900,
    assist: true,
  },
  {
    name: 'Cold Snap',
    blurb: '−16 °C stiffens every bearing and a light headwind leans on the empties. Chicago is bigger than track 3 — open an overflow before it fouls.',
    seed: 23,
    temp: -16, windMean: -3, gust: 1.2, night: false,
    trains: [26, 26],
    blocks: ['CHI', 'MEM', 'KCY', 'DEN', 'PIT', 'HOU'],
    weights: [3.2, 1, 1, 1, 1, 1],
    assign: { 0: 'HOU', 3: 'CHI', 2: 'MEM', 4: 'KCY', 5: 'DEN', 6: 'PIT' },
    mix: { hopper: 4, tank: 3, box: 3, autorack: 1 },
    loaded: 0.6,
    standing: [
      { track: 3, block: 'CHI', cars: 6, front: 560 },
      { track: 5, block: 'DEN', cars: 3, front: 600 },
      { track: 2, block: 'MEM', cars: 3, front: 520 },
    ],
    hump: 1.0,
    deadline: 1500,
    assist: true,
  },
  {
    name: 'Night Wind',
    blurb: 'A headwind gusting 8–14 m/s down the yard, empties and autoracks, a crowded bowl and two spare tracks. The radar can only tell you what the wind was doing a moment ago.',
    seed: 37,
    temp: 4, windMean: -11, gust: 3, night: true,
    trains: [24, 26, 22],
    blocks: ['CHI', 'MEM', 'KCY', 'DEN', 'PIT', 'HOU'],
    weights: [1.3, 1, 1.2, 1, 1, 1],
    assign: { 1: 'HOU', 2: 'CHI', 3: 'KCY', 4: 'MEM', 5: 'DEN', 6: 'PIT' },
    mix: { hopper: 2, tank: 2, box: 4, autorack: 3 },
    loaded: 0.35,
    standing: [
      { track: 2, block: 'CHI', cars: 6, front: 600 },
      { track: 3, block: 'KCY', cars: 7, front: 640 },
      { track: 4, block: 'MEM', cars: 4, front: 630 },
      { track: 6, block: 'PIT', cars: 4, front: 560 },
      { track: 1, block: 'HOU', cars: 3, front: 560 },
    ],
    hump: 1.0,
    deadline: 2300,
    assist: false,
  },
];

let carSeq = 0;
export const resetCars = () => { carSeq = 0; };
function pick(r, weights) {
  const tot = weights.reduce((a, b) => a + b, 0);
  let x = r() * tot;
  for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) < 0) return i;
  return weights.length - 1;
}

export function makeCar(r, shift, block) {
  const types = Object.keys(shift.mix);
  const type = types[pick(r, types.map((t) => shift.mix[t]))];
  const T = TYPES[type];
  const loaded = r() < shift.loaded;
  const fill = loaded ? 0.75 + 0.25 * r() : 0;
  // Bearing condition dominates: most cars are average, some free, some stiff.
  const roll = r();
  let rr = roll < 0.2 ? 0.0012 + 0.0005 * r() : roll < 0.8 ? 0.0018 + 0.0010 * r() : 0.0030 + 0.0015 * r();
  if (!loaded) rr += 0.0005;
  const hue = r();
  return {
    id: ++carSeq,
    type, block, loaded,
    len: T.len,
    mass: (T.tare + T.load * fill) * 1000,
    rr,
    cda: T.cda * (loaded || type !== 'autorack' ? 1 : 1.1),
    paint: hue,
    num: 100000 + Math.floor(r() * 899999),
  };
}

// A train is a list of cuts; each cut is 1–4 consecutive cars for one block.
export function makeTrain(r, shift, n) {
  const cuts = [];
  let left = n, last = -1;
  while (left > 0) {
    let b;
    do b = pick(r, shift.weights); while (b === last && shift.blocks.length > 1);
    last = b;
    const size = Math.min(left, [1, 1, 1, 1, 2, 2, 2, 3, 3, 4][Math.floor(r() * 10)]);
    const block = shift.blocks[b];
    const cars = [];
    for (let i = 0; i < size; i++) cars.push(makeCar(r, shift, block));
    cuts.push({ block, cars, plan: null, manual: false });
    left -= size;
  }
  return cuts;
}
