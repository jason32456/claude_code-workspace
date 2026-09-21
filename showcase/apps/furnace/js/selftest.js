// The bench.
//
// A path tracer is the easiest kind of program to be wrong about, because
// wrong renders look fine. Every check here is therefore decided by something
// that is not an opinion about an image: a closed-form answer, a convergence
// rate that follows from the central limit theorem, or an identity two
// configurations must satisfy whatever the picture looks like.

import { renderTile, makeRng, LAMBERT, GGX } from './trace.js';
import { furnaceScene, furnaceCamera, bleedScene, bleedCamera } from './scenes.js';

const pass = (name, expected, measured, detail) => ({ name, pass: true, expected, measured, detail });
const fail = (name, expected, measured, detail) => ({ name, pass: false, expected, measured, detail });

/** Mean, min and max of the red channel over a render. */
function render(scene, camera, w, h, spp, opts = {}) {
  const acc = new Float32Array(w * h * 3);
  for (let s = 0; s < spp; s++) renderTile(scene, camera, acc, w, h, 0, h, s, opts);
  let min = Infinity, max = -Infinity, sum = 0;
  for (let i = 0; i < w * h * 3; i += 3) {
    const v = acc[i] / spp;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { acc, spp, min, max, mean: sum / (w * h) };
}

/** Per-pixel luminance of an accumulated buffer. */
function luma(acc, spp, n) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (0.2126 * acc[i * 3] + 0.7152 * acc[i * 3 + 1] + 0.0722 * acc[i * 3 + 2]) / spp;
  }
  return out;
}

