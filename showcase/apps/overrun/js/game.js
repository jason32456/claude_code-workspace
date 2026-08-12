import * as THREE from '../vendor/three.module.min.js';
import { buildArena } from './arena.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapon.js';
import { createEnemyPool } from './enemy.js';
import { createWaveDirector } from './waves.js';
import { EYE_H, SENSITIVITY } from './constants.js';

// ─── Game state ───────────────────────────────────────────────────────────────
let gameState = 'menu';   // menu | playing | gameover
const keys = {};
let sensitivity = parseFloat(localStorage.getItem('overrun_sensitivity') || String(SENSITIVITY));
let highScore   = parseInt(localStorage.getItem('overrun_hs') || '0', 10);

// ─── Renderer ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

// ─── Main scene ───────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050810);
scene.fog = new THREE.Fog(0x050810, 20, 55);

scene.add(new THREE.AmbientLight(0x405070, 0.65));
const dirLight = new THREE.DirectionalLight(0xffeedd, 1.05);
dirLight.position.set(8, 14, 6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
Object.assign(dirLight.shadow.camera, { near: 0.5, far: 60, left: -25, right: 25, bottom: -25, top: 25 });
scene.add(dirLight);

// ─── Cameras ──────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(camera);

// Weapon scene renders over the main scene to prevent gun clipping through walls
const weaponScene = new THREE.Scene();
weaponScene.add(new THREE.AmbientLight(0xffffff, 0.9));
weaponScene.add(new THREE.DirectionalLight(0xffeedd, 0.5));
const weaponCamera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.01, 6);

// ─── Systems ──────────────────────────────────────────────────────────────────
const { aabbs } = buildArena(scene);
const player  = createPlayer();
const weapon  = createWeapon(weaponScene);
const enemies = createEnemyPool(scene);
const waves   = createWaveDirector(enemies);

// ─── Screen-space effects ─────────────────────────────────────────────────────
let shakeAmt       = 0;
let hitMarkerTimer = 0;
let vignetteTimer  = 0;
let waveTextTimer  = 0;
const HIT_DUR = 0.12;
const VIG_DUR = 0.35;

// ─── DOM references ───────────────────────────────────────────────────────────
const $menu      = document.getElementById('menu-overlay');
const $gameover  = document.getElementById('gameover-overlay');
const $hud       = document.getElementById('hud');
const $banner    = document.getElementById('wave-banner');
const $hpFill    = document.getElementById('hud-health-fill');
const $hpNum     = document.getElementById('hud-health-num');
const $ammo      = document.getElementById('hud-ammo');
const $score     = document.getElementById('hud-score');
const $waveLabel = document.getElementById('hud-wave');
const $hitmarker = document.getElementById('hitmarker');
const $vignette  = document.getElementById('vignette');
const $reloadWrap= document.getElementById('reload-bar-wrap');
const $reloadBar = document.getElementById('reload-bar');
const $goScore   = document.getElementById('go-score');
const $goBest    = document.getElementById('go-best');
const $hsDisplay = document.getElementById('hs-display');

// ─── Input ────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyR' && gameState === 'gameover') restartGame();
});
document.addEventListener('keyup',   e => { keys[e.code] = false; });
document.addEventListener('mousedown', e => { if (e.button === 0) keys['__mousedown'] = true;  });
document.addEventListener('mouseup',   e => { if (e.button === 0) keys['__mousedown'] = false; });

document.addEventListener('mousemove', e => {
  if (!isLocked() || gameState !== 'playing') return;
  player.yaw   -= e.movementX * sensitivity;
  player.pitch -= e.movementY * sensitivity;
  player.pitch  = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, player.pitch));
});

// ─── Pointer lock ─────────────────────────────────────────────────────────────
function isLocked() { return document.pointerLockElement === canvas; }

canvas.addEventListener('click', () => {
  if (gameState !== 'playing') return; // handled by overlay buttons
  if (!isLocked()) canvas.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  // When locked: if we came from menu or gameover → start a new game
  if (isLocked() && (gameState === 'menu' || gameState === 'gameover')) {
    startGame();
  }
});

// ─── Menu / overlay buttons ───────────────────────────────────────────────────
document.getElementById('play-btn')?.addEventListener('click',    () => canvas.requestPointerLock());
document.getElementById('restart-btn')?.addEventListener('click', restartGame);
$hsDisplay.textContent = `BEST: ${highScore}`;

// ─── Game lifecycle ───────────────────────────────────────────────────────────
function startGame() {
  gameState = 'playing';
  $menu.style.display    = 'none';
  $gameover.style.display= 'none';
  $hud.style.display     = 'block';
  $banner.style.display  = 'none';

  player.reset();
  weapon.reset();
  enemies.despawnAll();
  waves.reset();
  waves.start();
  shakeAmt = 0;
  hitMarkerTimer = 0;
  vignetteTimer  = 0;
  $vignette.style.opacity  = '0';
  $hitmarker.style.opacity = '0';

  showBanner('WAVE  1', 2.2);
}

