export const CURRENCIES = {
  EUR: { symbol: '€', exp: 2, name: 'Euro' },
  USD: { symbol: '$', exp: 2, name: 'US dollar' },
  GBP: { symbol: '£', exp: 2, name: 'Pound sterling' },
  CHF: { symbol: 'CHF ', exp: 2, name: 'Swiss franc' },
  SEK: { symbol: 'kr ', exp: 2, name: 'Swedish krona' },
  NOK: { symbol: 'kr ', exp: 2, name: 'Norwegian krone' },
  DKK: { symbol: 'kr ', exp: 2, name: 'Danish krone' },
  PLN: { symbol: 'zł ', exp: 2, name: 'Polish złoty' },
  CZK: { symbol: 'Kč ', exp: 2, name: 'Czech koruna' },
  AUD: { symbol: 'A$', exp: 2, name: 'Australian dollar' },
  CAD: { symbol: 'C$', exp: 2, name: 'Canadian dollar' },
  NZD: { symbol: 'NZ$', exp: 2, name: 'New Zealand dollar' },
  SGD: { symbol: 'S$', exp: 2, name: 'Singapore dollar' },
  HKD: { symbol: 'HK$', exp: 2, name: 'Hong Kong dollar' },
  MYR: { symbol: 'RM ', exp: 2, name: 'Malaysian ringgit' },
  IDR: { symbol: 'Rp ', exp: 0, name: 'Indonesian rupiah' },
  THB: { symbol: '฿', exp: 2, name: 'Thai baht' },
  INR: { symbol: '₹', exp: 2, name: 'Indian rupee' },
  JPY: { symbol: '¥', exp: 0, name: 'Japanese yen' },
  KRW: { symbol: '₩', exp: 0, name: 'South Korean won' },
  CNY: { symbol: 'CN¥', exp: 2, name: 'Chinese yuan' },
  MXN: { symbol: 'MX$', exp: 2, name: 'Mexican peso' },
  BRL: { symbol: 'R$', exp: 2, name: 'Brazilian real' },
  ZAR: { symbol: 'R ', exp: 2, name: 'South African rand' },
  KWD: { symbol: 'KD ', exp: 3, name: 'Kuwaiti dinar' },
};

export const exp = (code) => (CURRENCIES[code] ? CURRENCIES[code].exp : 2);

// Parses user text into integer minor units. Returns NaN on garbage rather than
// guessing, so the form can flag it.
export function parseMinor(text, code) {
  const e = exp(code);
  let s = String(text ?? '').trim().replace(/[\s_']/g, '');
  if (!s) return NaN;
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === '.' || s === '-') return NaN;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [whole, frac = ''] = s.split('.');
  if (frac.length > e) {
    // Round half up on the extra digits, done on the string so 0.115 isn't 0.11.
    const keep = frac.slice(0, e);
    const next = Number(frac[e]);
    const base = Number((whole || '0') + keep.padEnd(e, '0'));
    const v = base + (next >= 5 ? 1 : 0);
    return neg ? -v : v;
  }
  const v = Number((whole || '0') + frac.padEnd(e, '0'));
  return neg ? -v : v;
}

export function toDecimalString(minor, code) {
  const e = exp(code);
  const neg = minor < 0;
  const a = Math.abs(Math.round(minor));
  if (e === 0) return (neg ? '-' : '') + String(a);
  const s = String(a).padStart(e + 1, '0');
  return (neg ? '-' : '') + s.slice(0, -e) + '.' + s.slice(-e);
}

export function format(minor, code, { sign = false, symbol = true } = {}) {
  const e = exp(code);
  const neg = minor < 0;
  const a = Math.abs(Math.round(minor));
  const whole = Math.floor(a / 10 ** e);
  const frac = e ? String(a % 10 ** e).padStart(e, '0') : '';
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sym = symbol ? (CURRENCIES[code]?.symbol ?? code + ' ') : '';
  const body = sym + grouped + (e ? '.' + frac : '');
  if (neg) return '−' + body;
  if (sign && minor > 0) return '+' + body;
  return body;
}

// Largest-remainder allocation: integer parts that always sum to `total`.
// Ties on the fractional part go to the earlier index, so the result is
// deterministic for a given member order.
export function allocate(total, weights) {
  const n = weights.length;
  const out = new Array(n).fill(0);
  if (!n) return out;
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (!(sumW > 0)) return out;
  const isInt = weights.every(Number.isInteger);
  if (isInt && sumW === total) return weights.slice();
  const sgn = total < 0 ? -1 : 1;
  const T = Math.abs(total);
  const fracs = [];
  let used = 0;
  for (let i = 0; i < n; i++) {
    let q, r;
    if (isInt && Number.isSafeInteger(T * weights[i])) {
      q = Math.floor((T * weights[i]) / sumW);
      r = (T * weights[i]) % sumW;
      r = r / sumW;
    } else {
      const raw = (T * weights[i]) / sumW;
      q = Math.floor(raw + 1e-9);
      r = raw - q;
    }
    out[i] = q;
    used += q;
    fracs.push([r, i]);
  }
  let left = T - used;
  fracs.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0 && k < fracs.length; k++, left--) out[fracs[k][1]] += 1;
  for (let k = 0; left > 0; k = (k + 1) % n, left--) out[fracs[k][1]] += 1;
  return sgn < 0 ? out.map((v) => -v) : out;
}

// Converts an amount in `from` minor units to `to` minor units with one
// rounding step. `rate` is units of `to` per one unit of `from`.
export function convert(minor, from, to, rate) {
  if (from === to) return minor;
  const v = minor * rate * 10 ** (exp(to) - exp(from));
  return Math.round(v + (v >= 0 ? 1e-9 : -1e-9));
}