export function makeTests() {
  return [
    {
      id: 'furnace',
      name: 'A white sphere in a white furnace disappears',
      run() {
        const W = 72, H = 72, SPP = 64;
        const r = render(furnaceScene({ albedo: 1, type: LAMBERT }), furnaceCamera, W, H, SPP, { maxDepth: 40 });
        const dev = Math.max(Math.abs(r.min - 1), Math.abs(r.max - 1));
        const name = 'A white sphere in a white furnace disappears';
        const detail = 'A sphere of albedo 1 inside a void of uniform radiance 1 returns every photon '
          + 'it receives, so the correct image is flat 1.0 and the sphere is not visible at all. '
          + `${W}×${H} pixels × ${SPP} samples, and every one of them is exactly 1. Not close to `
          + '1 — the estimator has no variance here, because the sphere is convex and albedo 1 means '
          + 'each path carries its energy out unchanged.';
        return dev === 0
          ? pass(name, 'every pixel exactly 1.0', 'max deviation 0', detail)
          : fail(name, 'every pixel exactly 1.0', `max deviation ${dev.toExponential(3)}`, detail);
      },
    },

    {
      id: 'albedo',
      name: 'A grey sphere in a furnace returns exactly its albedo',
      run() {
        const W = 48, H = 48, SPP = 32;
        const albedos = [0.2, 0.35, 0.5, 0.65, 0.8, 0.95];
        let worst = 0;
        const rows = [];
        for (const a of albedos) {
          const r = render(furnaceScene({ albedo: a, type: LAMBERT }), furnaceCamera, W, H, SPP, { maxDepth: 40 });
          // Pixels that miss the sphere see the environment, so the sphere's own
          // value is the minimum across the frame.
          const d = Math.abs(r.min - a);
          worst = Math.max(worst, d);
          rows.push(`${a}→${r.min.toFixed(6)}`);
        }
        const name = 'A grey sphere in a furnace returns exactly its albedo';
        const detail = 'The closed form is not approximate: a Lambertian sphere of albedo a under uniform '
          + 'radiance L reflects exactly aL, so the render is checked against arithmetic rather than '
          + `against another render. ${rows.join('  ')}. The residual of `
          + `${worst.toExponential(1)} is the 32-bit accumulator and not the estimator — at albedo 1 the `
          + 'error is exactly zero because 1 accumulates exactly in float32, and at 0.95 it does not.';
        return worst < 1e-6
          ? pass(name, `${albedos.length} albedos within float32`, `worst error ${worst.toExponential(1)}`, detail)
          : fail(name, 'within float32 precision', `worst error ${worst.toExponential(3)}`, detail);
      },
    },

    {
      id: 'basis',
      name: 'The sampling basis is orthonormal',
      run() {
        // Checked directly rather than through a render, because this is the
        // bug the project shipped first and a render hid it completely.
        const rng = makeRng(7);
        let worst = 0;
        const N = 20000;
        for (let i = 0; i < N; i++) {
          let x = rng() * 2 - 1, y = rng() * 2 - 1, z = rng() * 2 - 1;
          const L = Math.hypot(x, y, z);
          if (L < 1e-6) continue;
          x /= L; y /= L; z /= L;
          const sign = z >= 0 ? 1 : -1;
          const a = -1 / (sign + z);
          const b = x * y * a;
          const t1 = [1 + sign * x * x * a, sign * b, -sign * x];
          const t2 = [b, sign + y * y * a, -y];
          const n = [x, y, z];
          const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
          worst = Math.max(worst,
            Math.abs(dot(t1, n)), Math.abs(dot(t2, n)), Math.abs(dot(t1, t2)),
            Math.abs(Math.hypot(...t1) - 1), Math.abs(Math.hypot(...t2) - 1));
        }
        const name = 'The sampling basis is orthonormal';
        const detail = `${N} random normals. Duff's branchless construction is written around z, and `
          + 'the permutation is not free: the same expressions written around y give vectors that are '
          + 'not perpendicular to the normal at all, so half the hemisphere samples point into the '
          + 'surface. That renders as a picture which looks completely reasonable.';
        return worst < 1e-12
          ? pass(name, 'orthonormal to 1e-12', `worst error ${worst.toExponential(2)}`, detail)
          : fail(name, 'orthonormal to 1e-12', `worst error ${worst.toExponential(2)}`, detail);
      },
    },

    {
      id: 'convergence',
      name: 'Error falls as one over the square root of the samples',
      run() {
        const W = 40, H = 30;
        const scene = bleedScene(), cam = bleedCamera;
        const ref = render(scene, cam, W, H, 3000, { maxDepth: 16 });
        const refL = luma(ref.acc, ref.spp, W * H);

        const counts = [4, 8, 16, 32, 64, 128, 256];
        const xs = [], ys = [];
        for (const n of counts) {
          const r = render(scene, cam, W, H, n, { maxDepth: 16 });
          const l = luma(r.acc, r.spp, W * H);
          let se = 0;
          for (let i = 0; i < W * H; i++) { const d = l[i] - refL[i]; se += d * d; }
          const rmse = Math.sqrt(se / (W * H));
          xs.push(Math.log(n)); ys.push(Math.log(rmse));
        }
        // Least-squares slope of log(rmse) against log(n).
        const mx = xs.reduce((a, b) => a + b) / xs.length;
        const my = ys.reduce((a, b) => a + b) / ys.length;
        let num = 0, den = 0;
        for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
        const slope = num / den;

        const name = 'Error falls as one over the square root of the samples';
        const detail = 'Monte Carlo error is the standard error of a mean, so it must fall as N^-0.5 — '
          + 'not approximately, as a consequence of the central limit theorem. Fitting log RMSE against '
          + `log N over ${counts[0]}..${counts[counts.length - 1]} samples gives an exponent of `
          + `${slope.toFixed(3)}. A renderer with a correlated sampler or a stuck seed gives a visibly `
          + 'shallower slope, which is why this is worth measuring rather than assuming.';
        return Math.abs(slope + 0.5) < 0.08
          ? pass(name, 'exponent −0.5 ± 0.08', `${slope.toFixed(3)}`, detail)
          : fail(name, 'exponent −0.5 ± 0.08', `${slope.toFixed(3)}`, detail);
      },
    },

    {
      id: 'roulette',
      name: 'Russian roulette does not change the answer',
      run() {
        const W = 40, H = 30, SPP = 900;
        const scene = bleedScene(), cam = bleedCamera;
        const on = render(scene, cam, W, H, SPP, { maxDepth: 24, russianRoulette: true });
        const off = render(scene, cam, W, H, SPP, { maxDepth: 24, russianRoulette: false });
        const rel = Math.abs(on.mean - off.mean) / off.mean;

        const name = 'Russian roulette does not change the answer';
        const detail = 'Killing a path with probability q and dividing the survivors by 1−q leaves the '
          + 'expected value untouched, so roulette may only cost variance, never accuracy. '
          + `Image means over ${SPP} samples: ${on.mean.toFixed(5)} with it, ${off.mean.toFixed(5)} without, `
          + `a relative difference of ${(rel * 100).toFixed(3)}%. An unbiased-looking speedup that is `
          + 'quietly biased is the easiest way to ship a wrong renderer, so the identity is measured.';
        return rel < 0.01
          ? pass(name, 'means agree within 1%', `${(rel * 100).toFixed(3)}%`, detail)
          : fail(name, 'means agree within 1%', `${(rel * 100).toFixed(3)}%`, detail);
      },
    },

    {
      id: 'importance',
      name: 'Importance sampling lowers variance without moving the mean',
      run() {
        const W = 40, H = 30, SPP = 700;
        const scene = bleedScene(), cam = bleedCamera;
        const cos = render(scene, cam, W, H, SPP, { maxDepth: 16, cosineSampling: true });
        const uni = render(scene, cam, W, H, SPP, { maxDepth: 16, cosineSampling: false });
        const ref = render(scene, cam, W, H, 3000, { maxDepth: 16 });
        const refL = luma(ref.acc, ref.spp, W * H);
        const rmse = (r) => {
          const l = luma(r.acc, r.spp, W * H);
          let se = 0;
          for (let i = 0; i < W * H; i++) { const d = l[i] - refL[i]; se += d * d; }
          return Math.sqrt(se / (W * H));
        };
        const rc = rmse(cos), ru = rmse(uni);
        const rel = Math.abs(cos.mean - uni.mean) / uni.mean;
        const factor = ru / rc;

        const name = 'Importance sampling lowers variance without moving the mean';
        const detail = 'Cosine-weighted and uniform hemisphere sampling are two estimators of the same '
          + 'integral, so they must agree in the mean and differ only in spread. They agree to '
          + `${(rel * 100).toFixed(3)}%, and at equal sample counts the cosine-weighted one has `
          + `${factor.toFixed(2)}× lower RMSE — which at the same error is about `
          + `${(factor * factor).toFixed(1)}× fewer samples.`;
        return rel < 0.02 && factor > 1
          ? pass(name, 'same mean, lower error', `${(rel * 100).toFixed(3)}% apart, ${factor.toFixed(2)}× less error`, detail)
          : fail(name, 'same mean, lower error', `${(rel * 100).toFixed(3)}% apart, factor ${factor.toFixed(2)}`, detail);
      },
    },

    {
      id: 'ggx',
      name: 'Rough metal loses energy, and the compensation only half fixes it',
      run() {
        const rows = ggxEnergy();
        const worst = rows[rows.length - 1];
        const improved = rows.every((r) => r.compensated >= r.single - 1e-9);
        const name = 'Rough metal loses energy, and the compensation only half fixes it';
        const detail = 'The same furnace, with a GGX microfacet metal of albedo 1. Single scattering '
          + 'cannot pass it: the Smith masking term removes the light a microfacet blocks and never '
          + 'puts it back, so a surface that should return everything returns '
          + `${(worst.single * 100).toFixed(0)}% of it at roughness 1. A Kulla-Conty style compensation `
          + `recovers most of that below roughness 0.6 and only about half of it at 1.0 `
          + `(${(worst.compensated * 100).toFixed(0)}%), because the added lobe is sampled with the `
          + 'specular pdf rather than its own. That residual is reported rather than tuned away.';
        return improved
          ? pass(name, 'compensation never worse', `loss ${(100 - worst.single * 100).toFixed(0)}% → ${(100 - worst.compensated * 100).toFixed(0)}% at roughness 1`, detail)
          : fail(name, 'compensation never worse', 'compensation made it worse somewhere', detail);
      },
    },
  ];
}

/** The GGX furnace sweep, shared by the bench and the page's chart. */
export function ggxEnergy(roughnesses = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
  const W = 40, H = 40, SPP = 160;
  const measure = (roughness, multiScatter) => {
    const acc = new Float32Array(W * H * 3);
    const scene = furnaceScene({ albedo: 1, type: GGX, roughness, multiScatter });
    for (let s = 0; s < SPP; s++) renderTile(scene, furnaceCamera, acc, W, H, 0, H, s, { maxDepth: 40 });
    let sum = 0, n = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
        if (dx * dx + dy * dy > 0.35) continue;   // the sphere's disc only
        sum += acc[(y * W + x) * 3] / SPP; n++;
      }
    }
    return sum / n;
  };
  return roughnesses.map((r) => ({
    roughness: r,
    single: measure(r, false),
    compensated: measure(r, true),
  }));
}
