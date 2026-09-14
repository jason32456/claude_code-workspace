// Every tunable in the game. Values are in metres / seconds; the octopus is a
// common octopus, so a 0.40 m mantle radius and a 1.05 m arm are roughly life
// size, and the building is scaled around that.

export const CFG = {
  body: {
    radius: 0.40,          // relaxed capsule radius
    beak: 0.20,            // hard limit — the only part that cannot deform
    squeezeRate: 2.2,      // radius units per second
    swimAccel: 9.0,
    swimDrag: 2.1,
    crawlAccel: 15.0,
    crawlDrag: 5.4,
    maxSwim: 3.4,
    maxCrawl: 2.6,
    gravity: 9.2,
    buoyancy: 8.6,         // slightly negative overall, so you sink slowly
    jetImpulse: 7.2,
    jetCost: 0.34,         // fraction of mantle reserve
    jetNoise: 9.0,
    climbGripNeeded: 2,    // arms holding before gravity lets go of you
  },

  arms: {
    count: 8,
    segments: 9,
    length: 1.05,
    radials: 8,
    reachSpeed: 3.4,
    // how fast an unsupervised grip rots, multiplied by the surface's slip
    decayBase: 0.055,
    reflexGripRange: 0.78,
    probeInterval: 1.5,
    tightenRate: 1.9,
  },

  focus: {
    slots: 2,
    slotsLate: 3,
    tightenCost: 0.45,     // seconds a re-tighten occupies a slot
  },

  breath: {
    airDrain: 1 / 92,      // ninety-two seconds of dry land, total
    waterGain: 1 / 11,
    mantleRefill: 1 / 4.5,
    squeezePenalty: 2.0,
    exertion: 0.45,        // extra drain while hauling
  },

  camo: {
    blendStill: 1.45,      // match units per second when frozen
    blendMoving: 0.24,
    breakSpeed: 1.6,       // above this, match actively falls
    breakRate: 0.85,
    papillaeWeight: 0.30,  // share of the match that is texture, not colour
  },

  threat: {
    suspicionRise: 1.0,
    suspicionFall: 0.36,
    catchDistance: 1.5,
    torchRange: 11.0,
    torchCos: Math.cos(0.42),
    visionCos: Math.cos(0.95),
    hearingBase: 4.5,
    inkHold: 4.2,
  },

  ink: {
    recharge: 90,
    cloudRadius: 3.2,
    cloudLife: 9.0,
  },

  world: {
    waterFog: 0.055,
    airFog: 0.016,
  },
};

// Surface families. `slip` drives how fast an unsupervised arm loses its grip;
// `rough` is what the papillae have to match; `col` is both the render colour
// and the colour the chromatophores copy.
export const MATS = {
  concrete: { col: 0x6d6f6d, rough: 0.75, slip: 0.55, name: 'concrete' },
  wetcon:   { col: 0x4e5450, rough: 0.70, slip: 0.75, name: 'wet concrete' },
  glass:    { col: 0x9fc6cf, rough: 0.02, slip: 2.60, name: 'glass' },
  steel:    { col: 0x8b9097, rough: 0.12, slip: 1.70, name: 'steel' },
  paint:    { col: 0x3f5a63, rough: 0.20, slip: 1.25, name: 'painted steel' },
  tile:     { col: 0x2f5f78, rough: 0.18, slip: 1.35, name: 'tile' },
  gravel:   { col: 0x7a6f5e, rough: 0.95, slip: 0.30, name: 'gravel' },
  rock:     { col: 0x5c5a55, rough: 1.00, slip: 0.22, name: 'rock' },
  weed:     { col: 0x3d5b3a, rough: 0.88, slip: 0.45, name: 'weed' },
  rust:     { col: 0x7d5236, rough: 0.85, slip: 0.60, name: 'rusted iron' },
  dark:     { col: 0x24282c, rough: 0.55, slip: 0.80, name: 'shadow' },
};
