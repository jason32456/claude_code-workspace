// Every tunable number in Vesper lives here so the flock can be re-balanced
// without touching the simulation.

export const MAX_BIRDS = 2600;

export const FLOCK = {
  perception: 8.0,
  neighbourCap: 24,
  sepRadiusLoose: 4.6,
  sepRadiusTight: 1.1,
  sepWeight: 5.2,
  aliWeight: 1.5,
  cohWeightLoose: 0.5,
  cohWeightTight: 3.4,
  leadWeight: 2.4,
  wildHomeWeight: 1.5,
  maxForce: 34,
  cruiseLoose: 27,
  cruiseTight: 21,
  minSpeed: 9,
  maxSpeed: 40,
  leadDistance: 34,
  bankRate: 1.15,
  pitchRate: 0.95,
  maxPitch: 0.72,
  predatorRadius: 34,
  predatorWeight: 260,
  flashImpulse: 46,
  flashDecay: 0.9,
  flashCost: 0.22,
  flashCooldown: 1.6,
  minClearance: 9,
};

export const STAMINA = {
  drainBase: 0.012,
  drainSpeed: 0.0022,
  drainDensity: 0.021,
  drainFlash: 0.0,
  recover: 0.045,
  feedGain: 0.6,
  thermalGain: 0.35,
  strayThreshold: 0.35,
};

export const FALCON = {
  patrolRadius: 130,
  patrolHeight: 95,
  climbHeight: 150,
  climbTime: 2.8,
  lockTime: 1.5,
  stoopSpeed: 62,
  stoopCommit: 40,
  flashWindow: 0.62,
  baseKill: 0.92,
  confusionTight: 0.8,
  confusionLoose: 0.14,
  fedRest: 15,
  missRest: 8,
  cruise: 34,
};

export const LIGHT = {
  // Normalised light level over a night: 1 = low sun, 0 = full dark.
  darkPanic: 0.16,
  darkLossRate: 26, // birds per second lost at zero light
};

export const WORLD = {
  valleyHalf: 300,
  ridgeHeight: 96,
  waterLevel: 0,
  cellSize: 25,
  halfWidth: 700,
};

// A night is a corridor down the valley with a hand-placed difficulty curve.
export const NIGHTS = [
  {
    id: 1,
    name: 'Low Sun',
    subtitle: 'Learn the shape of your own body.',
    brief:
      'A quiet stretch of valley and one young peregrine that has not committed to anything in its life. Sweep up the wild flocks over the water meadows and put them in the reeds before the light goes.',
    length: 3400,
    startBirds: 420,
    duskSeconds: 210,
    falcons: [{ delay: 26, timid: 0.55 }],
    wind: { z: 0, gust: 0 },
    wildFlocks: [
      { x: 700, z: -70, y: 62, n: 90 },
      { x: 1350, z: 90, y: 74, n: 120 },
      { x: 2050, z: -40, y: 58, n: 110 },
      { x: 2750, z: 60, y: 80, n: 140 },
    ],
    swarms: [
      { x: 950, z: 20, y: 30 },
      { x: 1800, z: -30, y: 26 },
      { x: 2500, z: 40, y: 32 },
    ],
    thermals: [
      { x: 1150, z: -140 },
      { x: 2300, z: 130 },
    ],
    pylons: [],
    turbines: [],
    stars: [500, 640, 780],
  },
  {
    id: 2,
    name: 'The Span',
    subtitle: 'Four hundred kilovolts, and no one told the birds.',
    brief:
      'The transmission corridor crosses the valley three times. Wires are invisible against a dusk sky and they do not care how tight you are flying — a compact flock through a span is the worst thing you will ever do. Two falcons tonight, and they hunt the side you are not watching.',
    length: 4800,
    startBirds: 520,
    duskSeconds: 250,
    falcons: [
      { delay: 20, timid: 0.15 },
      { delay: 95, timid: 0.25 },
    ],
    wind: { z: 3.2, gust: 1.4 },
    wildFlocks: [
      { x: 620, z: 80, y: 66, n: 110 },
      { x: 1500, z: -90, y: 58, n: 150 },
      { x: 2350, z: 50, y: 76, n: 130 },
      { x: 3100, z: -60, y: 62, n: 160 },
      { x: 3900, z: 70, y: 70, n: 170 },
    ],
    swarms: [
      { x: 1100, z: -20, y: 28 },
      { x: 2200, z: 30, y: 30 },
      { x: 3400, z: -40, y: 26 },
      { x: 4200, z: 20, y: 30 },
    ],
    thermals: [
      { x: 900, z: 150 },
      { x: 2600, z: -160 },
      { x: 3800, z: 140 },
    ],
    pylons: [
      { x: 1750, heights: [58, 76, 94] },
      { x: 2900, heights: [52, 70, 88] },
      { x: 4050, heights: [64, 84, 104] },
    ],
    turbines: [
      { x: 2500, z: -170 },
      { x: 2560, z: 130 },
      { x: 3600, z: -140 },
    ],
    stars: [620, 830, 1040],
  },
  {
    id: 3,
    name: 'Black Sun',
    subtitle: 'Everything at once, and the light going twice as fast.',
    brief:
      'The big roost. Three peregrines working the same flock from opposite sides, a crosswind that will not let you hold a line, wires, turbines, and a dusk that runs out early. Arrive enormous or do not bother arriving.',
    length: 6000,
    startBirds: 600,
    duskSeconds: 300,
    falcons: [
      { delay: 14, timid: 0 },
      { delay: 60, timid: 0 },
      { delay: 135, timid: 0.1 },
    ],
    wind: { z: -5.0, gust: 2.6 },
    wildFlocks: [
      { x: 560, z: -80, y: 60, n: 130 },
      { x: 1250, z: 90, y: 72, n: 150 },
      { x: 2000, z: -50, y: 64, n: 170 },
      { x: 2800, z: 70, y: 80, n: 180 },
      { x: 3600, z: -80, y: 58, n: 190 },
      { x: 4400, z: 60, y: 74, n: 200 },
      { x: 5200, z: -40, y: 66, n: 210 },
    ],
    swarms: [
      { x: 900, z: 30, y: 28 },
      { x: 1900, z: -30, y: 30 },
      { x: 2900, z: 40, y: 26 },
      { x: 3900, z: -20, y: 30 },
      { x: 4900, z: 30, y: 28 },
    ],
    thermals: [
      { x: 1100, z: -150 },
      { x: 2400, z: 160 },
      { x: 3500, z: -170 },
      { x: 4800, z: 150 },
    ],
    pylons: [
      { x: 1500, heights: [56, 74, 92] },
      { x: 2650, heights: [60, 80, 100] },
      { x: 3750, heights: [50, 68, 86] },
      { x: 5100, heights: [66, 88, 110] },
    ],
    turbines: [
      { x: 2100, z: -160 },
      { x: 2160, z: 140 },
      { x: 4200, z: -150 },
      { x: 4270, z: 120 },
      { x: 5400, z: -130 },
    ],
    stars: [800, 1150, 1480],
  },
];
