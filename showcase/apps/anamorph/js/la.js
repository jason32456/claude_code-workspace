// Linear algebra written out by hand. Nothing here is clever; it is all here so
// that the pose solver has no dependency it did not author, and so the self-test
// pane can check each piece against an answer derived somewhere else.

export function zeros(n) { return new Float64Array(n); }

// Row-major m x n.
export function mat(m, n) { return { m, n, d: new Float64Array(m * n) }; }

export function matFrom(m, n, arr) { return { m, n, d: Float64Array.from(arr) }; }

export function at(A, i, j) { return A.d[i * A.n + j]; }
export function set(A, i, j, v) { A.d[i * A.n + j] = v; }

export function transpose(A) {
  const T = mat(A.n, A.m);
  for (let i = 0; i < A.m; i++) for (let j = 0; j < A.n; j++) T.d[j * A.m + i] = A.d[i * A.n + j];
  return T;
}

export function matmul(A, B) {
  if (A.n !== B.m) throw new Error(`matmul shape ${A.m}x${A.n} * ${B.m}x${B.n}`);
  const C = mat(A.m, B.n);
  for (let i = 0; i < A.m; i++) {
    for (let k = 0; k < A.n; k++) {
      const a = A.d[i * A.n + k];
      if (a === 0) continue;
      for (let j = 0; j < B.n; j++) C.d[i * B.n + j] += a * B.d[k * B.n + j];
    }
  }
  return C;
}

// Gaussian elimination with partial pivoting. Returns null on a singular system
// rather than handing back infinities for a caller to discover later.
export function solve(A, b) {
  const n = A.m;
  const M = Float64Array.from(A.d);
  const x = Float64Array.from(b);
  for (let c = 0; c < n; c++) {
    let piv = c, best = Math.abs(M[c * n + c]);
    for (let r = c + 1; r < n; r++) {
      const v = Math.abs(M[r * n + c]);
      if (v > best) { best = v; piv = r; }
    }
    if (best < 1e-14) return null;
    if (piv !== c) {
      for (let j = 0; j < n; j++) { const t = M[c * n + j]; M[c * n + j] = M[piv * n + j]; M[piv * n + j] = t; }
      const t = x[c]; x[c] = x[piv]; x[piv] = t;
    }
    const d = M[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r * n + c] / d;
      if (f === 0) continue;
      for (let j = c; j < n; j++) M[r * n + j] -= f * M[c * n + j];
      x[r] -= f * x[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r];
    for (let j = r + 1; j < n; j++) s -= M[r * n + j] * x[j];
    x[r] = s / M[r * n + r];
  }
  return x;
}

// Cyclic Jacobi eigen-decomposition of a symmetric matrix. Returns eigenvalues
// ascending with their eigenvectors as columns of V. This is the workhorse: the
// DLT null vector is the eigenvector of AtA with the smallest eigenvalue, and
// the ratio of largest to smallest eigenvalue is the condition number the planar
// degeneracy claim is stated in.
export function symEig(S) {
  const n = S.m;
  const a = Float64Array.from(S.d);
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p], akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k], aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p], vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq;
          V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const idx = [...Array(n).keys()].sort((i, j) => a[i * n + i] - a[j * n + j]);
  const vals = idx.map((i) => a[i * n + i]);
  const vecs = idx.map((i) => { const v = new Float64Array(n); for (let k = 0; k < n; k++) v[k] = V[k * n + i]; return v; });
  return { values: vals, vectors: vecs };
}

// Unit-norm null vector of A: the eigenvector of AtA for the smallest eigenvalue.
export function nullVector(A) {
  const AtA = matmul(transpose(A), A);
  const { values, vectors } = symEig(AtA);
  const v = vectors[0];
  // Singular values are the square roots of the eigenvalues of AtA, so the
  // condition number of A is the square root of the eigenvalue ratio.
  const smallest = Math.max(values[0], 0), largest = Math.max(values[values.length - 1], 0);
  const cond = smallest > 0 ? Math.sqrt(largest / smallest) : Infinity;
  return { v, cond, singular: values.map((x) => Math.sqrt(Math.max(x, 0))) };
}

// --- 3-vectors and 3x3s, kept as plain arrays because they are everywhere ---

