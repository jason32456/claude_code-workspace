// Everything that takes longer than a frame runs here: reconstruction (which
// streams intermediate images), the budget sweep, Phase Lab cells and bench
// rows. The page keeps a pool of these.

import { makeCamera } from './sensing.js';
import { recover, minNorm } from './recover.js';
import { trial } from './bp.js';
import { psnr, ssim } from './metrics.js';
import { rng } from './rng.js';
import { TESTS } from './bench.js';

function measure(scene, { side, frac, mode, noise, seed }) {
  const m = Math.max(2, Math.round(frac * side * side));
  const cam = makeCamera({ side, m, mode, seed });
  const y = cam.apply(scene);
  if (noise > 0) {
    const r = rng(seed + 99);
    for (let j = 0; j < m; j++) y[j] += noise * r.gauss();
  }
  return { cam, y };
}

// Noise needs more smoothing; this scales the TV weight and the ℓ1 weight
// with σ, relative to the noiseless defaults.
function lambdaFor(method, noise) {
  return method === 'tv' ? 0.015 + 4 * noise : 3e-3 + 0.5 * noise;
}

self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'recover') {
    const { scene, params, token } = msg;
    const { cam, y } = measure(scene, params);
    const lin = minNorm(cam, y);
    self.postMessage({ type: 'linear', token, image: lin, psnr: psnr(scene, lin), ssim: ssim(scene, lin, params.side), y });
    const onFrame = (img, iter) => self.postMessage({ type: 'frame', token, image: img, iter, psnr: psnr(scene, img) });
    const out = recover(cam, y, params.method, { lambda: lambdaFor(params.method, params.noise), iters: params.iters, onFrame, every: 20 });
    self.postMessage({ type: 'sparse', token, image: out, psnr: psnr(scene, out), ssim: ssim(scene, out, params.side) });
  } else if (msg.type === 'sweep') {
    const { scene, params, fracs, token } = msg;
    for (const frac of fracs) {
      const { cam, y } = measure(scene, { ...params, frac });
      const lin = psnr(scene, minNorm(cam, y));
      const sp = psnr(scene, recover(cam, y, params.method, { lambda: lambdaFor(params.method, params.noise), iters: params.iters }));
      self.postMessage({ type: 'sweep-point', token, frac, lin, sparse: sp });
    }
    self.postMessage({ type: 'sweep-done', token });
  } else if (msg.type === 'cell') {
    const { n, m, k, kind, trials, seed, i, j, token } = msg;
    let ok = 0;
    for (let t = 0; t < trials; t++) {
      if (k >= m) continue; // more unknowns on the support than equations: never exact
      if (trial({ n, m, k, kind, seed: seed + t }).success) ok++;
    }
    self.postMessage({ type: 'cell-done', token, i, j, frac: ok / trials });
  } else if (msg.type === 'bench') {
    const t = TESTS.find((x) => x.id === msg.id);
    let last = 0;
    const progress = (f) => {
      const now = Date.now();
      if (now - last > 150) { last = now; self.postMessage({ type: 'bench-progress', id: t.id, frac: f }); }
    };
    const t0 = performance.now();
    const result = t.run(progress);
    result.ms = performance.now() - t0;
    self.postMessage({ type: 'bench-done', id: t.id, result });
  }
};
