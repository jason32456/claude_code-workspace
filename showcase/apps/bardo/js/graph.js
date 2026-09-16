// The one place the project's original verdict survives.
//
// At delta > 0 discounting bounds rho(DP) below 1 and every doctrine prices.
// At exactly delta = 0 that protection is gone, and the actuarial present value
// is finite precisely when liberation is reached almost surely — i.e. when the
// expected number of lives is finite. That is a property of the transition
// DIGRAPH and nothing else: no mortality law, no benefit, no arithmetic.
//
// A state prices at zero discount iff every recurrent class it can reach is
// the liberation class. Tarjan gives the classes; a closed class without
// liberation is a trap.

// Iterative Tarjan — recursion would be fine at this size, but the explicit
// stack makes the algorithm auditable against the brute-force check in
// selftest 10.
export function tarjanSCC(P, eps = 0) {
  const n = P.length;
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack = [];
  const comps = [];
  let counter = 0;

  const succ = (u) => {
    const out = [];
    for (let v = 0; v < n; v++) if (P[u][v] > eps) out.push(v);
    return out;
  };

  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    const work = [{ u: root, edges: succ(root), k: 0 }];
    index[root] = low[root] = counter++;
    stack.push(root); onStack[root] = 1;

    while (work.length) {
      const frame = work[work.length - 1];
      if (frame.k < frame.edges.length) {
        const v = frame.edges[frame.k++];
        if (index[v] === -1) {
          index[v] = low[v] = counter++;
          stack.push(v); onStack[v] = 1;
          work.push({ u: v, edges: succ(v), k: 0 });
        } else if (onStack[v]) {
          low[frame.u] = Math.min(low[frame.u], index[v]);
        }
      } else {
        work.pop();
        if (work.length) {
          const p = work[work.length - 1].u;
          low[p] = Math.min(low[p], low[frame.u]);
        }
        if (low[frame.u] === index[frame.u]) {
          const comp = [];
          for (;;) {
            const w = stack.pop();
            onStack[w] = 0;
            comp.push(w);
            if (w === frame.u) break;
          }
          comps.push(comp.sort((a, b) => a - b));
        }
      }
    }
  }
  return comps;
}

// Transitive reachability, built from the SCC condensation.
export function reachability(P, eps = 0) {
  const n = P.length;
  const reach = Array.from({ length: n }, () => new Uint8Array(n));
  for (let s = 0; s < n; s++) {
    const seen = reach[s];
    const q = [s];
    seen[s] = 1;
    while (q.length) {
      const u = q.pop();
      for (let v = 0; v < n; v++) {
        if (P[u][v] > eps && !seen[v]) { seen[v] = 1; q.push(v); }
      }
    }
  }
  return reach;
}

// A class is closed (recurrent) when no edge leaves it.
function isClosed(P, comp, eps) {
  const inComp = new Set(comp);
  for (const u of comp) {
    for (let v = 0; v < P.length; v++) {
      if (P[u][v] > eps && !inComp.has(v)) return false;
    }
  }
  return true;
}

export function classify(model, eps = 1e-14) {
  const { P, liberationIndex: L, N } = model;
  const comps = tarjanSCC(P, eps);
  const reach = reachability(P, eps);

  const classes = comps.map((comp) => ({
    members: comp,
    closed: isClosed(P, comp, eps),
    isLiberation: comp.length === 1 && comp[0] === L,
  }));

  const traps = classes.filter((c) => c.closed && !c.isLiberation);
  const trapMembers = new Set(traps.flatMap((c) => c.members));

  // Finite at zero discount iff no reachable closed class other than
  // liberation. Equivalently: the state cannot reach any trap.
  const finiteAtZero = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    let hitsTrap = false;
    for (const t of trapMembers) if (reach[s][t]) { hitsTrap = true; break; }
    finiteAtZero[s] = hitsTrap ? 0 : 1;
  }

  const sealedStates = [];
  for (let s = 0; s < N; s++) if (s !== L && !reach[s][L]) sealedStates.push(s);

  const nFinite = Array.from(finiteAtZero).filter((v, i) => v && i !== L).length;
  const nCycle = N - 1;
  const verdict =
    nFinite === nCycle ? 'absorbing' : nFinite === 0 ? 'recurrent' : 'mixed';

  return { classes, traps, finiteAtZero, sealedStates, verdict, nFinite, nCycle };
}

// Expected number of lives before liberation, on the transient block only.
// (I - Q)^{-1} 1. Returns null when the block is not transient, which is the
// honest answer for a doctrine with no exit rather than a large number.
export function expectedLives(model) {
  const { P, liberationIndex: L, N } = model;
  const cls = classify(model);
  const transient = [];
  for (let s = 0; s < N; s++) if (s !== L && cls.finiteAtZero[s]) transient.push(s);
  if (transient.length === 0) return { lives: null, transient: [] };

  const k = transient.length;
  const A = Array.from({ length: k }, () => new Float64Array(k));
  for (let a = 0; a < k; a++) {
    for (let b = 0; b < k; b++) {
      A[a][b] = (a === b ? 1 : 0) - P[transient[a]][transient[b]];
    }
  }
  // Solved here with a local Gauss-Jordan rather than la.solve so that
  // selftest 11 compares two independently written eliminations.
  const b = new Float64Array(k).fill(1);
  for (let col = 0; col < k; col++) {
    let best = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(A[r][col]) > Math.abs(A[best][col])) best = r;
    if (Math.abs(A[best][col]) < 1e-14) return { lives: null, transient };
    if (best !== col) {
      const t = A[best]; A[best] = A[col]; A[col] = t;
      const tb = b[best]; b[best] = b[col]; b[col] = tb;
    }
    const piv = A[col][col];
    for (let j = col; j < k; j++) A[col][j] /= piv;
    b[col] /= piv;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (f === 0) continue;
      for (let j = col; j < k; j++) A[r][j] -= f * A[col][j];
      b[r] -= f * b[col];
    }
  }
  const lives = new Map();
  for (let a = 0; a < k; a++) lives.set(transient[a], b[a]);
  return { lives, transient };
}
