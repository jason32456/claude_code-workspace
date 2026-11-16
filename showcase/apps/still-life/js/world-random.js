export function nextRandom(rt) {
  rt.rng = (rt.rng + 0x6d2b79f5) | 0;
  let t = rt.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(rt, min, max) {
  return min + Math.floor(nextRandom(rt) * (max - min + 1));
}
