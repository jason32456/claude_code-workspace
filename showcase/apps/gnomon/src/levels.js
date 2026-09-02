// Chambers are authored in *shadow space*: you say where a platform should be on
// the wall and how big it should look there, and the DSL back-solves the 3D
// position and size through the lamp. Without that, every edit to a lamp would
// mean recomputing every solid by hand.

const SCALABLE = {
  box: [1, 1, 1],
  wedge: [1, 1, 1],
  prism: [0, 1, 1],
  pyramid: [1, 1, 1],
  lshape: [1, 1, 1, 1],
  cross: [1, 1, 1, 1],
  tee: [1, 1, 1, 1],
  ring: [1, 1, 1, 0],
};

function chamber(def) {
  const [lx, ly, lz] = def.lamp.pos;
  const k = (z) => lz / (lz - z);

  const place = (sx, sy, z) => {
    const s = 1 / k(z);
    return [lx + (sx - lx) * s, ly + (sy - ly) * s, z];
  };

  const solid = (o) => {
    const z = o.z ?? 0.5;
    const s = 1 / k(z);
    const mask = SCALABLE[o.shape[0]];
    const shape = [o.shape[0], ...o.shape.slice(1).map((v, i) => (mask[i] ? v * s : v))];
    return {
      ...o,
      shape,
      pos: place(o.at[0], o.at[1], z),
      slideBounds: o.slideBounds || { x: [-11, 11], y: [-3, 17] },
    };
  };

  const solids = [];
  for (const g of def.ground || []) {
    solids.push(solid({ shape: ['box', g[2], g[3] ?? 1.4, 0.35], at: [g[0], g[1]], z: 0.5, flags: '' }));
  }
  for (const s of def.solids || []) solids.push(solid(s));

  // `from` indexes def.solids, but ground is prepended into the same array.
  const seal = def.seal
    ? {
        ...def.seal,
        from: (def.ground || []).length + def.seal.from,
        solutionPos: place(def.seal.solution.at[0], def.seal.solution.at[1], def.seal.solution.z),
      }
    : null;

  return { ...def, solids, seal, motes: (def.motes || []).map(([x, y]) => ({ x, y, taken: false })) };
}

