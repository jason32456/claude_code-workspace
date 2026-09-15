import { mulberry32, gaussian } from './rng.js';

// A real network, trained by real backpropagation, on the same data the
// closed-form learner sees. It exists to answer one question: is the spike a
// property of having many parameters, or a property of the exact interpolating
// solve? If it were about parameter count, this should spike too.

export function makeNet(D, H, seed) {
  const rand = mulberry32(seed);
  const W1 = new Float64Array(H * D);
  const b1 = new Float64Array(H);
  const W2 = new Float64Array(H);
  // He init on the first layer, 1/sqrt(H) on the second: the usual choice, and
  // the one that keeps the initial function O(1) independent of width, so a
  // width sweep is not secretly also a scale sweep.
  const s1 = Math.sqrt(2 / D), s2 = Math.sqrt(1 / H);
  for (let i = 0; i < H * D; i++) W1[i] = gaussian(rand) * s1;
  for (let j = 0; j < H; j++) { b1[j] = gaussian(rand) * 0.5; W2[j] = gaussian(rand) * s2; }
  return { D, H, W1, b1, W2, b2: 0 };
}

export function predict(net, X, off) {
  const { D, H, W1, b1, W2 } = net;
  let y = net.b2;
  for (let j = 0; j < H; j++) {
    let z = b1[j];
    const wo = j * D;
    for (let k = 0; k < D; k++) z += W1[wo + k] * X[off + k];
    if (z > 0) y += W2[j] * z;
  }
  return y;
}

// Full-batch gradient plus loss, in one pass. Returned gradients are of the
// mean squared error, which is what the finite-difference check compares to.
export function gradient(net, X, Y, n, g) {
  const { D, H, W1, b1, W2 } = net;
  g.W1.fill(0); g.b1.fill(0); g.W2.fill(0); g.b2 = 0;
  let loss = 0;
  const z = new Float64Array(H);
  for (let i = 0; i < n; i++) {
    const xo = i * D;
    let p = net.b2;
    for (let j = 0; j < H; j++) {
      let s = b1[j];
      const wo = j * D;
      for (let k = 0; k < D; k++) s += W1[wo + k] * X[xo + k];
      z[j] = s;
      if (s > 0) p += W2[j] * s;
    }
    const e = p - Y[i];
    loss += e * e;
    const d = (2 * e) / n;
    g.b2 += d;
    for (let j = 0; j < H; j++) {
      if (z[j] <= 0) continue;
      g.W2[j] += d * z[j];
      const dz = d * W2[j];
      g.b1[j] += dz;
      const wo = j * D;
      for (let k = 0; k < D; k++) g.W1[wo + k] += dz * X[xo + k];
    }
  }
  return loss / n;
}

export function makeGrad(D, H) {
  return { W1: new Float64Array(H * D), b1: new Float64Array(H), W2: new Float64Array(H), b2: 0 };
}

// Adam, because plain GD cannot drive this to interpolation in any number of
// steps a browser tab will sit through.
export function makeOpt(D, H) {
  const z = () => ({ W1: new Float64Array(H * D), b1: new Float64Array(H), W2: new Float64Array(H), b2: 0 });
  return { m: z(), v: z(), t: 0 };
}

export function step(net, g, opt, lr, wd) {
  const B1 = 0.9, B2 = 0.999, EPS = 1e-8;
  opt.t++;
  const c1 = 1 - Math.pow(B1, opt.t), c2 = 1 - Math.pow(B2, opt.t);
  const apply = (par, grad, m, v, len) => {
    for (let i = 0; i < len; i++) {
      const gi = grad[i] + wd * par[i];
      m[i] = B1 * m[i] + (1 - B1) * gi;
      v[i] = B2 * v[i] + (1 - B2) * gi * gi;
      par[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + EPS);
    }
  };
  apply(net.W1, g.W1, opt.m.W1, opt.v.W1, net.H * net.D);
  apply(net.b1, g.b1, opt.m.b1, opt.v.b1, net.H);
  apply(net.W2, g.W2, opt.m.W2, opt.v.W2, net.H);
  const gb = g.b2 + wd * net.b2;
  opt.m.b2 = B1 * opt.m.b2 + (1 - B1) * gb;
  opt.v.b2 = B2 * opt.v.b2 + (1 - B2) * gb * gb;
  net.b2 -= lr * (opt.m.b2 / c1) / (Math.sqrt(opt.v.b2 / c2) + EPS);
}

export function trainNet({ D, H, X, Y, n, epochs, lr = 0.02, wd = 0, seed = 1 }) {
  const net = makeNet(D, H, seed);
  const g = makeGrad(D, H);
  const opt = makeOpt(D, H);
  let loss = 0;
  for (let e = 0; e < epochs; e++) {
    loss = gradient(net, X, Y, n, g);
    step(net, g, opt, lr, wd);
  }
  return { net, loss };
}

// Plain SGD with momentum and global gradient-norm clipping. This is the
// optimiser the network sweep uses, deliberately: Adam's per-coordinate
// normalisation is a confound when the quantity under study is a norm blow-up.
// (Measured: at D=10 both optimisers show the peak, and Adam's is the larger of
// the two — so the choice turned out not to matter, but it had to be checked
// rather than assumed.) Clipping is not optional: without it a wide ReLU net
// under momentum diverges and the sweep reports NaN instead of a measurement.
export function trainNetSGD({ D, H, X, Y, n, epochs, lr = 0.05, mom = 0.9, clip = 1.0, seed = 1 }) {
  const net = makeNet(D, H, seed);
  const g = makeGrad(D, H);
  const vW1 = new Float64Array(H * D), vb1 = new Float64Array(H), vW2 = new Float64Array(H);
  let vb2 = 0, loss = 0;
  for (let e = 0; e < epochs; e++) {
    loss = gradient(net, X, Y, n, g);
    let gn = g.b2 * g.b2;
    for (let i = 0; i < H * D; i++) gn += g.W1[i] * g.W1[i];
    for (let j = 0; j < H; j++) gn += g.b1[j] * g.b1[j] + g.W2[j] * g.W2[j];
    gn = Math.sqrt(gn);
    const s = gn > clip ? clip / gn : 1;
    for (let i = 0; i < H * D; i++) { vW1[i] = mom * vW1[i] - lr * s * g.W1[i]; net.W1[i] += vW1[i]; }
    for (let j = 0; j < H; j++) {
      vb1[j] = mom * vb1[j] - lr * s * g.b1[j]; net.b1[j] += vb1[j];
      vW2[j] = mom * vW2[j] - lr * s * g.W2[j]; net.W2[j] += vW2[j];
    }
    vb2 = mom * vb2 - lr * s * g.b2; net.b2 += vb2;
    if (!Number.isFinite(loss)) break;
  }
  return { net, loss };
}
