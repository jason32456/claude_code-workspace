// ─── Utility ─────────────────────────────────────────────────────────────────

class Star {
  constructor(W, H) {
    this.x = Math.random() * W;
    this.y = Math.random() * H;
    this.r = Math.random() * 1.4 + 0.3;
    this.a = Math.random() * 0.6 + 0.15;
  }
  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${this.a})`;
    ctx.fill();
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * 5 + 1;
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s;
    this.life = 1;
    this.decay = Math.random() * 0.025 + 0.015;
    this.size = Math.random() * 3 + 1;
    this.color = color;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.96; this.vy *= 0.96;
    this.life -= this.decay;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  get dead() { return this.life <= 0; }
}

// ─── Game Objects ─────────────────────────────────────────────────────────────

class Ship {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = -Math.PI / 2;
    this.size = 16;
    this.invincible = 0;
    this.shield = 0;
    this.tripleShot = 0;
    this.thrusting = false;
  }

  rotate(dir) { this.angle += dir * 0.065; }

  thrust() {
    this.vx += Math.cos(this.angle) * 0.18;
    this.vy += Math.sin(this.angle) * 0.18;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > 9) { this.vx = this.vx / spd * 9; this.vy = this.vy / spd * 9; }
  }

  update(W, H) {
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.985; this.vy *= 0.985;
    if (this.x < 0) this.x += W; if (this.x > W) this.x -= W;
    if (this.y < 0) this.y += H; if (this.y > H) this.y -= H;
    if (this.invincible > 0) this.invincible--;
    if (this.shield > 0) this.shield--;
    if (this.tripleShot > 0) this.tripleShot--;
  }

  shoot() {
    const bx = this.x + Math.cos(this.angle) * this.size;
    const by = this.y + Math.sin(this.angle) * this.size;
    const out = [new Bullet(bx, by, this.angle, this.vx, this.vy)];
    if (this.tripleShot > 0) {
      out.push(new Bullet(bx, by, this.angle - 0.22, this.vx, this.vy));
      out.push(new Bullet(bx, by, this.angle + 0.22, this.vx, this.vy));
    }
    return out;
  }

  draw(ctx) {
    if (this.invincible > 0 && Math.floor(this.invincible / 5) % 2 === 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (this.shield > 0) {
      const pulse = 0.35 + 0.25 * Math.sin(Date.now() * 0.01);
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 1.85, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(68,170,255,${pulse})`;
      ctx.shadowColor = '#44aaff';
      ctx.shadowBlur = 28;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.strokeStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.size, 0);
    ctx.lineTo(-this.size * 0.7, this.size * 0.6);
    ctx.lineTo(-this.size * 0.4, 0);
    ctx.lineTo(-this.size * 0.7, -this.size * 0.6);
    ctx.closePath();
    ctx.stroke();

    if (this.thrusting) {
      const fl = this.size * 0.7 + Math.random() * this.size * 0.65;
      ctx.beginPath();
      ctx.moveTo(-this.size * 0.4 - 2, this.size * 0.22);
      ctx.lineTo(-this.size * 0.4 - fl, 0);
      ctx.lineTo(-this.size * 0.4 - 2, -this.size * 0.22);
      ctx.strokeStyle = '#ff8800';
      ctx.shadowColor = '#ff4400';
      ctx.shadowBlur = 22;
      ctx.stroke();
    }

    ctx.restore();
  }

  get hitRadius() { return this.size * 0.75; }
}

class Asteroid {
  constructor(x, y, tier = 0) {
    this.x = x; this.y = y;
    this.tier = tier;
    const radii  = [45, 25, 12];
    const speeds = [1.0, 1.75, 2.8];
    this.radius = radii[tier];
    const spd = speeds[tier] * (0.75 + Math.random() * 0.6);
    const a = Math.random() * Math.PI * 2;
    this.vx = Math.cos(a) * spd;
    this.vy = Math.sin(a) * spd;
    this.rot = 0;
    this.rotSpd = (Math.random() - 0.5) * 0.04;
    const n = Math.floor(Math.random() * 5) + 8;
    this.verts = Array.from({ length: n }, (_, i) => ({
      a: (i / n) * Math.PI * 2,
      r: this.radius * (0.62 + Math.random() * 0.52),
    }));
  }

