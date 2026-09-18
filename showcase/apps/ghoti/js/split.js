// Deterministic train / held-out split.
//
// Everything reported as accuracy is measured on words the model never trained on,
// and the split is seeded so the number on screen is the number you get on reload.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSplit(nWords, { seed = 20250915, heldOutFraction = 0.1 } = {}) {
  const order = new Uint32Array(nWords);
  for (let i = 0; i < nWords; i++) order[i] = i;
  const rand = mulberry32(seed);
  for (let i = nWords - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  const nHeld = Math.floor(nWords * heldOutFraction);
  return { heldOut: order.slice(0, nHeld), train: order.slice(nHeld) };
}
