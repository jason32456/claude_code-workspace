// A software rasteriser. WebGL would be faster, but this project's argument is
// its screenshots, and a z-buffer written out by hand is bit-identical in
// headless Chromium with no GPU flags and no driver variance.
//
// Radial distortion bends straight lines, so projecting the three vertices of a
// triangle and filling between them linearly would be wrong -- subtly, in
// exactly the way that flatters a pose solver. Instead the scene is rasterised
// through a *pinhole* camera into an oversized buffer, and the output frame is
// then resampled from it through the inverse distortion, one output pixel at a
// time. That makes the distortion exact everywhere rather than exact at corners.

import { undistort } from './camera.js';

// Inverting the radial model has no closed form. Fixed-point iteration per pixel
// is far too slow at a million pixels, but the map depends only on radius, so one
// monotone table built once serves the whole frame.
function radialLUT(k1, k2, ruMax, n = 2048) {
  const rd = new Float64Array(n + 1), ru = new Float64Array(n + 1);
  let monotone = true;
  for (let i = 0; i <= n; i++) {
    const r = (ruMax * i) / n;
    const r2 = r * r;
    ru[i] = r;
    rd[i] = r * (1 + k1 * r2 + k2 * r2 * r2);
    if (i > 0 && rd[i] <= rd[i - 1]) monotone = false;
  }
  return { rd, ru, n, monotone, rdMax: rd[n] };
}

function lutInvert(lut, r) {
  const { rd, ru, n } = lut;
  if (r <= 0) return 0;
  if (r >= rd[n]) return ru[n] * (r / rd[n]);
  let lo = 0, hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rd[mid] <= r) lo = mid; else hi = mid;
  }
  const span = rd[hi] - rd[lo];
  const f = span > 0 ? (r - rd[lo]) / span : 0;
  return ru[lo] + f * (ru[hi] - ru[lo]);
}

const LIGHT = (() => { const l = [-0.35, -0.78, -0.52]; const n = Math.hypot(...l); return l.map((v) => v / n); })();

