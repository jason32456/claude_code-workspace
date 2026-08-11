export const PLANET = {
  radius: 10,
  subdivisions: 3,
  axisTilt: 18 * Math.PI / 180,
  dayLength: 120,
  vents: 3,
  oreTiles: 26,
};

export const TERRAIN = {
  PLAIN: 'PLAIN',
  RIDGE: 'RIDGE',
  BASIN: 'BASIN',
  ORE: 'ORE',
};

export const TILE_RADIUS = {
  PLAIN: 1.0,
  ORE: 1.0,
  RIDGE: 1.046,
  BASIN: 0.982,
};

export const COLORS = {
  PLAIN: 0x9a7d54,
  PLAIN_ALT: 0x8b6f49,
  ORE: 0xb08243,
  RIDGE: 0x6d6a68,
  BASIN: 0x14212f,
  VENT: 0xff7a2f,
  crust: 0x241c17,
  sea: 0x0d2233,
};

// Baseline power every Core Vent contributes, so a fully dark grid still ticks.
export const VENT_POWER = 3;

// Adjacent arrays share inverters. Without this, players scatter solar evenly
// over the globe, half of it is always lit, and total production is flat — the
// day/night swing cancels itself out and the whole premise dies. Paying for
// clustering makes a solar farm a *place*, which the terminator can then leave.
export const SOLAR_ADJACENCY = 0.22;

export const BUILDINGS = {
  SOLAR: {
    key: 'SOLAR', name: 'Solar Array', hotkey: '1', cost: 20, glyph: '☀',
    blurb: '+7 PW/s at full sun, +22% per touching array. Nothing at night.',
    solar: 7,
  },
  CAPACITOR: {
    key: 'CAPACITOR', name: 'Capacitor', hotkey: '2', cost: 25, glyph: '▮',
    blurb: '+110 PW storage. Carries daylight into the dark.',
    storage: 110,
  },
  EXTRACTOR: {
    key: 'EXTRACTOR', name: 'Extractor', hotkey: '3', cost: 30, glyph: '⛏',
    blurb: '+1.1 AL/s. Ferrite seams only.',
    alloy: 1.1, idlePower: 0.5, oreOnly: true,
  },
  LASER: {
    key: 'LASER', name: 'Laser Battery', hotkey: '4', cost: 35, glyph: '↑',
    blurb: 'Single target, hits flyers. Armour halves it. 1.6 PW/s just to stay online.',
    range: 3.6, damage: 12, rate: 2.2, firePower: 10, idlePower: 1.6,
    weapon: 'beam', hitsAir: true,
  },
  ARC: {
    key: 'ARC', name: 'Arc Node', hotkey: '5', cost: 55, glyph: '⌁',
    blurb: 'Chains to 3 targets. Very power hungry.',
    range: 3.1, damage: 8, rate: 1.7, firePower: 22, idlePower: 2.4,
    weapon: 'chain', chain: 3, hitsAir: true,
  },
  MORTAR: {
    key: 'MORTAR', name: 'Mortar Pit', hotkey: '6', cost: 50, glyph: '◎',
    blurb: 'Splash, ignores armour, needs no power. Cannot hit flyers.',
    range: 4.3, damage: 30, splash: 1.15, rate: 0.6,
    firePower: 0, idlePower: 0, weapon: 'shell', hitsAir: false,
  },
  BULWARK: {
    key: 'BULWARK', name: 'Bulwark', hotkey: '7', cost: 8, glyph: '▬',
    blurb: 'Impassable to walkers. Flyers ignore it.',
    blocks: true,
  },
};

export const BUILD_ORDER = ['SOLAR', 'CAPACITOR', 'EXTRACTOR', 'LASER', 'ARC', 'MORTAR', 'BULWARK'];

export const UPGRADE = {
  maxLevel: 3,
  costFactor: 0.8,   // of base cost, per level
  powerFactor: 1.5,  // damage / yield / storage multiplier per level
  sellRefund: 0.6,
};

export const ENEMIES = {
  crawler: {
    key: 'crawler', name: 'Crawler', hp: 30, speed: 1.0, reward: 3, leak: 2,
    armour: 1, flying: false, color: 0xd94fd0, scale: 0.26,
  },
  husk: {
    key: 'husk', name: 'Husk', hp: 110, speed: 0.62, reward: 7, leak: 6,
    armour: 0.5, flying: false, color: 0x8e5bd8, scale: 0.36,
  },
  drifter: {
    key: 'drifter', name: 'Drifter', hp: 45, speed: 1.25, reward: 5, leak: 4,
    armour: 1, flying: true, color: 0x4fd6ff, scale: 0.28, altitude: 1.1,
  },
  spitter: {
    key: 'spitter', name: 'Spitter', hp: 60, speed: 0.8, reward: 6, leak: 5,
    armour: 1, flying: false, color: 0xff6b4f, scale: 0.3,
    attackRange: 2.2, attackDamage: 10, attackRate: 0.7,
  },
  leviathan: {
    key: 'leviathan', name: 'Leviathan', hp: 2600, speed: 0.42, reward: 150, leak: 60,
    armour: 0.5, flying: false, color: 0xff2f6a, scale: 0.95, spawnsCrawlers: 3.5,
  },
};

export const WAVES = [
  { crawler: 6 },
  { crawler: 12 },
  { crawler: 12, husk: 3 },
  { crawler: 14, drifter: 6 },
  { crawler: 16, husk: 6, spitter: 2 },
  { crawler: 18, drifter: 10, husk: 6 },
  { crawler: 20, husk: 8, spitter: 3 },
  { crawler: 22, drifter: 12, husk: 8 },
  { crawler: 26, husk: 14, spitter: 5 },
  { crawler: 30, drifter: 18, husk: 16, spitter: 6 },
  { crawler: 36, husk: 22, drifter: 16, spitter: 8 },
  { leviathan: 1, crawler: 30, husk: 18, drifter: 18, spitter: 8 },
];

export const GAME = {
  startAlloy: 330,
  startIntegrity: 100,
  firstBuildGap: 50,
  buildGap: 26,
  earlyCallBonus: 2,          // alloy per unbanked second
  waveDuration: (w) => 24 + 2 * w,
  hpScale: (w) => 1 + 0.05 * (w - 1),
  podFall: 3.2,               // seconds from orbit to impact
  podSize: 5,                 // max units per pod
  nightThreshold: 0.08,
  // Flow-field distance band a pod may land in: far enough to be a walk,
  // close enough that the walk crosses somebody's defences.
  dropBand: [5, 21],
};

export const CAMERA = {
  minDist: 14,
  maxDist: 46,
  startDist: 30,
  fov: 45,
};
