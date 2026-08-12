// Levels are pure data. Everything is in metres with y pointing down, matching
// the canvas, and the deck line sits at y = 8 in every level so the truck always
// starts from the same height.

const DECK_Y = 8;
const WORLD = { w: 34, h: 19 };

// Terrain rectangles: the two platforms, plus any piers or towers.
function cliffs(gapL, gapR) {
  return [
    { x: 0, y: DECK_Y, w: gapL, h: WORLD.h - DECK_Y },
    { x: gapR, y: DECK_Y, w: WORLD.w - gapR, h: WORLD.h - DECK_Y },
  ];
}

function level({ id, name, hint, gapL, gapR, budget, extraSolids = [], extraAnchors = [], noBuild = [] }) {
  return {
    id,
    name,
    hint,
    budget,
    world: WORLD,
    deckY: DECK_Y,
    solids: [...cliffs(gapL, gapR), ...extraSolids],
    anchors: [
      { x: gapL, y: DECK_Y },
      { x: gapR, y: DECK_Y },
      ...extraAnchors,
    ],
    noBuild,
    build: { x: gapL - 2, y: 2, w: gapR - gapL + 4, h: 12 },
    spawn: { x: gapL - 5.5, y: DECK_Y },
    goal: { x: gapR + 2, y: DECK_Y },
  };
}

export const LEVELS = [
  level({
    id: 'first-crossing',
    name: 'First Crossing',
    hint: 'Drag along the deck line to lay road, then brace it with beams. Cheap and straight beats clever.',
    gapL: 12,
    gapR: 18,
    budget: 320,
  }),
  level({
    id: 'span',
    name: 'Span',
    hint: 'The gap is wider than any single member. Road needs joints in mid-air, and joints in mid-air need holding up.',
    gapL: 11,
    gapR: 19,
    budget: 400,
  }),
  level({
    id: 'two-towers',
    name: 'Two Towers',
    hint: 'A pier in the river turns one long span into two short ones — but a bare column of pin joints folds like a knee. Triangulate it.',
    gapL: 10,
    gapR: 22,
    budget: 720,
    extraSolids: [{ x: 14, y: 13, w: 4, h: WORLD.h - 13 }],
    extraAnchors: [
      { x: 14, y: 13 },
      { x: 18, y: 13 },
    ],
  }),
  level({
    id: 'deep-ravine',
    name: 'Deep Ravine',
    hint: 'Nothing to land on. A flat deck sags until it tears — put depth in the structure, above or below.',
    gapL: 11,
    gapR: 21,
    budget: 480,
  }),
  level({
    id: 'cable-stay',
    name: 'Cable Stay',
    hint: 'Cables are a quarter the price of beams and pull beautifully. They also do absolutely nothing in compression.',
    gapL: 11,
    gapR: 21,
    budget: 340,
    // Pylons stand on the far side of the carriageway: they anchor stays but
    // the truck drives straight past them.
    extraSolids: [
      { x: 10, y: 3, w: 1, h: 5, ghost: true },
      { x: 21, y: 3, w: 1, h: 5, ghost: true },
    ],
    extraAnchors: [
      { x: 10, y: 3 },
      { x: 11, y: 3 },
      { x: 21, y: 3 },
      { x: 22, y: 3 },
    ],
  }),
  level({
    id: 'long-haul',
    name: 'The Long Haul',
    hint: 'Fourteen metres and not much money. Every member you can delete is money for one you cannot.',
    gapL: 10,
    gapR: 24,
    budget: 800,
  }),
  level({
    id: 'clearance',
    name: 'Clearance',
    hint: 'Shipping channel — nothing may cross the hatched zone. If you cannot go under, go over.',
    gapL: 11,
    gapR: 21,
    budget: 500,
    noBuild: [{ x: 13, y: 8.6, w: 6, h: 10 }],
  }),
  level({
    id: 'sandbox',
    name: 'Sandbox',
    hint: 'Seventeen metres, a pier, and more money than sense. Build the thing you have been sketching.',
    gapL: 9,
    gapR: 26,
    budget: 6000,
    extraSolids: [{ x: 17, y: 14, w: 2, h: WORLD.h - 14 }],
    extraAnchors: [
      { x: 17, y: 14 },
      { x: 19, y: 14 },
    ],
  }),
];

export function levelIndexById(id) {
  return Math.max(0, LEVELS.findIndex((l) => l.id === id));
}
