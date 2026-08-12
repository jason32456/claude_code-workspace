// Level data. Coordinates are world units (1 unit ≈ 1 metre).
//   blocks  [cx, cy, cz, sx, sy, sz]   static geometry, centre + full size
//   plates  { id, p:[x, floorY, z] }
//   doors   { p, s, needs:[plateIds], sw:switchId, invert:bool }
//   movers  { p, s, to:[dx,dy,dz], period, phase }  cosine ping-pong on the loop clock
//   hazards { p, s, period, on }                    active while (t % period) < on
//
// Reference numbers used while authoring: the player is 1.8 tall, jumps 2.52,
// so a ledge above 2.5 needs an echo (top 1.8) and above 4.3 needs an echo
// standing on something.

export const LEVELS = [
  {
    id: 'first-light',
    name: 'First Light',
    loop: 16, maxEchoes: 2, par: 1,
    hint: 'Something has to stand on that plate. It does not have to be you.',
    spawn: [0, 0, 12], yaw: 0,
    blocks: [
      [0, -0.5, 0, 26, 1, 32],
      [-8, 2.5, -4, 10, 5, 1],
      [8, 2.5, -4, 10, 5, 1],
    ],
    plates: [{ id: 'a', p: [-8, 0, 6] }],
    doors: [{ p: [0, 2.5, -4], s: [6, 5, 1], needs: ['a'] }],
    crystals: [[0, 1.3, -9], [7, 1.3, -12]],
    exit: [-7, 0, 11],
  },

  {
    id: 'step-up',
    name: 'Step Up',
    loop: 16, maxEchoes: 2, par: 1,
    hint: 'That ledge is out of reach. An echo is exactly 1.8 tall.',
    spawn: [-6, 0, 11], yaw: 0,
    blocks: [
      [0, -0.5, 0, 28, 1, 28],
      [8, 1.75, -6, 8, 3.5, 8],
    ],
    plates: [],
    doors: [],
    crystals: [[8, 4.9, -6], [-9, 1.3, -9]],
    exit: [2, 0, 12],
  },

  {
    id: 'two-hands',
    name: 'Two Hands',
    loop: 22, maxEchoes: 3, par: 2,
    hint: 'Two plates, held at the same moment. You have one body — for now.',
    spawn: [0, 0, 11], yaw: 0,
    blocks: [
      [0, -0.5, 0, 34, 1, 32],
      [-10, 2.5, -2, 14, 5, 1],
      [10, 2.5, -2, 14, 5, 1],
    ],
    plates: [{ id: 'a', p: [-11, 0, 7] }, { id: 'b', p: [11, 0, 7] }],
    doors: [{ p: [0, 2.5, -2], s: [6, 5, 1], needs: ['a', 'b'] }],
    crystals: [[0, 1.3, -7], [-9, 1.3, -12], [9, 1.3, -12]],
    exit: [0, 0, -13],
  },

  {
    id: 'clockwork',
    name: 'Clockwork',
    loop: 26, maxEchoes: 3, par: 1,
    hint: 'The platform and the laser run on the loop clock — identical every take.',
    spawn: [0, 0, 9], yaw: 0,
    blocks: [
      [0, -0.5, 13, 18, 1, 14],
      [0, -0.5, -13, 18, 1, 14],
      [-5.5, 2, -15, 7, 4, 1],
      [5.5, 2, -15, 7, 4, 1],
    ],
    plates: [{ id: 'a', p: [6, 0, 11] }],
    doors: [{ p: [0, 2, -15], s: [4, 4, 1], needs: ['a'] }],
    movers: [{ p: [0, -0.5, 3.5], s: [5, 1, 4.5], to: [0, 0, -7], period: 9, phase: 0, dwell: 0.16 }],
    hazards: [{ p: [0, 1.6, -10], s: [18, 3.2, 0.6], period: 6, on: 2.4 }],
    crystals: [[0, 1.3, -8], [-6, 1.3, -12], [4, 1.3, -18]],
    exit: [-1, 0, -18],
  },

  {
    id: 'switchboard',
    name: 'Switchboard',
    loop: 26, maxEchoes: 3, par: 1,
    hint: 'One switch, two doors, opposite phase. An echo can flip it twice.',
    spawn: [0, 0, 15], yaw: 0,
    blocks: [
      [0, -0.5, 0, 24, 1, 48],
      [-7.5, 2.5, 0, 9, 5, 1],
      [7.5, 2.5, 0, 9, 5, 1],
      [-7.5, 2.5, -11, 9, 5, 1],
      [7.5, 2.5, -11, 9, 5, 1],
    ],
    switches: [{ id: 's1', p: [-8, 0, 9] }],
    plates: [],
    doors: [
      { p: [0, 2.5, 0], s: [6, 5, 1], sw: 's1' },
      { p: [0, 2.5, -11], s: [6, 5, 1], sw: 's1', invert: true },
    ],
    crystals: [[0, 1.3, -6], [0, 1.3, -17], [-7, 1.3, -20]],
    exit: [6, 0, -20],
  },

  {
    id: 'spire',
    name: 'Spire',
    loop: 30, maxEchoes: 4, par: 2,
    hint: 'One echo holds the vault. One becomes the step you are missing.',
    spawn: [0, 0, 16], yaw: 0,
    blocks: [
      [0, -0.5, 0, 40, 1, 40],
      [2, 0.9, -9, 6, 1.8, 6],
      [9, 2.5, -9, 8, 5, 8],
      [-12, 2, 12.5, 9, 4, 1],
      [-16.5, 2, 8, 1, 4, 10],
      [-7.5, 2, 8, 1, 4, 10],
    ],
    plates: [{ id: 'a', p: [-5, 0, 9] }],
    doors: [{ p: [-12, 2, 3.5], s: [9, 4, 1], needs: ['a'] }],
    crystals: [[9, 6.4, -9], [-12, 1.3, 8], [15, 1.3, 10]],
    exit: [0, 0, 13],
  },
];
