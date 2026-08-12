// Level data. Coordinates are in the 900×600 arena space (physics.ARENA).
// wells: always-attract gravity bodies. blackHole: stronger pull + instant
// reset on event-horizon contact. walls: axis-aligned rect obstacles.

export const LEVELS = [
  {
    name: "First Orbit",
    ball: { x: 110, y: 300 },
    hole: { x: 800, y: 300, radius: 20 },
    wells: [{ x: 460, y: 210, strength: 4_200_000, radius: 22 }],
    blackHole: null,
    walls: [],
    par: 2,
  },
  {
    name: "Ease Off",
    ball: { x: 110, y: 300 },
    hole: { x: 780, y: 300, radius: 18 },
    wells: [{ x: 660, y: 320, strength: 8_500_000, radius: 26 }],
    blackHole: null,
    walls: [],
    par: 2,
  },
  {
    name: "Over the Wall",
    ball: { x: 100, y: 520 },
    hole: { x: 800, y: 100, radius: 18 },
    wells: [{ x: 500, y: 170, strength: 7_000_000, radius: 24 }],
    blackHole: null,
    walls: [{ x: 440, y: 260, w: 30, h: 340 }],
    par: 3,
  },
  {
    name: "Thread the Needle",
    ball: { x: 90, y: 300 },
    hole: { x: 810, y: 300, radius: 18 },
    wells: [
      { x: 350, y: 170, strength: 6_000_000, radius: 22 },
      { x: 560, y: 430, strength: 6_000_000, radius: 22 },
    ],
    blackHole: null,
    walls: [],
    par: 3,
  },
  {
    name: "Event Horizon",
    ball: { x: 100, y: 300 },
    hole: { x: 800, y: 300, radius: 18 },
    wells: [{ x: 460, y: 150, strength: 7_000_000, radius: 22 }],
    blackHole: { x: 460, y: 320, strength: 20_000_000, horizonRadius: 30, radius: 20 },
    walls: [],
    par: 3,
  },
  {
    name: "Slingshot",
    ball: { x: 120, y: 520 },
    hole: { x: 780, y: 100, radius: 18 },
    wells: [{ x: 760, y: 470, strength: 3_500_000, radius: 18 }],
    blackHole: { x: 450, y: 300, strength: 24_000_000, horizonRadius: 26, radius: 20 },
    walls: [],
    par: 3,
  },
  {
    name: "Corridor",
    ball: { x: 90, y: 540 },
    hole: { x: 830, y: 70, radius: 18 },
    wells: [{ x: 420, y: 500, strength: 5_500_000, radius: 20 }],
    blackHole: null,
    walls: [
      { x: 260, y: 0, w: 30, h: 380 },
      { x: 560, y: 220, w: 30, h: 380 },
    ],
    par: 4,
  },
  {
    name: "The Gauntlet",
    ball: { x: 90, y: 300 },
    hole: { x: 820, y: 300, radius: 18 },
    wells: [
      { x: 300, y: 140, strength: 5_000_000, radius: 20 },
      { x: 620, y: 470, strength: 5_000_000, radius: 20 },
      { x: 700, y: 160, strength: 4_000_000, radius: 18 },
    ],
    blackHole: { x: 470, y: 300, strength: 19_000_000, horizonRadius: 28, radius: 20 },
    walls: [
      { x: 230, y: 340, w: 30, h: 260 },
      { x: 560, y: 0, w: 30, h: 260 },
    ],
    par: 4,
  },
];
