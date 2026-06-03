// Canvas 2D renderer for Timber! Owns purely cosmetic state: screen shake,
// wood-chip particles, the chop/settle tweens, and the flying chopped log.
import { SIDE } from './game.js';

const W = 420, H = 720;
const CX = W / 2;
const GROUND_Y = 656;
const SEG_H = 64;
const TRUNK_W = 84;
const BRANCH_LEN = 78;

const COL = {
  trunk: '#9c6b3f',
  trunkDark: '#80552f',
  bark: '#6f4827',
  limb: '#7c4f2a',
  leaf: '#4faf55',
  leafDark: '#3c9145',
  chip: '#caa06d',
  shirt: '#d8483a',
  pants: '#365f95',
  skin: '#f1c79f',
  hat: '#27313d',
  axeHandle: '#8a5a3b',
  axeHead: '#cdd2da',
};

export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.chips = [];
    this.shake = 0;
    this.chopAnim = 0;   // 1 -> 0, axe swing
    this.dropAnim = 0;   // 1 -> 0, stack settling down one notch
    this.deathFlash = 0; // 1 -> 0
    this.facing = SIDE.LEFT;
    this.log = null;     // flying chopped log
    this.clouds = [
      { x: 70, y: 110, s: 1.0, v: 6 },
      { x: 300, y: 70, s: 0.7, v: 4 },
      { x: 210, y: 180, s: 0.85, v: 5 },
    ];
  }

  // Fired by the game on every chop.
  onChop(side, ok) {
    this.facing = side;
    this.chopAnim = 1;
    this.shake = ok ? 6 : 16;
    if (!ok) this.deathFlash = 1;

    // Wood chips spray out from the cut, away from the lumberjack.
    const dir = side === SIDE.LEFT ? 1 : -1;
    const ox = CX + dir * (TRUNK_W / 2);
    const oy = GROUND_Y - SEG_H * 1.4;
    const n = ok ? 12 : 22;
    for (let i = 0; i < n; i++) {
      this.chips.push({
        x: ox, y: oy,
        vx: dir * (60 + Math.random() * 180),
        vy: -120 - Math.random() * 160,
        r: 2 + Math.random() * 3,
        life: 0.6 + Math.random() * 0.4,
        spin: (Math.random() - 0.5) * 12,
        a: Math.random() * Math.PI,
      });
    }

    if (ok) {
      this.dropAnim = 1;
      // The chopped-off bottom block tumbles away opposite the chop.
      this.log = {
        x: CX, y: GROUND_Y - SEG_H / 2,
        vx: -dir * (220 + Math.random() * 80),
        vy: -180, life: 1.2, a: 0, spin: -dir * 8,
      };
    }
  }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 40);
    this.chopAnim = Math.max(0, this.chopAnim - dt * 6);
    this.dropAnim = Math.max(0, this.dropAnim - dt * 7);
    this.deathFlash = Math.max(0, this.deathFlash - dt * 2);

    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > W + 60) c.x = -60;
    }

    const g = 900;
    this.chips = this.chips.filter((c) => {
      c.vy += g * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.a += c.spin * dt;
      c.life -= dt;
      return c.life > 0;
    });

    if (this.log) {
      this.log.vy += g * dt;
      this.log.x += this.log.vx * dt;
      this.log.y += this.log.vy * dt;
      this.log.a += this.log.spin * dt;
      this.log.life -= dt;
      if (this.log.life <= 0) this.log = null;
    }
  }

  draw(game) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(sx, sy);

    this._sky(ctx);
    this._hills(ctx);
    this._clouds(ctx);
    this._ground(ctx);
    this._tree(ctx, game);
    this._fallingLog(ctx);
    this._lumberjack(ctx, game);
    this._chips(ctx);

    ctx.restore();

    this._hud(ctx, game);

    if (this.deathFlash > 0) {
      ctx.fillStyle = `rgba(220,60,50,${this.deathFlash * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  _sky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#8fd0ff');
    g.addColorStop(0.6, '#cdeffd');
    g.addColorStop(1, '#eafff0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  _hills(ctx) {
    ctx.fillStyle = '#7fc26a';
    ctx.beginPath();
    ctx.moveTo(0, 560);
    ctx.quadraticCurveTo(120, 470, 250, 545);
    ctx.quadraticCurveTo(360, 600, 420, 530);
    ctx.lineTo(420, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  }

  _clouds(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const c of this.clouds) {
      const s = c.s;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 22 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 26 * s, c.y + 6 * s, 18 * s, 0, Math.PI * 2);
      ctx.arc(c.x - 24 * s, c.y + 8 * s, 16 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 4 * s, c.y - 12 * s, 16 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _ground(ctx) {
    ctx.fillStyle = '#6abf5a';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = '#56a849';
    ctx.fillRect(0, GROUND_Y, W, 8);
    ctx.fillStyle = '#7a5235';
    ctx.fillRect(0, GROUND_Y + 26, W, H - GROUND_Y - 26);
  }

  _tree(ctx, game) {
    const off = this.dropAnim * SEG_H; // blocks slide down into place
    const left = CX - TRUNK_W / 2;

    for (let i = 0; i < game.segments.length; i++) {
      const top = GROUND_Y - (i + 1) * SEG_H - off;
      const seg = game.segments[i];

      ctx.fillStyle = COL.trunk;
      ctx.fillRect(left, top, TRUNK_W, SEG_H);
      ctx.fillStyle = COL.trunkDark;
      ctx.fillRect(left, top, 10, SEG_H);
      ctx.fillRect(left + TRUNK_W - 8, top, 8, SEG_H);

      // bark notch + segment seam
      ctx.strokeStyle = COL.bark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, top + SEG_H);
      ctx.lineTo(left + TRUNK_W, top + SEG_H);
      ctx.stroke();
      ctx.fillStyle = COL.bark;
      ctx.fillRect(left + 28, top + 14, 4, 22);
      ctx.fillRect(left + 50, top + 30, 4, 18);

      if (seg.branch === SIDE.LEFT) this._branch(ctx, left, top + SEG_H / 2, -1);
      if (seg.branch === SIDE.RIGHT) this._branch(ctx, left + TRUNK_W, top + SEG_H / 2, 1);
    }
  }

  _branch(ctx, x, y, dir) {
    ctx.fillStyle = COL.limb;
    ctx.fillRect(dir < 0 ? x - BRANCH_LEN : x, y - 9, BRANCH_LEN, 18);
    const lx = x + dir * (BRANCH_LEN + 4);
    ctx.fillStyle = COL.leafDark;
    ctx.beginPath();
    ctx.arc(lx, y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL.leaf;
    ctx.beginPath();
    ctx.arc(lx - dir * 12, y - 14, 18, 0, Math.PI * 2);
    ctx.arc(lx + dir * 10, y - 6, 16, 0, Math.PI * 2);
    ctx.arc(lx, y + 14, 17, 0, Math.PI * 2);
    ctx.fill();
  }

  _fallingLog(ctx) {
    if (!this.log) return;
    ctx.save();
    ctx.translate(this.log.x, this.log.y);
    ctx.rotate(this.log.a);
    ctx.globalAlpha = Math.min(1, this.log.life);
    ctx.fillStyle = COL.trunk;
    ctx.fillRect(-TRUNK_W / 2, -SEG_H / 2, TRUNK_W, SEG_H);
    ctx.fillStyle = COL.trunkDark;
    ctx.fillRect(-TRUNK_W / 2, -SEG_H / 2, 10, SEG_H);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  _lumberjack(ctx, game) {
    const dir = this.facing === SIDE.LEFT ? -1 : 1;
    // Stand just outside the trunk on the facing side.
    const baseX = CX + dir * (TRUNK_W / 2 + 34);
    const feetY = GROUND_Y;
    const lean = this.chopAnim * 6 * -dir; // small recoil toward trunk

    ctx.save();
    ctx.translate(baseX + lean, feetY);
    ctx.scale(dir, 1); // mirror so the figure always faces the trunk

    // legs
    ctx.fillStyle = COL.pants;
    ctx.fillRect(-16, -34, 12, 34);
    ctx.fillRect(2, -34, 12, 34);
    // boots
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(-18, -8, 16, 8);
    ctx.fillRect(2, -8, 16, 8);
    // torso
    ctx.fillStyle = COL.shirt;
    ctx.fillRect(-18, -78, 36, 46);
    // arm holding axe (toward trunk = +x after mirror)
    ctx.fillStyle = COL.shirt;
    ctx.save();
    ctx.translate(14, -64);
    const swing = (1 - this.chopAnim) * 0.2 + this.chopAnim * 1.1;
    ctx.rotate(swing);
    ctx.fillRect(0, -6, 30, 12);
    // axe
    ctx.fillStyle = COL.axeHandle;
    ctx.fillRect(26, -4, 30, 8);
    ctx.fillStyle = COL.axeHead;
    ctx.beginPath();
    ctx.moveTo(54, -14);
    ctx.lineTo(72, -6);
    ctx.lineTo(72, 6);
    ctx.lineTo(54, 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // head
    ctx.fillStyle = COL.skin;
    ctx.fillRect(-12, -104, 24, 26);
    // beanie
    ctx.fillStyle = COL.hat;
    ctx.fillRect(-14, -110, 28, 12);
    ctx.fillRect(-14, -100, 28, 4);
    // beard
    ctx.fillStyle = '#caa06d';
    ctx.fillRect(-10, -86, 20, 8);

    ctx.restore();
  }

  _chips(ctx) {
    for (const c of this.chips) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.a);
      ctx.globalAlpha = Math.max(0, Math.min(1, c.life * 1.6));
      ctx.fillStyle = COL.chip;
      ctx.fillRect(-c.r, -c.r * 0.6, c.r * 2, c.r * 1.2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _hud(ctx, game) {
    // score
    ctx.fillStyle = 'rgba(43,29,18,0.9)';
    ctx.font = 'bold 64px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (game.state === 'playing') {
      const pop = 1 + this.chopAnim * 0.12;
      ctx.save();
      ctx.translate(CX, 30);
      ctx.scale(pop, pop);
      ctx.fillText(String(game.score), 0, 0);
      ctx.restore();
    }

    // timer bar (only while playing)
    if (game.state === 'playing') {
      const bw = 260, bh = 18, bx = CX - bw / 2, by = 120;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      this._roundRect(ctx, bx - 3, by - 3, bw + 6, bh + 6, 10);
      ctx.fill();
      const t = game.timer;
      const col = t > 0.5 ? '#3aa757' : t > 0.25 ? '#e6a52e' : '#e0533d';
      ctx.fillStyle = col;
      this._roundRect(ctx, bx, by, Math.max(0, bw * t), bh, 8);
      ctx.fill();
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
