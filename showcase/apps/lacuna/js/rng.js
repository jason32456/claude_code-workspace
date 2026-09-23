// Seeded randomness, so every measurement pattern and every bench trial can be
// replayed exactly from its seed.

export function rng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  next.gauss = () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0;
    while (u === 0) u = next();
    const r = Math.sqrt(-2 * Math.log(u)), a = 2 * Math.PI * next();
    spare = r * Math.sin(a);
    return r * Math.cos(a);
  };
  next.int = (n) => Math.floor(next() * n);
  return next;
}

export function permutation(n, rand) {
  const p = new Int32Array(n);
  for (let i = 0; i < n; i++) p[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = rand.int(i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  return p;
}
