// Background lattice work: the bench and the angle-of-attack sweep. Each job
// posts progress as it goes; the tunnel on the main thread never waits.

import { TESTS } from './selftest.js';
import { polarPoint } from './tunnel.js';

self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'bench') {
    for (const t of TESTS) {
      self.postMessage({ type: 'test-start', id: t.id });
      let last = 0;
      const progress = (frac) => {
        const now = Date.now();
        if (now - last > 120) { last = now; self.postMessage({ type: 'test-progress', id: t.id, frac }); }
      };
      const t0 = performance.now();
      const result = t.run(progress);
      result.ms = performance.now() - t0;
      self.postMessage({ type: 'test-done', id: t.id, result });
    }
    self.postMessage({ type: 'bench-done' });
  } else if (msg.type === 'sweep') {
    const { shape, re, angles, token } = msg;
    for (const angle of angles) {
      self.postMessage({ type: 'sweep-start', token, angle });
      let last = 0;
      const progress = (frac) => {
        const now = Date.now();
        if (now - last > 120) { last = now; self.postMessage({ type: 'sweep-progress', token, angle, frac }); }
      };
      const point = polarPoint({ shape, re, angle, progress });
      self.postMessage({ type: 'sweep-point', token, point });
    }
    self.postMessage({ type: 'sweep-done', token });
  }
};
