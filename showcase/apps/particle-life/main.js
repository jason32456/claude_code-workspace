import { params, sim, randomizeMatrix, spawnParticles, step } from './simulation.js';
import { render } from './renderer.js';
import { initControls } from './controls.js';

const canvas      = document.getElementById('canvas');
const ctx         = canvas.getContext('2d');
const fpsEl       = document.getElementById('hud-fps');
const countEl     = document.getElementById('hud-count');

let paused      = false;
let frames      = 0;
let lastFpsTime = 0;

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

randomizeMatrix();
spawnParticles();

initControls({
  onPauseToggle() {
    paused = !paused;
    return paused;
  },
});

function loop(ts) {
  requestAnimationFrame(loop);
  if (paused) return;

  step();
  render(canvas, ctx, sim);

  frames++;
  if (ts - lastFpsTime >= 500) {
    const fps = Math.round(frames / (ts - lastFpsTime) * 1000);
    fpsEl.textContent   = `${fps} fps`;
    countEl.textContent = `${params.N} particles`;
    frames      = 0;
    lastFpsTime = ts;
  }
}

requestAnimationFrame(loop);
