// Preset menus. Times are typical home-kitchen figures, not lab measurements.
// Step fields: label, dur (min), hands (min of attention at the start),
// equip ('none' | 'burner' | 'oven'), temp (°C), slots (rack slots), hold
// (min the result may wait for the next step — for a dish's last step, for
// serving). `after` lists step ids when the step does not simply follow the
// one before it.

const S = (id, label, dur, hands, extra = {}) => ({ id, label, dur, hands, equip: 'none', temp: 0, slots: 1, hold: 0, ...extra });
const burner = (o = {}) => ({ equip: 'burner', ...o });
const oven = (temp, o = {}) => ({ equip: 'oven', temp, ...o });

export const PRESETS = [
  {
    key: 'roast',
    name: 'Sunday Roast',
    blurb: 'Beef at 180 °C, then the oven climbs to 220 °C for potatoes and Yorkshires while the beef rests.',
    serve: '13:30',
    kitchen: { cooks: 1, burners: 4, ovens: [{ name: 'Oven', slots: 2 }] },
    dishes: [
      { id: 'beef', name: 'Roast beef', color: 0, steps: [
        S('b1', 'Season and tie the joint', 8, 8, { hold: 60 }),
        S('b2', 'Sear all over', 10, 10, burner({ hold: 5 })),
        S('b3', 'Roast', 70, 2, oven(180, { hold: 10 })),
        S('b4', 'Rest under foil', 30, 1, { hold: 15 }),
        S('b5', 'Carve', 8, 8, { hold: 8 }),
      ] },
      { id: 'pots', name: 'Roast potatoes', color: 1, steps: [
        S('p1', 'Peel and cut', 15, 15, { hold: 90 }),
        S('p2', 'Parboil', 10, 2, burner({ hold: 15 })),
        S('p3', 'Steam-dry and rough up', 5, 5, { hold: 20 }),
        S('p4', 'Roast in hot fat', 50, 3, oven(220, { hold: 8 })),
      ] },
      { id: 'yorks', name: 'Yorkshire puddings', color: 2, steps: [
        S('y1', 'Whisk the batter', 6, 6, { hold: 240 }),
        S('y2', 'Heat the fat in the tin', 10, 1, oven(220, { hold: 1 })),
        S('y3', 'Bake — door shut', 22, 1, oven(220, { hold: 5 })),
      ] },
      { id: 'carrots', name: 'Honey carrots', color: 3, steps: [
        S('c1', 'Peel and slice', 8, 8, { hold: 120 }),
        S('c2', 'Simmer and glaze', 14, 2, burner({ hold: 6 })),
      ] },
      { id: 'greens', name: 'Buttered greens', color: 4, steps: [
        S('g1', 'Trim and shred', 5, 5, { hold: 120 }),
        S('g2', 'Steam', 6, 1, burner({ hold: 3 })),
      ] },
      { id: 'gravy', name: 'Gravy', color: 5, steps: [
        S('v1', 'Deglaze the tin, whisk in stock', 15, 8, burner({ after: ['b3'], hold: 45 })),
      ] },
    ],
  },
  {
    key: 'thanksgiving',
    name: 'Thanksgiving',
    blurb: 'Six sides fighting for one oven during the turkey’s rest — the classic bottleneck.',
    serve: '17:00',
    kitchen: { cooks: 1, burners: 4, ovens: [{ name: 'Oven', slots: 3 }] },
    dishes: [
      { id: 'turkey', name: 'Turkey', color: 0, steps: [
        S('t1', 'Butter and season', 15, 15, { hold: 60 }),
        S('t2', 'Roast', 180, 3, oven(165, { slots: 2, hold: 10 })),
        S('t3', 'Rest', 40, 1, { hold: 20 }),
        S('t4', 'Carve', 15, 15, { hold: 10 }),
      ] },
      { id: 'stuffing', name: 'Stuffing', color: 1, steps: [
        S('s1', 'Sweat onion and celery', 12, 6, burner({ hold: 60 })),
        S('s2', 'Mix with bread and stock', 8, 8, { hold: 45 }),
        S('s3', 'Bake', 40, 1, oven(180, { hold: 15 })),
      ] },
      { id: 'sweet', name: 'Sweet potato casserole', color: 2, steps: [
        S('w1', 'Peel and cube', 12, 12, { hold: 120 }),
        S('w2', 'Boil', 18, 1, burner({ hold: 30 })),
        S('w3', 'Mash, top with pecans', 10, 10, { hold: 60 }),
        S('w4', 'Bake', 30, 1, oven(180, { hold: 15 })),
      ] },
      { id: 'mash', name: 'Mashed potatoes', color: 3, steps: [
        S('m1', 'Peel and cut', 15, 15, { hold: 120 }),
        S('m2', 'Boil', 22, 1, burner({ hold: 5 })),
        S('m3', 'Mash with butter and cream', 8, 8, { hold: 20 }),
      ] },
      { id: 'beans', name: 'Green bean almondine', color: 4, steps: [
        S('n1', 'Trim beans', 10, 10, { hold: 180 }),
        S('n2', 'Blanch and sauté with almonds', 10, 6, burner({ hold: 5 })),
      ] },
      { id: 'rolls', name: 'Dinner rolls', color: 5, steps: [
        S('r1', 'Bake', 15, 1, oven(190, { hold: 10 })),
      ] },
      { id: 'tgravy', name: 'Gravy', color: 6, steps: [
        S('v2', 'Drippings, roux and stock', 15, 10, burner({ after: ['t2'], hold: 60 })),
      ] },
      { id: 'pie', name: 'Pumpkin pie', color: 7, offset: 60, steps: [
        S('k1', 'Blind-bake the crust', 15, 2, oven(190, { hold: 30 })),
        S('k2', 'Fill and bake', 50, 3, oven(175, { hold: 30 })),
        S('k3', 'Cool to set', 120, 0, { hold: 360 }),
      ] },
    ],
  },
  {
    key: 'pasta',
    name: 'Weeknight Pasta',
    blurb: 'Two burners, one cook, and pasta that waits for nobody.',
    serve: '19:30',
    kitchen: { cooks: 1, burners: 2, ovens: [{ name: 'Oven', slots: 2 }] },
    dishes: [
      { id: 'pasta', name: 'Spaghetti', color: 0, steps: [
        S('a1', 'Bring water to the boil', 12, 1, burner({ hold: 15 })),
        S('a2', 'Cook pasta', 10, 1, burner({ hold: 1 })),
        S('a3', 'Toss with the sauce', 3, 3, { after: ['a2', 'u3'], hold: 2 }),
      ] },
      { id: 'sauce', name: 'Tomato sauce', color: 1, steps: [
        S('u1', 'Chop onion and garlic', 8, 8, { hold: 30 }),
        S('u2', 'Sauté', 8, 6, burner({ hold: 2 })),
        S('u3', 'Add tomatoes, simmer', 20, 1, burner({ hold: 10 })),
      ] },
      { id: 'bread', name: 'Garlic bread', color: 2, steps: [
        S('d1', 'Make garlic butter, spread', 6, 6, { hold: 60 }),
        S('d2', 'Bake', 10, 1, oven(200, { hold: 6 })),
      ] },
      { id: 'salad', name: 'Green salad', color: 3, steps: [
        S('l1', 'Wash and dry leaves', 6, 6, { hold: 45 }),
        S('l2', 'Whisk dressing, toss', 3, 3, { hold: 4 }),
      ] },
    ],
  },
  {
    key: 'party',
    name: 'Dinner Party',
    blurb: 'Three courses, two cooks, two ovens: soup out at −30, duck at 0, fondants at +45.',
    serve: '20:30',
    kitchen: { cooks: 2, burners: 4, ovens: [{ name: 'Main oven', slots: 2 }, { name: 'Top oven', slots: 1 }] },
    dishes: [
      { id: 'soup', name: 'Roast squash soup', color: 0, offset: -30, steps: [
        S('q1', 'Cube squash', 12, 12, { hold: 120 }),
        S('q2', 'Roast', 35, 2, oven(200, { hold: 30 })),
        S('q3', 'Blend with stock and simmer', 15, 6, burner({ hold: 20 })),
      ] },
      { id: 'duck', name: 'Duck breast', color: 1, steps: [
        S('k4', 'Score and salt the skin', 8, 8, { hold: 120 }),
        S('k5', 'Render skin-side down', 12, 4, burner({ hold: 3 })),
        S('k6', 'Finish in the oven', 8, 1, oven(200, { hold: 1 })),
        S('k7', 'Rest and slice', 8, 3, { hold: 3 }),
      ] },
      { id: 'gratin', name: 'Gratin dauphinois', color: 2, steps: [
        S('x1', 'Slice potatoes thin', 15, 15, { hold: 60 }),
        S('x2', 'Bake in cream', 75, 2, oven(160, { hold: 20 })),
      ] },
      { id: 'sauce2', name: 'Cherry jus', color: 3, steps: [
        S('j1', 'Reduce stock, port and cherries', 20, 4, burner({ hold: 30 })),
      ] },
      { id: 'beans2', name: 'Fine beans', color: 4, steps: [
        S('e1', 'Top and tail', 6, 6, { hold: 120 }),
        S('e2', 'Blanch', 5, 1, burner({ hold: 3 })),
      ] },
      { id: 'fondant', name: 'Chocolate fondants', color: 5, offset: 45, steps: [
        S('f1', 'Melt, whisk, fill moulds', 20, 20, { hold: 240 }),
        S('f2', 'Chill', 60, 0, { hold: 180 }),
        S('f3', 'Bake', 12, 1, oven(200, { hold: 2 })),
      ] },
    ],
  },
];