  update(W, H) {
    this.x += this.vx; this.y += this.vy;
    this.rot += this.rotSpd;
    const p = this.radius + 5;
    if (this.x < -p) this.x += W + p * 2; if (this.x > W + p) this.x -= W + p * 2;
    if (this.y < -p) this.y += H + p * 2; if (this.y > H + p) this.y -= H + p * 2;
  }

  split() {
    if (this.tier >= 2) return [];
    return [
      new Asteroid(this.x, this.y, this.tier + 1),
      new Asteroid(this.x, this.y, this.tier + 1),
    ];
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = '#ff6600';
    ctx.shadowColor = '#ff3300';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const v0 = this.verts[0];
    ctx.moveTo(Math.cos(v0.a) * v0.r, Math.sin(v0.a) * v0.r);
    for (let i = 1; i < this.verts.length; i++) {
      const v = this.verts[i];
      ctx.lineTo(Math.cos(v.a) * v.r, Math.sin(v.a) * v.r);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  get score() { return [20, 50, 100][this.tier]; }
}

class Bullet {
  constructor(x, y, angle, shipVx, shipVy) {
    this.x = x; this.y = y;
    const spd = 13;
    this.vx = Math.cos(angle) * spd + shipVx * 0.35;
    this.vy = Math.sin(angle) * spd + shipVy * 0.35;
    this.life = 65;
  }

  update(W, H) {
    this.x += this.vx; this.y += this.vy;
    this.life--;
    if (this.x < 0) this.x += W; if (this.x > W) this.x -= W;
    if (this.y < 0) this.y += H; if (this.y > H) this.y -= H;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = '#ffff00';
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  get dead() { return this.life <= 0; }
}

class PowerUp {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.type = Math.random() < 0.5 ? 'shield' : 'triple';
    this.rot = 0;
    this.life = 420;
    this.t = 0;
  }

  update() {
    this.rot += 0.04;
    this.life--;
    this.t++;
  }

  draw(ctx) {
    const alpha = this.life < 90 ? this.life / 90 : 1;
    const color = this.type === 'shield' ? '#44aaff' : '#ff44ff';
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(
      this.x + Math.sin(this.t * 0.03) * 7,
      this.y + Math.cos(this.t * 0.025) * 4
    );
    ctx.rotate(this.rot);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    ctx.lineWidth = 2;
    const r = 13;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.shadowBlur = 6;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.type === 'shield' ? 'S' : '3', 0, 0);
    ctx.restore();
  }

  get dead() { return this.life <= 0; }
  get hitRadius() { return 16; }
}

// ─── Main Game ────────────────────────────────────────────────────────────────

class Game {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.W = 0; this.H = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.state = 'menu';
    this.score = 0;
    this.hi = parseInt(localStorage.getItem('astHi') || '0');
    this.lives = 3;
    this.wave = 0;
    this.nextWaveTimer = -1;
    this.waveAnnounce = 0;

    this.ship = null;
    this.asteroids = [];
    this.bullets = [];
    this.particles = [];
    this.powerUps = [];
    this.stars = [];

    this.keys = {};
    this.shootCooldown = 0;

    document.getElementById('hi-disp').textContent = this.hi;

    window.addEventListener('keydown', e => this._keyDown(e));
    window.addEventListener('keyup',  e => { this.keys[e.code] = false; });

    requestAnimationFrame(() => this._loop());
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width  = this.W;
    this.canvas.height = this.H;
    this.stars = Array.from({ length: 190 }, () => new Star(this.W, this.H));
  }

  _keyDown(e) {
    this.keys[e.code] = true;
    if (e.code === 'Space') {
      e.preventDefault();
      if (this.state === 'menu' || this.state === 'gameOver') {
        this._startGame();
        return;
      }
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (this.state === 'playing') this._pause();
      else if (this.state === 'paused') this._resume();
    }
  }

