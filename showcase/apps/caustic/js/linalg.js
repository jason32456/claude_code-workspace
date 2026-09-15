// Cholesky with jitter escalation.
//
// Every solve here is deliberately close to singular — at the interpolation
// threshold the Gram matrix IS singular, and that is the phenomenon, not a bug.
// So the solver has to degrade honestly rather than return noise: it adds the
// smallest ridge that makes the factorisation succeed and reports how much it
// needed, and the caller can refuse the result if the jitter grew large enough
// to have invented the answer.

function cholesky(A, m, jitter) {
  const L = new Float64Array(m * m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * m + j] + (i === j ? jitter : 0);
      for (let k = 0; k < j; k++) s -= L[i * m + k] * L[j * m + k];
      if (i === j) {
        if (!(s > 0)) return null;
        L[i * m + i] = Math.sqrt(s);
      } else {
        L[i * m + j] = s / L[j * m + j];
      }
    }
  }
  return L;
}

function cholSolve(L, b, m) {
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * m + k] * y[k];
    y[i] = s / L[i * m + i];
  }
  const x = new Float64Array(m);
  for (let i = m - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < m; k++) s -= L[k * m + i] * x[k];
    x[i] = s / L[i * m + i];
  }
  return x;
}

// Solve (A + lambda*I) x = b for symmetric positive semi-definite A.
// `lambda` is relative to the mean diagonal, so it means the same thing
// regardless of how the features happen to be scaled.
export function solveSPD(A, b, m, lambdaRel) {
  let tr = 0;
  for (let i = 0; i < m; i++) tr += A[i * m + i];
  const scale = tr / m || 1;
  const ladder = [lambdaRel, 1e-13, 1e-11, 1e-9, 1e-7, 1e-5];
  for (const mult of ladder) {
    const L = cholesky(A, m, mult * scale);
    if (!L) continue;
    const x = cholSolve(L, b, m);
    let ok = true;
    for (let i = 0; i < m; i++) if (!Number.isFinite(x[i])) { ok = false; break; }
    if (ok) return { x, jitter: mult, exact: mult <= lambdaRel };
  }
  return { x: new Float64Array(m), jitter: Infinity, exact: false };
}
