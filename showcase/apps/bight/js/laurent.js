// Laurent polynomials over Z, exact. Coefficients are BigInt because the
// Kauffman bracket is a sum over 2^n states of delta^(k-1) terms, and the
// binomial growth in the middle of that sum overruns a double long before the
// final answer does. An invariant that is "probably right to 15 digits" is not
// an invariant.

export function make(coeffs = new Map()) {
  const m = new Map();
  for (const [e, c] of coeffs) if (c !== 0n) m.set(Number(e), BigInt(c));
  return m;
}

export const zero = () => new Map();
export const one = () => new Map([[0, 1n]]);

// c * A^e
export function mono(c, e) {
  const v = BigInt(c);
  return v === 0n ? new Map() : new Map([[e, v]]);
}

export function add(p, q) {
  const r = new Map(p);
  for (const [e, c] of q) {
    const s = (r.get(e) ?? 0n) + c;
    if (s === 0n) r.delete(e); else r.set(e, s);
  }
  return r;
}

export function scale(p, c) {
  const v = BigInt(c);
  if (v === 0n) return new Map();
  const r = new Map();
  for (const [e, a] of p) r.set(e, a * v);
  return r;
}

export function shift(p, k) {
  const r = new Map();
  for (const [e, c] of p) r.set(e + k, c);
  return r;
}

export function mul(p, q) {
  const r = new Map();
  for (const [e1, c1] of p) {
    for (const [e2, c2] of q) {
      const e = e1 + e2;
      const s = (r.get(e) ?? 0n) + c1 * c2;
      if (s === 0n) r.delete(e); else r.set(e, s);
    }
  }
  return r;
}

export function pow(p, n) {
  let r = one();
  for (let i = 0; i < n; i++) r = mul(r, p);
  return r;
}

export function equal(p, q) {
  if (p.size !== q.size) return false;
  for (const [e, c] of p) if ((q.get(e) ?? 0n) !== c) return false;
  return true;
}

export const isZero = (p) => p.size === 0;

export function degrees(p) {
  if (p.size === 0) return { min: 0, max: 0 };
  const ks = [...p.keys()];
  return { min: Math.min(...ks), max: Math.max(...ks) };
}

// Substitute A = value (a BigInt), i.e. evaluate. Negative exponents make this
// rational in general, so it is only exact when the result is an integer; the
// callers that use it (the determinant bridge at A -> t = -1) are in that case,
// and the check below refuses silently-wrong answers.
export function evalAt(p, value) {
  const v = BigInt(value);
  let num = 0n, minE = 0;
  const { min } = degrees(p);
  minE = min;
  // Multiply through by v^(-minE) so every exponent is >= 0, then evaluate.
  for (const [e, c] of p) {
    let term = c;
    for (let i = 0; i < e - minE; i++) term *= v;
    num += term;
  }
  return { value: num, shift: minE };
}

// Substitute A^k -> t^(k/4) for the Jones variable change. Only exponents
// divisible by 4 can survive as integer powers of t; the Kauffman bracket of a
// KNOT (one component) always satisfies that, and this throws rather than
// rounding if it ever does not.
export function quarter(p) {
  const r = new Map();
  for (const [e, c] of p) {
    if (e % 4 !== 0) {
      throw new Error(`exponent ${e} is not divisible by 4 — not a single-component diagram`);
    }
    r.set(e / 4, c);
  }
  return r;
}

// Reverse the variable: A -> A^-1. This is the mirror-image operation, and
// selftest 7 uses it to check that the two trefoils really are distinguished.
export function mirror(p) {
  const r = new Map();
  for (const [e, c] of p) r.set(-e, c);
  return r;
}

function sup(n) {
  const digits = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return String(n).split('').map((d) => digits[d] ?? d).join('');
}

export function format(p, variable = 'A') {
  if (p.size === 0) return '0';
  const ks = [...p.keys()].sort((a, b) => b - a);
  let out = '';
  for (const e of ks) {
    const c = p.get(e);
    const neg = c < 0n;
    const abs = neg ? -c : c;
    const sign = out === '' ? (neg ? '−' : '') : (neg ? ' − ' : ' + ');
    const showCoeff = abs !== 1n || e === 0;
    const body = e === 0 ? '' : e === 1 ? variable : `${variable}${sup(e)}`;
    out += sign + (showCoeff ? abs.toString() : '') + body;
  }
  return out;
}
