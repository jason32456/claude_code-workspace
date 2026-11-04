// Flights, terrain, fields, atmosphere and the wind field. Pure functions so the
// sim, the bot, the bench and the renderer all agree on the same world.
// Axes: x east, y up, z south. Bearings are degrees clockwise from north.

export const D2R = Math.PI / 180;
export const HALF = 5000;
export const wrap360 = (a) => ((a % 360) + 360) % 360;
export const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
export const bearingOf = (dx, dz) => wrap360(Math.atan2(dx, -dz) / D2R);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

function hash2(i, j, s = 0) {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z, s = 0) {
  const i = Math.floor(x), j = Math.floor(z), fx = smooth(x - i), fz = smooth(z - j);
  const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz) * 2 - 1;
}
const fbm = (x, z, s, oct = 4) => {
  let v = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { v += a * vnoise(x * f, z * f, s + o * 17); a *= 0.5; f *= 2.03; }
  return v;
};

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Field types. legal = a farmer will not mind you landing there.
export const FIELD = {
  pasture: { id: 0, name: 'pasture', legal: true, col: [104, 150, 74] },
  stubble: { id: 1, name: 'stubble', legal: true, col: [196, 172, 104] },
  fallow: { id: 2, name: 'fallow', legal: true, col: [140, 128, 86] },
  crop: { id: 3, name: 'standing crop', legal: false, pen: 300, col: [150, 168, 60] },
  livestock: { id: 4, name: 'livestock', legal: false, pen: 300, col: [92, 140, 70] },
  wood: { id: 5, name: 'woodland', legal: false, pen: 300, col: [46, 78, 44] },
  water: { id: 6, name: 'water', legal: false, pen: 500, col: [70, 108, 128] },
  village: { id: 7, name: 'village', legal: false, pen: 300, col: [150, 140, 128] },
  marsh: { id: 8, name: 'salt marsh', legal: false, pen: 300, col: [120, 128, 92] },
};
export const FIELDS = Object.values(FIELD);

