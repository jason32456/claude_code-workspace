// ── Constants ──────────────────────────────────────────────────────────────

const SHIP_TURN_SPEED   = 0.055;   // radians per frame
const SHIP_THRUST       = 0.12;
const SHIP_FRICTION     = 0.985;
const SHIP_MAX_SPEED    = 7;
const BULLET_SPEED      = 11;
const BULLET_LIFE       = 60;      // frames
const FIRE_COOLDOWN     = 18;      // frames
const INVINCIBLE_FRAMES = 180;
const LIVES_START       = 3;

const ASTEROID_SIZES = {
  large:  { r: 42, score: 20,  speed: 0.9, children: 'medium' },
  medium: { r: 22, score: 50,  speed: 1.6, children: 'small'  },
  small:  { r: 11, score: 100, speed: 2.6, children: null      },
};

const COLORS = {
  ship:      '#00ffff',
  bullet:    '#ffffff',
  asteroid:  ['#ff6b35', '#ff8c00', '#e64400'],
  thrust:    '#ff8800',
  particle:  ['#ff6b35', '#ffaa00', '#fff', '#ff4400'],
  shield:    '#00ff99',
};

// ── Canvas setup ──────────────────────────────────────────────────────────

const canvas  = document.getElementById('canvas');
const ctx     = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ── Input ─────────────────────────────────────────────────────────────────

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyP' && state.running) togglePause();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ── Game state ────────────────────────────────────────────────────────────

let state = { running: false, paused: false };
let ship, asteroids, bullets, particles, score, lives, wave,
    fireCooldown, invincible, waveClearing, rafId;

function initGame() {
  score       = 0;
  lives       = LIVES_START;
  wave        = 0;
  fireCooldown = 0;
  invincible  = 0;
  waveClearing = false;
  ship        = createShip();
  asteroids   = [];
  bullets     = [];
  particles   = [];
  startWave();
}

function startWave() {
  wave++;
  waveClearing = false;
  const count = 3 + (wave - 1) * 2;
  asteroids = [];
  for (let i = 0; i < count; i++) spawnAsteroid();
}

// ── Entity factories ──────────────────────────────────────────────────────

function createShip() {
  return {
    x: canvas.width / 2,
    y: canvas.height / 2,
    vx: 0, vy: 0,
    angle: -Math.PI / 2,
    thrusting: false,
    dead: false,
  };
}

function spawnAsteroid(x, y, size = 'large') {
  const cfg = ASTEROID_SIZES[size];
  // keep away from ship spawn centre on wave start
  let ax, ay;
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const safeR = 120;
  do {
    ax = x ?? Math.random() * canvas.width;
    ay = y ?? Math.random() * canvas.height;
  } while (x == null && Math.hypot(ax - cx, ay - cy) < safeR);

  const angle = Math.random() * Math.PI * 2;
  const spd   = cfg.speed * (0.7 + Math.random() * 0.6) * (1 + (wave - 1) * 0.04);
  const verts = buildAsteroidShape(cfg.r);
  const color = COLORS.asteroid[Math.floor(Math.random() * COLORS.asteroid.length)];

  asteroids.push({ x: ax, y: ay, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                   size, r: cfg.r, verts, color, rot: 0, rotSpeed: (Math.random() - 0.5) * 0.02 });
}

function buildAsteroidShape(r) {
  const n = 10 + Math.floor(Math.random() * 5);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const d = r * (0.65 + Math.random() * 0.4);
    pts.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  return pts;
}

// ── Physics helpers ───────────────────────────────────────────────────────

function wrap(obj) {
  const W = canvas.width, H = canvas.height;
  if (obj.x < -obj.r) obj.x = W + obj.r;
  if (obj.x > W + obj.r) obj.x = -obj.r;
  if (obj.y < -obj.r) obj.y = H + obj.r;
  if (obj.y > H + obj.r) obj.y = -obj.r;
}

function circlesOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by;
  return dx*dx + dy*dy < (ar + br) * (ar + br);
}

// ── Particles ─────────────────────────────────────────────────────────────

function spawnExplosion(x, y, count, maxSpd = 3) {
  for (let i = 0; i < count; i++) {
    const a   = Math.random() * Math.PI * 2;
    const spd = Math.random() * maxSpd + 0.5;
    const color = COLORS.particle[Math.floor(Math.random() * COLORS.particle.length)];
    particles.push({
      x, y,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: 30 + Math.random() * 30,
      maxLife: 60,
      r: 1.5 + Math.random() * 2,
      color,
    });
  }
}