  _startGame() {
    this.score = 0;
    this.lives = 3;
    this.wave = 0;
    this.nextWaveTimer = -1;
    this.waveAnnounce = 0;
    this.asteroids = [];
    this.bullets = [];
    this.particles = [];
    this.powerUps = [];
    this.keys = {};
    this.shootCooldown = 30;
    this.ship = new Ship(this.W / 2, this.H / 2);
    this.ship.invincible = 200;
    this._nextWave();
    this._show(null);
    this.state = 'playing';
  }

  _nextWave() {
    this.wave++;
    this.waveAnnounce = 165;
    const count = 2 + this.wave;
    for (let i = 0; i < count; i++) {
      let x, y, tries = 0;
      do {
        x = Math.random() * this.W;
        y = Math.random() * this.H;
        tries++;
      } while (tries < 20 && this.ship && Math.hypot(x - this.ship.x, y - this.ship.y) < 170);
      this.asteroids.push(new Asteroid(x, y, 0));
    }
  }

  _pause()  { this.state = 'paused';  this._show('pause'); }
  _resume() { this.state = 'playing'; this._show(null); }

  _show(which) {
    for (const id of ['menu', 'gameover', 'pause']) {
      document.getElementById(id).classList.toggle('hidden', id !== which);
    }
    document.getElementById('overlay').classList.toggle('hidden', !which);
  }

