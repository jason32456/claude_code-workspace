import { runCell, makeProblem, probe } from './model.js';
import { trainNetSGD, predict } from './mlp.js';

// Every sweep streams its cells back as they finish rather than returning at the
// end. A sweep that takes eight seconds and paints nothing looks broken; one
// that paints as it goes looks like an instrument.

const post = (m) => self.postMessage(m);

// Median over trials. The distribution at the threshold is wildly skewed — a
// single unlucky seed can land three orders of magnitude out — so the mean would
// report the worst seed rather than the typical one.
function median(v) {
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function logspace(lo, hi, k) {
  const out = [];
  for (let i = 0; i < k; i++) out.push(Math.max(1, Math.round(lo * Math.pow(hi / lo, i / (k - 1)))));
  return [...new Set(out)];
}

const CAP = 1e12;

function sweepCurve({ D, n, noise, lambda, trials, steps, id }) {
  // Sample the model-size axis geometrically, but force the exact interpolation
  // threshold P = n into the grid. Miss it and the peak looks like a gentle bump
  // purely because no sample landed on the spike.
  const Ps = logspace(2, Math.max(1200, n * 12), steps);
  if (!Ps.includes(n)) Ps.push(n);
  for (const p of [n - 1, n + 1]) if (p > 1 && !Ps.includes(p)) Ps.push(p);
  Ps.sort((a, b) => a - b);

  for (let i = 0; i < Ps.length; i++) {
    const P = Ps[i];
    const te = [], tr = [], wn = [], ridged = [];
    for (let t = 0; t < trials; t++) {
      const seed = 1009 + t * 8677;
      const c = runCell({ D, n, P, noise, lambda: 1e-13, seed });
      te.push(Math.min(c.test, CAP)); tr.push(c.train); wn.push(c.wNorm);
      // The regularised arm is the control: same data, same features, same
      // parameter count, only the interpolation constraint relaxed.
      if (lambda > 1e-13) ridged.push(Math.min(runCell({ D, n, P, noise, lambda, seed }).test, CAP));
    }
    post({ type: 'curve', id, i, total: Ps.length, P, test: median(te), train: median(tr),
           wNorm: median(wn), ridge: ridged.length ? median(ridged) : null });
  }
  post({ type: 'done', id, kind: 'curve' });
}

function sweepGrid({ D, noise, lambda, trials, id }) {
  const Ps = logspace(3, 500, 30);
  const Ns = logspace(8, 140, 26);
  for (let r = 0; r < Ns.length; r++) {
    const n = Ns[r];
    const row = new Float64Array(Ps.length);
    for (let c = 0; c < Ps.length; c++) {
      const v = [];
      for (let t = 0; t < trials; t++) v.push(Math.min(runCell({ D, n, P: Ps[c], noise, lambda, seed: 4201 + t * 7717 }).test, CAP));
      row[c] = median(v);
    }
    post({ type: 'grid', id, r, rows: Ns.length, Ns, Ps, row }, [row.buffer]);
  }
  post({ type: 'done', id, kind: 'grid' });
}

function sweepDimension({ n, noise, lambda, trials, id }) {
  const Ds = [1, 2, 3, 5, 8, 12, 20, 32, 60, 100];
  const under = [8, 12, 18, 24].filter((p) => p < n);
  for (let i = 0; i < Ds.length; i++) {
    const D = Ds[i];
    const at = (P) => median(Array.from({ length: trials }, (_, t) => Math.min(runCell({ D, n, P, noise, lambda, seed: 3301 + t * 6131 }).test, CAP)));
    const best = Math.min(...under.map(at));
    const peak = at(n);
    const over = at(Math.max(600, n * 12));
    post({ type: 'dim', id, i, total: Ds.length, D, best, peak, over });
  }
  post({ type: 'done', id, kind: 'dim' });
}

// The control experiment: the same data, fitted by an actual network trained
// with backpropagation, swept over width instead of feature count. A network's
// interpolation threshold is where its PARAMETER count reaches n, not where its
// width does, so the threshold is drawn at H = (n-1)/(D+2).
function sweepNet({ D, n, noise, epochs, trials, id }) {
  // A network's threshold is at H = (n-1)/(D+2). With the closed-form pane's
  // defaults that lands at H < 2, leaving no widths below the threshold to
  // compare against -- the sweep would run fine and measure nothing. So this arm
  // picks its own D and n to put the threshold in the middle of a trainable
  // width range, and the pane says which values it used rather than implying
  // these are the panel's.
  D = Math.min(D, 10);
  n = Math.max(n, 10 * (D + 2));
  const thresholdH = (n - 1) / (D + 2);
  const Hs = logspace(1, Math.max(60, Math.ceil(thresholdH * 9)), 13);
  for (const extra of [Math.round(thresholdH), Math.round(thresholdH) + 1]) {
    if (extra >= 1 && !Hs.includes(extra)) Hs.push(extra);
  }
  Hs.sort((a, b) => a - b);
  for (let i = 0; i < Hs.length; i++) {
    const H = Hs[i];
    const te = [], tr = [];
    for (let t = 0; t < trials; t++) {
      const seed = 811 + t * 5443;
      const prob = makeProblem({ D, n, nTest: 300, noise, seed });
      const { net, loss } = trainNetSGD({ D, H, X: prob.X, Y: prob.Y, n, epochs, seed: seed * 3 + 1 });
      let s = 0;
      for (let k = 0; k < 300; k++) { const e = predict(net, prob.Xt, k * D) - prob.Yt[k]; s += e * e; }
      te.push(s / 300); tr.push(loss);
    }
    post({ type: 'net', id, i, total: Hs.length, H, params: H * (D + 2) + 1, threshold: thresholdH,
           usedD: D, usedN: n, test: median(te), train: median(tr) });
  }
  post({ type: 'done', id, kind: 'net' });
}

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.cmd === 'curve') sweepCurve(msg);
    else if (msg.cmd === 'grid') sweepGrid(msg);
    else if (msg.cmd === 'dim') sweepDimension(msg);
    else if (msg.cmd === 'net') sweepNet(msg);
    else if (msg.cmd === 'probe') post({ type: 'probe', id: msg.id, slot: msg.slot, result: probe(msg) });
  } catch (err) {
    post({ type: 'error', id: msg.id, message: String(err && err.message ? err.message : err) });
  }
};