// Wind keypoints: h = height above launch ground (m), from = bearing the wind
// blows FROM (met convention), spd m/s. `evolve(t)` may return replacements.
export const FLIGHTS = [
  {
    id: 'meadows', name: 'Water Meadows', sub: 'Veering wind',
    intro: 'Low air drifts east-north-east. High air goes south-south-east. Read the ladder and fly the goals in order.',
    clock: 6.5, thermals: 34 * 60, deadline: 42 * 60, surfaceT: 9, inv: { top: 180, dT: 4 },
    launch: [0, 0], seed: 11,
    layers: [
      { h: 0, from: 248, spd: 2.4 }, { h: 120, from: 262, spd: 3.8 }, { h: 300, from: 300, spd: 5 },
      { h: 550, from: 335, spd: 6.2 }, { h: 900, from: 10, spd: 7.5 }, { h: 1500, from: 30, spd: 9 },
    ],
    tasks: [
      { kind: 'JDG', name: 'Goal 1 · the Old Mill', goals: [[1550, -120]] },
      { kind: 'JDG', name: 'Goal 2 · Cross Lanes', goals: [[2700, 1000]] },
    ],
    river: [[-4000, -2600], [-1200, -1500], [600, -700], [1200, 300], [900, 1600], [1700, 3200], [2600, 5000]],
    lines: [[[-2600, 2300], [-400, 2100], [1800, 2500], [4200, 2200]]],
    villages: [[2300, -1700], [-1800, 900], [3900, 600]],
    medals: [800, 1350, 1800],
    terrain: (x, z) => 30 + 14 * fbm(x / 1800, z / 1800, 3),
  },
  {
    id: 'valley', name: 'Hollow Valley', sub: 'Drainage flow, power lines, a waltz',
    intro: 'Cold air is sliding down the valley floor, with a return flow above it. Watch the power lines. The drainage dies once the sun is up.',
    clock: 6.25, thermals: 32 * 60, deadline: 40 * 60, surfaceT: 6, inv: { top: 140, dT: 6 },
    launch: [0, -1800], seed: 23,
    layers: [
      { h: 0, from: 355, spd: 3.2 }, { h: 90, from: 355, spd: 3.0 }, { h: 170, from: 120, spd: 1.2 },
      { h: 260, from: 165, spd: 4.4 }, { h: 520, from: 200, spd: 5.2 }, { h: 800, from: 255, spd: 7.5 }, { h: 1500, from: 270, spd: 10 },
    ],
    evolve(t, layers) {
      const k = clamp((t - 900) / 900, 0, 1);
      if (k <= 0) return layers;
      return layers.map((L, i) => (i < 2 ? { ...L, spd: L.spd * (1 - 0.75 * k), from: L.from + 40 * k } : L));
    },
    tasks: [
      { kind: 'JDG', name: 'Goal 1 · Weir Bridge', goals: [[-150, -300]] },
      { kind: 'HWZ', name: 'Goal 2 · waltz, pick one', goals: [[-900, -1500], [500, -1850], [-200, -2300]] },
      { kind: 'JDG', name: 'Goal 3 · Ridge Farm', goals: [[1150, -3600]] },
    ],
    river: [[60, -5000], [-120, -3000], [120, -1600], [-100, 0], [150, 1800], [0, 5000]],
    lines: [[[-3200, -1000], [-1100, -1100], [1000, -950], [3300, -1100]], [[-2600, -3500], [0, -3350], [2800, -3600]]],
    villages: [[-300, 600], [700, -2600], [-1500, -2600]],
    medals: [1000, 1800, 2500],
    terrain(x, z) {
      const axis = 140 * Math.sin(z / 1400);
      const dx = x - axis;
      const walls = 190 * (1 - Math.exp(-(dx * dx) / (2 * 900 * 900)));
      return 70 - 0.012 * z + walls + 12 * fbm(x / 900, z / 900, 5);
    },
  },
  {
    id: 'saltings', name: 'The Saltings', sub: 'Land breeze, then the sea breeze',
    intro: 'At dawn the low air is going out to sea. Somewhere after a quarter of an hour the sea breeze arrives and reverses it. Do not land in the water.',
    clock: 6.0, thermals: 36 * 60, deadline: 44 * 60, surfaceT: 8, inv: { top: 220, dT: 3 },
    launch: [-400, 400], seed: 37,
    layers: [
      { h: 0, from: 265, spd: 3.0 }, { h: 110, from: 270, spd: 3.4 }, { h: 220, from: 190, spd: 4.2 },
      { h: 480, from: 175, spd: 6.0 }, { h: 750, from: 220, spd: 8.2 }, { h: 1500, from: 240, spd: 11 },
    ],
    evolve(t, layers) {
      const k = clamp((t - 1080) / 300, 0, 1);
      if (k <= 0) return layers;
      const sea = [{ h: 0, from: 90, spd: 4.2 }, { h: 160, from: 100, spd: 3.6 }, { h: 260, from: 150, spd: 3.5 }];
      return layers.map((L, i) => {
        if (i > 2) return L;
        const S = sea[i];
        const d = wrap180(S.from - L.from);
        return { h: lerp(L.h, S.h, k), from: wrap360(L.from + d * k), spd: lerp(L.spd, S.spd, k) };
      });
    },
    tasks: [
      { kind: 'JDG', name: 'Goal 1 · Sluice Gate', goals: [[1500, 300]] },
      { kind: 'HWZ', name: 'Goal 2 · waltz, pick one', goals: [[1500, -2200], [600, -1800], [2300, -1400]] },
      { kind: 'JDG', name: 'Goal 3 · Church Field', goals: [[300, -3900]] },
    ],
    coast: 2600,
    river: [[-5000, 2100], [-2400, 1700], [-200, 1300], [1300, 1100], [2700, 900]],
    lines: [[[-1300, -4200], [-1500, -1200], [-1100, 1800], [-1400, 4600]]],
    villages: [[-2200, -1200], [1300, -3300], [-3200, 2500]],
    medals: [1000, 1900, 2600],
    terrain(x, z) {
      const coast = this.coast + 260 * Math.sin(z / 900) + 120 * vnoise(z / 500, 1, 9);
      const land = 18 + 20 * clamp((coast - x) / 3000, 0, 1) + 7 * fbm(x / 1200, z / 1200, 7);
      const t = clamp((x - coast + 250) / 350, 0, 1);
      return lerp(land, -6, smooth(t));
    },
  },
];

