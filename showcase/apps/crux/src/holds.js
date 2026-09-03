import * as THREE from '../vendor/three.module.js';

// cone is the cosine cutoff: pull directions worse than this give no grip at all.
// drain is the pump multiplier at perfect alignment. wet is how much water hurts.
export const HOLD_TYPES = {
  jug: {
    key: 'jug',
    name: 'Jug',
    hint: 'bomber — rest here',
    color: 0x62d493,
    drain: 0.34,
    cone: -0.5,
    size: 0.075,
    foot: 1.0,
    wet: 0.25,
    rest: true,
  },
  edge: {
    key: 'edge',
    name: 'Edge',
    hint: 'wants a straight-down pull',
    color: 0x6ba6ff,
    drain: 1.0,
    cone: 0.44,
    size: 0.052,
    foot: 0.95,
    wet: 0.5,
  },
  sloper: {
    key: 'sloper',
    name: 'Sloper',
    hint: 'friction only — press in',
    color: 0xffb257,
    drain: 1.35,
    cone: 0.5,
    size: 0.095,
    foot: 0.6,
    wet: 1.0,
  },
  pocket: {
    key: 'pocket',
    name: 'Pocket',
    hint: 'two fingers, narrow window',
    color: 0xbe8bff,
    drain: 1.2,
    cone: 0.56,
    size: 0.042,
    foot: 0.5,
    wet: 0.35,
  },
  sidepull: {
    key: 'sidepull',
    name: 'Sidepull',
    hint: 'pull sideways, oppose with a foot',
    color: 0x58dede,
    drain: 0.92,
    cone: 0.4,
    size: 0.058,
    foot: 0.45,
    wet: 0.45,
  },
  undercling: {
    key: 'undercling',
    name: 'Undercling',
    hint: 'pull up and out — get your feet high',
    color: 0xff8fb6,
    drain: 1.12,
    cone: 0.48,
    size: 0.065,
    foot: 0.3,
    wet: 0.4,
  },
  flake: {
    key: 'flake',
    name: 'Flake',
    hint: 'loose — it will not hold for long',
    color: 0xd4695a,
    drain: 1.0,
    cone: 0.38,
    size: 0.08,
    foot: 0.75,
    wet: 0.5,
    breaks: 2.6,
  },
};

export const TYPE_ORDER = ['jug', 'edge', 'sloper', 'pocket', 'sidepull', 'undercling', 'flake'];

const _down = new THREE.Vector3();

// "Down the face": world-down projected into the rock's tangent plane. This is
// the axis every hold is judged against, which is why the same edge is trivial
// on a slab and desperate on a roof — the face tilts, the ideal tilts with it.
export function downFace(normal, out = new THREE.Vector3()) {
  return out.set(0, -1, 0).addScaledVector(normal, normal.y).normalize();
}

// The direction the rock wants to be loaded, in the local surface frame.
export function idealPull(type, normal, lateral, out = new THREE.Vector3()) {
  const d = downFace(normal, _down);
  switch (type) {
    case 'sloper':
      return out.copy(d).addScaledVector(normal, -0.35).normalize();
    case 'pocket':
      return out.copy(d).addScaledVector(normal, -0.25).normalize();
    case 'sidepull':
      return out.copy(lateral).multiplyScalar(0.8).addScaledVector(d, 0.55).normalize();
    case 'undercling':
      return out.copy(normal).multiplyScalar(0.9).addScaledVector(d, 0.35).normalize();
    case 'jug':
      return out.copy(d).addScaledVector(normal, -0.08).normalize();
    default:
      return out.copy(d).normalize();
  }
}

export function makeHold(id, position, normal, lateral, type, band) {
  const spec = HOLD_TYPES[type];
  const hold = {
    id,
    type,
    spec,
    band,
    position: position.clone(),
    normal: normal.clone(),
    lateral: lateral.clone(),
    ideal: idealPull(type, normal, lateral),
    wet: 0,
    chalk: 0,
    broken: false,
    loadTime: 0,
    used: false,
  };
  return hold;
}

// Alignment of an actual pull against what the hold can take, 0..1.
export function alignment(hold, pull) {
  const d = pull.dot(hold.ideal);
  const c = hold.spec.cone;
  if (d <= c) return 0;
  return Math.min(1, (d - c) / (1 - c));
}

export function friction(hold) {
  const dry = 1 - hold.wet * hold.spec.wet * 0.85;
  return THREE.MathUtils.clamp(dry + hold.chalk * 0.22, 0.05, 1.18);
}

// The number the whole game turns on: how well this hand is actually holding on.
export function gripQuality(hold, pull, fatigue = 0) {
  if (hold.broken) return 0;
  const a = alignment(hold, pull);
  const q = a * friction(hold) * (1 - fatigue * 0.45);
  return THREE.MathUtils.clamp(q, 0, 1);
}

export const SLIP_THRESHOLD = 0.14;