function endGame() {
  gameState = 'gameover';
  document.exitPointerLock();
  $hud.style.display    = 'none';
  $banner.style.display = 'none';

  const s = waves.score;
  if (s > highScore) {
    highScore = s;
    localStorage.setItem('overrun_hs', String(highScore));
  }
  $goScore.textContent = `SCORE: ${s}`;
  $goBest.textContent  = `BEST:  ${highScore}`;
  $gameover.style.display = 'flex';
}

function restartGame() {
  $gameover.style.display = 'none';
  canvas.requestPointerLock();  // triggers pointerlockchange → startGame
}

// ─── Banner ───────────────────────────────────────────────────────────────────
function showBanner(text, duration) {
  $banner.textContent    = text;
  $banner.style.opacity  = '1';
  $banner.style.display  = 'block';
  waveTextTimer = duration;
}

// ─── Main loop ────────────────────────────────────────────────────────────────
let lastTime = performance.now();

function tick() {
  requestAnimationFrame(tick);

  const now   = performance.now();
  const rawDt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const dt = gameState === 'playing' ? rawDt : 0;

  // ── Game update ─────────────────────────────────────────────────────────────
  if (gameState === 'playing') {

    player.update(dt, keys, aabbs);

    weapon.tryFire(keys, camera, enemies.active, (point, isHit) => {
      // Every shot gets a tiny shake; hits get extra
      shakeAmt = Math.max(shakeAmt, isHit ? 0.020 : 0.006);
      if (isHit) {
        hitMarkerTimer = HIT_DUR;
        $hitmarker.style.opacity = '1';
      }
    });

    weapon.update(dt, keys, player.bobY, player.bobX);

    enemies.update(
      dt, player.position, aabbs,
      () => waves.onKill(),
      (dmg) => {
        player.takeDamage(dmg);
        shakeAmt = Math.max(shakeAmt, 0.045);
        vignetteTimer = VIG_DUR;
        $vignette.style.opacity = '1';
      }
    );

    waves.update(dt, (clearedWave) => {
      showBanner(`WAVE  ${clearedWave + 1}  INCOMING`, 2.8);
    });

    if (player.dead) { endGame(); return; }

    // Effects decay
    shakeAmt = Math.max(0, shakeAmt - 8 * dt);

    if (hitMarkerTimer > 0) {
      hitMarkerTimer -= dt;
      if (hitMarkerTimer <= 0) $hitmarker.style.opacity = '0';
    }
    if (vignetteTimer > 0) {
      vignetteTimer -= dt;
      const alpha = Math.min(1, vignetteTimer / VIG_DUR);
      $vignette.style.opacity = String(alpha);
    }
    if (waveTextTimer > 0) {
      waveTextTimer -= dt;
      if (waveTextTimer <= 0) {
        $banner.style.opacity = '0';
        setTimeout(() => { if ($banner.style.opacity === '0') $banner.style.display = 'none'; }, 400);
      } else if (waveTextTimer < 0.5) {
        $banner.style.opacity = String(waveTextTimer / 0.5);
      }
    }

    updateHUD();
  }

  // ── Camera ──────────────────────────────────────────────────────────────────
  const sx = (Math.random() - 0.5) * 2 * shakeAmt;
  const sy = (Math.random() - 0.5) * 2 * shakeAmt;

  camera.position.set(
    player.position.x + player.bobX + sx,
    player.position.y + EYE_H + player.bobY + sy,
    player.position.z
  );
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch + weapon.recoil;

  // ── Render ──────────────────────────────────────────────────────────────────
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(weaponScene, weaponCamera);
}

// ─── HUD update ───────────────────────────────────────────────────────────────
function updateHUD() {
  const hpPct = Math.max(0, player.hp / player.maxHp);
  $hpFill.style.width      = (hpPct * 100).toFixed(1) + '%';
  $hpFill.style.background = hpPct > 0.4 ? '#3af' : hpPct > 0.2 ? '#fa0' : '#f22';
  $hpNum.textContent       = Math.ceil(player.hp);

  if (weapon.reloading) {
    $reloadWrap.style.display = 'block';
    $reloadBar.style.width    = (weapon.reloadProgress * 100).toFixed(1) + '%';
    $ammo.textContent = 'RELOADING…';
  } else {
    $reloadWrap.style.display = 'none';
    $ammo.textContent = `${weapon.ammo} / ${weapon.maxAmmo}`;
  }

  $score.textContent   = String(waves.score);
  $waveLabel.textContent = `WAVE ${waves.wave}`;
}

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = weaponCamera.aspect = aspect;
  camera.updateProjectionMatrix();
  weaponCamera.updateProjectionMatrix();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
$hud.style.display     = 'none';
$gameover.style.display= 'none';
$menu.style.display    = 'flex';
tick();
