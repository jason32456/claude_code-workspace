import { compile } from './core/plan.js';
import { Annealer } from './core/solver.js';
import { softScore, hardViolations } from './core/score.js';
import { whatIf } from './core/whatif.js';

let job = 0;

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'stop') { job++; return; }
  if (msg.type === 'solve') solve(msg, ++job);
  if (msg.type === 'whatif') {
    const r = whatIf(msg.plan, Int32Array.from(msg.occ), msg.wish);
    self.postMessage({ type: 'whatif', id: msg.id, result: { ...r, occ: Array.from(r.occ) } });
  }
};

function solve({ plan, occ, seed, iterations, jobId }, id) {
  const P = compile(plan);
  const ann = new Annealer(P, occ ? Int32Array.from(occ) : null, { seed, iterations });
  const started = performance.now();
  let lastPost = 0;
  const finish = (stopped) => {
    const best = Array.from(ann.bestOcc);
    self.postMessage({
      type: 'done', jobId, stopped, occ: best,
      soft: softScore(P, ann.bestOcc), hard: hardViolations(P, ann.bestOcc).length,
      iter: ann.iter, ms: performance.now() - started,
    });
  };
  const tick = () => {
    if (id !== job) { finish(true); return; }
    const done = ann.step(40_000);
    const now = performance.now();
    if (done || now - lastPost > 60) {
      lastPost = now;
      self.postMessage({
        type: 'progress', jobId, iter: ann.iter, iterations: ann.iterations,
        best: ann.best, current: ann.score, T: ann.T,
        rate: ann.iter / Math.max(1, (now - started) / 1000),
        occ: Array.from(ann.bestOcc),
      });
    }
    if (done) finish(false);
    else setTimeout(tick, 0);
  };
  tick();
}