export function makeWorld(F) {
  const T = F.terrain.bind(F);
  const L0 = T(F.launch[0], F.launch[1]);
  const seg = (px, pz, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / l2, 0, 1);
    const ex = a[0] + t * dx - px, ez = a[1] + t * dz - pz;
    return Math.sqrt(ex * ex + ez * ez);
  };
  const riverDist = (x, z) => {
    let d = 1e9;
    for (let i = 0; i < F.river.length - 1; i++) d = Math.min(d, seg(x, z, F.river[i], F.river[i + 1]));
    return d;
  };
  const ground = (x, z) => {
    let h = T(x, z);
    const rd = riverDist(x, z);
    if (rd < 60) h -= 4 * (1 - rd / 60);
    return h;
  };
  const S = 260;
  const fieldAt = (x, z, hIn, slopeIn) => {
    const h = hIn ?? T(x, z);
    if (h < 0.5 && F.coast) return FIELD.water;
    if (riverDist(x, z) < 16) return FIELD.water;
    for (const [vx, vz] of F.villages) if ((x - vx) ** 2 + (z - vz) ** 2 < 260 * 260) return FIELD.village;
    if (F.coast && h < 4) return FIELD.marsh;
    const u = x + 70 * vnoise(x / 420, z / 420, F.seed), v = z + 70 * vnoise(x / 420 + 9, z / 420, F.seed);
    const i = Math.floor(u / S), j = Math.floor(v / S);
    const r = hash2(i, j, F.seed);
    const slope = slopeIn ?? Math.abs(T(x + 20, z) - T(x - 20, z)) + Math.abs(T(x, z + 20) - T(x, z - 20));
    if (slope > 9 || r < 0.1) return FIELD.wood;
    if (r < 0.4) return FIELD.pasture;
    if (r < 0.56) return FIELD.stubble;
    if (r < 0.64) return FIELD.fallow;
    if (r < 0.84) return FIELD.crop;
    return FIELD.livestock;
  };
  const hedge = (x, z) => {
    const u = x + 70 * vnoise(x / 420, z / 420, F.seed), v = z + 70 * vnoise(x / 420 + 9, z / 420, F.seed);
    const fu = ((u / S) % 1 + 1) % 1, fv = ((v / S) % 1 + 1) % 1;
    return Math.min(fu, 1 - fu, fv, 1 - fv) * S;
  };

  // Atmosphere: dawn inversion over the launch ground, ISA lapse above it.
  const airT = (h) => {
    const agl = h - L0;
    const base = 273.15 + F.surfaceT;
    if (agl < F.inv.top) return base + F.inv.dT * clamp(agl / F.inv.top, 0, 1);
    return base + F.inv.dT - 0.0065 * (agl - F.inv.top);
  };
  const pres = (h) => 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588);

  const layersAt = (t) => (F.evolve ? F.evolve(t, F.layers) : F.layers);
  // The keypoint profile alone: what a pibal at launch would report.
  const profile = (agl, t) => {
    const Ls = layersAt(t);
    if (agl <= Ls[0].h) return { from: Ls[0].from, spd: Ls[0].spd };
    for (let i = 0; i < Ls.length - 1; i++) {
      const a = Ls[i], b = Ls[i + 1];
      if (agl <= b.h) {
        const k = (agl - a.h) / (b.h - a.h);
        return { from: wrap360(a.from + wrap180(b.from - a.from) * k), spd: lerp(a.spd, b.spd, k) };
      }
    }
    const z = Ls[Ls.length - 1];
    return { from: z.from, spd: z.spd };
  };
  // Full field: profile + slow spatial and temporal wander. Near the ground the
  // wind is slowed by friction (log-ish profile in the bottom 30 m).
  const wind = (x, y, z, t) => {
    const g = ground(x, z);
    const agl = Math.max(0, y - L0);
    const p = profile(agl, t);
    const n1 = vnoise(x / 2600 + t / 1500, z / 2600, F.seed + 101);
    const n2 = vnoise(x / 2200, z / 2200 - t / 1800, F.seed + 202);
    const from = p.from + 14 * n1;
    let spd = p.spd * (1 + 0.14 * n2);
    const hg = y - g;
    if (hg < 30) spd *= 0.45 + 0.55 * clamp(hg / 30, 0, 1);
    const a = from * D2R;
    let wy = 0;
    if (t > F.thermals) wy = thermal(x, y - g, z, t);
    return { x: -Math.sin(a) * spd, y: wy, z: Math.cos(a) * spd };
  };
  // Thermal bubbles: a drifting cell pattern that switches on with the sun.
  const thermal = (x, hg, z, t) => {
    const k = clamp((t - F.thermals) / 300, 0, 1);
    const c = vnoise(x / 350 + t / 240, z / 350, F.seed + 303);
    const up = Math.max(0, c - 0.25) * 6 - Math.max(0, -c - 0.4) * 2;
    return k * up * clamp(hg / 60, 0, 1) * Math.exp(-hg / 900);
  };

  const lines = F.lines.map((pts) => {
    const spans = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 320));
      for (let k = 0; k < n; k++) {
        const p0 = [ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n];
        const p1 = [ax + ((bx - ax) * (k + 1)) / n, az + ((bz - az) * (k + 1)) / n];
        spans.push({ a: p0, b: p1, ha: ground(p0[0], p0[1]) + 24, hb: ground(p1[0], p1[1]) + 24 });
      }
    }
    return spans;
  });
  const wireHeight = (sp, t) => lerp(sp.ha, sp.hb, t) - 7 * 4 * t * (1 - t);
  // Nearest wire: horizontal distance and the wire height there.
  const nearestWire = (x, z) => {
    let best = null;
    for (const L of lines) for (const sp of L) {
      const dx = sp.b[0] - sp.a[0], dz = sp.b[1] - sp.a[1], l2 = dx * dx + dz * dz;
      const t = clamp(((x - sp.a[0]) * dx + (z - sp.a[1]) * dz) / l2, 0, 1);
      const d = Math.hypot(sp.a[0] + t * dx - x, sp.a[1] + t * dz - z);
      if (!best || d < best.d) best = { d, h: wireHeight(sp, t) };
    }
    return best;
  };

  return { F, L0, ground, fieldAt, hedge, riverDist, airT, pres, profile, wind, lines, wireHeight, nearestWire };
}

export const fmtClock = (h) => {
  const m = Math.floor(h * 60 + 1e-6);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
