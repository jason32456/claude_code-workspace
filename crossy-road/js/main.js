import { createScene }      from './scene.js';
import { createPlayer }     from './player.js';
import { createLaneManager } from './lanes.js';
import { checkCollisions }  from './collision.js';
import { createHUD }        from './hud.js';

const CELL           = 1;
const SPAWN_AHEAD    = 22;   // generate this many rows ahead of player
const RECYCLE_BEHIND = 10;   // recycle rows this far behind player
const AUTO_ADVANCE   = 0.35; // camera auto-advance speed (rows/sec) — idle death
const KILL_BEHIND    = 4;    // rows behind camera before death

// ── Smooth lerp for camera ───────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

// ── State ────────────────────────────────────────────────────────────────────
let state = 'menu';  // 'menu' | 'playing' | 'dead'
let score = 0;
let bestScore = parseInt(localStorage.getItem('crossyBest') || '0', 10);

let rafHandle = null;
let lastTime  = 0;

// Camera tracking
let camFocusZ  = 0;   // current camera world-Z target (smooth)
let autoRow    = 0;   // auto-advancing camera minimum row
let cameraRow  = 0;   // the row the camera is currently locked to

const { renderer, camera, scene, updateCamera } = createScene();
const player  = createPlayer(scene);
const lanes   = createLaneManager(scene);
const hud     = createHUD(onPlay);

// Initial render so the scene isn't blank before "Play"
updateCamera(0, 0);
renderer.render(scene, camera);
hud.setBest(bestScore);
hud.showMenu(bestScore);

// ── Input ─────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (state === 'playing') {
    e.preventDefault();
    player.handleKey(e.key, lanes);
  } else if (state === 'menu' || state === 'dead') {
    const hopKeys = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D',' ']);
    if (hopKeys.has(e.key)) {
      e.preventDefault();
      onPlay();
    }
  }
});

// ── Game start ────────────────────────────────────────────────────────────────
function onPlay() {
  if (state === 'playing') return;
  startGame();
}

function startGame() {
  state = 'playing';
  score = 0;
  autoRow = 0;
  cameraRow = 0;
  camFocusZ = 0;

  player.reset();
  lanes.reset();
  hud.setScore(0);
  hud.setBest(bestScore);
  hud.hideOverlay();

  // Seed initial lanes
  for (let r = 0; r <= SPAWN_AHEAD; r++) lanes.ensureRow(r);

  if (rafHandle) cancelAnimationFrame(rafHandle);
  lastTime = performance.now();
  rafHandle = requestAnimationFrame(gameLoop);
}

// ── Main game loop ────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (state !== 'playing') return;

  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  // ── Update player ──────────────────────────────────────────────────────────
  player.update(dt, lanes);

  // ── Generate / recycle lanes ───────────────────────────────────────────────
  const pr = player.row;
  for (let r = Math.max(0, pr - 2); r <= pr + SPAWN_AHEAD; r++) {
    lanes.ensureRow(r);
  }
  lanes.recycleBehind(pr - RECYCLE_BEHIND);

  // ── Move vehicles ──────────────────────────────────────────────────────────
  lanes.update(dt);

  // ── Camera follow ──────────────────────────────────────────────────────────
  // auto-advance slowly pushes camera forward
  autoRow += dt * AUTO_ADVANCE;
  // camera row = further of: player's max progress, or auto advance
  const targetRow = Math.max(player.maxRow, Math.floor(autoRow));
  cameraRow = Math.max(cameraRow, targetRow);

  const targetZ = -cameraRow * CELL;
  camFocusZ = lerp(camFocusZ, targetZ, 0.06);
  updateCamera(player.mesh.position.x, camFocusZ);

  // ── Score ──────────────────────────────────────────────────────────────────
  if (player.maxRow > score) {
    score = player.maxRow;
    hud.setScore(score);
  }

  // ── Death checks ───────────────────────────────────────────────────────────
  // Fell behind camera
  if (pr < cameraRow - KILL_BEHIND) {
    die();
    return;
  }

  // Vehicle collision
  const deathReason = checkCollisions(player, lanes);
  if (deathReason) {
    die();
    return;
  }

  renderer.render(scene, camera);
  rafHandle = requestAnimationFrame(gameLoop);
}

// ── Death ─────────────────────────────────────────────────────────────────────
function die() {
  state = 'dead';
  player.mesh.visible = false;

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('crossyBest', bestScore);
  }

  hud.setBest(bestScore);
  hud.showGameOver(score, bestScore);

  // Keep rendering one final frame
  renderer.render(scene, camera);
}