// ── HUD ───────────────────────────────────────────────────────────────────

const scoreEl  = document.getElementById('score-display');
const waveEl   = document.getElementById('wave-display');
const livesEl  = document.getElementById('lives-display');
const hiEl     = document.getElementById('hi-score-display');

function getHiScore() { return parseInt(localStorage.getItem('asteroids_hi') || '0', 10); }
function saveHiScore(s) { localStorage.setItem('asteroids_hi', s); }

function updateHUD() {
  scoreEl.textContent = `SCORE: ${score}`;
  waveEl.textContent  = `WAVE ${wave}`;
  livesEl.textContent = '♦ '.repeat(lives).trim();
}

// ── Pause ─────────────────────────────────────────────────────────────────

function togglePause() {
  state.paused = !state.paused;
  if (!state.paused) loop();
}

// ── Ship death ────────────────────────────────────────────────────────────

function killShip() {
  spawnExplosion(ship.x, ship.y, 40, 5);
  lives--;
  if (lives <= 0) {
    gameOver();
    return;
  }
  ship = createShip();
  invincible = INVINCIBLE_FRAMES;
}

function gameOver() {
  state.running = false;
  cancelAnimationFrame(rafId);
  const hi = Math.max(score, getHiScore());
  saveHiScore(hi);
  overlay.style.display = 'flex';
  overlay.querySelector('h1').textContent = 'GAME OVER';
  overlay.querySelector('.subtitle').textContent = `SCORE: ${score}`;
  startBtn.textContent = 'PLAY AGAIN';
  hiEl.textContent = `HIGH SCORE: ${hi}`;
}

// ── Main loop ─────────────────────────────────────────────────────────────

function update() {
  // Ship input
  if (keys['ArrowLeft'])  ship.angle -= SHIP_TURN_SPEED;
  if (keys['ArrowRight']) ship.angle += SHIP_TURN_SPEED;
  ship.thrusting = !!keys['ArrowUp'];
  if (ship.thrusting) {
    ship.vx += Math.cos(ship.angle) * SHIP_THRUST;
    ship.vy += Math.sin(ship.angle) * SHIP_THRUST;
  }
  const spd = Math.hypot(ship.vx, ship.vy);
  if (spd > SHIP_MAX_SPEED) {
    ship.vx = (ship.vx / spd) * SHIP_MAX_SPEED;
    ship.vy = (ship.vy / spd) * SHIP_MAX_SPEED;
  }
  ship.vx *= SHIP_FRICTION;
  ship.vy *= SHIP_FRICTION;
  ship.x  += ship.vx;
  ship.y  += ship.vy;
  ship.r   = 14;
  wrap(ship);

  // Firing
  fireCooldown = Math.max(0, fireCooldown - 1);
  if (keys['Space'] && fireCooldown === 0) {
    bullets.push({
      x: ship.x + Math.cos(ship.angle) * 18,
      y: ship.y + Math.sin(ship.angle) * 18,
      vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx * 0.3,
      vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy * 0.3,
      life: BULLET_LIFE,
      r: 3,
    });
    fireCooldown = FIRE_COOLDOWN;
  }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx; b.y += b.vy;
    b.life--;
    wrap(b);
    if (b.life <= 0) { bullets.splice(i, 1); continue; }

    // Bullet-asteroid collision
    for (let j = asteroids.length - 1; j >= 0; j--) {
      const a = asteroids[j];
      if (circlesOverlap(b.x, b.y, b.r, a.x, a.y, a.r * 0.8)) {
        score += ASTEROID_SIZES[a.size].score;
        spawnExplosion(a.x, a.y, a.size === 'large' ? 20 : a.size === 'medium' ? 12 : 6, 3);

        const childSize = ASTEROID_SIZES[a.size].children;
        if (childSize) {
          spawnAsteroid(a.x + (Math.random()-0.5)*20, a.y + (Math.random()-0.5)*20, childSize);
          spawnAsteroid(a.x + (Math.random()-0.5)*20, a.y + (Math.random()-0.5)*20, childSize);
        }
        asteroids.splice(j, 1);
        bullets.splice(i, 1);
        break;
      }
    }
  }

  // Asteroids
  for (const a of asteroids) {
    a.x += a.vx; a.y += a.vy;
    a.rot += a.rotSpeed;
    wrap(a);
  }

  // Ship-asteroid collision
  if (invincible > 0) {
    invincible--;
  } else {
    for (const a of asteroids) {
      if (circlesOverlap(ship.x, ship.y, ship.r * 0.75, a.x, a.y, a.r * 0.75)) {
        killShip();
        return;
      }
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.02;  // slight gravity
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Wave clear
  if (asteroids.length === 0 && !waveClearing) {
    waveClearing = true;
    setTimeout(startWave, 1500);
  }

  updateHUD();
}

// ── Rendering ─────────────────────────────────────────────────────────────

function glow(color, blur = 12) {
  ctx.shadowColor = color;
  ctx.shadowBlur  = blur;
}
function noGlow() { ctx.shadowBlur = 0; }

function drawShip() {
  if (invincible > 0 && Math.floor(invincible / 5) % 2 === 0) return;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Thrust flame
  if (ship.thrusting) {
    const flen = 14 + Math.random() * 10;
    ctx.beginPath();
    ctx.moveTo(-12, -5);
    ctx.lineTo(-12 - flen, 0);
    ctx.lineTo(-12, 5);
    glow(COLORS.thrust, 16);
    ctx.strokeStyle = COLORS.thrust;
    ctx.lineWidth = 2;
    ctx.stroke();
    noGlow();
  }

  // Ship body
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-12, -10);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-12, 10);
  ctx.closePath();
  glow(COLORS.ship, 16);
  ctx.strokeStyle = COLORS.ship;
  ctx.lineWidth = 2;
  ctx.stroke();
  noGlow();

  ctx.restore();
}