export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm3 = (a) => Math.sqrt(dot3(a, a));
export function unit3(a) { const n = norm3(a); return n > 0 ? scale3(a, 1 / n) : [0, 0, 0]; }

export function mul33(A, B) {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  }
  return C;
}

export function mv33(A, v) {
  return [
    A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
    A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
    A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
  ];
}

export const t33 = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];

// Rodrigues: axis-angle (a 3-vector whose length is the angle) to rotation.
export function rodrigues(w) {
  const th = norm3(w);
  if (th < 1e-12) {
    // Second-order expansion, so the derivative near zero stays right.
    return [1, -w[2], w[1], w[2], 1, -w[0], -w[1], w[0], 1];
  }
  const k = scale3(w, 1 / th);
  const c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  const [x, y, z] = k;
  return [
    c + x * x * C, x * y * C - z * s, x * z * C + y * s,
    y * x * C + z * s, c + y * y * C, y * z * C - x * s,
    z * x * C - y * s, z * y * C + x * s, c + z * z * C,
  ];
}

// The inverse. Reading the axis straight off the skew part of R loses precision
// as theta approaches pi (it is scaled by sin theta), and reading it off R + I
// is only exact at pi itself, so neither branch is accurate in the gap between
// them. Going through a quaternion by Shepperd's method -- pick the branch whose
// denominator is largest -- is accurate across the whole range with no threshold
// to tune.
export function rodriguesLog(R) {
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = R;
  const tr = r00 + r11 + r22;
  let qw, qx, qy, qz;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    qw = 0.25 * s; qx = (r21 - r12) / s; qy = (r02 - r20) / s; qz = (r10 - r01) / s;
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
    qw = (r21 - r12) / s; qx = 0.25 * s; qy = (r01 + r10) / s; qz = (r02 + r20) / s;
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
    qw = (r02 - r20) / s; qx = (r01 + r10) / s; qy = 0.25 * s; qz = (r12 + r21) / s;
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    qw = (r10 - r01) / s; qx = (r02 + r20) / s; qy = (r12 + r21) / s; qz = 0.25 * s;
  }
  // q and -q are the same rotation, but only qw >= 0 gives theta in [0, pi] --
  // the minimal turn, which is what the optimiser should be stepping in.
  if (qw < 0) { qw = -qw; qx = -qx; qy = -qy; qz = -qz; }
  const sn = Math.sqrt(qx * qx + qy * qy + qz * qz);
  if (sn < 1e-300) return [0, 0, 0];
  // atan2 rather than acos: accurate for small angles as well as near pi.
  const th = 2 * Math.atan2(sn, qw);
  return [qx * th / sn, qy * th / sn, qz * th / sn];
}

// Nearest rotation matrix in Frobenius norm, via one polar iteration repeated.
// Used to clean up the rotation a linear method hands back before refinement.
export function orthonormalise(R) {
  let M = R.slice();
  for (let it = 0; it < 24; it++) {
    const Ti = inverse33(t33(M));
    if (!Ti) break;
    let maxd = 0;
    const N = new Array(9);
    for (let i = 0; i < 9; i++) { N[i] = 0.5 * (M[i] + Ti[i]); maxd = Math.max(maxd, Math.abs(N[i] - M[i])); }
    M = N;
    if (maxd < 1e-15) break;
  }
  return M;
}

export function det33(A) {
  return A[0] * (A[4] * A[8] - A[5] * A[7]) - A[1] * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * A[7] - A[4] * A[6]);
}

export function inverse33(A) {
  const d = det33(A);
  if (Math.abs(d) < 1e-300) return null;
  const i = 1 / d;
  return [
    (A[4] * A[8] - A[5] * A[7]) * i, (A[2] * A[7] - A[1] * A[8]) * i, (A[1] * A[5] - A[2] * A[4]) * i,
    (A[5] * A[6] - A[3] * A[8]) * i, (A[0] * A[8] - A[2] * A[6]) * i, (A[2] * A[3] - A[0] * A[5]) * i,
    (A[3] * A[7] - A[4] * A[6]) * i, (A[1] * A[6] - A[0] * A[7]) * i, (A[0] * A[4] - A[1] * A[3]) * i,
  ];
}
