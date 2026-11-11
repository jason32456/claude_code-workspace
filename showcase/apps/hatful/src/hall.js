function adjacency(allowed, n) {
  return allowed.slice(0, n).map((row) => {
    const a = [];
    for (let j = 0; j < n; j++) if (row[j]) a.push(j);
    return a;
  });
}

export function maxMatching(allowed, n) {
  const adj = adjacency(allowed, n);
  const matchG = new Int32Array(n).fill(-1);
  const matchR = new Int32Array(n).fill(-1);
  let seen;
  const augment = (g) => {
    for (const r of adj[g]) {
      if (seen[r]) continue;
      seen[r] = 1;
      if (matchR[r] < 0 || augment(matchR[r])) {
        matchR[r] = g;
        matchG[g] = r;
        return true;
      }
    }
    return false;
  };
  let size = 0;
  for (let g = 0; g < n; g++) {
    seen = new Uint8Array(n);
    if (augment(g)) size++;
  }
  return { matchG, matchR, size };
}

// Givers reachable from an unmatched giver by alternating paths form a set S with |N(S)| = |S| - 1.
export function hallViolator(allowed, n) {
  const { matchG, matchR, size } = maxMatching(allowed, n);
  if (size === n) return null;
  const adj = adjacency(allowed, n);
  const start = matchG.findIndex((r) => r < 0);
  const visG = new Uint8Array(n);
  const visR = new Uint8Array(n);
  visG[start] = 1;
  const stack = [start];
  while (stack.length) {
    const g = stack.pop();
    for (const r of adj[g]) {
      if (visR[r]) continue;
      visR[r] = 1;
      const g2 = matchR[r];
      if (g2 >= 0 && !visG[g2]) {
        visG[g2] = 1;
        stack.push(g2);
      }
    }
  }
  const givers = [];
  const receivers = [];
  for (let i = 0; i < n; i++) {
    if (visG[i]) givers.push(i);
    if (visR[i]) receivers.push(i);
  }
  return { givers, receivers };
}
