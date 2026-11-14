// Held-Karp over Hamiltonian cycles through vertex 0. Vertices 1..n-1 map to bits 0..n-2.

export const LOOP_EXACT_MAX = 16;

const bitIndex = (low) => 31 - Math.clz32(low);

export function loopForward(allowed, n) {
  const m = n - 1;
  const size = 2 ** m;
  const full = size - 1;
  const rows = new Array(m);
  for (let v = 0; v < m; v++) {
    let r = 0;
    for (let u = 0; u < m; u++) if (allowed[v + 1][u + 1]) r |= 1 << u;
    rows[v] = r;
  }
  const h = new Float64Array(size * m);
  for (let v = 0; v < m; v++) if (allowed[0][v + 1]) h[(1 << v) * m + v] = 1;
  for (let mask = 1; mask < size; mask++) {
    for (let rest = mask; rest; rest &= rest - 1) {
      const last = bitIndex(rest & -rest);
      const val = h[mask * m + last];
      if (val === 0) continue;
      for (let av = rows[last] & ~mask & full; av; av &= av - 1) {
        const low = av & -av;
        h[(mask | low) * m + bitIndex(low)] += val;
      }
    }
  }
  return { m, size, full, rows, h };
}

function closing(allowed, n) {
  const w = new Array(n - 1);
  for (let v = 0; v < n - 1; v++) w[v] = allowed[v + 1][0] ? 1 : 0;
  return w;
}

export function loopCount(allowed, n) {
  const fw = loopForward(allowed, n);
  const { m, size, full, rows, h } = fw;
  const back = closing(allowed, n);
  const marginals = Array.from({ length: n }, () => new Array(n).fill(0));

  // g[mask*m+v] = ways to go on from v (having visited mask) through the rest and back to 0.
  const g = new Float64Array(size * m);
  for (let v = 0; v < m; v++) g[full * m + v] = back[v];
  for (let mask = full - 1; mask >= 1; mask--) {
    for (let rest = mask; rest; rest &= rest - 1) {
      const v = bitIndex(rest & -rest);
      let s = 0;
      for (let av = rows[v] & ~mask & full; av; av &= av - 1) {
        const low = av & -av;
        s += g[(mask | low) * m + bitIndex(low)];
      }
      g[mask * m + v] = s;
    }
  }

  let total = 0;
  for (let v = 0; v < m; v++) {
    const w = allowed[0][v + 1] ? g[(1 << v) * m + v] : 0;
    marginals[0][v + 1] = w;
    total += w;
    marginals[v + 1][0] = h[full * m + v] * back[v];
  }
  if (total === 0) return { total, marginals };
  for (let mask = 1; mask < size; mask++) {
    for (let rest = mask; rest; rest &= rest - 1) {
      const a = bitIndex(rest & -rest);
      const ha = h[mask * m + a];
      if (ha === 0) continue;
      for (let av = rows[a] & ~mask & full; av; av &= av - 1) {
        const low = av & -av;
        const u = bitIndex(low);
        marginals[a + 1][u + 1] += ha * g[(mask | low) * m + u];
      }
    }
  }
  for (const row of marginals) {
    let s = 0;
    for (const x of row) s += x;
    if (s > 0) for (let j = 0; j < n; j++) row[j] /= s;
  }
  return { total, marginals };
}

function pick(count, weightAt, rng) {
  let tot = 0;
  for (let i = 0; i < count; i++) tot += weightAt(i);
  const target = rng.next() * tot;
  let acc = 0;
  let chosen = -1;
  for (let i = 0; i < count; i++) {
    const w = weightAt(i);
    if (w === 0) continue;
    acc += w;
    chosen = i;
    if (target < acc) break;
  }
  return chosen;
}

// Walk the table backwards: exactly uniform over Hamiltonian cycles.
export function loopSample(allowed, n, fw, rng) {
  const { m, full, h } = fw;
  const back = closing(allowed, n);
  let last = pick(m, (v) => h[full * m + v] * back[v], rng);
  if (last < 0) return null;
  let mask = full;
  const seq = [];
  for (;;) {
    seq.push(last + 1);
    const prev = mask ^ (1 << last);
    if (prev === 0) break;
    const prevMask = prev;
    const cur = last;
    last = pick(
      m,
      (p) => (prevMask & (1 << p) && allowed[p + 1][cur + 1] ? h[prevMask * m + p] : 0),
      rng
    );
    mask = prevMask;
  }
  seq.reverse();
  const perm = new Array(n);
  perm[0] = seq[0];
  for (let i = 0; i + 1 < seq.length; i++) perm[seq[i]] = seq[i + 1];
  perm[seq[seq.length - 1]] = 0;
  return perm;
}
