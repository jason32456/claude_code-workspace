import { BREATH, TIMING } from './world-config.js';

// Total texture offset after n ticks of a flow moving `perTick` cells per tick.
// Both the flowing item and anything carried by it read this one counter, so a
// drifting body and the texture beneath it always move by the same integer.
export function flowOffset(n, perTick) {
  if (!perTick) return 0;
  const magnitude = Math.floor(n * Math.abs(perTick) + 1e-9);
  return perTick < 0 ? -magnitude : magnitude;
}

export function flowStep(n, perTick) {
  return flowOffset(n, perTick) - flowOffset(n - 1, perTick);
}

export function ringOffset(n) {
  const angle = n * 0.15;
  return [Math.round(7 * Math.cos(angle)) | 0, Math.round(7 * Math.sin(angle)) | 0];
}

export function shiverOffset(k, length) {
  if (k < 0 || k >= length) return 0;
  return (k >> 1) & 1 ? -1 : 1;
}

export function introLayout(retry) {
  const breathStart = retry ? 0 : TIMING.titleTicks + TIMING.breathDelay;
  return { breathStart, total: breathStart + BREATH.ticks + TIMING.tail };
}

export function breathTrigger(centreX, cols) {
  return Math.round((centreX / cols) * BREATH.ticks);
}