  _explode(x, y, color, n = 20) {
    for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, color));
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  _update() {
    if (this.state !== 'playing') return;
    const { W, H } = this;
    const ship = this.ship;

    if (ship) {
      if (this.keys['ArrowLeft']  || this.keys['KeyA']) ship.rotate(-1);
      if (this.keys['ArrowRight'] || this.keys['KeyD']) ship.rotate(1);
      ship.thrusting = !!(this.keys['ArrowUp'] || this.keys['KeyW']);
      if (ship.thrusting) ship.thrust();
      ship.update(W, H);

      this.shootCooldown--;
      if ((this.keys['Space'] || this.keys['KeyZ'] || this.keys['KeyX']) && this.shootCooldown <= 0) {
        this.bullets.push(...ship.shoot());
        this.shootCooldown = 14;
      }
    }

    for (const a  of this.asteroids) a.update(W, H);
    for (const b  of this.bullets)   b.update(W, H);
    for (const p  of this.particles) p.update();
    for (const pu of this.powerUps)  pu.update();

    this.bullets   = this.bullets.filter(b  => !b.dead);
    this.particles = this.particles.filter(p  => !p.dead);
    this.powerUps  = this.powerUps.filter(pu => !pu.dead);

    this._collide();

    if (this.waveAnnounce > 0) this.waveAnnounce--;

    // Next-wave timer
    if (this.asteroids.length === 0) {
      if (this.nextWaveTimer === -1) {
        this.nextWaveTimer = 100;
      } else if (--this.nextWaveTimer <= 0) {
        this.nextWaveTimer = -1;
        this._nextWave();
      }
    }
  }

  _collide() {
    const ship = this.ship;

    // Bullets vs asteroids
    outer: for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const a = this.asteroids[ai];
        if (Math.hypot(b.x - a.x, b.y - a.y) < a.radius) {
          this.score += a.score;
          this._explode(a.x, a.y, '#ff6600', 12 + (a.radius * 0.5 | 0));
          if (a.tier < 2 && Math.random() < 0.13) {
            this.powerUps.push(new PowerUp(a.x, a.y));
          }
          this.asteroids.splice(ai, 1, ...a.split());
          this.bullets.splice(bi, 1);
          continue outer;
        }
      }
    }

    // Ship vs asteroids
    if (ship && ship.invincible === 0) {
      for (const a of this.asteroids) {
        if (Math.hypot(ship.x - a.x, ship.y - a.y) < a.radius + ship.hitRadius) {
          if (ship.shield > 0) {
            ship.shield = 0;
            this._explode(ship.x, ship.y, '#44aaff', 14);
          } else {
            this._explode(ship.x, ship.y, '#00ffff', 38);
            this.ship = null;
            this.lives--;
            if (this.lives > 0) {
              setTimeout(() => { if (this.state === 'playing') this._respawn(); }, 1800);
            } else {
              setTimeout(() => this._gameOver(), 1400);
            }
          }
          break;
        }
      }
    }

    // Ship vs power-ups
    if (ship) {
      for (let i = this.powerUps.length - 1; i >= 0; i--) {
        const pu = this.powerUps[i];
        if (Math.hypot(ship.x - pu.x, ship.y - pu.y) < pu.hitRadius + ship.hitRadius) {
          if (pu.type === 'shield') ship.shield = 360;
          else ship.tripleShot = 360;
          this._explode(pu.x, pu.y, pu.type === 'shield' ? '#44aaff' : '#ff44ff', 16);
          this.powerUps.splice(i, 1);
        }
      }
    }
  }

  _respawn() {
    this.ship = new Ship(this.W / 2, this.H / 2);
    this.ship.invincible = 200;
  }

  _gameOver() {
    this.state = 'gameOver';
    if (this.score > this.hi) {
      this.hi = this.score;
      localStorage.setItem('astHi', this.hi);
    }
    document.getElementById('final-score').textContent = this.score;
    document.getElementById('final-hi').textContent = this.hi;
    this._show('gameover');
  }

  // ── Draw ────────────────────────────────────────────────────────────────────

  _drawHUD() {
    const { ctx, W, H } = this;
    ctx.save();
    ctx.font = 'bold 22px monospace';
    ctx.shadowBlur = 14;

    ctx.fillStyle = '#00ffff'; ctx.shadowColor = '#00ffff';
    ctx.textAlign = 'left';
    ctx.fillText(this.score, 22, 38);

    ctx.textAlign = 'right';
    ctx.fillText(`HI ${this.hi}`, W - 22, 38);

    ctx.textAlign = 'center';
    ctx.font = '15px monospace';
    ctx.fillStyle = '#aaa'; ctx.shadowBlur = 0;
    ctx.fillText(`WAVE ${this.wave}`, W / 2, 38);

    // Lives (tiny ship icons)
    for (let i = 0; i < this.lives; i++) {
      ctx.save();
      ctx.translate(26 + i * 30, 64);
      ctx.rotate(-Math.PI / 2);
      ctx.strokeStyle = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-7, 5.5);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, -5.5);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Active power-up timers
    let px = 22;
    const ship = this.ship;
    if (ship && ship.shield > 0) {
      ctx.fillStyle = '#44aaff'; ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 8;
      ctx.font = '14px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`SHIELD ${(ship.shield / 60).toFixed(1)}s`, px, H - 18);
      px += 130;
    }
    if (ship && ship.tripleShot > 0) {
      ctx.fillStyle = '#ff44ff'; ctx.shadowColor = '#ff44ff'; ctx.shadowBlur = 8;
      ctx.font = '14px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`3-SHOT ${(ship.tripleShot / 60).toFixed(1)}s`, px, H - 18);
    }

    // Wave announcement overlay
    if (this.waveAnnounce > 0) {
      const alpha = Math.min(1, this.waveAnnounce / 45);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.font = 'bold 54px monospace';
      ctx.fillStyle = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 35;
      ctx.fillText(`WAVE ${this.wave}`, W / 2, H / 2 - 18);
      ctx.font = '20px monospace';
      ctx.fillStyle = '#ff6600'; ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 14;
      const cnt = this.asteroids.length;
      ctx.fillText(this.wave === 1 ? 'GOOD LUCK!' : `${cnt} ASTEROID${cnt !== 1 ? 'S' : ''}`, W / 2, H / 2 + 22);
      ctx.restore();
    }

    ctx.restore();
  }

  _draw() {
    const { ctx, W, H } = this;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    for (const s of this.stars) s.draw(ctx);

    if (this.state === 'playing' || this.state === 'paused') {
      for (const pu of this.powerUps) pu.draw(ctx);
      for (const a  of this.asteroids) a.draw(ctx);
      for (const b  of this.bullets)   b.draw(ctx);
      for (const p  of this.particles) p.draw(ctx);
      if (this.ship) this.ship.draw(ctx);
      this._drawHUD();
    }
  }

  _loop() {
    this._update();
    this._draw();
    requestAnimationFrame(() => this._loop());
  }
}

new Game();
