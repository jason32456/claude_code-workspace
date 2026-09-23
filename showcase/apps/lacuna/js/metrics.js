export function psnr(ref, x) {
  let se = 0;
  for (let i = 0; i < ref.length; i++) {
    const v = Math.min(1, Math.max(0, x[i])) - ref[i];
    se += v * v;
  }
  return 10 * Math.log10(ref.length / Math.max(se, 1e-20));
}

// Wang et al. (2004): 11×11 Gaussian window, σ = 1.5, K1 = 0.01, K2 = 0.03,
// dynamic range 1. Borders are cropped rather than padded.
export function ssim(ref, x, side) {
  const R = 5, w = [];
  let ws = 0;
  for (let d = -R; d <= R; d++) { const v = Math.exp(-(d * d) / (2 * 1.5 * 1.5)); w.push(v); ws += v; }
  for (let i = 0; i < w.length; i++) w[i] /= ws;
  const C1 = 0.01 ** 2, C2 = 0.03 ** 2;
  const clip = (v) => Math.min(1, Math.max(0, v));
  let total = 0, count = 0;
  for (let r = R; r < side - R; r++) {
    for (let c = R; c < side - R; c++) {
      let mx = 0, my = 0, sxx = 0, syy = 0, sxy = 0;
      for (let dr = -R; dr <= R; dr++) {
        for (let dc = -R; dc <= R; dc++) {
          const k = (r + dr) * side + c + dc, wt = w[dr + R] * w[dc + R];
          const a = ref[k], b = clip(x[k]);
          mx += wt * a; my += wt * b;
          sxx += wt * a * a; syy += wt * b * b; sxy += wt * a * b;
        }
      }
      sxx -= mx * mx; syy -= my * my; sxy -= mx * my;
      total += ((2 * mx * my + C1) * (2 * sxy + C2)) / ((mx * mx + my * my + C1) * (sxx + syy + C2));
      count++;
    }
  }
  return total / count;
}
