// Levels are laid out in fractions of the available screen, so the same level
// fits a 13" laptop and a 32" monitor. Radii are fractions of the screen's
// shorter side. A pot's (x, y) is the centre of its soil line.

export const LEVELS = [
  {
    id: 'sill',
    name: 'Sill',
    hint: 'There is a spring behind your screen, and a pot on a pillar. Water rests on window floors. Get it from one to the other.',
    springs: [{ x: 0.17, y: 0.27, dir: [1, 0.15] }],
    pots: [{ x: 0.47, y: 0.6, pillar: true, species: 0 }],
    rocks: [[0.05, 0.31, 0.2, 0.31, 0.02]],
  },
  {
    id: 'downstream',
    name: 'Downstream',
    hint: 'The rock staircase stops short of the pot. A window floor can finish what the rock started.',
    springs: [{ x: 0.08, y: 0.13, dir: [1, 0.2] }],
    pots: [{ x: 0.86, y: 0.8, pillar: true, species: 1 }],
    rocks: [
      [0.03, 0.17, 0.27, 0.25, 0.018],
      [0.32, 0.38, 0.5, 0.45, 0.018],
      [0.52, 0.58, 0.66, 0.63, 0.018],
    ],
  },
  {
    id: 'uphill',
    name: 'Uphill',
    hint: 'Water only flows down. To raise it, catch it in a window and drag that window up.',
    springs: [{ x: 0.16, y: 0.74, dir: [1, 0.1] }],
    pots: [{ x: 0.78, y: 0.27, species: 2 }],
    rocks: [[0.06, 0.78, 0.2, 0.78, 0.02]],
  },
  {
    id: 'roof',
    name: 'Through the Roof',
    hint: 'The pot is sealed under rock, except for a hole in the roof. Hold the bottom strip of a window to open its sill and let the water drop.',
    springs: [{ x: 0.66, y: 0.18, dir: [-1, 0.25] }],
    pots: [{ x: 0.82, y: 0.88, species: 3 }],
    rocks: [
      [0.7, 0.21, 0.42, 0.33, 0.018],
      [0.72, 0.64, 0.72, 1.06, 0.022],
      [0.92, 0.64, 0.92, 1.06, 0.022],
      [0.72, 0.64, 0.8, 0.69, 0.02],
      [0.84, 0.69, 0.92, 0.64, 0.02],
    ],
  },
  {
    id: 'two-gardens',
    name: 'Two Gardens',
    hint: 'One spring, two pots: one below it, and one well above it.',
    springs: [{ x: 0.5, y: 0.47, dir: [0.15, 1] }],
    pots: [
      { x: 0.16, y: 0.24, species: 4 },
      { x: 0.84, y: 0.84, pillar: true, species: 5 },
    ],
    rocks: [[0.43, 0.43, 0.57, 0.43, 0.022]],
  },
  {
    id: 'wall',
    name: 'Over the Wall',
    hint: 'Rock splits the screen down the middle. No window can carry water through it, but a high enough one can carry it over.',
    springs: [{ x: 0.2, y: 0.6, dir: [1, 0.1] }],
    pots: [{ x: 0.78, y: 0.86, pillar: true, species: 1 }],
    rocks: [
      [0.5, 0.4, 0.5, 1.06, 0.026],
      [0.1, 0.64, 0.24, 0.64, 0.02],
    ],
  },
  {
    id: 'heat',
    name: 'Heat',
    hint: 'Something in the middle of your screen is hot. Water that lingers in it turns to steam.',
    springs: [{ x: 0.12, y: 0.16, dir: [1, 0.2] }],
    pots: [{ x: 0.86, y: 0.84, pillar: true, species: 6 }],
    rocks: [[0.04, 0.2, 0.18, 0.2, 0.02]],
    heat: [[0.5, 0.52, 0.24]],
  },
  {
    id: 'garden',
    name: 'Free Garden',
    free: true,
    hint: 'No clock and no goal. Two springs, four pots, and as many windows as you like.',
    springs: [
      { x: 0.28, y: 0.14, dir: [-1, 0.2] },
      { x: 0.72, y: 0.14, dir: [1, 0.2] },
    ],
    pots: [
      { x: 0.12, y: 0.82, pillar: true, species: 0 },
      { x: 0.38, y: 0.5, pillar: true, species: 2 },
      { x: 0.62, y: 0.5, pillar: true, species: 4 },
      { x: 0.88, y: 0.82, pillar: true, species: 6 },
    ],
    rocks: [
      [0.2, 0.18, 0.36, 0.18, 0.018],
      [0.64, 0.18, 0.8, 0.18, 0.018],
    ],
  },
];

export const LEVEL_COUNT = LEVELS.length;

// Resolves a level against a concrete screen rect S = {x, y, w, h}. Pots get a
// plinth (and optionally a pillar to the floor) added as rock, and every spring
// gets a boulder behind it, so nothing floats.
export function resolveLevel(index, S) {
  const def = LEVELS[index];
  const u = Math.min(S.w, S.h);
  const s = Math.max(0.62, Math.min(1.3, u / 860));
  const X = (f) => S.x + f * S.w;
  const Y = (f) => S.y + f * S.h;
  const area = S.w * S.h;
  const need = Math.round(Math.max(56, Math.min(140, (area / 1e6) * 92)));

  const rocks = def.rocks.map(([ax, ay, bx, by, r]) => ({
    ax: X(ax), ay: Y(ay), bx: X(bx), by: Y(by), r: Math.max(7, r * u),
  }));

  const springs = def.springs.map((sp) => {
    const len = Math.hypot(sp.dir[0], sp.dir[1]);
    const dx = sp.dir[0] / len, dy = sp.dir[1] / len;
    const x = X(sp.x), y = Y(sp.y);
    const R = 20 * s;
    rocks.push({ ax: x - dx * (R + 8) - dy * 6, ay: y - dy * (R + 8) + dx * 6, bx: x - dx * (R + 8) + dy * 6, by: y - dy * (R + 8) - dx * 6, r: R });
    return { x, y, dx, dy, rate: Math.round(42 * Math.min(1, s)), speed: 150 };
  });

  const pots = def.pots.map((p, i) => {
    const w = 66 * s, h = 46 * s;
    const cx = X(p.x), top = Y(p.y);
    const base = top + h;
    const plinthR = 8 * s;
    rocks.push({ ax: cx - w * 0.62, ay: base + plinthR * 0.7, bx: cx + w * 0.62, by: base + plinthR * 0.7, r: plinthR });
    if (p.pillar) {
      rocks.push({ ax: cx, ay: base + plinthR, bx: cx, by: S.y + S.h + 60, r: Math.max(10, w * 0.26) });
    }
    return {
      x: cx - w / 2, y: top, w, h, cx,
      need, fill: 0, bloomAt: -1,
      species: p.species ?? i,
      seed: (index * 7919 + i * 104729 + 17) >>> 0,
    };
  });

  const heat = (def.heat || []).map(([x, y, r]) => ({ x: X(x), y: Y(y), r: r * u, rate: 1.6 }));

  return {
    index,
    id: def.id,
    name: def.name,
    hint: def.hint,
    free: !!def.free,
    screen: { ...S },
    scale: s,
    rocks,
    springs,
    pots,
    heat,
  };
}
