import { SPECIES_COLORS } from './simulation.js';

// Radius scales slightly with canvas so particles stay visible at different window sizes
function particleRadius(canvasWidth) {
  return Math.max(1.5, Math.min(3.5, canvasWidth / 550));
}

export function render(canvas, ctx, sim) {
  const { width: w, height: h } = canvas;
  const { N, positions, species } = sim;

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);

  if (!N || !positions) return;

  const r = particleRadius(w);

  // Bucket particles by species so we flip fillStyle once per species
  const K = SPECIES_COLORS.length;
  const buckets = Array.from({ length: K }, () => []);
  for (let i = 0; i < N; i++) buckets[species[i]].push(i);

  for (let s = 0; s < K; s++) {
    const bucket = buckets[s];
    if (!bucket.length) continue;
    ctx.fillStyle = SPECIES_COLORS[s];
    ctx.beginPath();
    for (let k = 0; k < bucket.length; k++) {
      const i = bucket[k];
      const x = positions[i * 2] * w;
      const y = positions[i * 2 + 1] * h;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, 6.283185307); // 2π inlined
    }
    ctx.fill();
  }
}