// Rasterise the scene through a pinhole camera into a buffer, carrying
// perspective-correct world position and uv at every pixel.
function rasterPinhole(scene, R, t, fp, cpx, cpy, PW, PH) {
  const col = new Float32Array(PW * PH * 3);
  const depth = new Float32Array(PW * PH).fill(Infinity);
  const wpos = new Float32Array(PW * PH * 3);
  const uvb = new Float32Array(PW * PH * 2);
  const mat = new Int32Array(PW * PH).fill(-1);

  const NEAR = 1.0;
  const camPt = (X) => [
    R[0] * X[0] + R[1] * X[1] + R[2] * X[2] + t[0],
    R[3] * X[0] + R[4] * X[1] + R[5] * X[2] + t[1],
    R[6] * X[0] + R[7] * X[1] + R[8] * X[2] + t[2],
  ];

  for (let ti = 0; ti < scene.tris.length; ti++) {
    const tri = scene.tris[ti];
    // Vertices in camera space, with their world positions and uvs carried along.
    let verts = tri.v.map((X, i) => ({ c: camPt(X), w: X, uv: tri.uv[i] }));

    // Near-plane clip in camera space, so a triangle straddling the pinhole is
    // cut rather than wrapped around behind it.
    const inside = verts.filter((v) => v.c[2] > NEAR);
    if (inside.length === 0) continue;
    if (inside.length < 3) {
      const out = [];
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length];
        const ain = a.c[2] > NEAR, bin = b.c[2] > NEAR;
        if (ain) out.push(a);
        if (ain !== bin) {
          const s = (NEAR - a.c[2]) / (b.c[2] - a.c[2]);
          out.push({
            c: [a.c[0] + s * (b.c[0] - a.c[0]), a.c[1] + s * (b.c[1] - a.c[1]), NEAR],
            w: [a.w[0] + s * (b.w[0] - a.w[0]), a.w[1] + s * (b.w[1] - a.w[1]), a.w[2] + s * (b.w[2] - a.w[2])],
            uv: [a.uv[0] + s * (b.uv[0] - a.uv[0]), a.uv[1] + s * (b.uv[1] - a.uv[1])],
          });
        }
      }
      verts = out;
    }
    if (verts.length < 3) continue;

    // Shade per face: this scene is flat-shaded on purpose, so that a marker's
    // four edges stay hard and sub-pixel corner refinement has something real to
    // lock onto.
    const e1 = [tri.v[1][0] - tri.v[0][0], tri.v[1][1] - tri.v[0][1], tri.v[1][2] - tri.v[0][2]];
    const e2 = [tri.v[2][0] - tri.v[0][0], tri.v[2][1] - tri.v[0][1], tri.v[2][2] - tri.v[0][2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    let lam = -(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    if (lam < 0) lam = -lam * 0.35;
    const shade = 0.42 + 0.62 * lam;

    // Fan-triangulate the clipped polygon.
    for (let k = 1; k + 1 < verts.length; k++) {
      const P = [verts[0], verts[k], verts[k + 1]];
      const s = P.map((v) => {
        const iz = 1 / v.c[2];
        return { x: fp * v.c[0] * iz + cpx, y: fp * v.c[1] * iz + cpy, iz, w: v.w, uv: v.uv };
      });
      const area = (s[1].x - s[0].x) * (s[2].y - s[0].y) - (s[2].x - s[0].x) * (s[1].y - s[0].y);
      if (Math.abs(area) < 1e-12) continue;
      const inv = 1 / area;

      let minx = Math.max(0, Math.floor(Math.min(s[0].x, s[1].x, s[2].x)));
      let maxx = Math.min(PW - 1, Math.ceil(Math.max(s[0].x, s[1].x, s[2].x)));
      let miny = Math.max(0, Math.floor(Math.min(s[0].y, s[1].y, s[2].y)));
      let maxy = Math.min(PH - 1, Math.ceil(Math.max(s[0].y, s[1].y, s[2].y)));
      if (minx > maxx || miny > maxy) continue;

      for (let py = miny; py <= maxy; py++) {
        const yc = py + 0.5;
        for (let px = minx; px <= maxx; px++) {
          const xc = px + 0.5;
          let w0 = ((s[1].x - xc) * (s[2].y - yc) - (s[2].x - xc) * (s[1].y - yc)) * inv;
          let w1 = ((s[2].x - xc) * (s[0].y - yc) - (s[0].x - xc) * (s[2].y - yc)) * inv;
          let w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;

          const iz = w0 * s[0].iz + w1 * s[1].iz + w2 * s[2].iz;
          if (iz <= 0) continue;
          const z = 1 / iz;
          const o = py * PW + px;
          if (z >= depth[o]) continue;
          depth[o] = z;

          // Perspective-correct: interpolate attribute/z, then multiply by z.
          const a0 = w0 * s[0].iz, a1 = w1 * s[1].iz, a2 = w2 * s[2].iz;
          const wx = (a0 * s[0].w[0] + a1 * s[1].w[0] + a2 * s[2].w[0]) * z;
          const wy = (a0 * s[0].w[1] + a1 * s[1].w[1] + a2 * s[2].w[1]) * z;
          const wz = (a0 * s[0].w[2] + a1 * s[1].w[2] + a2 * s[2].w[2]) * z;
          const uu = (a0 * s[0].uv[0] + a1 * s[1].uv[0] + a2 * s[2].uv[0]) * z;
          const vv = (a0 * s[0].uv[1] + a1 * s[1].uv[1] + a2 * s[2].uv[1]) * z;

          wpos[o * 3] = wx; wpos[o * 3 + 1] = wy; wpos[o * 3 + 2] = wz;
          uvb[o * 2] = uu; uvb[o * 2 + 1] = vv;
          mat[o] = ti;

          const c = tri.shadeColour(uu, vv);
          col[o * 3] = c[0] * shade; col[o * 3 + 1] = c[1] * shade; col[o * 3 + 2] = c[2] * shade;
        }
      }
    }
  }
  return { col, depth, wpos, uvb, mat, PW, PH };
}

// Full render: pinhole buffer, then resample through the distortion with
// supersampling. `paint` (optional) recolours a pixel from its world position --
// that is how the anamorph is applied, since it is a function of where a surface
// point is, not of how the surface is textured.
export function render(scene, cam, W, H, opts = {}) {
  const ss = opts.ss || 2;
  const paint = opts.paint || null;

  // How much of the pinhole image does this frame need? Undistort the border.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const probe = (u, v) => { const [x, y] = undistort(cam, u, v); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (let i = 0; i <= 32; i++) {
    probe((W * i) / 32, 0); probe((W * i) / 32, H);
    probe(0, (H * i) / 32); probe(W, (H * i) / 32);
  }
  const padx = (x1 - x0) * 0.02, pady = (y1 - y0) * 0.02;
  x0 -= padx; x1 += padx; y0 -= pady; y1 += pady;

  const fp = cam.f * ss;
  const PW = Math.min(4096, Math.max(8, Math.ceil((x1 - x0) * fp) + 2));
  const PH = Math.min(4096, Math.max(8, Math.ceil((y1 - y0) * fp) + 2));
  const cpx = -x0 * fp + 1, cpy = -y0 * fp + 1;

  const buf = rasterPinhole(scene, cam.R, cam.t, fp, cpx, cpy, PW, PH);

  // Apply the anamorph (or any world-position-driven paint) in pinhole space,
  // before resampling, so it gets the same antialiasing as everything else.
  if (paint) {
    const { col, mat, wpos } = buf;
    const rgb = [0, 0, 0];
    for (let o = 0; o < PW * PH; o++) {
      if (mat[o] < 0) continue;
      if (!scene.tris[mat[o]].paintable) continue;
      if (paint(wpos[o * 3], wpos[o * 3 + 1], wpos[o * 3 + 2], rgb)) {
        col[o * 3] = rgb[0]; col[o * 3 + 1] = rgb[1]; col[o * 3 + 2] = rgb[2];
      }
    }
  }

  const rMax = Math.hypot(Math.max(Math.abs(x0), Math.abs(x1)), Math.max(Math.abs(y0), Math.abs(y1))) * 1.05;
  const lut = radialLUT(cam.k1, cam.k2, rMax);

  const out = new Uint8ClampedArray(W * H * 4);
  const depthOut = new Float32Array(W * H).fill(Infinity);
  const inv = 1 / (ss * ss);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      let r = 0, g = 0, b = 0, dmin = Infinity;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = px + (sx + 0.5) / ss, v = py + (sy + 0.5) / ss;
          // Distorted pixel -> normalised undistorted, via the radial table.
          const dx = (u - cam.cx) / cam.f, dy = (v - cam.cy) / cam.f;
          const rd = Math.hypot(dx, dy);
          let nx, ny;
          if (rd < 1e-12) { nx = 0; ny = 0; }
          else { const ru = lutInvert(lut, rd); nx = dx * (ru / rd); ny = dy * (ru / rd); }
          const bx = nx * fp + cpx, by = ny * fp + cpy;
          // Bilinear sample of the pinhole buffer.
          const ix = Math.floor(bx - 0.5), iy = Math.floor(by - 0.5);
          const tx = bx - 0.5 - ix, ty = by - 0.5 - iy;
          let cr = 0, cg = 0, cb = 0;
          for (let j = 0; j < 2; j++) {
            for (let i = 0; i < 2; i++) {
              const qx = Math.min(PW - 1, Math.max(0, ix + i)), qy = Math.min(PH - 1, Math.max(0, iy + j));
              const wgt = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
              const o = (qy * PW + qx) * 3;
              cr += buf.col[o] * wgt; cg += buf.col[o + 1] * wgt; cb += buf.col[o + 2] * wgt;
              const d = buf.depth[qy * PW + qx];
              if (d < dmin) dmin = d;
            }
          }
          r += cr; g += cg; b += cb;
        }
      }
      const o = (py * W + px) * 4;
      out[o] = r * inv * 255; out[o + 1] = g * inv * 255; out[o + 2] = b * inv * 255; out[o + 3] = 255;
      depthOut[py * W + px] = dmin;
    }
  }
  return { rgba: out, depth: depthOut, W, H, pinhole: buf, lutMonotone: lut.monotone };
}