export const LEVELS = [
  chamber({
    id: 'first-light',
    name: 'First Light',
    hint: 'Drag a glowing solid to turn it. The shadow it throws is the only floor you have.',
    par: 30,
    lamp: { pos: [0, 7.5, 13] },
    spawn: [-12, 5],
    door: [12.8, 5.0],
    ground: [[-11.5, 3.0, 8], [11.5, 3.0, 8]],
    solids: [
      { shape: ['box', 12, 0.9, 1.8], at: [0, 4.2], z: 5, rot: [Math.PI / 2, 0], flags: 'rotate' },
    ],
    motes: [[-4, 7.0], [0, 7.3], [4, 7.0]],
  }),

  chamber({
    id: 'leverage',
    name: 'Leverage',
    hint: 'Scroll on a solid to push it toward the lamp. Closer to the light means a bigger, faster shadow.',
    par: 55,
    lamp: { pos: [0, 4.2, 13] },
    spawn: [-11, 6.5],
    door: [11.4, 13.7],
    ground: [[-11, 4.6, 8], [-5.6, 5.4, 3, 1.2], [5.2, 9.6, 3.4, 1.2], [10.9, 11.5, 7]],
    solids: [
      {
        shape: ['box', 4.0, 2.6, 2.2], at: [-1.4, 6.3], z: 2,
        flags: 'depth slide', depthRange: [1.6, 9.2],
        slideBounds: { x: [-6, 6], y: [2, 9] },
      },
    ],
    motes: [[-1.4, 10.5], [7.6, 12.6], [-8.5, 7.2]],
  }),

  chamber({
    id: 'confluence',
    name: 'Confluence',
    hint: 'Shadows that overlap are one platform. Hold Shift while dragging to slide a solid.',
    par: 70,
    lamp: { pos: [0, 7.5, 13] },
    spawn: [-12.5, 5],
    door: [13.2, 5.0],
    ground: [[-12.5, 3.0, 6], [12.5, 3.0, 6]],
    solids: [
      { shape: ['box', 8, 0.9, 1.6], at: [-6, 5.2], z: 4, rot: [0.9, 0.25], flags: 'rotate slide', slideBounds: { x: [-9, 2], y: [0, 10] } },
      { shape: ['box', 8, 0.9, 1.6], at: [6, 6.6], z: 6, rot: [-0.9, -0.2], flags: 'rotate slide', slideBounds: { x: [-2, 9], y: [0, 10] } },
    ],
    motes: [[0, 9.6], [-9, 7.4], [9, 8.2]],
  }),

  chamber({
    id: 'the-vane',
    name: 'The Vane',
    hint: 'The vane never stops. A shadow that moves under you carries you with it.',
    par: 80,
    lamp: { pos: [0, 7.5, 13] },
    spawn: [-12.5, 5],
    door: [13.2, 8.6],
    ground: [[-12.5, 3.0, 6], [12.6, 6.4, 6]],
    solids: [
      {
        shape: ['box', 13, 0.9, 1.4], at: [-1.5, 5.4], z: 4.5,
        motor: 0.5, motorAxis: [0, 0, 1], flags: '',
      },
      { shape: ['box', 6.5, 0.9, 1.4], at: [7.5, 6.0], z: 3.5, rot: [0.5, 0], flags: 'rotate slide', slideBounds: { x: [2, 9], y: [1, 9] } },
    ],
    motes: [[-1.5, 11.4], [6.0, 10.0], [-7.5, 8.6]],
  }),

  chamber({
    id: 'narrows',
    name: 'Narrows',
    hint: 'Two shadows closing on you at once will crush you. Watch the blades, then run.',
    par: 75,
    lamp: { pos: [0, 7.5, 13] },
    spawn: [-13, 5],
    door: [13.4, 5.0],
    ground: [[-12.6, 3.2, 6], [12.6, 3.2, 6], [0, 3.2, 14, 0.9]],
    solids: [
      { shape: ['box', 22, 3.0, 1.0], at: [0, 10.4], z: 2, flags: '' },
      { shape: ['box', 5.6, 1.1, 1.4], at: [-4.2, 5.9], z: 5, motor: 0.85, motorAxis: [0, 0, 1], flags: '' },
      { shape: ['box', 5.6, 1.1, 1.4], at: [4.2, 5.9], z: 5, rot: [0, 0], motor: -0.85, motorAxis: [0, 0, 1], flags: '' },
      { shape: ['box', 4.4, 0.9, 1.2], at: [0, 7.4], z: 3, rot: [0, 0], flags: 'rotate slide', slideBounds: { x: [-7, 7], y: [3, 9] } },
    ],
    motes: [[-4.2, 8.0], [4.2, 8.0], [0, 12.6]],
  }),

  chamber({
    id: 'keyhole',
    name: 'Keyhole',
    hint: 'The gate reads a shape, not a key. Turn the wedge until its shadow fills the outline.',
    par: 110,
    lamp: { pos: [0, 7.5, 13] },
    spawn: [-12.5, 5],
    door: [12.9, 9.4],
    ground: [[-12.5, 3.0, 6], [-1.0, 3.0, 11], [12.6, 7.2, 6]],
    solids: [
      {
        shape: ['wedge', 5.2, 4.6, 2.0], at: [-7.4, 11.2], z: 5,
        rot: [1.1, -0.5], flags: 'rotate depth slide',
        depthRange: [3.2, 7.4], slideBounds: { x: [-8, 0], y: [4, 11] },
      },
      { shape: ['box', 5.0, 0.9, 1.4], at: [7.4, 5.2], z: 4, rot: [0.35, 0], flags: 'rotate slide', slideBounds: { x: [2, 9], y: [1, 8] } },
    ],
    seal: { from: 0, solution: { yaw: -0.35, pitch: 0.2, z: 5.6, at: [-7.0, 10.6] } },
    motes: [[-7.0, 13.6], [4.0, 7.4], [11.0, 10.6]],
  }),

  chamber({
    id: 'lamplight',
    name: 'Lamplight',
    hint: 'Nothing here turns. Drag the lamp itself — every shadow answers, and the deep ones answer loudest.',
    par: 90,
    lamp: { pos: [0, 7.5, 13], flags: 'move depth', bounds: { x: [-7.5, 7.5], y: [3.5, 12], z: [8.5, 15] } },
    spawn: [-13, 5],
    door: [13.2, 11.2],
    ground: [[-12.8, 3.0, 6], [12.8, 9.2, 6]],
    // Each shadow drifts by (lamp move) × (k − 1): the ledges barely notice, the
    // deep slab swings twice as far as the lamp does. The chain is broken at the
    // starting position and has to be re-made one link at a time.
    solids: [
      { shape: ['box', 6.0, 1.0, 1.2], at: [-6.5, 4.7], z: 3, flags: '' },
      { shape: ['box', 5.0, 1.0, 1.2], at: [7.0, 6.4], z: 8.4, flags: '' },
      { shape: ['box', 5.0, 1.0, 1.2], at: [3.0, 10.4], z: 6, flags: '' },
      { shape: ['prism', 6, 1.5, 1.6], at: [-7.0, 11.4], z: 7, flags: '' },
    ],
    motes: [[-7.0, 13.8], [7.0, 8.6], [3.0, 12.6]],
  }),

  chamber({
    id: 'orrery',
    name: 'Orrery',
    hint: 'The wheel is the road. Hold the seal shut while you ride it.',
    par: 130,
    lamp: { pos: [0, 7.5, 13] },
    spawn: [-11.5, 6.5],
    door: [12.6, 10.6],
    ground: [[-11.5, 4.6, 7], [12.0, 8.4, 7]],
    solids: [
      { shape: ['ring', 5.2, 0.9, 1.2, 8], at: [-0.5, 7.6], z: 5, motor: 0.42, motorAxis: [0, 0, 1], flags: '' },
      {
        shape: ['tee', 5.0, 4.6, 1.5, 1.8], at: [-8.6, 11.8], z: 6,
        rot: [0.6, 0.4], flags: 'rotate depth slide',
        depthRange: [4, 8.6], slideBounds: { x: [-8, -1], y: [4, 11] },
      },
    ],
    seal: { from: 1, solution: { yaw: -0.2, pitch: -0.15, z: 6.6, at: [-9.0, 12.4] } },
    motes: [[-0.5, 13.6], [-6.9, 9.4], [4.0, 4.2]],
  }),

  chamber({
    id: 'gnomon',
    name: 'Gnomon',
    hint: 'Lamp on a rail, a wheel that never stops, and a seal. Everything you know, at once.',
    par: 170,
    lamp: { pos: [-2, 7.0, 12.5], flags: 'move', bounds: { x: [-8, 8], y: [5, 10.5], z: [12.5, 12.5] } },
    spawn: [-13.2, 5],
    door: [13.4, 12.0],
    ground: [[-12.9, 3.0, 6], [1.0, 2.6, 7, 1.1], [12.9, 10.2, 6]],
    solids: [
      { shape: ['box', 7.0, 1.0, 1.3], at: [-6.4, 5.4], z: 4, flags: '' },
      { shape: ['cross', 8.0, 8.0, 1.1, 1.4], at: [1.5, 8.6], z: 5.5, motor: 0.38, motorAxis: [0, 0, 1], flags: '' },
      {
        shape: ['lshape', 5.4, 5.4, 1.6, 1.8], at: [8.6, 6.6], z: 5,
        rot: [0.8, 0.3], flags: 'rotate depth slide',
        depthRange: [3.4, 8], slideBounds: { x: [2, 9], y: [2, 10] },
      },
    ],
    seal: { from: 2, solution: { yaw: 0.15, pitch: -0.1, z: 5.8, at: [9.0, 6.4] } },
    motes: [[1.5, 14.2], [-9.0, 9.4], [6.2, 12.4]],
  }),
];