function drawAsteroid(a) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.rot);
  ctx.beginPath();
  const [fx, fy] = a.verts[0];
  ctx.moveTo(fx, fy);
  for (let i = 1; i < a.verts.length; i++) {
    ctx.lineTo(a.verts[i][0], a.verts[i][1]);
  }
  ctx.closePath();
  glow(a.color, 10);
  ctx.strokeStyle = a.color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = a.color + '18';
  ctx.fill();
  noGlow();
  ctx.restore();
}

function drawBullet(b) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  glow('#fff', 14);
  ctx.fillStyle = '#fff';
  ctx.fill();
  noGlow();
  ctx.restore();
}

function drawParticle(p) {
  const alpha = p.life / 60;
  ctx.save();
  ctx.globalAlpha = Math.min(alpha, 1);
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.restore();
}

function drawStarfield() {
  // drawn once into an offscreen canvas and reused
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (const s of stars) {
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
}

function drawWaveBanner() {
  if (!waveClearing) return;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.font = '28px Courier New';
  ctx.fillStyle = '#0ff';
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur = 20;
  ctx.textAlign = 'center';
  ctx.fillText(`WAVE ${wave} CLEAR`, canvas.width / 2, canvas.height / 2 - 20);
  ctx.font = '16px Courier New';
  ctx.fillText(`WAVE ${wave + 1} INCOMING`, canvas.width / 2, canvas.height / 2 + 14);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStarfield();

  for (const a of asteroids) drawAsteroid(a);
  for (const b of bullets)    drawBullet(b);
  for (const p of particles)  drawParticle(p);
  drawShip();
  drawWaveBanner();
}

// ── Starfield (static) ─────────────────────────────────────────────────────

let stars = [];
function buildStars() {
  stars = [];
  const count = Math.floor((canvas.width * canvas.height) / 4000);
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() < 0.15 ? 2 : 1,
    });
  }
}

// ── Loop ──────────────────────────────────────────────────────────────────

function loop() {
  if (!state.running || state.paused) return;
  update();
  draw();
  rafId = requestAnimationFrame(loop);
}

// ── Start ─────────────────────────────────────────────────────────────────

function startGame() {
  buildStars();
  initGame();
  overlay.style.display = 'none';
  state.running = true;
  state.paused  = false;
  loop();
}

startBtn.addEventListener('click', startGame);

// Show high score on load
const hi = getHiScore();
hiEl.textContent = hi > 0 ? `HIGH SCORE: ${hi}` : '';

// Draw a preview frame on load
buildStars();
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, canvas.width, canvas.height);
drawStarfield();
