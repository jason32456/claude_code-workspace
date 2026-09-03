// Order cards. Each target is a silhouette r(u) over its own length, where
// u = 0 is the end on the pipe (which becomes the base once it is cracked off)
// and u = 1 is the tip (which becomes the mouth).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const bump = (u, c, w) => Math.exp(-(((u - c) / w) ** 2));

export const ORDERS = [
  {
    id: 'tumbler',
    name: 'Tumbler',
    buyer: 'Six for the cafe on Warren St.',
    brief: 'Straight wall, open, flat base. Nothing clever.',
    length: 11,
    open: true,
    flatBase: true,
    tol: 0.95,
    hint: 'Blow it out, keep rolling, shear the tip open, then block the wall straight.',
    r: (u) => 0.7 + 1.62 * smooth(0, 0.22, u) + 0.32 * u,
  },
  {
    id: 'budvase',
    name: 'Bud Vase',
    buyer: 'A florist who is very specific.',
    brief: 'Round body, long narrow neck, small lip.',
    length: 13,
    open: true,
    flatBase: true,
    tol: 0.9,
    hint: 'Blow the body, reheat, then jack the neck in and pull it out long.',
    r: (u) => 0.55 + 2.55 * bump(u, 0.3, 0.24) + 0.75 * smooth(0.55, 1, u) + 0.45 * bump(u, 1, 0.09),
  },
  {
    id: 'bowl',
    name: 'Bowl',
    buyer: 'Restaurant service, eight covers.',
    brief: 'Shallow and wide. All rim, no wall.',
    length: 7.5,
    open: true,
    flatBase: true,
    tol: 1.0,
    hint: 'Shear it open early, then spin it hot — the rim opens on its own.',
    r: (u) => 0.7 + 0.75 * smooth(0, 0.16, u) + 3.35 * u ** 1.9,
  },
  {
    id: 'decanter',
    name: 'Decanter',
    buyer: 'Wedding gift. No pressure.',
    brief: 'Heavy belly, tall neck, tight mouth. Closed form.',
    length: 15,
    open: false,
    flatBase: true,
    tol: 0.85,
    hint: 'Never shear this one. Chill the neck so the breath goes into the belly.',
    r: (u) => 0.6 + 2.95 * bump(u, 0.32, 0.22) + 0.85 * smooth(0.55, 0.8, u) - 0.15 * smooth(0.9, 1, u),
  },
  {
    id: 'amphora',
    name: 'Amphora',
    buyer: 'The gallery, for the window.',
    brief: 'Belly, neck and a flared lip. One gather.',
    length: 16,
    open: true,
    flatBase: false,
    tol: 0.85,
    hint: 'Body, then neck, then open it and flare the lip last while it is hottest.',
    r: (u) => 0.6 + 2.85 * bump(u, 0.3, 0.22) + 0.9 * smooth(0.5, 0.75, u) + 1.35 * bump(u, 1, 0.07),
  },
];

export function targetProfile(order, samples = 32) {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) out[i] = order.r(i / (samples - 1));
  return out;
}

export function scorePiece(glass, order) {
  const samples = 32;
  const mine = glass.profile(samples);
  const want = targetProfile(order, samples);

  let err = 0;
  for (let i = 0; i < samples; i++) err += Math.abs(mine[i] - want[i]);
  err /= samples;
  let profile = clamp(1 - err / order.tol, 0, 1);
  const lenErr = Math.abs(glass.L - order.length) / order.length;
  profile *= clamp(1 - lenErr / 0.62, 0, 1);

  // sustained wobble costs more than one brief lapse you recovered from
  const sag = 0.62 * glass.meanSag() + 0.38 * glass.maxSag();
  const symmetry = clamp(1 - sag / 0.62, 0, 1);

  const w = glass.meanWall();
  let wall;
  if (w < 0.12) wall = clamp(w / 0.12, 0, 1) * 0.6;
  else if (w > 0.5) wall = clamp(1 - (w - 0.5) / 0.55, 0, 1);
  else wall = 1;

  let rim = glass.opened === order.open ? 0.7 : 0;
  if (!order.flatBase) rim += 0.3;
  else rim += 0.3 * clamp(glass.baseFlat, 0, 1);

  const total = Math.round(100 * (0.55 * profile + 0.15 * symmetry + 0.15 * wall + 0.15 * rim));
  return {
    total,
    grade: gradeOf(total),
    parts: [
      ['Profile', Math.round(profile * 100)],
      ['Symmetry', Math.round(symmetry * 100)],
      ['Wall', Math.round(wall * 100)],
      ['Rim & base', Math.round(rim * 100)],
    ],
    note: noteFor(glass, order, { profile, symmetry, wall, rim, w, lenErr }),
  };
}

export function gradeOf(total) {
  if (total >= 90) return 'MASTER';
  if (total >= 75) return 'JOURNEYMAN';
  if (total >= 60) return 'APPRENTICE';
  return 'SECOND';
}

function noteFor(glass, order, d) {
  if (glass.opened !== order.open) {
    return order.open
      ? 'They ordered an open form. This one is still sealed.'
      : 'You sheared a closed form open. It cannot hold anything now.';
  }
  if (d.symmetry < 0.5) return 'It wobbles. You stopped rolling while it was soft.';
  if (d.wall < 0.6) {
    return d.w < 0.2
      ? 'Walls are paper thin — it would not survive the box.'
      : 'Far too heavy. There is a gather in there you never blew out.';
  }
  if (d.lenErr > 0.3) return glass.L > order.length ? 'Overlong. You pulled too hard.' : 'Short. It needed more length.';
  if (d.profile < 0.5) return 'The silhouette is not the one on the card.';
  if (d.profile < 0.8) return 'Close, but the curve drifts from the drawing.';
  return 'Clean work. That goes straight to the annealer.';
}
