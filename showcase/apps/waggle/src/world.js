// Shared by the sim and the renderer: days, patches, terrain and the sun.
// Coordinates: x = east, z = south, y = up, metres. Bearing 0° = north, clockwise.

export const D2R = Math.PI / 180;
export const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
export const wrap360 = (a) => ((a % 360) + 360) % 360;
export const bearingOf = (x, z) => wrap360(Math.atan2(x, -z) / D2R);
export const dirOf = (az) => [Math.sin(az * D2R), -Math.cos(az * D2R)];

// Solar position for a local solar hour. Returns degrees.
export function sunAt(hour, lat, dec) {
  const H = (hour - 12) * 15 * D2R, p = lat * D2R, d = dec * D2R;
  const alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H));
  const A = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(p) - Math.tan(d) * Math.cos(p));
  return { az: wrap360(A / D2R + 180), alt: alt / D2R };
}

function hash(i, j, s) {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, s) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function makeTerrain(day) {
  const { seed, relief, hills } = day.terrain;
  return (x, z) => {
    let h = (vnoise(x / 260, z / 260, seed) - 0.5) * relief + (vnoise(x / 90, z / 90, seed + 7) - 0.5) * relief * 0.25;
    for (const k of hills) {
      const dx = x - k.x, dz = z - k.z;
      h += k.h * Math.exp(-(dx * dx + dz * dz) / (2 * k.r * k.r));
    }
    const r2 = x * x + z * z;
    return h * (1 - Math.exp(-r2 / (2 * 40 * 40)));
  };
}

// q = sugar quality 0..1; cap/regen in forager loads; open = [hourFrom, hourTo]
const P = (o) => ({ cap: 120, regen: 0.6, open: [0, 24], toxic: false, hornet: 0, ...o });

export const DAYS = [
  {
    id: 'meadow', name: 'Spring Meadow', sub: 'April · 48° N', lat: 48, dec: 6,
    start: 10, end: 15, colony: 120, sunUp: true,
    targets: [1200, 2200, 3400],
    terrain: { seed: 11, relief: 14, hills: [{ x: -500, z: 420, h: 24, r: 220 }] },
    intro: 'Taste a flower patch, fly home and dance. Up on the comb is the sun.',
    patches: [
      P({ id: 'dand', name: 'Dandelions', color: '#f4c21c', x: 150, z: -150, r: 34, q: 0.5, cap: 50, regen: 0.12 }),
      P({ id: 'willow', name: 'Pussy willow', color: '#e9e36a', x: -420, z: -190, r: 26, q: 0.8, cap: 90, regen: 0.5, kind: 'tree' }),
      P({ id: 'crocus', name: 'Crocus lawn', color: '#a46ad8', x: -120, z: 300, r: 28, q: 0.7, cap: 50, regen: 0.2, open: [9, 12.5] }),
      P({ id: 'rape', name: 'Oilseed rape', color: '#ffe23a', x: 560, z: 380, r: 80, q: 0.9, cap: 260, regen: 1.3 }),
      P({ id: 'blackthorn', name: 'Blackthorn hedge', color: '#f3f1ea', x: 140, z: 640, r: 40, q: 0.6, cap: 110, regen: 0.6, kind: 'hedge' }),
    ],
  },
  {
    id: 'orchard', name: 'The Orchard', sub: 'May · 51° N', lat: 51, dec: 18,
    start: 8, end: 16, colony: 150, sunUp: false,
    targets: [1800, 3200, 5000],
    terrain: { seed: 23, relief: 18, hills: [{ x: 600, z: -500, h: 30, r: 260 }] },
    intro: 'The apples close at noon. The rape by the road has been sprayed: taste before you dance.',
    patches: [
      P({ id: 'apple', name: 'Apple orchard', color: '#f7d6e0', x: -380, z: -260, r: 70, q: 0.85, cap: 240, regen: 1.2, open: [8, 12], kind: 'tree' }),
      P({ id: 'sprayed', name: 'Oilseed rape (sprayed)', color: '#ffe23a', x: 300, z: 120, r: 70, q: 0.9, cap: 300, regen: 1.5, toxic: true }),
      P({ id: 'clover', name: 'White clover', color: '#f2f2e4', x: 260, z: 520, r: 60, q: 0.7, cap: 200, regen: 1.0 }),
      P({ id: 'phacelia', name: 'Phacelia strip', color: '#8a7ae6', x: -720, z: 560, r: 55, q: 1.0, cap: 220, regen: 1.1 }),
      P({ id: 'hawthorn', name: 'Hawthorn hedge', color: '#fbf6ee', x: 620, z: -420, r: 45, q: 0.75, cap: 150, regen: 0.8, open: [11, 24], kind: 'hedge' }),
      P({ id: 'dand2', name: 'Dandelions', color: '#f4c21c', x: -110, z: 160, r: 26, q: 0.45, cap: 50, regen: 0.12 }),
    ],
  },
  {
    id: 'heath', name: 'Heath in August', sub: 'August · 53° N', lat: 53, dec: 14,
    start: 7, end: 18, colony: 180, sunUp: false,
    targets: [3000, 5200, 7600],
    terrain: { seed: 41, relief: 22, hills: [{ x: -380, z: -1050, h: 95, r: 420 }, { x: 700, z: 300, h: 28, r: 200 }] },
    intro: 'The heather is high and far. The limes bloom from eleven to three. Hornets hunt the bramble.',
    patches: [
      P({ id: 'heather', name: 'Heather moor', color: '#b85fae', x: -360, z: -1120, r: 130, q: 0.85, cap: 520, regen: 2.4 }),
      P({ id: 'lime', name: 'Lime avenue', color: '#d9e57a', x: 560, z: -260, r: 50, q: 1.0, cap: 260, regen: 1.6, open: [11, 15], kind: 'tree' }),
      P({ id: 'bramble', name: 'Bramble thicket', color: '#f0d8e6', x: -330, z: 230, r: 45, q: 0.8, cap: 200, regen: 1.0, hornet: 0.12, kind: 'hedge' }),
      P({ id: 'borage', name: 'Borage patch', color: '#4f7de0', x: 180, z: 240, r: 22, q: 0.75, cap: 50, regen: 0.12 }),
      P({ id: 'sunflower', name: 'Sunflowers', color: '#ffb81c', x: 820, z: 620, r: 90, q: 0.55, cap: 300, regen: 1.4 }),
      P({ id: 'knap', name: 'Knapweed verge', color: '#c056c8', x: -760, z: -180, r: 40, q: 0.65, cap: 140, regen: 0.7 }),
    ],
  },
];
