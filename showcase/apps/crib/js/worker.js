// The search runs here so a million closures never touch the frame budget.

import { runBombe } from './bombe.js';
import { evaluateStop, rankStops } from './scoring.js';

let cancelled = false;

self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type !== 'run') return;

  cancelled = false;
  const { menu, fullMenu, testReg, reflector, orders, cipher, crib, offset, maxStops } = msg;

  const stops = [];
  const t0 = performance.now();
  let lastPost = 0;

  try {
    for (const evt of runBombe({ menu, reflector, orders, testReg, maxStops })) {
      if (cancelled) { self.postMessage({ type: 'cancelled' }); return; }

      if (evt.type === 'stop') {
        // Keep the live wires for the diagonal-board view of the first few.
        stops.push(evt);
        self.postMessage({
          type: 'stop',
          order: evt.order,
          position: evt.position,
          tested: evt.tested,
          mask: evt.mask,
          live: stops.length <= 40 ? Array.from(evt.live) : null,
        });
      } else if (evt.type === 'progress') {
        const now = performance.now();
        if (now - lastPost > 60) {
          lastPost = now;
          self.postMessage({ ...evt, elapsed: now - t0 });
        }
      } else if (evt.type === 'order') {
        self.postMessage(evt);
      } else if (evt.type === 'done') {
        const elapsed = performance.now() - t0;
        self.postMessage({ type: 'evaluating', stops: stops.length });

        // Plugboard completion uses the whole crib, not just the twelve
        // scramblers the hardware could drive. The bombe's twelve-edge budget
        // is a constraint on the machine, not on what you know once it stops.
        const evaluated = [];
        for (const s of stops) {
          if (cancelled) { self.postMessage({ type: 'cancelled' }); return; }
          const r = evaluateStop(s, { menu: fullMenu, cipher, crib, offset, reflector });
          if (r) evaluated.push(stripLive(r));
        }

        self.postMessage({
          type: 'done',
          tested: evt.tested,
          totalPositions: evt.totalPositions,
          stops: stops.length,
          survivors: evaluated.length,
          elapsed,
          ranked: rankStops(evaluated).slice(0, 40),
        });
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};

function stripLive(r) {
  const { live, ...rest } = r;
  void live;
  return rest;
}
