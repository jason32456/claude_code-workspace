// Yard geometry. s is distance along the track from the hump crest (s = 0),
// positive into the bowl. Every path shares the lead up to the first switch;
// three levels of switches fan it into eight tracks.

export const G = 9.81;
export const NODES = [95, 135, 175];        // switch points, by ladder level
export const SPREAD = [10, 5, 2.5];         // lateral offset added at each level
export const TRANS = 30;                     // length of each switch curve
export const FOUL = 28;                      // fouling point past the points
export const CLEAR = NODES[2] + TRANS;       // 205: clearance point of the bowl
export const MASTER = [42, 78];              // master retarder
export const TRACK_RET = [207, 250];         // track retarders
export const BOWL = 250;                     // usable bowl starts here
export const TRACK_END = [520, 585, 630, 665, 665, 630, 585, 520];
export const N_TRACKS = 8;
export const APPROACH = -420;

// Grade as a fraction, positive = descending toward the bowl.
export function grade(s, leaf = -1) {
  if (s < 0) return -0.012;
  if (s < 35) return 0.040;
  if (s < 80) return 0.015;
  if (s < 205) return 0.008;
  if (s < 250) return 0.006;
  if (s < 320) return 0.003;
  return 0.0005;
}

// Equivalent-grade resistance of the switch curves.
export function curveRes(s) {
  for (const n of NODES) if (s > n && s < n + TRANS) return 0.0006;
  return 0;
}

const Y0 = 5.4, STEP = 0.5, LO = APPROACH - 20, HI = 720;
const yTab = new Float32Array(Math.ceil((HI - LO) / STEP) + 2);
{
  let y = Y0 - 0.012 * -LO; // approach rises toward the crest
  for (let i = 0; i < yTab.length; i++) {
    yTab[i] = y;
    const s = LO + i * STEP;
    y -= grade(s + STEP / 2) * STEP;
  }
}
export function height(s, leaf = -1) {
  const f = (Math.min(Math.max(s, LO), HI) - LO) / STEP;
  const i = Math.floor(f);
  let y = yTab[i] + (yTab[i + 1] - yTab[i]) * (f - i);
  return y;
}

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export const leafBits = (leaf) => [(leaf >> 2) & 1, (leaf >> 1) & 1, leaf & 1];
export const bitsLeaf = (b) => b[0] * 4 + b[1] * 2 + b[2];

// Lateral offset of the path through `bits` at distance s.
export function lateral(s, bits) {
  let z = 0;
  for (let k = 0; k < 3; k++) {
    const u = smooth((s - NODES[k]) / TRANS);
    if (u > 0) z += (bits[k] ? 1 : -1) * SPREAD[k] * u;
  }
  return z;
}

export const trackZ = (leaf) => lateral(1000, leafBits(leaf));

// World point (x, y, z) on a path. x is s, which is accurate to within a few
// per cent through the switch curves.
export function point(s, bits, leaf = -1) {
  return [s, height(s, leaf), lateral(s, bits)];
}

// Heading of the path in the x-z plane, for orienting cars.
export function yaw(s, bits) {
  const d = lateral(s + 0.5, bits) - lateral(s - 0.5, bits);
  return Math.atan2(d, 1);
}

// Switch index for level k given the bits above it: 0 | 1..2 | 3..6.
export function switchIndex(k, bits) {
  if (k === 0) return 0;
  if (k === 1) return 1 + bits[0];
  return 3 + bits[0] * 2 + bits[1];
}
export function switchNode(i) {
  if (i === 0) return { k: 0, prefix: [] };
  if (i < 3) return { k: 1, prefix: [i - 1] };
  return { k: 2, prefix: [(i - 3) >> 1, (i - 3) & 1] };
}