export const DISH_COLORS = 8;

// A small library of ready-made dishes for the "Add dish" menu.
export const LIBRARY = [
  { name: 'Rice', steps: [S('_1', 'Rinse', 3, 3, { hold: 60 }), S('_2', 'Simmer covered', 15, 1, burner({ hold: 0 })), S('_3', 'Steam off the heat', 10, 0, { hold: 15 })] },
  { name: 'Roast vegetables', steps: [S('_1', 'Chop and oil', 12, 12, { hold: 60 }), S('_2', 'Roast', 35, 2, oven(200, { hold: 10 }))] },
  { name: 'Steamed greens', steps: [S('_1', 'Trim', 5, 5, { hold: 120 }), S('_2', 'Steam', 6, 1, burner({ hold: 3 }))] },
  { name: 'Baked salmon', steps: [S('_1', 'Season fillets', 5, 5, { hold: 60 }), S('_2', 'Bake', 14, 1, oven(200, { hold: 4 }))] },
  { name: 'Bread rolls', steps: [S('_1', 'Warm through', 8, 1, oven(180, { hold: 10 }))] },
  { name: 'Custard', steps: [S('_1', 'Whisk yolks and sugar', 5, 5, { hold: 30 }), S('_2', 'Cook gently, stirring', 12, 12, burner({ hold: 30 }))] },
  { name: 'Blank dish', steps: [S('_1', 'Prep', 10, 10, { hold: 30 }), S('_2', 'Cook', 20, 2, burner({ hold: 5 }))] },
];
