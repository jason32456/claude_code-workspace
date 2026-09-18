// Homography estimation by the Direct Linear Transform, with and without
// Hartley's normalisation. Both are kept, because the difference between them
// is one of the things this project measures rather than asserts.

import { mat, set, nullVector, inverse33 } from './la.js';

// Translate the centroid to the origin and scale so the mean distance from it is
// sqrt(2). The claim that this is cosmetic is the one being tested.
function normalise(pts) {
  const n = pts.length;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p[0]; my += p[1]; }
  mx /= n; my /= n;
  let md = 0;
  for (const p of pts) md += Math.hypot(p[0] - mx, p[1] - my);
  md /= n;
  const s = md > 1e-12 ? Math.SQRT2 / md : 1;
  const T = [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1];
  const out = pts.map((p) => [(p[0] - mx) * s, (p[1] - my) * s]);
  return { T, out };
}

// src (2D) -> dst (2D). Returns the 3x3 as a row-major 9-array, plus the
// condition number of the design matrix, which is what actually goes wrong when
// the configuration is degenerate.
export function homography(src, dst, { normalised = true } = {}) {
  if (src.length !== dst.length || src.length < 4) return null;
  let S = src, D = dst, Ts = null, Td = null;
  if (normalised) {
    const a = normalise(src), b = normalise(dst);
    S = a.out; D = b.out; Ts = a.T; Td = b.T;
  }
  const n = S.length;
  const A = mat(2 * n, 9);
  for (let i = 0; i < n; i++) {
    const [x, y] = S[i], [u, v] = D[i];
    set(A, 2 * i, 0, -x); set(A, 2 * i, 1, -y); set(A, 2 * i, 2, -1);
    set(A, 2 * i, 6, u * x); set(A, 2 * i, 7, u * y); set(A, 2 * i, 8, u);
    set(A, 2 * i + 1, 3, -x); set(A, 2 * i + 1, 4, -y); set(A, 2 * i + 1, 5, -1);
    set(A, 2 * i + 1, 6, v * x); set(A, 2 * i + 1, 7, v * y); set(A, 2 * i + 1, 8, v);
  }
  const { v, cond, singular } = nullVector(A);
  let H = Array.from(v);
  if (normalised) {
    const Tdi = inverse33(Td);
    if (!Tdi) return null;
    // H = Td^-1 * Hn * Ts
    const m3 = (X, Y) => {
      const O = new Array(9);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) O[i * 3 + j] = X[i * 3] * Y[j] + X[i * 3 + 1] * Y[3 + j] + X[i * 3 + 2] * Y[6 + j];
      return O;
    };
    H = m3(m3(Tdi, H), Ts);
  }
  if (Math.abs(H[8]) > 1e-15) { const s = 1 / H[8]; H = H.map((x) => x * s); }
  return { H, cond, singular };
}

export function applyH(H, p) {
  const w = H[6] * p[0] + H[7] * p[1] + H[8];
  if (Math.abs(w) < 1e-15) return null;
  return [(H[0] * p[0] + H[1] * p[1] + H[2]) / w, (H[3] * p[0] + H[4] * p[1] + H[5]) / w];
}

export function homographyRMS(H, src, dst) {
  let s = 0, n = 0;
  for (let i = 0; i < src.length; i++) {
    const q = applyH(H, src[i]);
    if (!q) continue;
    s += (q[0] - dst[i][0]) ** 2 + (q[1] - dst[i][1]) ** 2;
    n++;
  }
  return n ? Math.sqrt(s / n) : Infinity;
}
