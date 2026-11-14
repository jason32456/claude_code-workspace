// Bitmask DP for mode 'any'. Valid for n <= 22 (tables hold 2^n doubles each).

export const DP_MAX = 22;

let popCache = new Uint8Array(2);
function popTable(n) {
  const size = 2 ** n;
  if (popCache.length < size) {
    const t = new Uint8Array(size);
    for (let m = 1; m < size; m++) t[m] = t[m >> 1] + (m & 1);
    popCache = t;
  }
  return popCache;
}

const bitIndex = (low) => 31 - Math.clz32(low);

export function rowMasks(allowed, n) {
  if (n > DP_MAX) throw new RangeError('bitmask tables support n <= ' + DP_MAX);
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = 0; j < n; j++) if (allowed[i][j]) m |= 1 << j;
    rows[i] = m >>> 0;
  }
  return rows;
}

// b[mask] = ways for givers popcount(mask)..n-1 to fill the receivers not in mask.
export function backwardTable(rows, n) {
  const size = 2 ** n;
  const full = size - 1;
  const pc = popTable(n);
  const b = new Float64Array(size);
  b[full] = 1;
  for (let mask = full - 1; mask >= 0; mask--) {
    let avail = rows[pc[mask]] & ~mask & full;
    let s = 0;
    while (avail) {
      const low = avail & -avail;
      s += b[mask | low];
      avail ^= low;
    }
    b[mask] = s;
  }
  return b;
}

// f[mask] = ways for givers 0..popcount(mask)-1 to use exactly the receivers in mask.
function forwardTable(rows, n) {
  const size = 2 ** n;
  const full = size - 1;
  const pc = popTable(n);
  const f = new Float64Array(size);
  f[0] = 1;
  for (let mask = 0; mask < full; mask++) {
    const v = f[mask];
    if (v === 0) continue;
    let avail = rows[pc[mask]] & ~mask & full;
    while (avail) {
      const low = avail & -avail;
      f[mask | low] += v;
      avail ^= low;
    }
  }
  return f;
}

export function countAndMarginals(rows, n) {
  const size = 2 ** n;
  const full = size - 1;
  const pc = popTable(n);
  const b = backwardTable(rows, n);
  const f = forwardTable(rows, n);
  const total = f[full];
  const marginals = Array.from({ length: n }, () => new Array(n).fill(0));
  if (total === 0) return { total, marginals };
  for (let mask = 0; mask < full; mask++) {
    const v = f[mask];
    if (v === 0) continue;
    const k = pc[mask];
    const row = marginals[k];
    let avail = rows[k] & ~mask & full;
    while (avail) {
      const low = avail & -avail;
      row[bitIndex(low)] += v * b[mask | low];
      avail ^= low;
    }
  }
  for (const row of marginals) {
    let s = 0;
    for (const x of row) s += x;
    if (s > 0) for (let j = 0; j < n; j++) row[j] /= s;
  }
  return { total, marginals };
}

// Exactly uniform over valid permutations: P(j | mask) = b[mask|j] / b[mask].
export function sampleAny(rows, n, b, rng) {
  const full = 2 ** n - 1;
  const perm = new Array(n);
  let mask = 0;
  for (let k = 0; k < n; k++) {
    const target = rng.next() * b[mask];
    let avail = rows[k] & ~mask & full;
    let acc = 0;
    let pick = 0;
    while (avail) {
      const low = avail & -avail;
      avail ^= low;
      const w = b[mask | low];
      if (w === 0) continue;
      acc += w;
      pick = low;
      if (target < acc) break;
    }
    perm[k] = bitIndex(pick);
    mask |= pick;
  }
  return perm;
}
