// The picture the anamorph resolves into. Generated rather than loaded: a binary
// asset would be one more thing to trust, and this way the whole page is one
// folder of text. It is built to make misalignment loud -- concentric rings and
// a hard grid go visibly wrong under a pose error of a fraction of a degree,
// where a photograph would just look slightly soft.

// A 5x7 bitmap font, enough for the words this page needs.
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

export const SOURCE_W = 512, SOURCE_H = 384;

function drawText(px, text, ox, oy, scale, rgb) {
  let cx = ox;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch];
    if (!g) { cx += 6 * scale; continue; }
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (g[r][c] !== '1') continue;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          const x = cx + c * scale + dx, y = oy + r * scale + dy;
          if (x < 0 || y < 0 || x >= SOURCE_W || y >= SOURCE_H) continue;
          const o = (y * SOURCE_W + x) * 3;
          px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2];
        }
      }
    }
    cx += 6 * scale;
  }
}

let cached = null;

export function sourceImage() {
  if (cached) return cached;
  const px = new Float32Array(SOURCE_W * SOURCE_H * 3);
  const cx = SOURCE_W / 2, cy = SOURCE_H / 2;
  for (let y = 0; y < SOURCE_H; y++) {
    for (let x = 0; x < SOURCE_W; x++) {
      const o = (y * SOURCE_W + x) * 3;
      const dx = x - cx, dy = y - cy;
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx);

      // Base: a deep field with a hard grid. Straight lines are what a wrong
      // pose bends.
      let R = 0.055, G = 0.075, B = 0.115;
      if (x % 32 === 0 || y % 32 === 0) { R = 0.13; G = 0.17; B = 0.24; }

      // Concentric rings -- the most sensitive thing on the card.
      const ring = Math.abs(((r / 15) % 1) - 0.5);
      if (r < 172 && ring > 0.40) { R = 0.18; G = 0.32; B = 0.42; }

      // A bold amber annulus.
      if (r > 120 && r < 134) { R = 0.95; G = 0.62; B = 0.13; }
      // Twelve spokes inside it.
      if (r < 118 && r > 40 && Math.abs(((th / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.44) { R = 0.30; G = 0.55; B = 0.62; }

      // Corner registration crosses: unmistakable when they line up.
      for (const [qx, qy] of [[46, 46], [SOURCE_W - 46, 46], [46, SOURCE_H - 46], [SOURCE_W - 46, SOURCE_H - 46]]) {
        const ax = Math.abs(x - qx), ay = Math.abs(y - qy);
        if ((ax < 26 && ay < 3) || (ay < 26 && ax < 3)) { R = 0.92; G = 0.94; B = 0.96; }
        if (Math.abs(Math.hypot(ax, ay) - 18) < 2) { R = 0.55; G = 0.85; B = 0.70; }
      }
      px[o] = R; px[o + 1] = G; px[o + 2] = B;
    }
  }
  drawText(px, 'ANAMORPH', 104, 168, 6, [0.97, 0.98, 1.0]);
  cached = { px, w: SOURCE_W, h: SOURCE_H };
  return cached;
}

// Bilinear sample in pixel coordinates. Returns false outside the card, so the
// caller can leave the surface its own colour instead of clamping the edge into
// a smear that would flatter the result.
export function sampleSource(img, u, v, rgb) {
  if (!(u >= 0 && u <= img.w - 1 && v >= 0 && v <= img.h - 1)) return false;
  const ix = Math.floor(u), iy = Math.floor(v);
  const tx = u - ix, ty = v - iy;
  const x1 = Math.min(img.w - 1, ix + 1), y1 = Math.min(img.h - 1, iy + 1);
  for (let c = 0; c < 3; c++) {
    const a = img.px[(iy * img.w + ix) * 3 + c], b = img.px[(iy * img.w + x1) * 3 + c];
    const d = img.px[(y1 * img.w + ix) * 3 + c], e = img.px[(y1 * img.w + x1) * 3 + c];
    rgb[c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
  }
  return true;
}
