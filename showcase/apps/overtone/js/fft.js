// Radix-2 Cooley-Tukey FFT, iterative and in-place.
//
// Iterative rather than recursive because this runs a few hundred times over an
// 8192-point frame and the call overhead is real. The twiddle factors and the
// bit-reversal permutation depend only on N, so they are built once per size and
// cached.
//
// Verified against an independently written naive DFT — see the self-test in
// js/selftest.js. That is the one exact oracle in this whole pipeline, so it is
// checked rather than assumed.

const cache = new Map();

function tables(n) {
  if (cache.has(n)) return cache.get(n);
  if ((n & (n - 1)) !== 0) throw new Error(`FFT size ${n} is not a power of two`);

  // Bit-reversal permutation.
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    rev[i] = r;
  }

  // Twiddles for every stage, flattened: cos/sin of -2*pi*k/len.
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / n);
    sin[i] = Math.sin((-2 * Math.PI * i) / n);
  }

  const t = { rev, cos, sin, n };
  cache.set(n, t);
  return t;
}

// In-place complex FFT. re/im are Float64Array(n) and are overwritten.
export function fft(re, im) {
  const n = re.length;
  const { rev, cos, sin } = tables(n);

  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const tw = k * step;
        const wr = cos[tw];
        const wi = sin[tw];
        const a = i + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

// Magnitude spectrum of a real signal, bins 0..n/2. Allocates once per call
// site if `out` is supplied.
export function magnitudeSpectrum(samples, out = null) {
  const n = samples.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(samples);
  fft(re, im);
  const bins = n / 2;
  const mag = out ?? new Float64Array(bins);
  for (let i = 0; i < bins; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

const windowCache = new Map();

// Periodic Hann window — periodic rather than symmetric because these frames are
// being overlap-analysed, not filtered.
export function hann(n) {
  if (windowCache.has(n)) return windowCache.get(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  windowCache.set(n, w);
  return w;
}

// Naive O(n^2) DFT. Present only as the oracle the FFT is checked against —
// never called on the analysis path.
export function naiveDFT(samples) {
  const n = samples.length;
  const mag = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) {
    let sr = 0;
    let si = 0;
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      sr += samples[t] * Math.cos(a);
      si += samples[t] * Math.sin(a);
    }
    mag[k] = Math.hypot(sr, si);
  }
  return mag;
}
